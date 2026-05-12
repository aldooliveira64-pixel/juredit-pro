/**
 * JUREDITPRO — Fase 2
 * Item 2.2: Conectores diretos ao DataJud CNJ
 * Versão GitHub Pages — sem backend, chamada direta à API pública
 *
 * API pública DataJud: https://datajud-wiki.cnj.jus.br/api-publica/
 * Chave pública oficial: clave-datajud-api-publica
 */
 
const DATAJUD_BASE   = 'https://api-publica.datajud.cnj.jus.br';
const DATAJUD_APIKEY = 'clave-datajud-api-publica';
 
// Mapa tribunal → índice DataJud
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
};
 
// Normaliza resultado DataJud para formato JurEditPro
function normalizar(hit) {
  const s = hit._source || {};
  return {
    id:              hit._id || '',
    tribunal:        s.tribunal?.sigla || s.siglaTribunal || '',
    numero_processo: s.numeroProcesso  || s.numero        || '',
    classe:          s.classe?.nome    || '',
    orgao_julgador:  s.orgaoJulgador?.nome || '',
    relator:         s.relatorNome     || s.relator        || '',
    data_julgamento: s.dataJulgamento  || s.data           || '',
    ementa:          s.ementa          || '',
    decisao:         s.decisao         || '',
    url:             s.inteiroteorUrl  || s.url            || '',
    score:           hit._score        || 0,
    fonte:           'DataJud/CNJ',
  };
}
 
// Monta query Elasticsearch
function montarQuery(termo, pagina = 1, tamanho = 10) {
  return {
    from: (pagina - 1) * tamanho,
    size: tamanho,
    query: {
      bool: {
        should: [
          {
            multi_match: {
              query:  termo,
              fields: ['ementa^3', 'decisao^2', 'classe.nome', 'orgaoJulgador.nome'],
              type:   'best_fields',
              fuzziness: 'AUTO',
            },
          },
          {
            match_phrase: {
              ementa: { query: termo, boost: 5 },
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    sort: [
      { _score:          { order: 'desc' } },
      { dataJulgamento:  { order: 'desc' } },
    ],
  };
}
 
// Busca em um índice específico
async function buscarIndice(indice, termo, pagina = 1, tamanho = 10) {
  const url  = `${DATAJUD_BASE}/${indice}/_search`;
  const body = montarQuery(termo, pagina, tamanho);
 
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `APIKey ${DATAJUD_APIKEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });
 
  if (!resp.ok) {
    throw new Error(`DataJud HTTP ${resp.status} — ${indice}`);
  }
 
  const data = await resp.json();
  return {
    resultados: (data.hits?.hits || []).map(normalizar),
    total:       data.hits?.total?.value || 0,
  };
}
 
// ─── Classe principal ─────────────────────────────────────────────────────────
 
class TribunalAPI {
  constructor(options = {}) {
    this.timeout = options.timeout || 15000;
  }
 
  // Método interno com timeout
  async _buscar(tribunal, termo, opcoes = {}) {
    const { pagina = 1, tamanho = 10 } = opcoes;
 
    const indice = INDICES[tribunal.toLowerCase()];
    if (!indice) throw new Error(`Tribunal "${tribunal}" não suportado.`);
 
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.timeout);
 
    try {
      const resultado = await buscarIndice(indice, termo, pagina, tamanho);
      clearTimeout(timer);
      return { ...resultado, termo, tribunal };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout ao consultar ${tribunal.toUpperCase()}`);
      }
      throw err;
    }
  }
 
  // Busca em tribunal específico
  async searchSTF(termo,   op = {}) { return this._buscar('stf',   termo, op); }
  async searchSTJ(termo,   op = {}) { return this._buscar('stj',   termo, op); }
  async searchTCU(termo,   op = {}) { return this._buscar('tcu',   termo, op); }
  async searchTRF1(termo,  op = {}) { return this._buscar('trf1',  termo, op); }
  async searchTRF2(termo,  op = {}) { return this._buscar('trf2',  termo, op); }
  async searchTRF3(termo,  op = {}) { return this._buscar('trf3',  termo, op); }
  async searchTRF4(termo,  op = {}) { return this._buscar('trf4',  termo, op); }
  async searchTRF5(termo,  op = {}) { return this._buscar('trf5',  termo, op); }
  async searchTRF6(termo,  op = {}) { return this._buscar('trf6',  termo, op); }
  async searchTJDFT(termo, op = {}) { return this._buscar('tjdft', termo, op); }
  async searchTJSP(termo,  op = {}) { return this._buscar('tjsp',  termo, op); }
  async searchTJRJ(termo,  op = {}) { return this._buscar('tjrj',  termo, op); }
  async searchTJMG(termo,  op = {}) { return this._buscar('tjmg',  termo, op); }
  async searchTJRS(termo,  op = {}) { return this._buscar('tjrs',  termo, op); }
 
  // Busca em todos os principais tribunais em paralelo
  async searchTodos(termo, opcoes = {}) {
    const principais = ['stf', 'stj', 'tcu', 'trf1', 'trf2', 'trf3', 'trf4', 'trf5'];
 
    const respostas = await Promise.allSettled(
      principais.map(t => buscarIndice(INDICES[t], termo, 1, 3))
    );
 
    const resultados = respostas
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value.resultados)
      .sort((a, b) => b.score - a.score)
      .slice(0, opcoes.tamanho || 10);
 
    return {
      termo,
      tribunal: 'todos',
      resultados,
      total: resultados.length,
    };
  }
}
 
export default TribunalAPI;
 
// CommonJS fallback
if (typeof module !== 'undefined') {
  module.exports = TribunalAPI;
}
 
