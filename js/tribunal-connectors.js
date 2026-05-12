/**
 * JUREDITPRO — Fase 2
 * Item 2.2: Conectores DataJud CNJ
 * Versão GitHub Pages — query simplificada + proxy corrigido
 */

const DATAJUD_BASE   = 'https://api-publica.datajud.cnj.jus.br';
const DATAJUD_APIKEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

// Proxy corrigido — formato com parâmetro url=
const CORS_PROXY = 'https://corsproxy.io/?url=';

const INDICES = {
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
  todos: null,
};

function normalizar(hit) {
  const s = hit._source || {};
  return {
    id:              hit._id || '',
    tribunal:        s.tribunal?.sigla     || s.siglaTribunal || '',
    numero_processo: s.numeroProcesso      || s.numero        || '',
    classe:          s.classe?.nome        || '',
    orgao_julgador:  s.orgaoJulgador?.nome || '',
    relator:         s.relatorNome         || s.relator        || '',
    data_julgamento: s.dataJulgamento      || s.data           || '',
    ementa:          s.ementa              || '',
    decisao:         s.decisao             || '',
    url:             s.inteiroteorUrl      || s.url            || '',
    score:           hit._score            || 0,
    fonte:           'DataJud/CNJ',
  };
}

// Query mínima e compatível com DataJud
function montarQuery(termo, pagina = 1, tamanho = 10) {
  return {
    size: tamanho,
    from: (pagina - 1) * tamanho,
    query: {
      multi_match: {
        query:     termo,
        fields:    ['ementa', 'decisao', 'classe.nome'],
        type:      'best_fields',
        operator:  'or',
      },
    },
    sort: [{ dataJulgamento: { order: 'desc' } }],
  };
}

async function buscarIndice(indice, termo, pagina = 1, tamanho = 10) {
  const urlAlvo  = `${DATAJUD_BASE}/${indice}/_search`;
  const urlFinal = `${CORS_PROXY}${encodeURIComponent(urlAlvo)}`;
  const corpo    = JSON.stringify(montarQuery(termo, pagina, tamanho));

  const resp = await fetch(urlFinal, {
    method:  'POST',
    headers: {
      'Authorization': `APIKey ${DATAJUD_APIKEY}`,
      'Content-Type':  'application/json',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: corpo,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} — ${indice}: ${txt.substring(0, 100)}`);
  }

  const data = await resp.json();
  return {
    resultados: (data.hits?.hits || []).map(normalizar),
    total:      data.hits?.total?.value || 0,
  };
}

class TribunalAPI {
  constructor(options = {}) {
    this.timeout = options.timeout || 20000;
  }

  async _buscar(tribunal, termo, opcoes = {}) {
    const { pagina = 1, tamanho = 10 } = opcoes;
    const trib   = tribunal.toLowerCase();
    const indice = INDICES[trib];
    if (indice === undefined) throw new Error(`Tribunal "${tribunal}" não suportado.`);

    try {
      const resultado = await buscarIndice(indice, termo, pagina, tamanho);
      return { ...resultado, termo, tribunal: trib };
    } catch (err) {
      throw err;
    }
  }

  async searchSTF(t,   op = {}) { return this._buscar('stf',   t, op); }
  async searchSTJ(t,   op = {}) { return this._buscar('stj',   t, op); }
  async searchTCU(t,   op = {}) { return this._buscar('tcu',   t, op); }
  async searchTRF1(t,  op = {}) { return this._buscar('trf1',  t, op); }
  async searchTRF2(t,  op = {}) { return this._buscar('trf2',  t, op); }
  async searchTRF3(t,  op = {}) { return this._buscar('trf3',  t, op); }
  async searchTRF4(t,  op = {}) { return this._buscar('trf4',  t, op); }
  async searchTRF5(t,  op = {}) { return this._buscar('trf5',  t, op); }
  async searchTRF6(t,  op = {}) { return this._buscar('trf6',  t, op); }
  async searchTJDFT(t, op = {}) { return this._buscar('tjdft', t, op); }
  async searchTJSP(t,  op = {}) { return this._buscar('tjsp',  t, op); }
  async searchTJRJ(t,  op = {}) { return this._buscar('tjrj',  t, op); }
  async searchTJMG(t,  op = {}) { return this._buscar('tjmg',  t, op); }
  async searchTJRS(t,  op = {}) { return this._buscar('tjrs',  t, op); }

  async searchTodos(termo, opcoes = {}) {
    const principais = ['stf', 'stj', 'tcu', 'trf4'];
    const respostas  = await Promise.allSettled(
      principais.map(t => buscarIndice(INDICES[t], termo, 1, 3))
    );
    const resultados = respostas
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value.resultados)
      .sort((a, b) => b.score - a.score)
      .slice(0, opcoes.tamanho || 10);
    return { termo, tribunal: 'todos', resultados, total: resultados.length };
  }
}

export default TribunalAPI;
if (typeof module !== 'undefined') module.exports = TribunalAPI;
