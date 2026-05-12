/**
 * JUREDITPRO — Fase 2
 * Item 2.2: Conectores de Jurisprudência — versão DEFINITIVA + CORS proxy
 * API: jurisprudencias.ai
 */

const JURAI_BASE  = 'https://jurisprudencias.ai/api/v1';
const JURAI_TOKEN = 'jur_f414e3c6a32b86d0945ca15fe62c1b7983892dbe2936fd0f8e80b2fd18dd12b8';

// Proxies em ordem de tentativa
const PROXIES = [
  (url) => `https://proxy.cors.sh/${url}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => url, // direto (funciona se jurisprudencias.ai tiver CORS aberto)
];

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

function normalizar(item) {
  return {
    id:              item.id             || item.process_number  || String(Math.random()),
    tribunal:        (item.court         || '').toUpperCase(),
    numero_processo: item.process_number || '',
    classe:          item.class_name     || '',
    orgao_julgador:  item.organ          || '',
    relator:         item.rapporteur     || '',
    data_julgamento: item.judgment_date  || item.publication_date || '',
    ementa:          item.headnote       || item.excerpt          || '',
    decisao:         item.full_text      ? item.full_text.substring(0, 500) : '',
    url:             item.url            || item.source_url       || '',
    score:           item.score          || 0,
    fonte:           'jurisprudencias.ai',
  };
}

async function buscarTribunal(tribunal, termo, pagina = 1, tamanho = 10) {
  const params  = new URLSearchParams({ q: termo, page: pagina - 1, size: tamanho });
  const urlAlvo = `${JURAI_BASE}/courts/${tribunal}/decisions?${params}`;
  const erros   = [];

  for (const proxy of PROXIES) {
    const url = proxy(urlAlvo);
    try {
      const resp = await fetch(url, {
        method:  'GET',
        headers: {
          'Authorization':  `Bearer ${JURAI_TOKEN}`,
          'x-cors-api-key': 'temp_guest', // requerido pelo proxy.cors.sh
        },
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        erros.push(`HTTP ${resp.status}: ${txt.substring(0, 80)}`);
        continue;
      }

      const data  = await resp.json();
      const itens = data.decisions || data.results || data.data || (Array.isArray(data) ? data : []);
      const total = data.total     || data.count   || itens.length;

      return {
        resultados: itens.map(normalizar),
        total,
      };

    } catch (err) {
      erros.push(err.message);
    }
  }

  throw new Error(`[${tribunal}] ${erros.join(' | ')}`);
}

async function buscarTodos(termo, tamanho = 10) {
  const tribunais = ['stf', 'stj', 'trf3', 'tjsp', 'tjrs', 'tjsc'];
  const respostas = await Promise.allSettled(
    tribunais.map(t => buscarTribunal(t, termo, 1, 3))
  );

  const resultados = respostas
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.resultados)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, tamanho);

  return { resultados, total: resultados.length };
}

class TribunalAPI {
  async _buscar(tribunal, termo, opcoes = {}) {
    const { pagina = 1, tamanho = 10 } = opcoes;
    const trib = tribunal.toLowerCase();

    if (trib === 'todos') {
      const res = await buscarTodos(termo, tamanho);
      return { ...res, termo, tribunal: 'todos' };
    }

    const codigo = TRIBUNAIS_MAP[trib];
    if (!codigo) throw new Error(`Tribunal "${tribunal}" não suportado.`);

    const res = await buscarTribunal(codigo, termo, pagina, tamanho);
    return { ...res, termo, tribunal: trib };
  }

  async searchSTF(t,   op = {}) { return this._buscar('stf',   t, op); }
  async searchSTJ(t,   op = {}) { return this._buscar('stj',   t, op); }
  async searchTST(t,   op = {}) { return this._buscar('tst',   t, op); }
  async searchTRF3(t,  op = {}) { return this._buscar('trf3',  t, op); }
  async searchTJSP(t,  op = {}) { return this._buscar('tjsp',  t, op); }
  async searchTJRS(t,  op = {}) { return this._buscar('tjrs',  t, op); }
  async searchTJSC(t,  op = {}) { return this._buscar('tjsc',  t, op); }
  async searchTJRJ(t,  op = {}) { return this._buscar('tjrj',  t, op); }
  async searchTodos(t, op = {}) { return this._buscar('todos', t, op); }
}

export default TribunalAPI;
if (typeof module !== 'undefined') module.exports = TribunalAPI;
