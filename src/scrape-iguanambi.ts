/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Scraper iguanambi.com.br via WordPress REST API.
 *  Port de collector/scrape_iguanambi.py.
 */

import { join } from "node:path";
import * as cheerio from "cheerio";
import pRetry from "p-retry";

import { RAW_DIR } from "./config.ts";
import { ensureDir, writeJson } from "./util.ts";
import type { ManifestEntry } from "./types.ts";

const BASE_URL = "https://www.iguanambi.com.br/wp-json/wp/v2";
const CATEGORY_ID = 46; // Lagoa Real
const PER_PAGE = 100;

interface WpPost {
  id: number;
  date: string;
  modified?: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt?: { rendered: string };
  slug: string;
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  let text = $.root().text();
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  // collapse whitespace per line
  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
  return text;
}

async function fetchPosts(page: number): Promise<{ posts: WpPost[]; totalPages: number }> {
  return await pRetry(
    async () => {
      const url = new URL(`${BASE_URL}/posts`);
      url.searchParams.set("categories", String(CATEGORY_ID));
      url.searchParams.set("per_page", String(PER_PAGE));
      url.searchParams.set("page", String(page));
      url.searchParams.set("_fields", "id,date,modified,link,title,content,excerpt,slug");

      const res = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = parseInt(res.headers.get("x-wp-totalpages") || "1", 10);
      const posts = (await res.json()) as WpPost[];
      return { posts, totalPages: total };
    },
    { retries: 3, minTimeout: 2_000, maxTimeout: 30_000 },
  );
}

async function fetchAllPosts(): Promise<WpPost[]> {
  const all: WpPost[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    console.log(`[iguanambi] página ${page}/${totalPages}`);
    const { posts, totalPages: tp } = await fetchPosts(page);
    totalPages = tp;
    if (posts.length === 0) break;
    all.push(...posts);
    console.log(`[iguanambi]   ${posts.length} posts`);
    page++;
    if (page <= totalPages) await Bun.sleep(500);
  }
  console.log(`[iguanambi] total: ${all.length} posts`);
  return all;
}

function postToMarkdown(post: WpPost): string {
  const title = post.title.rendered;
  const date = post.date.slice(0, 10);
  const link = post.link;
  const text = htmlToText(post.content.rendered);
  return `# ${title}\n\n**Data:** ${date}\n**Fonte:** ${link}\n\n---\n\n${text}`;
}

async function savePost(post: WpPost, index: number): Promise<ManifestEntry> {
  const docId = String(index).padStart(4, "0");
  const slug = post.slug.slice(0, 80);
  const base = `${docId}_iguanambi_${slug}`;
  const mdPath = join(RAW_DIR, `${base}.md`);
  const metaPath = join(RAW_DIR, `${base}.meta.json`);
  const md = postToMarkdown(post);
  await Bun.write(mdPath, md);

  const meta = {
    id: docId,
    source_url: post.link,
    source_title: htmlToText(post.title.rendered),
    discovered_via: "wp_rest_api",
    discovery_query: "iguanambi.com.br category=lagoa-real",
    collected_at: new Date().toISOString(),
    published_at: post.date,
    modified_at: post.modified ?? post.date,
    content_type: "html",
    language: "pt-BR",
    char_count: md.length,
    needs_ocr: false,
    domain: "iguanambi.com.br",
    tags: ["iguanambi", "noticias", "lagoa-real", "jornal"],
  };
  await writeJson(metaPath, meta);
  console.log(`[iguanambi] salvo: ${base} (${md.length} chars)`);

  return {
    id: docId,
    url: post.link,
    title: htmlToText(post.title.rendered),
    needs_ocr: false,
    file: `${base}.md`,
  };
}

export async function scrapeIguanambi(): Promise<ManifestEntry[]> {
  ensureDir(RAW_DIR);
  const posts = await fetchAllPosts();
  const entries: ManifestEntry[] = [];
  let idx = 1;
  for (const post of posts) {
    try {
      const e = await savePost(post, idx);
      entries.push(e);
      idx++;
    } catch (err) {
      console.error(`[iguanambi] erro post ${post.id}: ${err}`);
    }
  }
  console.log(`[iguanambi] ${entries.length} posts salvos`);
  return entries;
}