/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Gera PDFs branded a partir de matérias (URL, .md, ou substring).
 *  Port de collector/pdf_generator.py usando pdfkit.
 *
 *  Branding: Vozes do Sertão (Liga Colaborativa dos Povos).
 *  Paleta: preto + bege/peach #F5C99B.
 */

import { join, basename } from "node:path";
import { existsSync, readdirSync, createWriteStream } from "node:fs";

import PDFDocument from "pdfkit";

import { LOGO_LIGA, LOGO_MAIN, PDF_DIR, RAW_DIR } from "./config.ts";
import { ensureDir, readJson } from "./util.ts";
import type { Article, Block } from "./types.ts";
import { fetchRich } from "./article-rich.ts";

const PEACH = "#F5C99B";
const DARK = "#1A1A1A";
const MUTED = "#666666";

// A4 in points: 595.28 x 841.89
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_L = 62.36; // ~2.2cm
const MARGIN_R = 62.36;
const MARGIN_T = 70.87; // ~2.5cm
const MARGIN_B = 62.36;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

// ---------- helpers ----------

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const months = [
    "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${parseInt(m[3], 10)} de ${months[parseInt(m[2], 10)]} de ${m[1]}`;
}

function getImageSize(path: string): { width: number; height: number } | null {
  try {
    const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const buf = Bun.file(path).slice(0, 32);
    return null; // pdfkit handles internally; we let it scale
  } catch {
    return null;
  }
}

// ---------- markdown fallback ----------

function escapeMd(s: string): string {
  // Para fallback de .md plano, mantém **bold** e *italic* mas sanitiza.
  // pdfkit não usa HTML tags como reportlab; renderizamos via tokens próprios.
  return s;
}

interface MdParts {
  title: string;
  subtitle: string | null;
  date: string | null;
  categoria: string | null;
  autor: string | null;
  fonte: string | null;
  paragraphs: string[];
}

function parseMd(text: string): MdParts {
  const lines = text.split("\n");
  let title = "";
  let subtitle: string | null = null;
  let date: string | null = null;
  let categoria: string | null = null;
  let autor: string | null = null;
  let fonte: string | null = null;
  const bodyLines: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (!inBody) {
      if (line.startsWith("# ")) title = line.slice(2).trim();
      else if (line.startsWith("_") && line.endsWith("_") && line.length > 2 && !subtitle)
        subtitle = line.replace(/^_|_$/g, "").trim();
      else if (line.startsWith("**Data:**")) date = line.replace("**Data:**", "").trim();
      else if (line.startsWith("**Categoria:**"))
        categoria = line.replace("**Categoria:**", "").trim();
      else if (line.startsWith("**Autor:**")) autor = line.replace("**Autor:**", "").trim();
      else if (line.startsWith("**Fonte:**")) fonte = line.replace("**Fonte:**", "").trim();
      else if (line.trim() === "---") inBody = true;
    } else {
      bodyLines.push(line);
    }
  }
  const bodyRaw = bodyLines.join("\n").trim();
  const paragraphs = bodyRaw
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return { title, subtitle, date, categoria, autor, fonte, paragraphs };
}

function articleFromMd(md: string, mdPath: string): Article {
  const p = parseMd(md);
  let domain = "";
  if (p.fonte) {
    try {
      domain = new URL(p.fonte).hostname.replace(/^www\./, "");
    } catch {
      /* noop */
    }
  }
  return {
    url: p.fonte || "",
    title: p.title || "Sem título",
    subtitle: p.subtitle,
    date_iso: p.date ? `${p.date}T00:00:00-03:00` : null,
    autor: p.autor,
    categoria: p.categoria,
    domain,
    hero_image: null,
    blocks: p.paragraphs.map((text) => ({ type: "p", text })),
  };
}

// ---------- chrome (header/footer) ----------

/** Desenha apenas a banda de fundo (peach) — seguro de chamar antes do conteúdo. */
function drawBackground(doc: PDFKit.PDFDocument, isCover: boolean): void {
  doc.save();
  const h = isCover ? 60 * 2.83465 : 8 * 2.83465;
  doc.rect(0, 0, PAGE_W, h).fill(PEACH);
  doc.restore();
}

/** Texto do rodapé seguro — height limit + lineBreak false impedem overflow. */
function drawCoverFooter(doc: PDFKit.PDFDocument): void {
  doc.save();
  doc.fontSize(9).fillColor(MUTED).font("Helvetica-Oblique");
  doc.text(
    "Um projeto da Liga Colaborativa dos Povos",
    MARGIN_L,
    PAGE_H - 18 * 2.83465 - 6,
    { width: CONTENT_W, align: "center", lineBreak: false, height: 12 } as any,
  );
  doc.fontSize(7.5).font("Helvetica");
  doc.text(
    "Arquivo de imprensa · Coleta automatizada de fontes públicas",
    MARGIN_L,
    PAGE_H - 12 * 2.83465,
    { width: CONTENT_W, align: "center", lineBreak: false, height: 12 } as any,
  );
  doc.restore();
}

function drawPageFooter(doc: PDFKit.PDFDocument, pageNumber: number): void {
  doc.save();
  const footerY = PAGE_H - 12 * 2.83465;
  doc
    .strokeColor(PEACH)
    .lineWidth(0.6)
    .moveTo(MARGIN_L, footerY - 4)
    .lineTo(PAGE_W - MARGIN_R, footerY - 4)
    .stroke();
  doc.fontSize(8).font("Helvetica").fillColor(MUTED);
  doc.text(
    "Vozes do Sertão · Documentos · Lagoa Real (BA)",
    MARGIN_L,
    footerY,
    { width: CONTENT_W - 100, lineBreak: false, height: 12 } as any,
  );
  doc.text(
    `Página ${pageNumber}`,
    PAGE_W - MARGIN_R - 100,
    footerY,
    { width: 100, align: "right", lineBreak: false, height: 12 } as any,
  );
  doc.restore();
}

// ---------- inline markup ----------

interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** Converte tags inline tipo reportlab (<b>, <i>, <u>, <font>) e markdown
 *  (**bold**, *italic*) em runs de estilo para pdfkit. */
function parseInline(s: string): InlineRun[] {
  // First normalize markdown to tags
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<i>$1</i>");
  s = s.replace(/<br\s*\/?>/gi, "\n");

  const runs: InlineRun[] = [];
  const stack: { tag: string }[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (!buf) return;
    const style: InlineRun = { text: decodeEntities(buf) };
    for (const t of stack) {
      if (t.tag === "b") style.bold = true;
      else if (t.tag === "i") style.italic = true;
      else if (t.tag === "u") style.underline = true;
    }
    runs.push(style);
    buf = "";
  };

  while (i < s.length) {
    if (s[i] === "<") {
      const close = s.indexOf(">", i);
      if (close === -1) {
        buf += s[i];
        i++;
        continue;
      }
      const tag = s.slice(i + 1, close).trim();
      const isClose = tag.startsWith("/");
      const name = (isClose ? tag.slice(1) : tag.split(/\s+/)[0]).toLowerCase();
      if (["b", "i", "u"].includes(name)) {
        flush();
        if (isClose) {
          const idx = [...stack].reverse().findIndex((x) => x.tag === name);
          if (idx !== -1) stack.splice(stack.length - 1 - idx, 1);
        } else {
          stack.push({ tag: name });
        }
        i = close + 1;
        continue;
      }
      if (name === "font") {
        // treat as transparent
        flush();
        i = close + 1;
        continue;
      }
      // unknown tag: keep raw text
      buf += s.slice(i, close + 1);
      i = close + 1;
    } else {
      buf += s[i];
      i++;
    }
  }
  flush();
  return runs;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function fontFor(run: InlineRun): string {
  if (run.bold && run.italic) return "Helvetica-BoldOblique";
  if (run.bold) return "Helvetica-Bold";
  if (run.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function writeRichText(
  doc: PDFKit.PDFDocument,
  text: string,
  options: PDFKit.Mixins.TextOptions & { fontSize?: number; color?: string } = {},
): void {
  const fontSize = options.fontSize ?? 11;
  const color = options.color ?? DARK;
  const runs = parseInline(text);
  doc.fontSize(fontSize).fillColor(color);
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const isLast = i === runs.length - 1;
    doc.font(fontFor(r));
    const opts = {
      ...options,
      continued: !isLast,
      underline: r.underline ?? options.underline,
    };
    doc.text(r.text, opts);
  }
}

// ---------- layout helpers ----------

function drawImageFitted(
  doc: PDFKit.PDFDocument,
  path: string,
  maxW: number,
  maxH: number,
  align: "center" | "left" = "center",
): void {
  if (!existsSync(path)) return;
  try {
    const img = (doc as any).openImage(path);
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x =
      align === "center" ? (PAGE_W - w) / 2 : doc.x;
    const y = doc.y;
    doc.image(path, x, y, { width: w, height: h });
    doc.y = y + h;
  } catch (e) {
    console.warn(`[pdf] falha ao abrir imagem ${path}: ${e}`);
  }
}

function ruleLine(
  doc: PDFKit.PDFDocument,
  widthRatio = 1,
  align: "left" | "center" = "left",
  color = PEACH,
  thickness = 0.5,
): void {
  const w = CONTENT_W * widthRatio;
  const x = align === "center" ? (PAGE_W - w) / 2 : MARGIN_L;
  const y = doc.y + 4;
  doc
    .strokeColor(color)
    .lineWidth(thickness)
    .moveTo(x, y)
    .lineTo(x + w, y)
    .stroke();
  doc.y = y + 4;
}

// ---------- render blocks ----------

function renderBlock(doc: PDFKit.PDFDocument, b: Block): void {
  if (b.type === "img") {
    if (!b.src) return;
    doc.moveDown(0.3);
    drawImageFitted(doc, b.src, CONTENT_W, 340, "center");
    if (b.caption) {
      doc.moveDown(0.2);
      doc
        .fontSize(8.5)
        .font("Helvetica-Oblique")
        .fillColor(MUTED)
        .text(b.caption, { width: CONTENT_W, align: "center" });
    }
    doc.moveDown(0.6);
    return;
  }
  if (b.type === "h2") {
    doc.moveDown(0.6);
    doc.fontSize(15).font("Helvetica-Bold").fillColor(DARK)
      .text(b.text || "", { width: CONTENT_W });
    doc.moveDown(0.3);
    return;
  }
  if (b.type === "h3") {
    doc.moveDown(0.5);
    doc.fontSize(12.5).font("Helvetica-Bold").fillColor(DARK)
      .text(b.text || "", { width: CONTENT_W });
    doc.moveDown(0.2);
    return;
  }
  if (b.type === "h4" || b.type === "h5") {
    doc.moveDown(0.4);
    doc.fontSize(11.5).font("Helvetica-Bold").fillColor(DARK)
      .text(b.text || "", { width: CONTENT_W });
    doc.moveDown(0.2);
    return;
  }
  if (b.type === "quote") {
    doc.moveDown(0.3);
    const oldX = doc.x;
    doc.x = oldX + 18;
    doc.fontSize(11.5).font("Helvetica-Oblique").fillColor(DARK)
      .text(`“${b.text}”`, { width: CONTENT_W - 36 });
    doc.x = oldX;
    doc.moveDown(0.4);
    return;
  }
  if (b.type === "list") {
    doc.moveDown(0.2);
    for (const item of b.items || []) {
      const oldX = doc.x;
      doc.x = oldX + 18;
      writeRichText(doc, `•  ${item}`, { width: CONTENT_W - 36, fontSize: 11 });
      doc.x = oldX;
      doc.moveDown(0.15);
    }
    doc.moveDown(0.3);
    return;
  }
  if (b.type === "p") {
    writeRichText(doc, b.text || "", {
      width: CONTENT_W,
      align: "justify",
      fontSize: 11,
    });
    doc.moveDown(0.6);
    return;
  }
}

// ---------- main builder ----------

export async function buildPdf(article: Article, outputPath: string): Promise<string> {
  ensureDir(PDF_DIR);
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN_T, bottom: MARGIN_B, left: MARGIN_L, right: MARGIN_R },
    info: {
      Title: article.title,
      Author: "Vozes do Sertão",
      Subject: "Lagoa Real (BA) — arquivo de imprensa",
      Creator: "Vozes do Sertão / Liga Colaborativa dos Povos",
    },
    autoFirstPage: false,
  });

  const stream = createWriteStream(outputPath);
  doc.pipe(stream);

  // Chrome (bg + footer) desenhado em cada página criada.
  // O flag inChrome impede recursão se text() do footer disparar nova página.
  let pageNumber = 0;
  let inChrome = false;
  doc.on("pageAdded", () => {
    if (inChrome) return;
    inChrome = true;
    pageNumber++;
    const isCover = pageNumber === 1;
    drawBackground(doc, isCover);
    if (isCover) drawCoverFooter(doc);
    else drawPageFooter(doc, pageNumber);
    doc.x = MARGIN_L;
    doc.y = MARGIN_T;
    inChrome = false;
  });

  doc.addPage();

  // === COVER ===
  if (existsSync(LOGO_MAIN)) {
    doc.moveDown(0.4);
    drawImageFitted(doc, LOGO_MAIN, 311, 170, "center"); // ~11cm x 6cm
    doc.moveDown(1.5);
  }

  doc
    .fontSize(8)
    .font("Helvetica-Bold")
    .fillColor(PEACH)
    .text("ARQUIVO DE IMPRENSA", MARGIN_L, doc.y, {
      width: CONTENT_W,
      align: "center",
    });
  doc.moveDown(0.2);
  ruleLine(doc, 0.2, "center");

  doc
    .fontSize(26)
    .font("Helvetica-Bold")
    .fillColor(DARK)
    .text(article.title, MARGIN_L, doc.y, {
      width: CONTENT_W,
      align: "center",
    });
  doc.moveDown(0.2);

  if (article.subtitle) {
    doc
      .fontSize(13)
      .font("Helvetica-Oblique")
      .fillColor(MUTED)
      .text(article.subtitle, { width: CONTENT_W, align: "center" });
    doc.moveDown(0.6);
  } else {
    doc.moveDown(0.6);
  }

  const metaBits: string[] = [];
  const fd = fmtDate(article.date_iso);
  if (fd) metaBits.push(fd);
  if (article.categoria) metaBits.push(article.categoria);
  if (article.domain) metaBits.push(article.domain);
  if (metaBits.length) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(DARK)
      .text(metaBits.join("  ·  "), { width: CONTENT_W, align: "center" });
  }

  // Hero image
  if (article.hero_image?.src && existsSync(article.hero_image.src)) {
    doc.moveDown(0.7);
    drawImageFitted(doc, article.hero_image.src, 396, 255, "center"); // ~14cm x 9cm
    if (article.hero_image.caption) {
      doc.moveDown(0.2);
      doc
        .fontSize(8.5)
        .font("Helvetica-Oblique")
        .fillColor(MUTED)
        .text(article.hero_image.caption, { width: CONTENT_W, align: "center" });
    }
  } else {
    doc.moveDown(2);
    if (existsSync(LOGO_LIGA)) {
      drawImageFitted(doc, LOGO_LIGA, 71, 71, "center"); // ~2.5cm
    }
  }

  // === BODY ===
  doc.addPage();
  doc.fontSize(20).font("Helvetica-Bold").fillColor(DARK)
    .text(article.title, { width: CONTENT_W });
  doc.moveDown(0.2);
  if (article.subtitle) {
    doc.fontSize(12.5).font("Helvetica-Oblique").fillColor(MUTED)
      .text(article.subtitle, { width: CONTENT_W });
    doc.moveDown(0.4);
  }

  const inlineMeta: string[] = [];
  if (fd) inlineMeta.push(`<b>Publicado em</b> ${fd}`);
  if (article.categoria) inlineMeta.push(`<b>Categoria</b> ${article.categoria}`);
  if (article.autor) inlineMeta.push(`<b>Autor</b> ${article.autor}`);
  if (inlineMeta.length) {
    writeRichText(doc, inlineMeta.join("  ·  "), {
      width: CONTENT_W,
      fontSize: 9,
      color: MUTED,
    });
    doc.moveDown(0.4);
  }

  ruleLine(doc, 1, "left");
  doc.moveDown(0.4);

  for (const b of article.blocks) {
    renderBlock(doc, b);
  }

  if (article.url) {
    doc.moveDown(1);
    ruleLine(doc, 0.3, "left");
    doc.moveDown(0.2);
    doc
      .fontSize(8)
      .font("Helvetica-Oblique")
      .fillColor(MUTED)
      .text(`Fonte original: ${article.url}`, { width: CONTENT_W });
    doc.moveDown(0.3);
    doc.text(
      "Documento compilado pelo coletor automatizado do projeto Vozes do Sertão. " +
        "Texto reproduzido para fins de arquivo, pesquisa e curadoria pública.",
      { width: CONTENT_W },
    );
  }

  doc.end();
  await new Promise<void>((resolve) => stream.on("finish", () => resolve()));
  return outputPath;
}

// ---------- locator helpers ----------

export function findMdByQuery(query: string): string | null {
  if (!existsSync(RAW_DIR)) return null;
  const q = query.toLowerCase();
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".md")).sort();
  for (const f of files) {
    if (f.toLowerCase().includes(q)) return join(RAW_DIR, f);
  }
  for (const f of files) {
    const metaName = f.replace(/\.md$/, ".meta.json");
    const metaPath = join(RAW_DIR, metaName);
    if (!existsSync(metaPath)) continue;
    try {
      const m = JSON.parse(require("node:fs").readFileSync(metaPath, "utf-8"));
      if ((m.source_title || "").toLowerCase().includes(q)) return join(RAW_DIR, f);
    } catch {
      /* skip */
    }
  }
  return null;
}

export async function loadArticleFromSource(source: string): Promise<Article> {
  // .md path
  if (source.endsWith(".md") && existsSync(source)) {
    const text = await Bun.file(source).text();
    return articleFromMd(text, source);
  }
  // URL
  if (source.startsWith("http")) {
    const a = await fetchRich(source);
    if (!a) throw new Error(`fetchRich falhou para ${source}`);
    return a;
  }
  // Substring → busca em raw
  const md = findMdByQuery(source);
  if (!md) throw new Error(`nenhum .md encontrado para: ${source}`);
  // try fetchRich from meta source_url
  const metaPath = md.replace(/\.md$/, ".meta.json");
  if (existsSync(metaPath)) {
    try {
      const meta = await readJson<{ source_url?: string }>(metaPath);
      const url = meta.source_url;
      if (url && url.startsWith("http") && url.includes("sudoestebahia.com")) {
        const rich = await fetchRich(url);
        if (rich) return rich;
      }
    } catch (e) {
      console.warn(`[pdf] fallback md por erro fetch: ${e}`);
    }
  }
  const text = await Bun.file(md).text();
  return articleFromMd(text, md);
}

export async function generatePdf(source: string, output?: string): Promise<string> {
  ensureDir(PDF_DIR);
  const article = await loadArticleFromSource(source);
  if (!output) {
    const slug = article.title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 60);
    output = join(PDF_DIR, `${slug || "documento"}.pdf`);
  }
  await buildPdf(article, output);
  return output;
}