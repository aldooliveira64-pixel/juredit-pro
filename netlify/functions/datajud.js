/**
 * JUREDITPRO — Fase 2
 * Item 2.1: Middleware de integração com DataJud (CNJ)
 * 
 * Netlify Function: /netlify/functions/datajud
 * Endpoint público: /.netlify/functions/datajud?termo=LGPD&tribunal=stf&pagina=1
 * 
 * Documentação DataJud: https://datajud-wiki.cnj.jus.br/api-publica/
 */

const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

// Chave pública padrão do CNJ (substitua pela sua após aprovação do acesso)
const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || 'clave-datajud-api-publica';

// Mapa de índices por tribunal
const INDICES_TRIBUNAIS = {
  stf:   'api_publica_stf',
  stj:   'api_publica_stj',
  tcu:   'api_publica_tcu',
  trf1:  'api_publica_trf1',
  trf2:  'api_publica_trf2',
  trf3:  'api_publica_trf3',
  trf4:  'api_publica_trf4',
  trf5:  'api_publica_trf5',
  trf6:  'api_publica_trf6',
  tjdft: 'api_publica_tjdft',
  tjsp:  'api_publica_tjsp',
  tjrj:  'api_publica_tjrj',
  tjmg:  'api_publica_tjmg',
  tjrs:  'api_publica_tjrs',
  todos: null, // busca em todos os tribunais
};

/**
 * Normaliza um acórdão do DataJud para o formato JurEditPro
 */
function normalizarAcordao(hit) {
  const src = hit._source || {};

  return {
    id:              hit._id,
    tribunal:        src.tribunal?.sigla        || src.siglaTribunal || '',
    numero_processo: src.numeroProcesso         || src.numero       || '',
    classe:          src.classe?.nome           || '',
    orgao_julgador:  src.orgaoJulgador?.nome    || '',
    relator:         src.relatorNome            || src.relator      || '',
    data_julgamento: src.dataJulgamento         || src.data         || '',
    ementa:          src.ementa                 || '',
    decisao:         src.decisao                || '',
    url:             src.inteiroteorUrl         || src.url          || '',
    score:           hit._score                 || 0,
    fonte:           'DataJud/CNJ',
  };
}

/**
 * Monta a query Elasticsearch para busca por termo
 */
function montarQuery(termo, pagina = 1, tamanho = 10) {
  const from = (pagina - 1) * tamanho;

  return {
    from,
    size: tamanho,
    query: {
      bool: {
        should: [
          {
            multi_match: {
              query: termo,
              fields: ['ementa^3', 'decisao^2', 'classe.nome', 'orgaoJulgador.nome'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          },
          {
            match_phrase: {
              ementa: {
                query: termo,
                boost: 5,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    sort: [
      { _score: { order: 'desc' } },
      { dataJulgamento: { order: 'desc' } },
    ],
    _source: [
      'tribunal', 'siglaTribunal', 'numeroProcesso', 'numero',
      'classe', 'orgaoJulgador', 'relatorNome', 'relator',
      'dataJulgamento', 'data', 'ementa', 'decisao',
      'inteiroteorUrl', 'url',
    ],
  };
}

/**
 * Faz a busca em um tribunal específico
 */
async function buscarNoTribunal(indice, query) {
  const url = `${DATAJUD_BASE_URL}/${indice}/_search`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `APIKey ${DATAJUD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    const erro = await response.text();
    throw new Error(`DataJud [${indice}] HTTP ${response.status}: ${erro}`);
  }

  return response.json();
}

/**
 * Handler principal da Netlify Function
 */
exports.handler = async (event) => {
  // CORS — permite chamadas do frontend JurEditPro
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ erro: 'Método não permitido. Use GET.' }),
    };
  }

  const params   = event.queryStringParameters || {};
  const termo    = (params.termo || '').trim();
  const tribunal = (params.tribunal || 'todos').toLowerCase();
  const pagina   = parseInt(params.pagina || '1', 10);
  const tamanho  = Math.min(parseInt(params.tamanho || '10', 10), 50);

  if (!termo || termo.length < 3) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ erro: 'Parâmetro "termo" obrigatório (mínimo 3 caracteres).' }),
    };
  }

  if (!(tribunal in INDICES_TRIBUNAIS)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        erro: 'Tribunal inválido.',
        tribunais_validos: Object.keys(INDICES_TRIBUNAIS),
      }),
    };
  }

  try {
    const query = montarQuery(termo, pagina, tamanho);
    let resultados = [];
    let total = 0;

    if (tribunal === 'todos') {
      // Busca em paralelo nos principais tribunais
      const principais = ['stf', 'stj', 'tcu', 'trf1', 'trf2', 'trf3', 'trf4', 'trf5'];
      const promessas  = principais.map(t =>
        buscarNoTribunal(INDICES_TRIBUNAIS[t], { ...query, size: 3 }).catch(() => null)
      );

      const respostas = await Promise.all(promessas);

      for (const resp of respostas) {
        if (resp?.hits?.hits) {
          resultados.push(...resp.hits.hits.map(normalizarAcordao));
          total += resp.hits.total?.value || 0;
        }
      }

      // Reordena por score quando mistura tribunais
      resultados.sort((a, b) => b.score - a.score);
      resultados = resultados.slice(0, tamanho);

    } else {
      const indice = INDICES_TRIBUNAIS[tribunal];
      const resp   = await buscarNoTribunal(indice, query);

      resultados = (resp.hits?.hits || []).map(normalizarAcordao);
      total      = resp.hits?.total?.value || 0;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        termo,
        tribunal,
        pagina,
        tamanho,
        total,
        paginas_total: Math.ceil(total / tamanho),
        resultados,
      }),
    };

  } catch (erro) {
    console.error('[DataJud Middleware] Erro:', erro.message);

    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        erro: 'Falha ao consultar DataJud.',
        detalhe: erro.message,
      }),
    };
  }
};
