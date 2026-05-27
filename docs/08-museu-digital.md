<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 08 — Museu Digital de Lagoa Real

## Conceito

Acervo digital documental sobre a história de **Lagoa Real (BA)**, organizado como um museu virtual com:

- **Exposições temáticas** (curadoria editorial)
- **Catálogo navegável** (busca por tema, data, fonte, camada de direitos)
- **Linha do tempo** da história do município
- **Galeria de personalidades** (com respeito à LGPD)
- **Repositório de pesquisa** (para historiadores e estudantes)
- **Pipeline de IA conversacional** (assistente de pesquisa local, com RAG sobre o acervo interno)

## Sub-projeto `museu-digital/`

Front-end Next.js. Consome a API do `discovery-documentos-ts`.

### Páginas planejadas

| Página | Caminho | Conteúdo |
|---|---|---|
| Inicial | `/` | Hero + curadoria editorial destaque |
| Catálogo | `/acervo` | Lista com filtros (camada, fonte, data) |
| Documento | `/acervo/[museum_id]` | L1/L2: conteúdo completo · L3: ficha referencial |
| Exposição | `/exposicoes/[slug]` | Curadoria temática (texto + obras selecionadas) |
| Linha do tempo | `/historia` | Eventos cronológicos navegáveis |
| Sobre | `/sobre` | Missão, política de direitos, equipe |
| LGPD | `/privacidade` | Política + formulário remove-request |
| Doação de acervo | `/contribuir` | Form para colaboradores enviarem documentos |

## Identificadores únicos

Todo documento recebe **3 identificadores**:

| ID | Formato | Uso |
|---|---|---|
| `id` | `0170` | Sequencial estável no manifest |
| `museum_id` | `MDLR-2026-00170` | ID público canônico do museu (URL-friendly) |
| `sha256` | `abc123...` (64 hex) | Hash do conteúdo — prova de integridade |

`museum_id` segue padrão `MDLR-{ano-de-ingresso}-{seq:05d}`. Estável após primeiro registro no blockchain.

## Inventário em Blockchain

### Por quê

- **Prova de existência** com timestamp imutável
- **Inventário público auditável** sem custódia centralizada
- **Integridade verificável** via hash
- **Resistência à censura** do registro (não do conteúdo)

### Como

Smart contract simples em rede pública de baixo custo (Polygon / Base):

```solidity
struct MuseumRecord {
    string museumId;       // MDLR-2026-00170
    bytes32 sha256;        // hash do markdown
    string metadataURI;    // ipfs://... ou https://museu-lagoareal.com/api/docs/0170
    uint256 timestamp;
    uint8 rightsLayer;     // 1, 2 ou 3
}

function register(MuseumRecord calldata r) external onlyCurator;
function batchRegister(MuseumRecord[] calldata rs) external onlyCurator;
function get(string calldata museumId) external view returns (MuseumRecord memory);
```

Batches periódicos (semanal/mensal) economizam gas.

### O que NÃO entra no blockchain

- **Conteúdo do documento** (sempre off-chain — local + IPFS opcional)
- **Dados pessoais** (LGPD: hash não permite rastrear pessoa, mas conteúdo não vai pra cadeia)

## Roadmap

### Fase 1 — Coleta e estrutura (atual — concluída)
- ✅ 474 documentos coletados (Wikipedia + gov.br + jornais + Exa/Firecrawl)
- ✅ Classificação por camada de direitos
- ✅ Manifest unificado com hashes
- ✅ API HTTP completa
- ✅ PDF branded
- ✅ Política LGPD com endpoint de remoção

### Fase 2 — Curadoria e front-end (próxima)
- Site público (Next.js) consumindo API
- Curadoria editorial das primeiras 3-5 exposições temáticas
- Negociação de cessão com Bláva (sudoeste) e Iguanambi → migrar L3→L2
- OCR de documentos físicos doados pela comunidade

### Fase 3 — Blockchain e IA
- Deploy do smart contract de inventário
- Batch register inicial das 474 obras
- Treino de modelo conversacional local (RAG sobre acervo interno)
- API pública de busca semântica

### Fase 4 — Parcerias institucionais
- Diálogo com IPHAN (patrimônio imaterial)
- Convênios com universidades (UESB, UFBA)
- Programas de incentivo cultural (Lei Rouanet, FCC-BA)

## Diferencial

Comparado a acervos digitais convencionais:

1. **Política de direitos transparente em código** — cada documento traz sua camada no JSON.
2. **Coletor automatizado open source** — qualquer pessoa pode replicar para sua cidade.
3. **Pipeline para IA conversacional** — não é só catálogo, é base de conhecimento ativa.
4. **Blockchain como inventário** — não como NFT, não como produto financeiro: como prova pública de existência e integridade.
5. **Foco hiperlocal** — Lagoa Real (~14k habitantes) raramente recebe atenção em grandes acervos.
