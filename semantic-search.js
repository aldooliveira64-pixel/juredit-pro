/**
 * JUREDITPRO — Fase 2
 * Item 2.4: Busca semântica automática de jurisprudência
 *
 * Fluxo:
 *   1. Extrai keywords do título do capítulo
 *   2. Gera embedding via HuggingFace (gratuito) ou OpenAI
 *   3. Busca no DataJud usando as keywords + enriquece com similaridade semântica
 *   4. Roda em background (não bloqueia o editor)
 *
 * Uso:
 *   import BuscaSemantica from './semantic-search.js';
 *   const bs = new BuscaSemantica();
 *   bs.onResultados((resultados) => renderizarSidebar(resultados));
 *   bs.buscarParaCapitulo({ id: 'cap1', titulo: 'Responsabilidade Civil do Estado' });
 */

import cache from './cache-manager.js';

// ─── Configuração ─────────────────────────────────────────────────────────────

const CONFIG = {
  // Modelo HuggingFace Inference API (gratuito com conta)
  // Alternativa: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
  hfModel: 'neuralmind/bert-base-portuguese-cased',
  hfApiKey: '',   // defina process.env.HF_API_KEY ou via painel do JurEditPro

  // OpenAI (opcional — mais preciso, pago)
  openaiApiKey: '', // process.env.OPENAI_API_KEY
  openaiModel:  'text-embedding-3-small',

  // Limiar mínimo de similaridade coseno para incluir resultado (0–1)
  limiarSimilaridade: 0.45,

  // Delay antes de buscar ao trocar de capítulo (evita buscas a cada tecla)
  debounceMs: 1500,

  // Middleware DataJud
  middlewareURL: '/.netlify/functions/datajud',
};

// ─── Stopwords jurídicas a remover ───────────────────────────────────────────

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'o', 'a', 'os', 'as',
  'que', 'se', 'no', 'na', 'por', 'com', 'uma', 'um', 'para', 'ou',
  'ao', 'aos', 'às', 'à', 'pelo', 'pela', 'pelos', 'pelas', 'este',
  'esta', 'esse', 'essa', 'isso', 'aquele', 'sua', 'seu', 'seus',
  'suas', 'como', 'mais', 'foi', 'ser', 'são', 'há', 'não',
  // termos muito genéricos no âmbito jurídico
  'direito', 'lei', 'artigo', 'art', 'parágrafo', 'inciso', 'alínea',
  'capítulo', 'seção', 'título', 'livro',
]);


// ─── Utilitários ──────────────────────────────────────────────────────────────

/**
 * Extrai keywords relevantes do título do capítulo
 */
function extrairKeywords(titulo) {
  return titulo
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))
    .slice(0, 6); // máximo 6 keywords
}

/**
 * Similaridade de cosseno entre dois vetores
 */
function similaridadeCosseno(a, b) {
  const dot   = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

/**
 * Gera embedding via HuggingFace Inference API
 */
async function gerarEmbeddingHF(texto) {
  const resp = await fetch(
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${CONFIG.hfModel}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.hfApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: texto, options: { wait_for_model: true } }),
    }
  );

  if (!resp.ok) throw new Error(`HuggingFace HTTP ${resp.status}`);

  const data = await resp.json();

  // HF retorna [[...vetor...]] para feature-extraction
  return Array.isArray(data[0]) ? data[0] : data;
}

/**
 * Gera embedding via OpenAI
 */
async function gerarEmbeddingOpenAI(texto) {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: texto, model: CONFIG.openaiModel }),
  });

  if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);

  const data = await resp.json();
  return data.data[0].embedding;
}

/**
 * Gera embedding — tenta HF primeiro, OpenAI como fallback
 */
async function gerarEmbedding(texto) {
  const chaveCache = `emb:${texto.substring(0, 80)}`;
  const cached     = cache.get(chaveCache);
  if (cached) return cached;

  let embedding;

  if (CONFIG.hfApiKey) {
    embedding = await gerarEmbeddingHF(texto);
  } else if (CONFIG.openaiApiKey) {
    embedding = await gerarEmbeddingOpenAI(texto);
  } else {
    throw new Error('Configure HF_API_KEY ou OPENAI_API_KEY para busca semântica.');
  }

  cache.set(chaveCache, embedding, { ttl: 7 * 24 * 60 * 60 * 1000 }); // 7 dias
  return embedding;
}


// ─── Classe principal ─────────────────────────────────────────────────────────

class BuscaSemantica {
  constructor(options = {}) {
    this._config       = { ...CONFIG, ...options };
    this._callbacks    = [];
    this._debounceTimer = null;
    this._buscando     = false;
  }

  /**
   * Registra callback chamado quando resultados chegam
   * @param {Function} fn - (resultados: Acordao[], meta: object) => void
   */
  onResultados(fn) {
    this._callbacks.push(fn);
    return this; // encadeável
  }

  _emitir(resultados, meta) {
    this._callbacks.forEach(fn => fn(resultados, meta));
  }

  /**
   * Inicia busca semântica para um capítulo (com debounce)
   * @param {{ id: string, titulo: string }} capitulo
   */
  buscarParaCapitulo(capitulo) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(
      () => this._executarBusca(capitulo),
      this._config.debounceMs
    );
  }

  async _executarBusca(capitulo) {
    if (this._buscando) return;
    this._buscando = true;

    const keywords = extrairKeywords(capitulo.titulo);
    if (!keywords.length) {
      this._buscando = false;
      return;
    }

    const termoQuery = keywords.join(' ');
    const chaveCache  = `semantica:${capitulo.id}:${termoQuery}`;

    try {
      // Verifica cache primeiro
      const cached = cache.get(chaveCache);
      if (cached) {
        this._emitir(cached, { doCashe: true, capitulo, keywords });
        return;
      }

      // 1. Busca no DataJud pelos termos
      const params = new URLSearchParams({
        termo:    termoQuery,
        tribunal: 'todos',
        tamanho:  '20',
      });

      const resp = await fetch(`${this._config.middlewareURL}?${params}`);
      if (!resp.ok) throw new Error(`DataJud HTTP ${resp.status}`);

      const { resultados } = await resp.json();
      if (!resultados?.length) {
        this._emitir([], { capitulo, keywords, total: 0 });
        return;
      }

      // 2. Gera embedding do título do capítulo
      let embCapitulo;
      let usarSimilaridade = true;

      try {
        embCapitulo = await gerarEmbedding(capitulo.titulo);
      } catch {
        // Se embedding falhar, retorna resultados sem reranking semântico
        usarSimilaridade = false;
      }

      // 3. Reordena por similaridade semântica
      let rankados = resultados;

      if (usarSimilaridade && embCapitulo) {
        const comSimilaridade = await Promise.all(
          resultados.map(async (acordao) => {
            try {
              const embEmenta   = await gerarEmbedding(acordao.ementa.substring(0, 500));
              const similaridade = similaridadeCosseno(embCapitulo, embEmenta);
              return { ...acordao, similaridade };
            } catch {
              return { ...acordao, similaridade: 0 };
            }
          })
        );

        rankados = comSimilaridade
          .filter(a => a.similaridade >= this._config.limiarSimilaridade)
          .sort((a, b) => b.similaridade - a.similaridade);
      }

      // 4. Cacheia e emite
      cache.set(chaveCache, rankados, { ttl: 24 * 60 * 60 * 1000 });
      this._emitir(rankados, { capitulo, keywords, total: rankados.length, semantico: usarSimilaridade });

    } catch (erro) {
      console.error('[BuscaSemantica]', erro.message);
      this._emitir([], { capitulo, keywords, erro: erro.message });

    } finally {
      this._buscando = false;
    }
  }

  /**
   * Busca imediata sem debounce (ex: ao clicar em "Buscar Agora")
   */
  buscarAgora(capitulo) {
    clearTimeout(this._debounceTimer);
    return this._executarBusca(capitulo);
  }

  cancelar() {
    clearTimeout(this._debounceTimer);
  }
}

export default BuscaSemantica;
