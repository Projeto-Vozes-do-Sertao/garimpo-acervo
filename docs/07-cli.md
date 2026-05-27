<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 07 — CLI

Tanto a versão Python quanto a TypeScript expõem CLI com paridade.

## Python (`discovery-documentos/`)

```bash
cd discovery-documentos
pip install -e .

# Pipeline padrão (Exa + Firecrawl + filter + scrape + save)
python -m collector.main
python -m collector.main --use-cache    # usa cache de URLs descobertas

# Iguanambi (WP REST)
python -m collector.main --iguanambi

# Sudoeste (enum + body scan)
python -m collector.main --sudoeste
python -m collector.main --sudoeste-save  # re-salva do cache

# Manifest standalone
python -m collector.manifest

# PDF
python -m collector.pdf_generator "estufa-automatizada"
python -m collector.pdf_generator https://sudoestebahia.com/...
python -m collector.pdf_generator path/to/file.md -o output.pdf
```

## TypeScript (`discovery-documentos-ts/`)

```bash
cd discovery-documentos-ts
bun install

# Pipeline padrão
bun src/cli.ts discover
bun src/cli.ts discover --use-cache

# Iguanambi
bun src/cli.ts iguanambi

# Sudoeste
bun src/cli.ts sudoeste                   # ID max default 42500
bun src/cli.ts sudoeste --max-id 1000     # range customizado
bun src/cli.ts sudoeste-save              # re-salva do cache

# Manifest
bun src/cli.ts manifest

# PDF
bun src/cli.ts pdf "estufa-automatizada"
bun src/cli.ts pdf https://sudoestebahia.com/...
bun src/cli.ts pdf path/to/file.md -o out.pdf
```

## Shortcuts via npm scripts (TS)

```bash
bun run iguanambi
bun run sudoeste
bun run manifest
bun run pdf -- "estufa-automatizada"
bun run dev          # server hot reload
bun run start        # server prod
```

## Variáveis de ambiente

```bash
# Compartilhar dados entre Python e TS
export DATA_DIR=/Volumes/KINGSTON/.../discovery-documentos/data

# Branding
export BRANDING_DIR="/Users/duca/Documents/Liga/Projeto Vozes do Sertão"

# API
export PORT=3000
export HOST=0.0.0.0
export INTERNAL_API_TOKEN=segredo-forte
export LOG_LEVEL=info

# Keys (mesmas em ambas as versões)
export EXA_API_KEY=...
export FIRECRAWL_API_KEY=...
```
