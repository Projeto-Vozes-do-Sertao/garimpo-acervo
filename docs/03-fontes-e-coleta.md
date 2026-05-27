<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 03 — Fontes e Coleta

Estratégia por fonte, com decisões de implementação e gotchas descobertos.

## Visão consolidada

| Fonte | Domínio | Método | Docs coletados | Camada |
|---|---|---|---|---|
| Exa | (vários) | API semântica | 20 | mista (depende do domínio) |
| Firecrawl | (vários) | Search + scrape | 34 | mista |
| iguanambi.com.br | jornal regional | WordPress REST API | 29 | **L3** |
| sudoestebahia.com | jornal regional | Enum legacy IDs + body scan | 391 | **L3** |

## Exa (descoberta semântica)

Usado para descobrir páginas conceitualmente relacionadas a Lagoa Real, mesmo sem o termo literal no texto. Bom para encontrar acervos acadêmicos, blogs regionais, materiais governamentais.

Queries (6 no total) em `collector/config.py` / `src/config.ts`:
- história e emancipação política
- comunidades rurais, povoamento
- personalidades, líderes
- desenvolvimento agrícola
- cultura, vaqueiros
- educação, saúde, infraestrutura

10 resultados por query.

## Firecrawl (keyword search + scrape)

Duas funções distintas:
1. **Search** — keyword search com aspas literais (`"Lagoa Real"`) — captura URLs perdidas pela Exa.
2. **Scrape** — para cada URL descoberta, retorna Markdown limpo + detecta tipo (HTML, PDF nativo, PDF que requer OCR).

Gotcha: Firecrawl SDK v1.29 mudou shape da resposta — uso de `as any` no port TS para sobreviver à instabilidade.

## iguanambi.com.br

Jornal regional **com WordPress** e API REST aberta (`/wp-json/wp/v2/posts`). Categoria de Lagoa Real é ID **46**.

Implementação:
```
GET /wp-json/wp/v2/posts?categories=46&per_page=100&page=N
```

- Paginação via header `X-WP-TotalPages`
- Retry exponencial 3 tentativas (tenacity / p-retry)
- Rate limit interno de 500ms entre páginas
- Texto extraído de `content.rendered` via BeautifulSoup/cheerio (`get_text` + colapso de whitespace)

**29 posts** coletados. Conteúdo integral (artigo).

## sudoestebahia.com — desafio

Site **sem WordPress** — CMS custom da **Bláva Comunicação**. Categoria `/categoria/lagoa-real` mostra apenas as **30 mais recentes**, sem paginação real.

### Descoberta investigativa

Probing inicial revelou:
1. `?page=2` retorna **mesma página** — paginação fake.
2. `/wp-json/` → 404 (não é WP).
3. `sitemap.xml` cobre só os últimos 2 meses (~1000 URLs).
4. Endpoint `/ajax/carregar_mais.php?pagina=N` existe mas retorna notícias gerais, sem filtro por categoria.
5. Busca textual `POST /busca s="Lagoa Real"` retorna ~31 resultados, sem paginação (cap).

### Achado-chave: enumeração de IDs legacy

URLs antigas têm padrão `/noticias/{id}-2024/01/01/x` que retorna **301 redirect** para a URL canônica atual. Range de IDs: **1..~42100**.

Estratégia adotada:
1. HEAD request para cada ID 1..42500 (paralelo, 30 concurrent).
2. Header `Location` revela URL canônica.
3. Coleta de **todas** as URLs únicas (~41.564 candidatos).
4. Para cada candidato: GET HTML → parse → filtra por menção a "Lagoa Real" no título/subtítulo/corpo (case + accent insensitive).
5. **391 matérias** matched (categorias diversas: Lagoa Real, Bahia, Política, Caetité, etc — qualquer matéria que cite Lagoa Real).

### Custos

- ~42k HEAD requests, ~5min em paralelo
- ~42k GET requests (HTML completo), ~30min
- Sem rate-limit aparente (Cloudflare)
- Bandwidth ~3GB durante run completa

### Estrutura HTML extraída

`div.tb-blog-content > .post` × 2:
- `posts[0]` = cabeçalho (data, categoria, título, subtítulo, autor)
- `posts[1]` = corpo (imagem hero + parágrafos)

### Gotcha: parágrafos colados

CMS sudoeste publica corpo inteiro em **1 `<p>` gigante** (sem `</p><p>` entre parágrafos lógicos). Splitter heurístico em `article_rich.py` / `article-rich.ts`:
- Quebra em sentenças (boundary = `[."”!?]` + espaço + maiúscula).
- Agrupa em chunks de 350–700 chars.
- Força break antes de **cues de atribuição**: "Segundo", "De acordo", "Para o", "Em nota", etc.
- Resultado: 1 `<p>` → 4 parágrafos legíveis no PDF.

## Resilência / resume

Cada scraper tem cache JSON resumível em `data/cache_*.json`. Run interrompida volta de onde parou. Re-runs futuras processam só IDs/URLs novas (delta).
