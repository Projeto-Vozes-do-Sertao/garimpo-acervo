<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 09 — Decisões Técnicas (ADRs)

Log de decisões arquiteturais não-óbvias, no estilo ADR (Architecture Decision Record).

---

## ADR-001 — Stack inicial: Python para coleta

**Contexto**: Precisávamos coletar rápido fontes web heterogêneas (Wikipedia, gov.br, jornais).

**Decisão**: Python 3.11 com `httpx`, `BeautifulSoup4`, `Pillow`, `ReportLab`, mais APIs Exa e Firecrawl.

**Por quê**: ecossistema maduro para scraping; iteração rápida; ReportLab é o padrão-ouro para PDF programático.

**Trade-off**: deploy menos trivial que Node; concorrência via `asyncio` exige cuidado.

---

## ADR-002 — Manifest unificado em vez de múltiplos índices

**Contexto**: Cada modo (`--iguanambi`, `--sudoeste`, padrão) inicialmente sobrescrevia o `manifest.json`. Resultado: só uma fonte aparecia por vez.

**Decisão**: Função `rebuild_manifest()` (`collector/manifest.py` / `src/manifest.ts`) que escaneia todos os `*.meta.json` em `data/raw/` e monta manifest unificado com IDs globais sequenciais.

**Consequência**: cada scraper só adiciona arquivos. O manifest reflete o filesystem inteiro. Idempotente.

---

## ADR-003 — Sudoeste: enum de IDs legacy

**Contexto**: `sudoestebahia.com` não tem WordPress, sitemap só cobre 2 meses, categoria mostra só 30 recentes, busca tem cap.

**Decisão**: Enumerar IDs 1..42500 via legacy redirect `/noticias/{id}-2024/01/01/x` → 301 → URL canônica. Para cada URL canônica, GET HTML e filtrar por menção a "Lagoa Real".

**Resultado**: 391 matérias capturadas (vs. 30 da categoria). Inclui matérias sobre Lagoa Real em outras categorias (Caetité, Política, Bahia).

**Trade-off**: 42k HEAD + 42k GET requests. ~35 min total. ~3GB bandwidth. Sem rate-limit aparente (Cloudflare permite).

---

## ADR-004 — Splitter de parágrafos heurístico

**Contexto**: CMS sudoeste serve corpo da matéria em **1 `<p>` gigante** sem `</p><p>`. PDF fica ilegível como bloco contínuo de 2k chars.

**Decisão**: Splitter por sentença + cues de atribuição em `article_rich.py` / `article-rich.ts`:
- Boundary regex: `(?<=[\."”!?])\s+(?=[A-ZÁ...])` (fim de pontuação + maiúscula)
- Force break antes de: "Segundo", "Para o", "De acordo", "Em nota", etc.
- Agrupa em chunks 350–700 chars

**Resultado**: 1 `<p>` → 4 parágrafos legíveis no PDF.

---

## ADR-005 — Port TS com Bun + Fastify

**Contexto**: Usuário pediu API TS mantendo 100% funcionalidade.

**Decisão**: Bun runtime (TS nativo, fetch nativo, mais rápido que Node) + Fastify 5 (maduro, validação Zod). Outras escolhas:
- **HTML**: cheerio (jQuery-like API)
- **PDF**: pdfkit (closest mapping de ReportLab)
- **Imagens**: sharp (webp → jpg)
- **Concorrência**: p-limit
- **Retry**: p-retry

**Rejeitadas**:
- Hono (mais novo mas menos features de produção que Fastify)
- Puppeteer p/ PDF (pesado, ~150MB)
- Cheerio v0 (escolhido v1 mais moderno)

---

## ADR-006 — Chrome do PDF via `pageAdded` com guard

**Contexto**: pdfkit não tem o conceito de "footer fixo". Tentativa inicial com `bufferPages + switchToPage` causou texto vazado para páginas erradas.

**Decisão**: Hook `doc.on("pageAdded")` desenha banda peach + footer. Flag `inChrome` previne recursão (se `doc.text()` do footer disparar overflow → novo `pageAdded` → no-op). `lineBreak: false` + `height: 12` impede que footer text wrap.

**Trade-off**: footer redesenhado em toda página automaticamente. Não suporta numeração "página X de Y" trivialmente (precisaria de bufferPages segundo passe).

---

## ADR-007 — Política de direitos em 3 camadas

**Contexto**: 95% do acervo é jornal com copyright (L3). Política rígida ("não toca em copyright") inviabiliza projeto. Política frouxa ("publica tudo") gera risco legal.

**Decisão**: 3 camadas com tratamento distinto + Art. 46 da Lei 9.610 para citações.
- L1: hospeda integral, distribui livre
- L2: hospeda conforme termo de cessão
- L3: **não hospeda publicamente** (catálogo referencial); mas **mantém local** para pesquisa interna / treino de IA (uso amparado em art. 46 VIII).

Classificação **automática por domínio** (`src/rights.ts`). Override individual via meta.json.

**Salvaguarda LGPD**: endpoint `/remove-request` + log auditável.

---

## ADR-008 — `data/raw/` local-only (não versionado)

**Contexto**: Acervo de 5MB de markdown de matérias L3 não deve ir para git público.

**Decisão**: `.gitignore` exclui `data/raw/`, `data/images/`, `data/pdf/`, caches. Só `manifest.json` vai pro repo (índice + hashes).

**Consequência**: novo dev precisa rodar scrape para popular `data/raw/`. Caches resumíveis facilitam.

---

## ADR-009 — Autenticação simples por header token

**Contexto**: Endpoints `/scrape/*` e `?view=internal` precisam de auth. Não justificativa para OAuth ou JWT ainda.

**Decisão**: Header `x-internal-token` comparado com env `INTERNAL_API_TOKEN`. Constant-time comparison não implementado (token longo + uso interno baixo volume — risco aceitável).

**Trade-off**: token único, sem rotação automatizada. Adequado para fase 1. Migrar para JWT na fase 3.

---

## ADR-010 — Inventário on-chain (não conteúdo on-chain)

**Contexto**: Queremos prova pública de existência e integridade.

**Decisão**: Smart contract registra `museum_id`, `sha256`, metadados essenciais + URI de metadados completos (IPFS). **Conteúdo do documento nunca vai pra cadeia.**

**Por quê**:
- LGPD: hash não permite rastrear pessoa; conteúdo em chain seria irreversível.
- Custo: 5MB on-chain seria proibitivo.
- Imutabilidade: para conteúdo, IPFS basta. Para registro, blockchain agrega timestamp + ordenação imutáveis.

**Rede**: Polygon ou Base (gas baixo, EVM). Batch register reduz custo.

---

## ADR-011 — `museum_id` formato MDLR-YYYY-NNNNN

**Contexto**: Precisa de ID público estável, legível, único, ordenável.

**Decisão**: `MDLR-{ano-de-ingresso}-{seq:05d}` (ex: `MDLR-2026-00170`).
- `MDLR` = Museu Digital de Lagoa Real (prefixo institucional)
- ano de ingresso ajuda na orientação cronológica
- 5 dígitos = 100k docs ano (folga generosa)

**Estabilidade**: ID atribuído na primeira inclusão. Não muda se reordenarmos manifest. Persistido no `meta.json` quando confirmado.

**Comparação com ID interno**: `id` (sequencial padded `0170`) usado para arquivos; `museum_id` para apresentação pública e blockchain.

---

## ADR-012 — Manter Python como referência

**Contexto**: Port TS está pronto. Manter Python custa nada? Vale removê-lo?

**Decisão**: **Manter** ambos por agora. Python como referência de comportamento — se TS divergir, comparamos com Python. Após 3 meses de uso estável do TS, deprecar Python.

**Trade-off**: manutenção dupla. Mitigado por testes de paridade (manifests devem coincidir em count e hashes).
