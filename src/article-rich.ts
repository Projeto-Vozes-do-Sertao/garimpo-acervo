/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Parser estruturado de matérias para PDF.
 *  Re-fetch HTML original e extrai blocos (parágrafos, imagens, headings, listas).
 *  Port de collector/article_rich.py.
 */

import { createHash } from "node:crypto";
import { join, extname } from "node:path";
import { existsSync, readdirSync } from "node:fs";

import * as cheerio from "cheerio";
import sharp from "sharp";

import { IMAGE_DIR } from "./config.ts";
import { cleanText, ensureDir, escapeXml, parsePtDate } from "./util.ts";
import type { Article, Block } from "./types.ts";

const PARA_BREAK_CUES = [
  "Segundo ", "De acordo ", "Para o ", "Para a ", "Conforme ",
  "Em nota", "Em entrevista", "Na ocasião", "Ainda segundo",
  "Já ", "Também ", "Além disso", "Por outro lado", "Por fim",
  "O prefeito", "A prefeita", "O governador", "O secretário",
  "A polícia", "A vítima", "O suspeito", "O acusado",
];

const DROP_SELECTORS =
  "script, style, iframe, " +
  ".audio-wrapper-ia, .author-box, .barra, .banner-entre-noticias, " +
  ".comments-area, .blog-sidebar, .related, .compartilhar, .social-share, " +
  ".tb-share, .pubsud, .ads, .ad";

// ---------- inline formatting ----------

function inlineHtml($: any, node: any): string {
  // Text node
  if (node.type === "text") {
    return escapeXml(node.data || "");
  }
  if (node.type !== "tag") return "";

  const name = node.name.toLowerCase();
  const children = (node.children || []) as any[];
  const inner = children.map((c) => inlineHtml($, c)).join("");

  if (name === "strong" || name === "b") return `<b>${inner}</b>`;
  if (name === "em" || name === "i") return `<i>${inner}</i>`;
  if (name === "u") return `<u>${inner}</u>`;
  if (name === "a") {
    const href = node.attribs?.href || "";
    if (href) return `<u><font color="#1A1A1A">${inner}</font></u>`;
    return inner;
  }
  if (name === "br") return "<br/>";
  if (name === "p" || name === "span" || name === "div") return inner;
  // default: text
  return escapeXml($(node).text());
}

// ---------- paragraph splitter ----------

export function splitLongParagraph(html: string, minLen = 350, maxLen = 700): string[] {
  if (html.length <= maxLen) return [html];
  const sentences = html.split(/(?<=[\."”!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“])/);
  if (sentences.length <= 1) return [html];

  const paragraphs: string[] = [];
  let current: string[] = [];
  let curLen = 0;
  for (const sent of sentences) {
    const trimmed = sent.replace(/^[ "“]+/, "");
    const startsWithCue = PARA_BREAK_CUES.some((c) => trimmed.startsWith(c));
    if (current.length > 0 && curLen >= minLen && (startsWithCue || curLen >= maxLen)) {
      paragraphs.push(current.join(" "));
      current = [];
      curLen = 0;
    }
    current.push(sent);
    curLen += sent.length + 1;
  }
  if (current.length) paragraphs.push(current.join(" "));
  return paragraphs;
}

// ---------- image handling ----------

function extForUrl(url: string, contentType: string | null): string {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("webp")) return ".webp";
    if (ct.includes("png")) return ".png";
    if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
    if (ct.includes("gif")) return ".gif";
  }
  const path = (new URL(url).pathname || "").toLowerCase();
  for (const ext of [".webp", ".jpg", ".jpeg", ".png", ".gif"]) {
    if (path.endsWith(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  }
  return ".jpg";
}

async function downloadImage(url: string): Promise<string | null> {
  ensureDir(IMAGE_DIR);
  const h = createHash("sha1").update(url).digest("hex").slice(0, 16);
  // Check cache
  if (existsSync(IMAGE_DIR)) {
    for (const f of readdirSync(IMAGE_DIR)) {
      if (f.startsWith(h + ".") && extname(f) !== ".webp") {
        return join(IMAGE_DIR, f);
      }
    }
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type");
    const ext = extForUrl(url, ct);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf || buf.length === 0) return null;
    const rawPath = join(IMAGE_DIR, `${h}${ext}`);
    await Bun.write(rawPath, buf);
    // Convert webp/gif → jpg
    if (ext === ".webp" || ext === ".gif") {
      try {
        const jpgPath = join(IMAGE_DIR, `${h}.jpg`);
        await sharp(rawPath)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 85 })
          .toFile(jpgPath);
        await Bun.file(rawPath).delete();
        return jpgPath;
      } catch (e) {
        console.warn(`[image] convert falhou ${url}: ${e}`);
        return null;
      }
    }
    return rawPath;
  } catch (e) {
    console.warn(`[image] download falhou ${url}: ${e}`);
    return null;
  }
}

// ---------- header + blocks ----------

function extractHeader($: any, container: any) {
  const posts = container.children(".post");
  const header = posts.length > 0 ? posts.eq(0) : container;
  const out = {
    title: "",
    subtitle: null as string | null,
    date_iso: null as string | null,
    categoria: null as string | null,
    autor: null as string | null,
  };
  const h = header.find("h1, h2, h3").first();
  if (h.length) out.title = cleanText(h.text());

  const dh = header.find(".date-hour").first().text().trim();
  if (dh) out.date_iso = parsePtDate(dh);

  const cat = header.find(".cat").first().text().trim();
  if (cat) out.categoria = cleanText(cat);

  header.find("p").each((_: number, p: any) => {
    const $p = $(p);
    const classes = ($p.attr("class") || "").split(/\s+/);
    if (classes.includes("autor")) {
      out.autor = cleanText($p.text()).replace(/^Por:/, "").trim();
    } else if (!out.subtitle) {
      const t = cleanText($p.text());
      if (t) out.subtitle = t;
    }
  });
  return out;
}

async function extractHero(
  $: any,
  container: any,
  baseUrl: string,
): Promise<Block | null> {
  const posts = container.children(".post");
  const bodyEl = posts.length > 1 ? posts.eq(1) : null;
  if (!bodyEl) return null;
  const media = bodyEl.find(".entry-media-container").first();
  if (media.length === 0) return null;
  const img = media.find("img").first();
  if (img.length === 0) return null;
  let src = img.attr("src") || "";
  if (src.startsWith("//")) src = "https:" + src;
  else if (src.startsWith("/")) src = new URL(src, baseUrl).toString();
  if (!src) return null;
  const local = await downloadImage(src);
  if (!local) return null;
  let caption: string | null = null;
  const legenda = media.find(".legenda-miniatura").first();
  if (legenda.length) caption = cleanText(legenda.text());
  return { type: "img", src: local, caption: caption ?? undefined };
}

async function walkBlocks(
  $: any,
  container: any,
  baseUrl: string,
): Promise<Block[]> {
  // Unwrap nested <p><p>...</p></p>
  container.find("p").each((_: number, p: any) => {
    const inner = $(p).children("p");
    if (inner.length === 1) {
      $(p).replaceWith(inner);
    }
  });

  const target = container.find(".entry-details").first();
  const root = target.length > 0 ? target : container;

  const blocks: Block[] = [];
  const elems = root.find("p, h1, h2, h3, h4, h5, ul, ol, blockquote, img, figure").toArray();
  const seen = new Set<any>();

  for (const el of elems as any[]) {
    if (seen.has(el)) continue;
    if (el.type !== "tag") continue;
    const $el = $(el);
    const name = el.name.toLowerCase();

    // Skip <p> inside ul/ol/blockquote
    if (name === "p" && $el.parents("ul, ol, blockquote").length > 0) continue;

    seen.add(el);

    if (name === "img") {
      let src = $el.attr("src") || "";
      if (!src) continue;
      if (src.startsWith("//")) src = "https:" + src;
      else if (src.startsWith("/")) src = new URL(src, baseUrl).toString();
      const local = await downloadImage(src);
      if (!local) continue;
      let caption: string | undefined;
      const fig = $el.parents("figure").first();
      if (fig.length) {
        const fc = fig.find("figcaption").first();
        if (fc.length) caption = cleanText(fc.text());
      }
      if (!caption) {
        const nxt = $el.next();
        const cls = (nxt.attr("class") || "").toLowerCase();
        if (nxt.is("p") && cls.includes("legenda")) {
          caption = cleanText(nxt.text());
          seen.add(nxt.get(0) as any);
        }
      }
      blocks.push({ type: "img", src: local, caption });
    } else if (["h2", "h3", "h4", "h5"].includes(name)) {
      const text = cleanText($el.text());
      if (text) blocks.push({ type: name as Block["type"], text });
    } else if (name === "blockquote") {
      const text = cleanText(inlineHtml($, el));
      if (text) blocks.push({ type: "quote", text });
    } else if (name === "ul" || name === "ol") {
      const items: string[] = [];
      $el.children("li").each((_: number, li: any) => {
        items.push(cleanText(inlineHtml($, li)));
      });
      if (items.length) blocks.push({ type: "list", items });
    } else if (name === "p") {
      const cls = ($el.attr("class") || "").toLowerCase();
      if (cls.includes("legenda")) continue;
      const html = inlineHtml($, el);
      const text = cleanText(html);
      if (!text) continue;
      for (const chunk of splitLongParagraph(text)) {
        blocks.push({ type: "p", text: chunk });
      }
    }
  }
  return blocks;
}

// ---------- public API ----------

export async function fetchRich(url: string): Promise<Article | null> {
  const parsed = new URL(url);
  const domain = parsed.hostname.replace(/^www\./, "");
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; VozesDoSertao/1.0; pesquisa+arquivo)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.warn(`[rich] GET ${url} → ${res.status}`);
    return null;
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const container = $("div.tb-blog-content").first();
  if (container.length === 0) {
    console.warn(`[rich] sem tb-blog-content em ${url}`);
    return null;
  }
  container.find(DROP_SELECTORS).remove();

  const header = extractHeader($, container);
  const hero = await extractHero($, container, url);

  const posts = container.children(".post");
  const bodyEl = posts.length > 1 ? posts.eq(1) : container;
  if (hero) bodyEl.find(".entry-media-container").remove();

  const blocks = await walkBlocks($, bodyEl, url);

  return {
    url,
    title: header.title,
    subtitle: header.subtitle,
    date_iso: header.date_iso,
    autor: header.autor,
    categoria: header.categoria,
    domain,
    hero_image: hero,
    blocks,
  };
}