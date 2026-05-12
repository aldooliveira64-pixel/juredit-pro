/**
 * JUREDITPRO — Fase 2
 * Item 2.8: Cache de resultados com TTL
 *
 * Estratégia em duas camadas:
 *   L1 — Memória (Map): ultra-rápido, perdido ao recarregar a página
 *   L2 — localStorage: persiste entre sessões, TTL configurável
 *
 * Uso:
 *   import cache from './cache-manager.js';
 *
 *   const dados = await cache.get('stf:LGPD');
 *   if (!dados) {
 *     const resultado = await buscarNaAPI('LGPD');
 *     cache.set('stf:LGPD', resultado, { ttl: 24 * 60 * 60 * 1000 }); // 24h
 *   }
 */

const PREFIXO_LS      = 'jurEditPro_cache_';
const TTL_PADRAO_MS   = 24 * 60 * 60 * 1000; // 24 horas
const MAX_ENTRADAS_LS = 200;                  // evita localStorage lotado

class CacheManager {
  constructor(options = {}) {
    this.ttlPadrao = options.ttl    ?? TTL_PADRAO_MS;
    this.prefixo   = options.prefix ?? PREFIXO_LS;
    this._memoria  = new Map(); // L1: in-memory
  }

  // ─── Chave segura para localStorage ─────────────────────────────────────

  _chaveLS(chave) {
    // Normaliza: minúsculas, sem caracteres especiais, prefixado
    const normalizada = chave
      .toLowerCase()
      .replace(/[^a-z0-9_:]/g, '_')
      .substring(0, 100);
    return `${this.prefixo}${normalizada}`;
  }

  // ─── GET ─────────────────────────────────────────────────────────────────

  /**
   * Recupera entrada do cache.
   * @returns {any|null} Valor cacheado ou null se expirado/inexistente
   */
  get(chave) {
    const agora = Date.now();

    // L1: memória
    if (this._memoria.has(chave)) {
      const entrada = this._memoria.get(chave);
      if (agora < entrada.expira) {
        return entrada.valor;
      }
      this._memoria.delete(chave);
    }

    // L2: localStorage
    try {
      const raw = localStorage.getItem(this._chaveLS(chave));
      if (!raw) return null;

      const entrada = JSON.parse(raw);
      if (agora >= entrada.expira) {
        localStorage.removeItem(this._chaveLS(chave));
        return null;
      }

      // Promove para L1
      this._memoria.set(chave, entrada);
      return entrada.valor;

    } catch {
      return null;
    }
  }

  // ─── SET ─────────────────────────────────────────────────────────────────

  /**
   * Salva entrada no cache.
   * @param {string} chave
   * @param {any}    valor
   * @param {object} opcoes - { ttl: ms, somenteMemoria: bool }
   */
  set(chave, valor, opcoes = {}) {
    const ttl         = opcoes.ttl          ?? this.ttlPadrao;
    const somenteMem  = opcoes.somenteMemoria ?? false;
    const expira      = Date.now() + ttl;

    const entrada = { valor, expira, criadoEm: Date.now() };

    // Sempre salva em L1
    this._memoria.set(chave, entrada);

    if (somenteMem) return;

    // Salva em L2 com controle de capacidade
    try {
      this._limparExpirados();
      localStorage.setItem(this._chaveLS(chave), JSON.stringify(entrada));
    } catch (e) {
      // localStorage cheio — remove entradas mais antigas e tenta novamente
      if (e.name === 'QuotaExceededError') {
        this._liberarEspaco();
        try {
          localStorage.setItem(this._chaveLS(chave), JSON.stringify(entrada));
        } catch {
          console.warn('[Cache] localStorage cheio mesmo após limpeza.');
        }
      }
    }
  }

  // ─── DELETE ──────────────────────────────────────────────────────────────

  delete(chave) {
    this._memoria.delete(chave);
    try {
      localStorage.removeItem(this._chaveLS(chave));
    } catch { /* ok */ }
  }

  // ─── HAS ─────────────────────────────────────────────────────────────────

  has(chave) {
    return this.get(chave) !== null;
  }

  // ─── GET OR FETCH ────────────────────────────────────────────────────────

  /**
   * Retorna cache se existir; caso contrário executa fn() e cacheia o resultado.
   * Padrão "cache-aside" — o mais usado.
   *
   * @param {string}   chave
   * @param {Function} fn    - função async que busca o dado
   * @param {object}   opcoes
   */
  async getOuBuscar(chave, fn, opcoes = {}) {
    const cached = this.get(chave);
    if (cached !== null) {
      return { dados: cached, doCashe: true };
    }

    const dados = await fn();
    this.set(chave, dados, opcoes);
    return { dados, doCashe: false };
  }

  // ─── INVALIDAÇÃO ─────────────────────────────────────────────────────────

  /**
   * Remove todas as entradas cujas chaves contém o padrão.
   * Ex: cache.invalidarPor('stf:') remove todas as buscas do STF.
   */
  invalidarPor(padrao) {
    // L1
    for (const chave of this._memoria.keys()) {
      if (chave.includes(padrao)) this._memoria.delete(chave);
    }

    // L2
    try {
      const chaveLS = this._chaveLS(padrao);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.includes(chaveLS)) localStorage.removeItem(k);
      }
    } catch { /* ok */ }
  }

  limparTudo() {
    this._memoria.clear();
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefixo)) localStorage.removeItem(k);
      }
    } catch { /* ok */ }
  }

  // ─── ESTATÍSTICAS ────────────────────────────────────────────────────────

  stats() {
    let totalLS = 0;
    let bytesLS = 0;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefixo)) {
          totalLS++;
          bytesLS += (localStorage.getItem(k) || '').length * 2; // UTF-16
        }
      }
    } catch { /* ok */ }

    return {
      entradas_memoria:    this._memoria.size,
      entradas_storage:    totalLS,
      bytes_storage:       bytesLS,
      kb_storage:          (bytesLS / 1024).toFixed(1),
    };
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  _limparExpirados() {
    const agora = Date.now();
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(this.prefixo)) continue;
        try {
          const entrada = JSON.parse(localStorage.getItem(k));
          if (agora >= entrada.expira) localStorage.removeItem(k);
        } catch {
          localStorage.removeItem(k);
        }
      }
    } catch { /* ok */ }
  }

  _liberarEspaco() {
    // Remove as 20% entradas mais antigas
    const entradas = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(this.prefixo)) continue;
        try {
          const entrada = JSON.parse(localStorage.getItem(k));
          entradas.push({ chave: k, criadoEm: entrada.criadoEm || 0 });
        } catch { /* ok */ }
      }

      entradas
        .sort((a, b) => a.criadoEm - b.criadoEm)
        .slice(0, Math.ceil(entradas.length * 0.2))
        .forEach(e => localStorage.removeItem(e.chave));

    } catch { /* ok */ }
  }
}

// Instância singleton — compartilhada em todo o JurEditPro
const cache = new CacheManager({ ttl: TTL_PADRAO_MS });

export default cache;
export { CacheManager };
