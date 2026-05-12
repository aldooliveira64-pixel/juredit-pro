/**
 * JUREDITPRO — Fase 2
 * Itens 2.5 + 2.6: Sidebar de Referências + Botão "Importar para Capítulo"
 *
 * Vanilla JS puro — sem dependência de framework.
 * Injetar no HTML com: <script type="module" src="js/jurisprudencia-ui.js"></script>
 *
 * Requer:
 *   - tribunal-connectors.js
 *   - abnt-formatter.js
 *   - cache-manager.js
 *   - semantic-search.js (opcional — para busca automática)
 */

import TribunalAPI     from './tribunal-connectors.js';
import { formatarABNT, datajudParaAbnt, formatarCitacaoCurta } from './abnt-formatter.js';
import cache           from './cache-manager.js';
import BuscaSemantica  from './semantic-search.js';

// ─── Estado global da Sidebar ─────────────────────────────────────────────────

const estado = {
  capitulo:    null,   // capítulo atualmente selecionado
  resultados:  [],     // acórdãos exibidos
  selecionados: new Set(), // IDs dos checkados
  pagina:      1,
  buscando:    false,
  tribunal:    'todos',
  termoBusca:  '',
};

const api           = new TribunalAPI();
const buscaSemantica = new BuscaSemantica();

// ─── Injeção do HTML da Sidebar ───────────────────────────────────────────────

function criarSidebarHTML() {
  const sidebar = document.createElement('aside');
  sidebar.id         = 'jureditpro-sidebar';
  sidebar.className  = 'jureditpro-sidebar jureditpro-sidebar--fechado';
  sidebar.innerHTML  = `
    <div class="jsb-header">
      <span class="jsb-titulo">⚖️ Jurisprudência</span>
      <button class="jsb-btn-fechar" title="Fechar sidebar">✕</button>
    </div>

    <div class="jsb-busca">
      <select class="jsb-select-tribunal" title="Tribunal">
        <option value="todos">Todos os tribunais</option>
        <option value="stf">STF</option>
        <option value="stj">STJ</option>
        <option value="tcu">TCU</option>
        <option value="trf1">TRF1</option>
        <option value="trf2">TRF2</option>
        <option value="trf3">TRF3</option>
        <option value="trf4">TRF4</option>
        <option value="trf5">TRF5</option>
        <option value="tjdft">TJDFT</option>
        <option value="tjsp">TJSP</option>
        <option value="tjrj">TJRJ</option>
        <option value="tjmg">TJMG</option>
        <option value="tjrs">TJRS</option>
      </select>
      <div class="jsb-busca-row">
        <input class="jsb-input-busca" type="text" placeholder="Buscar jurisprudência..." />
        <button class="jsb-btn-buscar">🔍</button>
      </div>
    </div>

    <div class="jsb-status"></div>

    <div class="jsb-lista"></div>

    <div class="jsb-acoes">
      <button class="jsb-btn-importar" disabled>
        ↩ Importar selecionados (<span class="jsb-contador">0</span>)
      </button>
      <button class="jsb-btn-mais">Carregar mais</button>
    </div>
  `;

  document.body.appendChild(sidebar);
  return sidebar;
}

// ─── CSS injetado dinamicamente ───────────────────────────────────────────────

function injetarCSS() {
  if (document.getElementById('jureditpro-sidebar-css')) return;

  const style = document.createElement('style');
  style.id    = 'jureditpro-sidebar-css';
  style.textContent = `
    .jureditpro-sidebar {
      position: fixed;
      top: 0; right: 0;
      width: 340px;
      height: 100vh;
      background: #fff;
      border-left: 2px solid #1a3a5c;
      box-shadow: -4px 0 24px rgba(0,0,0,0.12);
      display: flex;
      flex-direction: column;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      z-index: 9999;
      transition: transform 0.3s ease;
    }
    .jureditpro-sidebar--fechado { transform: translateX(100%); }

    .jsb-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #1a3a5c;
      color: #fff;
      font-weight: 600;
      font-size: 14px;
    }
    .jsb-btn-fechar {
      background: none; border: none; color: #fff;
      cursor: pointer; font-size: 16px; padding: 0 4px;
    }

    .jsb-busca {
      padding: 12px;
      border-bottom: 1px solid #e5e9ef;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .jsb-select-tribunal {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #c7d0db;
      border-radius: 6px;
      font-size: 12px;
    }
    .jsb-busca-row {
      display: flex;
      gap: 6px;
    }
    .jsb-input-busca {
      flex: 1;
      padding: 7px 10px;
      border: 1px solid #c7d0db;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
    }
    .jsb-input-busca:focus { border-color: #1a3a5c; }
    .jsb-btn-buscar {
      padding: 6px 12px;
      background: #1a3a5c;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    .jsb-status {
      padding: 6px 14px;
      font-size: 11px;
      color: #666;
      min-height: 22px;
    }

    .jsb-lista {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .jsb-card {
      border: 1px solid #dde3ea;
      border-radius: 8px;
      padding: 10px 12px;
      cursor: default;
      transition: border-color 0.15s;
    }
    .jsb-card:hover { border-color: #1a3a5c; }
    .jsb-card--selecionado { border-color: #2e7d32; background: #f1f8f1; }

    .jsb-card-header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 6px;
    }
    .jsb-checkbox { margin-top: 2px; accent-color: #2e7d32; }

    .jsb-badge {
      font-size: 10px;
      font-weight: 700;
      background: #1a3a5c;
      color: #fff;
      border-radius: 4px;
      padding: 1px 6px;
      white-space: nowrap;
    }

    .jsb-numero {
      font-size: 11px;
      color: #1a3a5c;
      font-weight: 600;
    }
    .jsb-relator { font-size: 11px; color: #555; }
    .jsb-data    { font-size: 10px; color: #888; }

    .jsb-ementa {
      font-size: 11px;
      color: #333;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .jsb-ementa--expandida { -webkit-line-clamp: unset; }

    .jsb-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }
    .jsb-btn-expandir {
      font-size: 10px;
      color: #1a3a5c;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
    }
    .jsb-btn-link {
      font-size: 10px;
      color: #1976d2;
      text-decoration: none;
    }
    .jsb-btn-link:hover { text-decoration: underline; }

    .jsb-acoes {
      padding: 10px 12px;
      border-top: 1px solid #e5e9ef;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .jsb-btn-importar {
      padding: 8px;
      background: #2e7d32;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .jsb-btn-importar:disabled { background: #aaa; cursor: not-allowed; }
    .jsb-btn-mais {
      padding: 6px;
      background: none;
      border: 1px solid #c7d0db;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      color: #555;
    }
    .jsb-vazio {
      text-align: center;
      color: #999;
      padding: 40px 20px;
      font-size: 12px;
    }
    .jsb-loading {
      text-align: center;
      padding: 30px;
      color: #555;
    }

    /* Botão flutuante para abrir a sidebar */
    #jsb-toggle {
      position: fixed;
      right: 16px;
      bottom: 80px;
      background: #1a3a5c;
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      z-index: 9998;
    }
  `;

  document.head.appendChild(style);
}

// ─── Renderização ─────────────────────────────────────────────────────────────

function renderizarCard(acordao) {
  const card = document.createElement('div');
  card.className   = 'jsb-card';
  card.dataset.id  = acordao.id;

  const selecionado = estado.selecionados.has(acordao.id);
  if (selecionado) card.classList.add('jsb-card--selecionado');

  const dataFmt = acordao.data_julgamento
    ? new Date(acordao.data_julgamento).toLocaleDateString('pt-BR')
    : '';

  card.innerHTML = `
    <div class="jsb-card-header">
      <input type="checkbox" class="jsb-checkbox" data-id="${acordao.id}" ${selecionado ? 'checked' : ''} />
      <div>
        <span class="jsb-badge">${acordao.tribunal}</span>
        <div class="jsb-numero">${acordao.numero_processo || '—'}</div>
      </div>
    </div>
    <div class="jsb-relator">${acordao.relator ? '👤 ' + acordao.relator : ''}</div>
    <div class="jsb-data">${dataFmt}</div>
    <div class="jsb-ementa">${acordao.ementa || 'Ementa não disponível.'}</div>
    <div class="jsb-card-footer">
      <button class="jsb-btn-expandir">ver mais</button>
      ${acordao.url ? `<a class="jsb-btn-link" href="${acordao.url}" target="_blank" rel="noopener">Íntegra ↗</a>` : ''}
    </div>
  `;

  // Checkbox → selecionar/deselecionar
  card.querySelector('.jsb-checkbox').addEventListener('change', (e) => {
    if (e.target.checked) {
      estado.selecionados.add(acordao.id);
      card.classList.add('jsb-card--selecionado');
    } else {
      estado.selecionados.delete(acordao.id);
      card.classList.remove('jsb-card--selecionado');
    }
    atualizarBotaoImportar();
  });

  // Expandir ementa
  const ementa = card.querySelector('.jsb-ementa');
  card.querySelector('.jsb-btn-expandir').addEventListener('click', () => {
    const expandida = ementa.classList.toggle('jsb-ementa--expandida');
    card.querySelector('.jsb-btn-expandir').textContent = expandida ? 'ver menos' : 'ver mais';
  });

  return card;
}

function renderizarLista() {
  const lista = document.querySelector('.jsb-lista');
  if (!lista) return;

  lista.innerHTML = '';

  if (!estado.resultados.length) {
    lista.innerHTML = '<div class="jsb-vazio">Nenhum resultado encontrado.<br>Tente outra busca.</div>';
    return;
  }

  estado.resultados.forEach(a => lista.appendChild(renderizarCard(a)));
}

function atualizarStatus(msg) {
  const el = document.querySelector('.jsb-status');
  if (el) el.textContent = msg;
}

function atualizarBotaoImportar() {
  const btn     = document.querySelector('.jsb-btn-importar');
  const contador = document.querySelector('.jsb-contador');
  const n        = estado.selecionados.size;
  if (btn) btn.disabled = n === 0;
  if (contador) contador.textContent = n;
}

// ─── Busca ────────────────────────────────────────────────────────────────────

async function executarBusca(termo, pagina = 1) {
  if (estado.buscando) return;
  estado.buscando  = true;
  estado.termoBusca = termo;
  estado.pagina    = pagina;

  const lista = document.querySelector('.jsb-lista');
  if (lista) lista.innerHTML = '<div class="jsb-loading">⏳ Buscando acórdãos...</div>';

  atualizarStatus('Consultando DataJud...');

  try {
    const resp = await api._buscar(estado.tribunal, termo, { pagina, tamanho: 10 });

    estado.resultados = pagina === 1
      ? (resp.resultados || [])
      : [...estado.resultados, ...(resp.resultados || [])];

    renderizarLista();
    atualizarStatus(`${resp.total || estado.resultados.length} resultado(s) encontrado(s)`);

  } catch (erro) {
    atualizarStatus('Erro ao buscar. Verifique a conexão.');
    if (lista) lista.innerHTML = `<div class="jsb-vazio">❌ ${erro.message}</div>`;

  } finally {
    estado.buscando = false;
  }
}

// ─── Importar para capítulo (2.6) ────────────────────────────────────────────

function importarSelecionados() {
  if (!estado.capitulo || !estado.selecionados.size) return;

  const acordaosSelecionados = estado.resultados
    .filter(a => estado.selecionados.has(a.id));

  // Formata referências ABNT
  const referencias = acordaosSelecionados.map(a =>
    formatarABNT(datajudParaAbnt(a))
  );

  // IDs para o chapter.jurisprudencia
  const ids = acordaosSelecionados.map(a => a.id);

  // Dispara evento customizado — o editor captura e atualiza o capítulo
  document.dispatchEvent(new CustomEvent('jurEditPro:importarJurisprudencia', {
    detail: {
      capituloId:  estado.capitulo.id,
      acordaos:    acordaosSelecionados,
      referencias, // strings ABNT prontas
      ids,
    },
  }));

  // Feedback visual
  atualizarStatus(`✅ ${ids.length} julgado(s) importado(s) para "${estado.capitulo.titulo}"`);
  estado.selecionados.clear();
  atualizarBotaoImportar();

  // Re-renderiza cards sem seleção
  document.querySelectorAll('.jsb-card--selecionado').forEach(c => {
    c.classList.remove('jsb-card--selecionado');
    const cb = c.querySelector('.jsb-checkbox');
    if (cb) cb.checked = false;
  });
}

// ─── Inicialização ────────────────────────────────────────────────────────────

function inicializarSidebar() {
  injetarCSS();
  const sidebar = criarSidebarHTML();

  // Botão flutuante de toggle
  const toggle = document.createElement('button');
  toggle.id          = 'jsb-toggle';
  toggle.title       = 'Abrir jurisprudência';
  toggle.textContent = '⚖️';
  document.body.appendChild(toggle);

  // Eventos
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('jureditpro-sidebar--fechado');
  });

  sidebar.querySelector('.jsb-btn-fechar').addEventListener('click', () => {
    sidebar.classList.add('jureditpro-sidebar--fechado');
  });

  sidebar.querySelector('.jsb-btn-buscar').addEventListener('click', () => {
    const termo = sidebar.querySelector('.jsb-input-busca').value.trim();
    if (termo.length >= 3) executarBusca(termo);
  });

  sidebar.querySelector('.jsb-input-busca').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const termo = e.target.value.trim();
      if (termo.length >= 3) executarBusca(termo);
    }
  });

  sidebar.querySelector('.jsb-select-tribunal').addEventListener('change', (e) => {
    estado.tribunal = e.target.value;
    if (estado.termoBusca) executarBusca(estado.termoBusca);
  });

  sidebar.querySelector('.jsb-btn-mais').addEventListener('click', () => {
    if (estado.termoBusca) executarBusca(estado.termoBusca, estado.pagina + 1);
  });

  sidebar.querySelector('.jsb-btn-importar').addEventListener('click', importarSelecionados);

  // Escuta capítulo ativo (o editor deve disparar este evento ao trocar de capítulo)
  document.addEventListener('jurEditPro:capituloAtivo', (e) => {
    estado.capitulo = e.detail;
    estado.selecionados.clear();
    atualizarBotaoImportar();

    // Popula campo de busca com título do capítulo e busca automaticamente
    const input = sidebar.querySelector('.jsb-input-busca');
    if (input) input.value = e.detail.titulo || '';

    if (e.detail.titulo) {
      buscaSemantica.buscarParaCapitulo(e.detail);
    }
  });

  // Resultado da busca semântica popula a sidebar automaticamente
  buscaSemantica.onResultados((resultados, meta) => {
    if (!resultados.length) return;
    estado.resultados = resultados;
    renderizarLista();
    atualizarStatus(`🤖 ${resultados.length} sugestão(ões) semântica(s) para "${meta.capitulo?.titulo}"`);
  });

  return sidebar;
}

// ─── Auto-inicialização ───────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarSidebar);
} else {
  inicializarSidebar();
}

export { inicializarSidebar, executarBusca, importarSelecionados };
