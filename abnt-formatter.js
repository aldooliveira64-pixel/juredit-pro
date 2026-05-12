/**
 * JUREDITPRO — Fase 2
 * Item 2.7: Normalização ABNT de julgados (NBR 6023:2018)
 *
 * Uso:
 *   import { formatarABNT, formatarLista } from './abnt-formatter.js';
 *
 *   const ref = formatarABNT({
 *     ente:      'STF',
 *     numeracao: 'RE 1.234.567',
 *     relator:   'Min. Alexandre de Moraes',
 *     data:      '2024-03-15',
 *     ementa:    'Responsabilidade civil do Estado...',
 *     url:       'https://portal.stf.jus.br/...',
 *   });
 *   // → "BRASIL. Supremo Tribunal Federal. RE 1.234.567. Rel. Min. Alexandre de Moraes,
 *   //    julgado em 15 mar. 2024. Disponível em: https://... Acesso em: 10 maio 2026."
 */

// ─── Mapa de siglas → nome oficial e órgão ───────────────────────────────────

const TRIBUNAIS = {
  STF:   { pais: 'BRASIL', orgao: 'Supremo Tribunal Federal' },
  STJ:   { pais: 'BRASIL', orgao: 'Superior Tribunal de Justiça' },
  TCU:   { pais: 'BRASIL', orgao: 'Tribunal de Contas da União' },
  TRF1:  { pais: 'BRASIL', orgao: 'Tribunal Regional Federal da 1ª Região' },
  TRF2:  { pais: 'BRASIL', orgao: 'Tribunal Regional Federal da 2ª Região' },
  TRF3:  { pais: 'BRASIL', orgao: 'Tribunal Regional Federal da 3ª Região' },
  TRF4:  { pais: 'BRASIL', orgao: 'Tribunal Regional Federal da 4ª Região' },
  TRF5:  { pais: 'BRASIL', orgao: 'Tribunal Regional Federal da 5ª Região' },
  TRF6:  { pais: 'BRASIL', orgao: 'Tribunal Regional Federal da 6ª Região' },
  TJDFT: { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Distrito Federal e dos Territórios' },
  TJSP:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado de São Paulo' },
  TJRJ:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado do Rio de Janeiro' },
  TJMG:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado de Minas Gerais' },
  TJRS:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado do Rio Grande do Sul' },
  TJSC:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado de Santa Catarina' },
  TJBA:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado da Bahia' },
  TJPR:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado do Paraná' },
  TJGO:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado de Goiás' },
  TJPE:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado de Pernambuco' },
  TJCE:  { pais: 'BRASIL', orgao: 'Tribunal de Justiça do Estado do Ceará' },
};

// Meses abreviados conforme NBR 6023
const MESES_ABREV = [
  'jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
];


// ─── Utilitários de data ──────────────────────────────────────────────────────

/**
 * Converte data (ISO ou dd/mm/yyyy) para formato ABNT: "15 mar. 2024"
 */
function formatarDataABNT(dataStr) {
  if (!dataStr) return '';

  let dia, mes, ano;

  // ISO: 2024-03-15
  if (/^\d{4}-\d{2}-\d{2}/.test(dataStr)) {
    [ano, mes, dia] = dataStr.substring(0, 10).split('-').map(Number);
  }
  // BR: 15/03/2024
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(dataStr)) {
    [dia, mes, ano] = dataStr.substring(0, 10).split('/').map(Number);
  }
  else {
    return dataStr; // retorna como está se formato desconhecido
  }

  const mesAbrev = MESES_ABREV[(mes || 1) - 1] || '';
  return `${dia} ${mesAbrev} ${ano}`;
}

/**
 * Data de acesso no formato ABNT: "10 maio 2026."
 */
function dataAcessoABNT() {
  const hoje = new Date();
  const dia   = hoje.getDate();
  const mes   = MESES_ABREV[hoje.getMonth()];
  const ano   = hoje.getFullYear();
  return `${dia} ${mes} ${ano}.`;
}

/**
 * Trunca ementa para nota de rodapé (máx 150 chars)
 */
function truncarEmenta(ementa, max = 150) {
  if (!ementa || ementa.length <= max) return ementa || '';
  return ementa.substring(0, max).trimEnd() + '[...]';
}


// ─── Formatador principal ─────────────────────────────────────────────────────

/**
 * Formata um acórdão conforme ABNT NBR 6023:2018
 *
 * @param {object} acordao
 * @param {string} acordao.ente           - Sigla do tribunal: 'STF', 'STJ', etc.
 * @param {string} acordao.numeracao      - Número do processo/acórdão: 'RE 1.234.567'
 * @param {string} acordao.relator        - Nome do relator
 * @param {string} acordao.data           - Data ISO (2024-03-15) ou BR (15/03/2024)
 * @param {string} [acordao.ementa]       - Texto da ementa (opcional, para nota)
 * @param {string} [acordao.url]          - URL do inteiro teor
 * @param {string} [acordao.orgao]        - Órgão julgador (se diferente do padrão)
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.comEmenta]    - Inclui ementa truncada após a referência
 * @param {boolean} [opcoes.semAcesso]    - Omite "Acesso em" (ex: acervo físico)
 *
 * @returns {string} Referência bibliográfica ABNT
 */
function formatarABNT(acordao, opcoes = {}) {
  const sigla  = (acordao.ente || '').toUpperCase().replace(/\s/g, '');
  const info   = TRIBUNAIS[sigla] || { pais: 'BRASIL', orgao: sigla };
  const orgao  = acordao.orgao || info.orgao || sigla;
  const pais   = info.pais;

  const data    = formatarDataABNT(acordao.data || acordao.data_julgamento || '');
  const relator = acordao.relator ? `Rel. ${acordao.relator},` : '';
  const julgado = data ? `julgado em ${data}.` : '';

  // Monta referência base
  // Formato: PAÍS. Órgão. Número. Rel. Nome, julgado em DD mmm. AAAA.
  let ref = `${pais}. ${orgao}. ${acordao.numeracao || ''}.`;

  if (relator) ref += ` ${relator}`;
  if (julgado) ref += ` ${julgado}`;

  // Disponibilidade eletrônica
  if (acordao.url && !opcoes.semAcesso) {
    ref += ` Disponível em: ${acordao.url}`;
    ref += ` Acesso em: ${dataAcessoABNT()}`;
  }

  // Ementa como nota complementar
  if (opcoes.comEmenta && acordao.ementa) {
    ref += `\n  Ementa: ${truncarEmenta(acordao.ementa)}`;
  }

  // Remove espaços duplos e limpa
  return ref.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Formata lista de acórdãos para seção de referências
 * @param {object[]} acordaos
 * @param {object}   opcoes
 * @returns {string} Bloco de referências separadas por \n\n
 */
function formatarLista(acordaos, opcoes = {}) {
  return acordaos
    .map(a => formatarABNT(a, opcoes))
    .join('\n\n');
}

/**
 * Formata citação curta no texto (nota de rodapé ou in-text)
 * Ex: "(STF, RE 1.234.567, 2024)"
 */
function formatarCitacaoCurta(acordao) {
  const sigla  = (acordao.ente || '').toUpperCase();
  const numero = acordao.numeracao || '';
  const ano    = (acordao.data || acordao.data_julgamento || '').substring(0, 4);
  return `(${[sigla, numero, ano].filter(Boolean).join(', ')})`;
}

/**
 * Converte acórdão do formato DataJud para o formato esperado pelo formatador
 */
function datajudParaAbnt(acordao) {
  return {
    ente:      acordao.tribunal,
    numeracao: acordao.numero_processo,
    relator:   acordao.relator,
    data:      acordao.data_julgamento,
    ementa:    acordao.ementa,
    url:       acordao.url,
  };
}


// ─── Exportações ──────────────────────────────────────────────────────────────

export {
  formatarABNT,
  formatarLista,
  formatarCitacaoCurta,
  datajudParaAbnt,
  formatarDataABNT,
  TRIBUNAIS,
};

export default formatarABNT;
