<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 04 — Política de Direitos

Documento canônico da **Política de Acervo e Distribuição do Museu Digital de Lagoa Real**.

**Vozes do Sertão é um projeto da Liga Colaborativa dos Povos.**

## Princípios

1. **Sem fins lucrativos**: o acervo é constituído para pesquisa, preservação e difusão cultural.
2. **Atribuição sempre**: toda obra exibida traz crédito e link à fonte original.
3. **Transparência de direitos**: cada documento é classificado em uma das 3 camadas (visível no `manifest.json`).
4. **Reversibilidade**: pedidos de remoção/correção por parte de autores são acolhidos.
5. **Curadoria progressiva**: priorizamos contato direto com detentores para migrar obras de L3 → L2 (cessão expressa).

## As três camadas

### Camada 1 — Acesso aberto / Domínio público

**Critério**: obras em domínio público (Lei 9.610/98 art. 41 — 70 anos após morte do autor) OU licenciadas sob CC0, CC BY, CC BY-SA, ou liberadas pela Lei de Acesso à Informação (LAI 12.527/11).

**Tratamento**:
- Hospedagem integral em infraestrutura do museu
- Distribuição livre no site, redes sociais, materiais educativos
- Produções derivadas (vídeos, posts) permitidas com atribuição

**Domínios classificados como L1** (auto-detecção em `src/rights.ts`):
- `*.wikipedia.org` / `*.wikimedia.org` (CC BY-SA 4.0)
- `*.gov.br`, `*.ba.gov.br` (LAI)
- `ibge.gov.br` (LAI)
- `*.edu.br`, `scielo.br`, `redalyc.org`, `bn.gov.br` (acesso aberto)
- `portaldatransparencia.com.br` (LAI)
- Atos oficiais (leis, decretos) — Art. 8º Lei 9.610

### Camada 2 — Autorização expressa

**Critério**: autor ou detentor concedeu **termo de cessão por escrito** ao museu.

**Tratamento**:
- Hospedagem nos limites do termo
- Conteúdo derivado conforme escopo autorizado
- Termo arquivado em `data/cessoes/` (não público)
- Override no `meta.json`: `rights_layer_override: 2` + `rights_license: "Cessão YYYY-NN"`

**Atualmente**: 0 documentos. **Negociação prioritária** com: Bláva Comunicação (sudoestebahia.com), Grupo Iguanambi.

### Camada 3 — Catálogo referencial (copyright restrito)

**Critério**: copyright reservado, sem cessão obtida.

**Tratamento**:
- **NÃO hospeda** conteúdo público integral
- Registra apenas:
  - título
  - autor (se disponível)
  - data
  - fonte (URL original)
  - **resumo curatorial próprio** (obra autoral do museu — não viola copyright da fonte)
- Link sempre presente para consulta na fonte legítima
- Para produções derivadas: aplica-se direito de citação (Art. 46 Lei 9.610)

**Importante para o pipeline interno**: o conteúdo integral é mantido em `data/raw/` **localmente** para treino de IA / pesquisa interna. O `.gitignore` impede que esse conteúdo seja publicado no repositório git.

## Base legal

| Aspecto | Norma | Aplicação |
|---|---|---|
| Direitos autorais | Lei 9.610/98 | Define copyright e domínio público |
| Acesso à informação pública | Lei 12.527/11 (LAI) | Libera material de órgãos públicos |
| Citação para pesquisa | Lei 9.610/98 Art. 46 | Trecho + atribuição + proporção razoável |
| Dados pessoais | Lei 13.709/18 (LGPD) | Pesquisa histórica e interesse público cultural |
| Atos oficiais | Lei 9.610/98 Art. 8º | Leis, decretos, atos públicos = domínio público |

## LGPD — Dados pessoais

Muitas matérias mencionam pessoas vivas por nome (políticos, vítimas, suspeitos). O museu opera com **base legal de pesquisa histórica e interesse público cultural** (Lei 13.709/18 art. 7º IV).

**Salvaguardas**:
1. Endpoint `POST /remove-request` para titulares solicitarem remoção
2. Resposta em até **15 dias úteis**
3. Anonimização preferencial sobre remoção total
4. Log auditável em `data/lgpd_remove_requests.jsonl`
5. Após remoção, mantém-se apenas o **hash SHA-256** no blockchain (sem dados identificáveis)

## Rastreabilidade — Blockchain

Cada documento recebe registro on-chain contendo:
- `museum_id` (ex: `MDLR-2026-00170`)
- `sha256` do arquivo
- metadados essenciais (título, fonte, camada)

**O conteúdo NUNCA é gravado no blockchain** — apenas metadados + hash. Serve como:
- Prova de existência (timestamp)
- Garantia de integridade (hash check)
- Inventário público auditável

Implementação prevista: contrato simples em **Polygon/Base** com função `register(museum_id, sha256, metadata_uri)`. Para metadados completos, link para IPFS (também só metadados).

## Implementação técnica

### Classificação automática

`src/rights.ts` — `classifyRights(url)` → `{ layer, license, reason }`.

Fallback **conservador**: domínio desconhecido → **L3** por padrão (precaução).

### Override individual

`meta.json` pode conter:
- `rights_layer: 2` — força camada manualmente
- `rights_license: "Cessão 2026-001"` — referência ao termo
- `rights_reason: "Autorização de João da Silva (autor)"`

### API enforcement

`GET /docs/:id` (default = público):
- L1/L2 → markdown integral
- L3 → metadados + URL fonte + `access_notice` explicando o motivo

`GET /docs/:id?view=internal` (requer header `x-internal-token`):
- Todas as camadas → markdown integral (uso interno autorizado)

Token configurado via env var `INTERNAL_API_TOKEN`.

### .gitignore

`data/raw/`, `data/images/`, `data/pdf/`, `data/cache_*` ficam **local-only**. Apenas `manifest.json` e `lgpd_remove_requests.jsonl` entram no repositório.
