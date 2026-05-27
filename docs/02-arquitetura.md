<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 02 — Arquitetura

## Layout do repositório

```
vozes-do-sertao/
├── discovery-documentos/        # Coletor Python original (referência)
├── discovery-documentos-ts/     # Port TypeScript (Bun + Fastify) — produção
├── museu-digital/               # Front-end web (Next.js) — site do museu
└── docs/                        # Documentação compartilhada
```

Os três sub-projetos compartilham o mesmo diretório `data/` quando rodam localmente, via env var `DATA_DIR`.

## discovery-documentos (Python)

Implementação inicial, hoje servindo como **referência de comportamento**. Manter por enquanto para auditar paridade quando algo no port TS divergir.

Módulos:
- `config.py` — queries, paths, domínios
- `discover.py` — Exa (semântica) + Firecrawl (keyword search)
- `filter.py` — dedupe + blocklist
- `scrape.py` — Firecrawl scrape → Markdown
- `save.py` — persist `.md` + `.meta.json`
- `scrape_iguanambi.py` — WordPress REST API
- `scrape_sudoestebahia.py` — async ID enum + body scan
- `article_rich.py` — parser HTML estruturado (blocos)
- `pdf_generator.py` — ReportLab + branding
- `manifest.py` — manifest unificado
- `main.py` — orquestrador CLI

## discovery-documentos-ts (TypeScript)

Port 1:1 do Python, runtime **Bun**, framework HTTP **Fastify**. Mesmas funções com nomes equivalentes, mesma estrutura de dados.

| Função | Python | TypeScript |
|---|---|---|
| Runtime | CPython 3.11 | Bun 1.1+ |
| HTTP server | — | Fastify 5 |
| HTML parse | BeautifulSoup4 | cheerio |
| HTTP client | httpx | native `fetch` |
| Imagens | Pillow | sharp |
| PDF | ReportLab | pdfkit |
| Concorrência | asyncio.Semaphore | p-limit |
| Retry | tenacity | p-retry |
| CLI | argparse | commander |
| Progresso | tqdm | cli-progress |
| Exa | exa-py | exa-js |
| Firecrawl | firecrawl-py | @mendable/firecrawl-js |

Módulos espelhados em `src/`:

```
src/
├── config.ts            ↔ config.py
├── types.ts             (interfaces compartilhadas)
├── util.ts              (slugify, datas, hash, json)
├── rights.ts            (classificação L1/L2/L3 — novo, sem equivalente em Python)
├── discover.ts          ↔ discover.py
├── filter.ts            ↔ filter.py
├── scrape.ts            ↔ scrape.py
├── save.ts              ↔ save.py
├── scrape-iguanambi.ts  ↔ scrape_iguanambi.py
├── scrape-sudoestebahia.ts ↔ scrape_sudoestebahia.py
├── article-rich.ts      ↔ article_rich.py
├── pdf-generator.ts     ↔ pdf_generator.py
├── manifest.ts          ↔ manifest.py
├── cli.ts               ↔ main.py
└── server.ts            (HTTP API — novo)
```

## museu-digital (Next.js)

Site público do museu — Next.js. Consome a API do `discovery-documentos-ts`. Renderiza:
- Página inicial com curadoria editorial
- Catálogo navegável (filtros por camada, fonte, ano, tema)
- Página de cada documento (L1/L2: conteúdo integral; L3: ficha referencial + link)
- Formulário LGPD (`/remove-request`)
- Páginas de exposição (curadoria temática)

## Diretório de dados

Estrutura compartilhada (configurável via `DATA_DIR`):

```
data/
├── raw/                          # Markdown + meta.json por documento (LOCAL ONLY p/ L3)
│   ├── 0001_iguanambi_*.md
│   ├── 0001_iguanambi_*.meta.json
│   └── ...
├── images/                       # Imagens baixadas das matérias (LOCAL ONLY)
├── pdf/                          # PDFs branded gerados (LOCAL ONLY p/ L3)
├── manifest.json                 # Índice unificado (PÚBLICO — sem conteúdo, só metadados + hashes)
├── lgpd_remove_requests.jsonl    # Pedidos LGPD recebidos
├── cache_discovered_urls.json
├── cache_sudoeste_ids.json
├── cache_sudoeste_parsed.json
├── cache_sudoeste_candidates.json
└── cache_sudoeste_matched.json
```

Apenas `manifest.json` é versionado no git. `raw/`, `images/`, `pdf/` e caches ficam **local-only** — protege Camada 3 e dá liberdade para treino de IA interno.

## Fluxo de dados ponta-a-ponta

```
[Fontes externas]
    ├── Exa (semântica)
    ├── Firecrawl (keyword search + scrape)
    ├── iguanambi.com.br (WordPress REST API)
    ├── sudoestebahia.com (HTTP + ID enumeration)
    └── outras

         ↓ discover + filter + scrape

[data/raw/  +  data/images/]   ← local-only
         ↓
   rebuildManifest()
         ↓
[data/manifest.json] ← versionado
         ↓
    Fastify API
         ↓
   ├── /docs (catálogo público — L3 só metadata)
   ├── /docs/:id?view=internal (auth — para treino IA)
   ├── /pdf (gera PDF branded)
   └── /remove-request (LGPD)
         ↓
   museu-digital (Next.js)
```
