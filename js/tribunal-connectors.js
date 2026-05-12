/**
 * JUREDITPRO — Fase 2
 * Item 2.2: Conectores para APIs oficiais dos tribunais
 *
 * Uso (frontend):
 *   import TribunalAPI from './tribunal-connectors.js';
 *   const api = new TribunalAPI();
 *   const resultados = await api.searchSTF('responsabilidade civil');
 */

class TribunalAPI {
  constructor(options = {}) {
    // Base da Netlify Function local (ajuste se necessário)
    this.middlewareURL = options.middlewareURL || '/.netlify/functions/datajud';
    this.timeout       = options.timeout       || 15000; // 15s
  }

  // ─── Método interno de busca ──────────────────────────────────────────────

  async _buscar(tribunal, termo, opcoes = {}) {
    const { pagina = 1, tamanho = 10 } = opcoes;

    const params = new URLSearchParams({ termo, tribunal, pagina, tamanho });
    const url    = `${this.middlewareURL}?${params}`;

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.timeout);

    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.erro || `HTTP ${resp.status}`);
      }

      return await resp.json();

    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout ao consultar ${tribunal.toUpperCase()} (>${this.timeout}ms)`);
      }
      throw err;
    }
  }

  // ─── STF ─────────────────────────────────────────────────────────────────

  /**
   * Busca acórdãos no Supremo Tribunal Federal
   * @returns {Promise<{resultados: Acordao[], total: number}>}
   */
  async searchSTF(termo, opcoes = {}) {
    return this._buscar('stf', termo, opcoes);
  }

  // ─── STJ ─────────────────────────────────────────────────────────────────

  /**
   * Busca acórdãos no Superior Tribunal de Justiça
   */
  async searchSTJ(termo, opcoes = {}) {
    return this._buscar('stj', termo, opcoes);
  }

  // ─── TCU ─────────────────────────────────────────────────────────────────

  /**
   * Busca acórdãos no Tribunal de Contas da União
   */
  async searchTCU(termo, opcoes = {}) {
    return this._buscar('tcu', termo, opcoes);
  }

  // ─── TRFs ────────────────────────────────────────────────────────────────

  async searchTRF1(termo, opcoes = {}) { return this._buscar('trf1', termo, opcoes); }
  async searchTRF2(termo, opcoes = {}) { return this._buscar('trf2', termo, opcoes); }
  async searchTRF3(termo, opcoes = {}) { return this._buscar('trf3', termo, opcoes); }
  async searchTRF4(termo, opcoes = {}) { return this._buscar('trf4', termo, opcoes); }
  async searchTRF5(termo, opcoes = {}) { return this._buscar('trf5', termo, opcoes); }
  async searchTRF6(termo, opcoes = {}) { return this._buscar('trf6', termo, opcoes); }

  // ─── TJs estaduais ───────────────────────────────────────────────────────

  async searchTJDFT(termo, opcoes = {}) { return this._buscar('tjdft', termo, opcoes); }
  async searchTJSP(termo,  opcoes = {}) { return this._buscar('tjsp',  termo, opcoes); }
  async searchTJRJ(termo,  opcoes = {}) { return this._buscar('tjrj',  termo, opcoes); }
  async searchTJMG(termo,  opcoes = {}) { return this._buscar('tjmg',  termo, opcoes); }
  async searchTJRS(termo,  opcoes = {}) { return this._buscar('tjrs',  termo, opcoes); }

  // ─── Busca global ────────────────────────────────────────────────────────

  /**
   * Busca em todos os tribunais em paralelo
   */
  async searchTodos(termo, opcoes = {}) {
    return this._buscar('todos', termo, opcoes);
  }

  /**
   * Busca em lista customizada de tribunais em paralelo
   * @param {string[]} tribunais - ex: ['stf', 'stj', 'trf4']
   */
  async searchMultiplos(tribunais, termo, opcoes = {}) {
    const promessas = tribunais.map(t =>
      this._buscar(t, termo, { ...opcoes, tamanho: 5 }).catch(err => ({
        tribunal: t,
        erro: err.message,
        resultados: [],
        total: 0,
      }))
    );

    const respostas = await Promise.all(promessas);

    const resultados = respostas
      .flatMap(r => r.resultados || [])
      .sort((a, b) => b.score - a.score);

    const erros = respostas
      .filter(r => r.erro)
      .map(r => ({ tribunal: r.tribunal, erro: r.erro }));

    return {
      termo,
      resultados,
      total: resultados.length,
      erros: erros.length ? erros : undefined,
    };
  }
}

// ─── Exportações ─────────────────────────────────────────────────────────────

// ESM
export default TribunalAPI;

// CommonJS (Node.js / testes)
if (typeof module !== 'undefined') {
  module.exports = TribunalAPI;
}

/**
 * @typedef {Object} Acordao
 * @property {string} id
 * @property {string} tribunal
 * @property {string} numero_processo
 * @property {string} classe
 * @property {string} orgao_julgador
 * @property {string} relator
 * @property {string} data_julgamento  - formato: YYYY-MM-DD
 * @property {string} ementa
 * @property {string} decisao
 * @property {string} url
 * @property {number} score
 * @property {string} fonte
 */
