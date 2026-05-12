# JurEditPro — Fase 2: Guia de Integração

## Estrutura dos arquivos gerados

```
fase2/
├── netlify/
│   └── functions/
│       └── datajud.js          ← 2.1  Middleware DataJud (Netlify Function)
├── js/
│   ├── tribunal-connectors.js  ← 2.2  Conectores STF, STJ, TCU, TRFs
│   ├── semantic-search.js      ← 2.4  Busca semântica automática
│   ├── jurisprudencia-ui.js    ← 2.5  Sidebar de referências
│   │                           ← 2.6  Botão "Importar para capítulo"
│   ├── abnt-formatter.js       ← 2.7  Normalização ABNT NBR 6023:2018
│   └── cache-manager.js        ← 2.8  Cache L1 (memória) + L2 (localStorage)
└── scraper/
    └── scraper.py              ← 2.3  Web scraping (tribunais sem API)
```

---

## Passo 1 — Configurar a Netlify Function (2.1)

Copie `netlify/functions/datajud.js` para a raiz do seu projeto:

```
seu-projeto/
└── netlify/
    └── functions/
        └── datajud.js
```

No painel do Netlify → **Environment Variables**, adicione:

```
DATAJUD_API_KEY = sua_chave_aqui
```

> Sem chave própria? A chave pública `clave-datajud-api-publica` já está no código como fallback.
> Solicite acesso em: https://datajud-wiki.cnj.jus.br/api-publica/

Teste local:
```bash
netlify dev
# Acesse: http://localhost:8888/.netlify/functions/datajud?termo=LGPD&tribunal=stf
```

---

## Passo 2 — Adicionar os módulos JS ao projeto

Copie a pasta `js/` para dentro do seu projeto e adicione ao `index.html`:

```html
<!-- No final do <body> -->
<script type="module" src="js/jurisprudencia-ui.js"></script>
```

Esse único import carrega automaticamente:
- A sidebar lateral (2.5)
- O botão importar (2.6)
- A busca semântica em background (2.4)
- O cache (2.8)
- O formatador ABNT (2.7)

---

## Passo 3 — Conectar ao editor existente

Adicione dois eventos no seu código de editor:

### 3a. Quando o usuário troca de capítulo:

```javascript
// No seu código de seleção de capítulo:
document.dispatchEvent(new CustomEvent('jurEditPro:capituloAtivo', {
  detail: {
    id:     capitulo.id,      // ID do capítulo
    titulo: capitulo.titulo,  // Título (usado para busca semântica)
  }
}));
```

### 3b. Quando o usuário importa julgados (receber o evento):

```javascript
document.addEventListener('jurEditPro:importarJurisprudencia', (e) => {
  const { capituloId, acordaos, referencias, ids } = e.detail;

  // Atualiza o capítulo no seu estado/localStorage:
  const capitulo = chapters.find(c => c.id === capituloId);
  if (capitulo) {
    capitulo.jurisprudencia = [
      ...(capitulo.jurisprudencia || []),
      ...ids,
    ];

    // Adiciona referências ABNT ao texto do capítulo (opcional):
    // capitulo.referencias_abnt = referencias;

    // Salva no localStorage:
    localStorage.setItem('jurEditPro_project', JSON.stringify({ chapters }));
  }
});
```

---

## Passo 4 — Scraper Python (2.3, opcional)

Para tribunais sem API (ex: TRF3, TJSC):

```bash
# Instalar dependências
pip install selenium webdriver-manager requests beautifulsoup4 lxml

# Rodar busca
python scraper/scraper.py --tribunal trf3 --termo "responsabilidade civil" --saida resultado.json
```

O JSON gerado tem o mesmo formato do DataJud e pode ser importado manualmente.

---

## Passo 5 — Busca semântica (2.4, opcional mas poderoso)

Para ativar o reranking semântico, adicione no painel Netlify:

```
# Opção A — HuggingFace (gratuito)
HF_API_KEY = hf_xxxxxxxxxxxx

# Opção B — OpenAI (mais preciso, pago)
OPENAI_API_KEY = sk-xxxxxxxxxxxx
```

Sem essas chaves, a sidebar ainda funciona — apenas sem reordenação semântica.

---

## Fluxo completo em produção

```
Usuário troca de capítulo
    ↓
[Editor] dispara jurEditPro:capituloAtivo
    ↓
[BuscaSemantica] extrai keywords do título (debounce 1.5s)
    ↓
[CacheManager] verifica cache local (24h TTL)
    ↓ cache miss
[TribunalAPI] → [Netlify Function] → [DataJud CNJ]
    ↓
[BuscaSemantica] reordena por similaridade (se HF/OpenAI configurado)
    ↓
[Sidebar] exibe resultados com checkboxes
    ↓
Usuário seleciona + clica "Importar"
    ↓
[ABNT Formatter] gera referências NBR 6023
    ↓
[Editor] recebe jurEditPro:importarJurisprudencia e salva no capítulo
```

---

## Compatibilidade

| Módulo               | Requer backend | Requer API key | Funciona offline |
|----------------------|:--------------:|:--------------:|:----------------:|
| datajud.js           | ✅ Netlify Fn  | Opcional       | ❌               |
| tribunal-connectors  | Via datajud.js | —              | ❌               |
| jurisprudencia-ui    | Via connectors | —              | Parcial (cache)  |
| abnt-formatter       | ❌ Frontend    | —              | ✅               |
| cache-manager        | ❌ Frontend    | —              | ✅               |
| semantic-search      | ❌ Frontend    | HF ou OpenAI   | Sem reranking    |
| scraper.py           | Servidor local | —              | ✅               |
