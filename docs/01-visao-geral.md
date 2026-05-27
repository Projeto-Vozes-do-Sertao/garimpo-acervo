<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 01 — Visão Geral

## Propósito

Constituir um **acervo digital documental** sobre a história de **Lagoa Real (BA)** — município do Sudoeste baiano — para fins de **pesquisa, preservação e difusão cultural**, sem fins lucrativos.

**Vozes do Sertão é um projeto da Liga Colaborativa dos Povos.**

O acervo alimenta:
- um **Museu Digital** público (catálogo + exposições virtuais);
- canais de difusão (vídeos, posts, materiais educativos);
- um pipeline de **OCR → Embedding → RAG** para um assistente conversacional de pesquisa local (treino de IA interno).

## Atores

| Ator | Papel |
|---|---|
| Liga Colaborativa dos Povos | Mantenedora institucional do projeto |
| Igor Duca | Autor / desenvolvedor / curador técnico |
| Pesquisadores convidados | Curadoria editorial, validação histórica |
| Detentores de direitos (jornais, autores) | Fonte das obras — alvos de negociação de cessão |
| Comunidade de Lagoa Real | Audiência primária; potenciais doadores de acervo |

## Escopo

**No escopo:**
- Coleta automatizada de fontes online sobre Lagoa Real (Wikipedia, gov.br, jornais regionais).
- Processamento (limpeza, conversão para Markdown, estruturação).
- Classificação por **camada de direitos** (1/2/3).
- Geração de **PDFs branded** para distribuição em redes.
- API HTTP servindo o acervo público (catálogo) e interno (treino de IA).
- Registro em blockchain pública de hashes (prova de existência e inventário).

**Fora do escopo (por ora):**
- Republicação massiva de conteúdo copyrighted sem cessão.
- Monetização direta do acervo.
- OCR de documentos físicos (planejado para fase 2).
- Integração com ANCINE / IPHAN (planejada para fase 3).

## Métricas atuais (2026-05-27)

- **474 documentos** coletados, agregando 4 fontes distintas
- **4,96M caracteres** de texto limpo
- Distribuição por camada:
  - **L1** (aberto): 22
  - **L2** (cessão expressa): 0 (a negociar)
  - **L3** (catálogo referencial): 452
- Por fonte: sudoestebahia=391 · firecrawl=34 · iguanambi=29 · exa=20
