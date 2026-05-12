/**
 * JUREDITPRO — Fase 2
 * Item 2.2: Conectores de Jurisprudência — versão DEFINITIVA
 * API: jurisprudencias.ai — retorna ementas reais com texto completo
 *
 * Tribunais suportados: STF, STJ, TST, TRF3, TJRR, TJRL, TJRS, TJSC, TJSP
 * Documentação: https://jurisprudencias.ai/api
 */

const JURAI_BASE  = 'https://jurisprudencias.ai/api/v1';
const JURAI_TOKEN = 'jur_f414e3c6a32b86d0945ca15fe62c1b7983892dbe2936fd0f8e80b2fd18dd12b8';

// Mapa de siglas JurEditPro → código jurisprudencias.ai
const TRIBUNAIS_MAP = {
  stf:  'stf',
  stj:  'stj',
  tst:  'tst',
  trf3: 'trf3',
  tjsp: 'tjsp',
  tjrs: 'tjrs',
  tjsc: 'tjsc',
  tjrj: 'tjrj',
  todos: null,
};

// Normaliza resposta da jurisprudencias.ai para formato JurEditPro
function normalizar(item) {
  return {
    id:              item.id              || item.process_number || '',
    tribunal:        (item.court          || '').toUpperCase(),
    numero_processo: item.process_number  || '',
    classe:          item.class_name      || '',
    orgao_julgador:  item.organ           || item.rapporteur_organ || '',
    relator:         item.rapporteur      || '',
    data_julgamento: item.judgment_date   || item.publication_date || '',
    ementa:          item.headnote        || item.excerpt         || '',
    decisao:         item.full_text       ? item.full_text.substring(0, 500) : '',
    url:             item.url             || item.source_url      || '',
    score:           item.score           || 0,
    fonte:           'jurisprudencias.ai',
  };
}

// Busca em tribunal específico
async function buscarTribunal(tribunal, termo, pagina = 1, tamanho = 10) {
  const params = new URLSearchParams({
    q:    termo,
    page: pagina - 1, // API usa base 0
    size: tamanho,
  });

  const url  = `${JURAI_BASE}/courts/${tribunal}/decisions?${params}`;
  const resp = await fetch(url, {
    method:  'GET',
    headers: {
      'Authorization': `Bearer ${JURAI_TOKEN}`,
      'Content-Type':  'application/json',
    },
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`jurisprudencias.ai HTTP ${resp.status} [${tribunal}]: ${txt.substring(0, 100)}`);
  }

  const data = await resp.json();

  // Normaliza diferentes formatos de resposta
  const itens = data.decisions || data.results || data.data || data || [];
  const total = data.total     || data.count    || itens.length;

  return {
    resultados: (Array.isArray(itens) ? itens : []).map(normalizar),
    total,
  };
}

// Busca em todos os tribunais em paralelo
async function buscarTodos(termo, tamanho = 10) {
  const tribunais  = ['stf', 'stj', 'trf3', 'tjsp', 'tjrs', 'tjsc'];
  const respostas  = await Promise.allSettled(
    tribunais.map(t => buscarTribunal(t, termo, 1, 3))
  );

  const resultados = respostas
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.resultados)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, tamanho);

  const erros = respostas
    .map((r, i) => r.status === 'rejected' ? `${tribunais[i]}: ${r.reason?.message}` : null)
    .filter(Boolean);

  if (erros.length) console.warn('[TribunalAPI] Parcial:', erros);

  return { resultados, total: resultados.length };
}

// ─── Classe principal ─────────────────────────────────────────────────────────

class TribunalAPI {
  constructor(options = {}) {
    this.timeout = options.timeout || 20000;
  }

  async _buscar(tribunal, termo, opcoes = {}) {
    const { pagina = 1, tamanho = 10 } = opcoes;
    const trib = tribunal.toLowerCase();

    if (trib === 'todos') {
      const res = await buscarTodos(termo, tamanho);
      return { ...res, termo, tribunal: 'todos' };
    }

    const codigo = TRIBUNAIS_MAP[trib];
    if (!codigo) throw new Error(`Tribunal "${tribunal}" não suportado. Use: ${Object.keys(TRIBUNAIS_MAP).join(', ')}`);

    const res = await buscarTribunal(codigo, termo, pagina, tamanho);
    return { ...res, termo, tribunal: trib };
  }

  async searchSTF(t,   op = {}) { return this._buscar('stf',  t, op); }
  async searchSTJ(t,   op = {}) { return this._buscar('stj',  t, op); }
  async searchTST(t,   op = {}) { return this._buscar('tst',  t, op); }
  async searchTRF3(t,  op = {}) { return this._buscar('trf3', t, op); }
  async searchTJSP(t,  op = {}) { return this._buscar('tjsp', t, op); }
  async searchTJRS(t,  op = {}) { return this._buscar('tjrs', t, op); }
  async searchTJSC(t,  op = {}) { return this._buscar('tjsc', t, op); }
  async searchTJRJ(t,  op = {}) { return this._buscar('tjrj', t, op); }
  async searchTodos(t, op = {}) { return this._buscar('todos',t, op); }
}

export default TribunalAPI;
if (typeof module !== 'undefined') module.exports = TribunalAPI;
