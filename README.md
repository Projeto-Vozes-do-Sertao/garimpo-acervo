<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# garimpo-acervo

> **garimpo-acervo** é a ferramenta de pesquisa documental do projeto **Vozes do Sertão** — um projeto da **Liga Colaborativa dos Povos** — que constitui o **Museu Digital de Lagoa Real (BA)**.
>
> A metáfora do *garimpo* nos guia: busca paciente, artesanal, atenta — descobrindo, lapidando e catalogando fontes documentais sobre a história, cultura e cotidiano de Lagoa Real.

Stack: **Bun + Fastify + TypeScript** · runtime moderno, API HTTP + CLI.

## O que faz

1. **Garimpa** fontes documentais sobre Lagoa Real em múltiplas origens (Wikipedia, gov.br, jornais regionais, busca semântica Exa, busca por palavra-chave Firecrawl).
2. **Cataloga** com classificação por **camada de direitos** (1/2/3 — conforme [política do Museu Digital](./docs/04-politica-direitos.md)).
3. **Hasheia** cada documento (SHA-256) para registro futuro em blockchain como prova de existência.
4. **Gera PDFs branded** com identidade visual do Vozes do Sertão.
5. **Serve** via API HTTP (Fastify) com modo público (catálogo referencial p/ L3) e modo interno (treino de IA).

## Stack

| Função | Biblioteca |
|---|---|
| Runtime | Bun 1.1+ |
| HTTP server | Fastify 5 |
| HTML parse | cheerio |
| HTTP client | native `fetch` |
| Imagens | sharp (webp → jpg) |
| PDF | pdfkit |
| Concorrência | p-limit |
| Retry | p-retry |
| CLI | commander |
| Validação | zod |
| Progresso | cli-progress |
| Exa | exa-js |
| Firecrawl | @mendable/firecrawl-js |

## Setup

```bash
bun install

# .env
EXA_API_KEY=...
FIRECRAWL_API_KEY=...
INTERNAL_API_TOKEN=segredo-forte
BRANDING_DIR=/caminho/para/logos/         # opcional
DATA_DIR=/caminho/para/data/              # opcional, default ./data
```

## CLI

```bash
bun src/cli.ts iguanambi              # scrape WordPress iguanambi.com.br
bun src/cli.ts sudoeste                # scrape sudoestebahia.com (enum + body)
bun src/cli.ts sudoeste --max-id 1000  # range customizado
bun src/cli.ts sudoeste-save           # re-salva do cache
bun src/cli.ts discover                # pipeline Exa+Firecrawl
bun src/cli.ts manifest                # reconstrói manifest.json
bun src/cli.ts pdf "estufa-automatizada"   # gera PDF branded
```

## API HTTP

```bash
bun src/server.ts             # produção
bun --watch src/server.ts     # dev (hot reload)
```

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/` | — | Lista endpoints |
| GET | `/health` | — | Healthcheck |
| GET | `/manifest` | — | Manifest unificado |
| POST | `/manifest/rebuild` | — | Reconstrói manifest |
| GET | `/docs?source=&domain=&q=&limit=` | — | Lista filtrável |
| GET | `/docs/:id` | — | Doc — L1/L2 markdown completo; L3 só metadados |
| GET | `/docs/:id?view=internal` | `x-internal-token` | Markdown integral (treino IA) |
| POST | `/scrape/iguanambi` | `x-internal-token` | Dispara scrape (background job) |
| POST | `/scrape/sudoeste` | `x-internal-token` | Idem |
| POST | `/scrape/sudoeste/save` | `x-internal-token` | Re-salva do cache |
| POST | `/scrape/discover` | `x-internal-token` | Pipeline Exa+Firecrawl |
| GET | `/jobs/:id` | — | Status de job |
| POST | `/pdf` | — | Gera PDF, body `{source, filename?}` |
| GET | `/pdf/:filename` | — | Baixa PDF |
| POST | `/remove-request` | — | Pedido LGPD de remoção |

## Estado atual

- **474 documentos** indexados (mesmo `data/` da referência Python)
- **4,96M caracteres** de texto limpo
- Distribuição por camada de direitos:
  - **L1** (aberto/CC/LAI): 22
  - **L2** (cessão expressa): 0
  - **L3** (catálogo referencial): 452
- Distribuição por fonte:
  - sudoestebahia.com: 391
  - exa + firecrawl: 54
  - iguanambi.com.br: 29

## Política de direitos (resumo)

3 camadas:
- **L1** — domínio público / licença aberta → hospeda integral
- **L2** — autorização expressa por cessão → hospeda conforme termo
- **L3** — copyright restrito → catálogo referencial (metadados + link à fonte)

`data/raw/` mantém **conteúdo integral local** para pesquisa interna e treino de IA (uso amparado em Art. 46 da Lei 9.610/98). Apenas `manifest.json` (índice + hashes) é versionado.

Documentação completa: [`docs/04-politica-direitos.md`](./docs/04-politica-direitos.md).

## Documentação

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Visão Geral](./docs/01-visao-geral.md) | Propósito, atores, escopo |
| 02 | [Arquitetura](./docs/02-arquitetura.md) | Módulos, fluxo de dados |
| 03 | [Fontes e Coleta](./docs/03-fontes-e-coleta.md) | Estratégia por fonte, gotchas |
| 04 | [Política de Direitos](./docs/04-politica-direitos.md) | 3 camadas, base legal, LGPD |
| 05 | [PDF & Branding](./docs/05-pdf-branding.md) | Paleta, layout, tipografia |
| 06 | [API TypeScript](./docs/06-api-typescript.md) | Endpoints Fastify, autenticação |
| 07 | [CLI](./docs/07-cli.md) | Comandos |
| 08 | [Museu Digital](./docs/08-museu-digital.md) | Conceito, roadmap, blockchain |
| 09 | [Decisões Técnicas](./docs/09-decisoes-tecnicas.md) | ADRs |

## Licença

Distribuído sob licença **Creative Commons Atribuição-NãoComercial-CompartilhaIgual 4.0 Internacional (CC BY-NC-SA 4.0)** — ver [LICENSE.md](./LICENSE.md).

Os documentos coletados em `data/raw/` pertencem a seus respectivos autores e estão sujeitos às respectivas camadas de direitos. Veja `manifest.json` para classificação por documento.

## Contato

**Liga Colaborativa dos Povos** · **Projeto Vozes do Sertão**

- Site: https://ligacolaborativa.com.br
- E-mail: contato@ligacolaborativa.com.br

Autor / responsável técnico: Igor Duca

Pedidos de remoção LGPD: endpoint `POST /remove-request` na API ou e-mail acima.
