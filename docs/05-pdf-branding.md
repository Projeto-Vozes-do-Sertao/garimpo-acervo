<!--
  Autor: Igor Duca
  Data: 2026-05-27
  Projeto: Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
  Acervo: Museu Digital de Lagoa Real
-->

# 05 — Geração de PDF e Branding

## Branding

Logos em `~/Documents/Liga/Projeto Vozes do Sertão/`:
- `logo projeto.png` — logo principal (cacto + sol + texto "VOZES DO SERTÃO")
- `liga-logo.png` — selo institucional Liga Colaborativa dos Povos
- `logo-square.png` — variante quadrada (ícone)

Path configurável via env `BRANDING_DIR`.

## Paleta

| Cor | Hex | Uso |
|---|---|---|
| Peach | `#F5C99B` | Banda decorativa no topo, accent lines |
| Dark | `#1A1A1A` | Texto principal |
| Muted | `#666666` | Subtítulos, rodapé, captions |
| White | `#FFFFFF` | Background |

## Layout do PDF

### Página 1 — Capa

```
┌─────────────────────────────────────┐
│ ▓▓▓▓▓▓ (banda peach 60mm) ▓▓▓▓▓▓▓▓ │
│      🌵 VOZES DO SERTÃO              │  ← logo centrado
│                                      │
│         ARQUIVO DE IMPRENSA          │  ← label peach
│           ────                       │
│   Título grande da matéria           │
│   centralizado, Helvetica-Bold 26pt  │
│                                      │
│   Subtítulo em itálico, muted 13pt   │
│                                      │
│  data · categoria · domínio (10pt)   │
│                                      │
│   ┌────────────────────────┐         │
│   │  Foto hero da matéria  │         │
│   │  (até 14cm × 9cm)      │         │
│   └────────────────────────┘         │
│       Foto: [crédito] (8.5pt)        │
│                                      │
│  Um projeto da Liga Colaborativa     │
│  Arquivo de imprensa · Coleta auto.  │
└─────────────────────────────────────┘
```

### Página 2+ — Corpo

```
┌─────────────────────────────────────┐
│ ▓▓ (banda peach 8mm) ▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│                                      │
│ Título da matéria                   │  ← 20pt bold
│ Subtítulo em itálico                │
│                                      │
│ Publicado em DATA · Categoria X     │  ← 9pt
│ ────────────────────────────────    │  ← linha peach
│                                      │
│ Parágrafo justificado 11pt,         │
│ leading 16.5pt. Splitter heurístico │
│ converte 1 <p> gigante em 4         │
│ parágrafos legíveis.                │
│                                      │
│ "Quotes em itálico com aspas        │
│  curvas, indentadas."               │
│                                      │
│ ────                                 │
│ Fonte original: https://...         │
│ Documento compilado pelo coletor... │
│                                      │
│ ───────────────────────────────     │
│ Vozes do Sertão...    Página 2      │  ← rodapé
└─────────────────────────────────────┘
```

## Decisões técnicas

### Library de PDF

**Python**: ReportLab → tem `Platypus` (flowables), `Paragraph` aceita tags HTML-like (`<b>`, `<i>`, `<u>`, `<font>`).

**TS**: pdfkit → mais low-level (chama `doc.text()`, `doc.rect()`, `doc.image()` diretamente). Sem flowables. Sem suporte HTML inline — escrito um parser de tags próprio em `parseInline()` que converte `<b>`/`<i>`/`<u>`/`<font>` + markdown `**bold**`/`*italic*` em runs de estilo.

Trade-offs:
- pdfkit é menos ergonômico mas suficiente.
- Considerar futuramente: **puppeteer + HTML/CSS** para tipografia ainda mais rica (sacrifica peso de dependência).

### Chrome (banda + rodapé) — gotcha de recursão

**Problema**: `doc.text()` ao escrever rodapé pode disparar overflow → `pageAdded` → novo footer drawn → recursão infinita / páginas vazias.

**Solução adotada** (`pdf-generator.ts`):
1. Banda peach (rect, sem texto) desenhada via `pageAdded` (zero risco).
2. Footer (texto) também desenhado em `pageAdded`, mas com:
   - flag `inChrome = true` impedindo re-entrada
   - `lineBreak: false` + `height: 12` impedindo wrap
   - posição absoluta x/y

Resultado: cover (60mm peach + texto signature) + body pages (8mm peach + texto rodapé) consistentes.

### Splitter de parágrafo

Ver `docs/03-fontes-e-coleta.md` — corpo single-`<p>` do sudoeste fica ilegível sem quebra. Splitter heurístico (`splitLongParagraph`) divide em chunks de 350–700 chars por boundary de aspas + cues de atribuição.

### Imagens — webp → jpg

Sudoeste serve imagens em **webp**. pdfkit não renderiza webp (e ReportLab tampouco). Sharp (TS) / Pillow (Python) converte automaticamente para JPEG (qualidade 85, flatten com fundo branco se transparente) no momento do download.

Cache local em `data/images/` evita re-download.

### Tipografia

Helvetica built-in do pdfkit (sem fontes custom). Para melhorar:
```ts
doc.registerFont("Inter", "./fonts/Inter-Regular.ttf");
doc.registerFont("Inter-Bold", "./fonts/Inter-Bold.ttf");
// Trocar todas as referências "Helvetica" → "Inter"
```

Pendente — não implementado ainda. Helvetica funciona bem.

## Uso

```bash
# CLI
bun src/cli.ts pdf "estufa-automatizada"             # busca por substring
bun src/cli.ts pdf https://sudoestebahia.com/...     # URL direta
bun src/cli.ts pdf path/to/0170_xxx.md -o out.pdf    # arquivo .md

# HTTP API
curl -X POST http://localhost:3000/pdf \
  -H 'content-type: application/json' \
  -d '{"source":"estufa-automatizada"}'
# → {"path":"...","filename":"...","download_url":"/pdf/..."}
```
