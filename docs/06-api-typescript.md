<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 06 — API TypeScript (Fastify + Bun)

## Stack

- **Runtime**: Bun 1.1+
- **Framework**: Fastify 5
- **Validação**: zod
- **Auth**: header `x-internal-token` (env `INTERNAL_API_TOKEN`)
- **CORS**: aberto (configurar conforme produção)

## Boot

```bash
cd discovery-documentos-ts
bun install

# .env
echo 'EXA_API_KEY=...' > .env
echo 'FIRECRAWL_API_KEY=...' >> .env
echo 'INTERNAL_API_TOKEN=segredo-forte' >> .env
echo 'DATA_DIR=/caminho/compartilhado/data' >> .env

# dev (hot reload)
bun --watch src/server.ts

# prod
bun src/server.ts
```

Envs: `PORT` (default 3000), `HOST` (0.0.0.0), `LOG_LEVEL` (info), `BRANDING_DIR`, `INTERNAL_API_TOKEN`.

## Endpoints

### Meta

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/` | — | Lista de endpoints |
| GET | `/health` | — | Healthcheck |

### Catálogo (público)

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/manifest` | — | Manifest unificado completo |
| GET | `/docs` | — | Lista paginada (filtros: `source`, `domain`, `q`, `limit`) |
| GET | `/docs/:id` | — | Doc + markdown se L1/L2; metadata + URL fonte se L3 |
| GET | `/docs/:id?view=internal` | `x-internal-token` | Markdown integral mesmo L3 (treino IA) |

#### Resposta `/docs/:id` quando L3 sem token

```json
{
  "id": "0170",
  "museum_id": "MDLR-2026-00170",
  "title": "Alunos de Lagoa Real desenvolvem estufa...",
  "url": "https://www.sudoestebahia.com/...",
  "rights_layer": 3,
  "rights_license": "copyright reservado ao veículo",
  "markdown": null,
  "meta": null,
  "access_notice": "Camada 3 (catálogo referencial): direitos autorais reservados ao veículo...",
  "source_url": "https://www.sudoestebahia.com/..."
}
```

#### Resposta `/docs/:id` com token (qualquer camada)

```json
{
  "id": "0170",
  "museum_id": "MDLR-2026-00170",
  "title": "...",
  "url": "...",
  "rights_layer": 3,
  "markdown": "# Alunos de Lagoa Real...\n\n...",
  "meta": { /* meta.json completo */ },
  "sha256": "abc123..."
}
```

### Scraping (internal-only)

Todos exigem `x-internal-token`. Rodam em background, retornam `job_id`.

| Método | Rota | Body | Descrição |
|---|---|---|---|
| POST | `/scrape/iguanambi` | — | WordPress REST iguanambi.com.br |
| POST | `/scrape/sudoeste` | `{max_id?}` | Enum legacy + body scan sudoestebahia.com |
| POST | `/scrape/sudoeste/save` | — | Re-salva do cache (sem re-scrape) |
| POST | `/scrape/discover` | — | Pipeline Exa+Firecrawl |

Resposta:
```json
{"job_id": "uuid-aqui", "status": "running"}
```

### Jobs

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/jobs` | — | Lista todos jobs em memória |
| GET | `/jobs/:id` | — | Status + resultado/erro |

Status possíveis: `pending`, `running`, `completed`, `failed`.

### PDF

| Método | Rota | Body | Descrição |
|---|---|---|---|
| POST | `/pdf` | `{source, filename?}` | Gera PDF branded |
| GET | `/pdf/:filename` | — | Baixa PDF gerado |

`source` aceita: URL, caminho `.md`, ou substring do título/arquivo.

### Manifest

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| POST | `/manifest/rebuild` | — | Reconstrói scanning data/raw/*.meta.json |

### LGPD

| Método | Rota | Body | Descrição |
|---|---|---|---|
| POST | `/remove-request` | `{document_id, requester_name, requester_email, reason}` | Pedido de remoção LGPD |

Log em `data/lgpd_remove_requests.jsonl`.

## Estrutura interna

```
src/server.ts
├── Job tracker (Map<id, Job>) — jobs em memória
├── isInternalRequest(req) — verifica x-internal-token
├── Routes (todos com Zod validation)
└── buildServer() → Fastify instance
```

Background jobs: `runJob(job, fn)` executa `fn()` async, atualiza status. Não persiste — se servidor reiniciar, jobs in-flight são perdidos. (Pra produção: trocar por BullMQ/Redis.)

## Segurança

- **CORS** atualmente `origin: true` (qualquer origem). **Restringir em produção** pro domínio do museu.
- **Rate limiting** não configurado. Adicionar `@fastify/rate-limit` para endpoints públicos.
- **Token** simples (header bearer). Para auth mais robusta: JWT, API keys com rotação.
- **HTTPS**: deixar a cargo do reverse proxy (nginx / Caddy / Cloudflare).
- **Validação**: todo body/query passa por Zod schema.

## Testando

```bash
# Health
curl localhost:3000/health

# Manifest summary
curl localhost:3000/manifest | jq '{total: .total_documents, layers: .by_rights_layer}'

# Doc L1 (Wikipedia) — markdown vem completo
curl localhost:3000/docs/0001

# Doc L3 (jornal) — só metadata
curl localhost:3000/docs/0100

# Doc L3 com token — markdown completo
curl -H 'x-internal-token: <seu-token>' \
  'localhost:3000/docs/0100?view=internal'

# Disparar scrape
curl -X POST -H 'x-internal-token: <seu-token>' \
  localhost:3000/scrape/iguanambi

# Gerar PDF
curl -X POST -H 'content-type: application/json' \
  -d '{"source":"estufa-automatizada"}' \
  localhost:3000/pdf

# LGPD
curl -X POST -H 'content-type: application/json' \
  -d '{
    "document_id": "0170",
    "requester_name": "Fulano",
    "requester_email": "fulano@example.com",
    "reason": "Sou o autor citado e peço remoção..."
  }' \
  localhost:3000/remove-request
```
