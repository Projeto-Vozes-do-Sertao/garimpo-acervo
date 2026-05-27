/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Scraper sudoestebahia.com — coleta máxima de matérias sobre Lagoa Real.
 *
 *  Estratégia (3 fases):
 *  1. Discovery: categoria + busca + enumeração de IDs legacy (HEAD redirects)
 *  2. Body scan: GET HTML de cada candidato, parse, filtra por menção a "Lagoa Real"
 *  3. Persistência: salva .md + .meta.json em data/raw/
 *
 *  Caches resumíveis em data/cache_sudoeste_*.json.
 *  Port de collector/scrape_sudoestebahia.py.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import cliProgress from "cli-progress";

import { DATA_DIR, RAW_DIR } from "./config.ts";
import {
  cleanText,
  ensureDir,
  fileExists,
  hasLagoaReal,
  parsePtDate,
  readJson,
  slugifyUrl,
  writeJson,
} from "./util.ts";
import type { ManifestEntry } from "./types.ts";

const BASE = "https://www.sudoestebahia.com";
export const MAX_LEGACY_ID = 42500;
const CONCURRENCY = 20;
const HEAD_CONCURRENCY = 30;
const CACHE_FLUSH_EVERY = 500;

const CACHE_IDS = join(DATA_DIR, "cache_sudoeste_ids.json");
const CACHE_PARSED = join(DATA_DIR, "cache_sudoeste_parsed.json");
const CACHE_CANDIDATES = join(DATA_DIR, "cache_sudoeste_candidates.json");
const CACHE_MATCHED = join(DATA_DIR, "cache_sudoeste_matched.json");

const UA =
  "Mozilla/5.0 (compatible; VozesDoSertao/1.0; pesquisa+arquivo)";

interface ParsedArticle {
  title: string;
  subtitle: string | null;
  date_iso: string | null;
  autor: string | null;
  categoria: string | null;
  body: string;
  full_text: string;
}

// ---------- Phase A: discovery ----------

async function fetchCategoryPage(): Promise<string[]> {
  const r = await fetch(`${BASE}/categoria/lagoa-real`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`categoria HTTP ${r.status}`);
  const html = await r.text();
  const urls = [
    ...html.matchAll(
      /href="(https:\/\/www\.sudoestebahia\.com\/noticias\/lagoa-real\/[^"#/]+)"/g,
    ),
  ].map((m) => m[1]);
  return [...new Set(urls)].sort();
}

async function fetchSearch(query: string): Promise<string[]> {
  const r = await fetch(`${BASE}/busca`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ s: query }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`busca HTTP ${r.status}`);
  const html = await r.text();
  const urls = [
    ...html.matchAll(
      /href="(https:\/\/www\.sudoestebahia\.com\/noticias\/[a-z0-9-]+\/[^"#/]+)"/g,
    ),
  ].map((m) => m[1]);
  return [...new Set(urls)].sort();
}

async function headId(idNum: number): Promise<{ id: number; loc: string | null }> {
  const url = `${BASE}/noticias/${idNum}-2024/01/01/x`;
  try {
    const r = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    let loc = r.headers.get("location") || "";
    if (!loc || loc.includes("busca?s=")) return { id: idNum, loc: null };
    if (loc.startsWith("/")) loc = BASE + loc;
    return { id: idNum, loc };
  } catch {
    return { id: idNum, loc: null };
  }
}

async function loadIdCache(): Promise<Record<number, string | null>> {
  if (!(await fileExists(CACHE_IDS))) return {};
  const raw = await readJson<Record<string, string | null>>(CACHE_IDS);
  const out: Record<number, string | null> = {};
  for (const [k, v] of Object.entries(raw)) out[parseInt(k, 10)] = v;
  return out;
}

async function saveIdCache(cache: Record<number, string | null>): Promise<void> {
  const obj: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(cache)) obj[k] = v;
  await Bun.write(CACHE_IDS, JSON.stringify(obj));
}

async function enumIds(maxId: number): Promise<Record<number, string | null>> {
  const cache = await loadIdCache();
  if (Object.keys(cache).length > 0) {
    console.log(`[sudoeste] cache IDs: ${Object.keys(cache).length} entradas`);
  }

  const todo: number[] = [];
  for (let i = 1; i <= maxId; i++) {
    if (!(i in cache)) todo.push(i);
  }
  if (todo.length === 0) return cache;
  console.log(`[sudoeste] enumerando ${todo.length} IDs novos (1..${maxId})`);

  const limit = pLimit(HEAD_CONCURRENCY);
  const bar = new cliProgress.SingleBar(
    { format: "IDs |{bar}| {percentage}% | {value}/{total} | {eta_formatted}" },
    cliProgress.Presets.shades_classic,
  );
  bar.start(todo.length, 0);

  let done = 0;
  const tasks = todo.map((id) =>
    limit(async () => {
      const r = await headId(id);
      cache[r.id] = r.loc;
      done++;
      bar.update(done);
      if (done % CACHE_FLUSH_EVERY === 0) await saveIdCache(cache);
    }),
  );
  await Promise.all(tasks);
  bar.stop();
  await saveIdCache(cache);
  return cache;
}

// ---------- Phase B: body scan ----------

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(30_000),
      redirect: "follow",
    });
    if (r.status !== 200) return null;
    return await r.text();
  } catch {
    return null;
  }
}

const DROP_SELECTORS =
  "script, style, .audio-wrapper-ia, .author-box, .barra, " +
  ".banner-entre-noticias, .comments-area, .blog-sidebar, iframe, " +
  ".related, .compartilhar, .social-share, .tb-share, .pubsud";

function parseArticle(html: string): ParsedArticle | null {
  const $ = cheerio.load(html);
  const container = $("div.tb-blog-content").first();
  if (container.length === 0) return null;
  const posts = container.children(".post");
  if (posts.length === 0) return null;
  const header = posts.eq(0);
  const bodyEl = posts.length > 1 ? posts.eq(1) : null;

  let title = "";
  const h = header.find("h1, h2, h3").first();
  if (h.length) title = h.text().trim();
  if (!title) {
    title = $("title").text().replace(" - Sudoeste Bahia", "").trim();
  }

  const dh = header.find(".date-hour").first().text().trim();
  const dateIso = dh ? parsePtDate(dh) : null;
  const cat = header.find(".cat").first().text().trim() || null;

  let subtitle: string | null = null;
  let autor: string | null = null;
  header.find("p").each((_: number, p: any) => {
    const $p = $(p);
    const classes = ($p.attr("class") || "").split(/\s+/);
    if (classes.includes("autor")) {
      autor = $p.text().trim().replace(/^Por:/, "").trim();
    } else if (!subtitle) {
      const t = $p.text().trim();
      if (t) subtitle = t;
    }
  });

  let body = "";
  if (bodyEl) {
    bodyEl.find(DROP_SELECTORS).remove();
    body = bodyEl
      .text()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n");
    body = body.replace(/\n{3,}/g, "\n\n").trim();
  }

  const fullText = [title, subtitle, body].filter(Boolean).join("\n");
  return {
    title,
    subtitle,
    date_iso: dateIso,
    autor,
    categoria: cat,
    body,
    full_text: fullText,
  };
}

async function loadParsedCache(): Promise<Record<string, ParsedArticle | null>> {
  if (!(await fileExists(CACHE_PARSED))) return {};
  return await readJson<Record<string, ParsedArticle | null>>(CACHE_PARSED);
}

async function saveParsedCache(cache: Record<string, ParsedArticle | null>): Promise<void> {
  await Bun.write(CACHE_PARSED, JSON.stringify(cache));
}

async function scanBodies(urls: string[]): Promise<Record<string, ParsedArticle>> {
  const cache = await loadParsedCache();
  if (Object.keys(cache).length > 0) {
    console.log(`[sudoeste] cache parsed: ${Object.keys(cache).length}`);
  }

  const todo = urls.filter((u) => !(u in cache));
  console.log(
    `[sudoeste] body scan: ${todo.length} novas, ${urls.length - todo.length} em cache`,
  );

  const limit = pLimit(CONCURRENCY);
  const bar = new cliProgress.SingleBar(
    { format: "Body |{bar}| {percentage}% | {value}/{total} | {eta_formatted}" },
    cliProgress.Presets.shades_classic,
  );
  bar.start(todo.length, 0);
  let done = 0;

  const tasks = todo.map((url) =>
    limit(async () => {
      const html = await fetchHtml(url);
      if (!html) {
        cache[url] = null;
      } else {
        const parsed = parseArticle(html);
        cache[url] = parsed && hasLagoaReal(parsed.full_text) ? parsed : null;
      }
      done++;
      bar.update(done);
      if (done % 200 === 0) await saveParsedCache(cache);
    }),
  );
  await Promise.all(tasks);
  bar.stop();
  await saveParsedCache(cache);

  const matched: Record<string, ParsedArticle> = {};
  for (const [url, p] of Object.entries(cache)) {
    if (p) matched[url] = p;
  }
  return matched;
}

// ---------- Phase C: save ----------

async function cleanupOrphans(): Promise<number> {
  if (!existsSync(RAW_DIR)) return 0;
  const glob = new Bun.Glob("*sudoestebahia*");
  let removed = 0;
  for await (const f of glob.scan({ cwd: RAW_DIR })) {
    await Bun.file(join(RAW_DIR, f)).delete();
    removed++;
  }
  if (removed) console.log(`[sudoeste] limpeza: ${removed} arquivos removidos`);
  return removed;
}

function toMarkdown(url: string, p: ParsedArticle): string {
  let md = `# ${p.title || "Sem título"}\n\n`;
  if (p.subtitle) md += `_${p.subtitle}_\n\n`;
  if (p.date_iso) md += `**Data:** ${p.date_iso.slice(0, 10)}\n`;
  if (p.categoria) md += `**Categoria:** ${p.categoria}\n`;
  if (p.autor) md += `**Autor:** ${p.autor}\n`;
  md += `**Fonte:** ${url}\n\n---\n\n`;
  md += p.body || "";
  return md;
}

async function saveAll(matched: Record<string, ParsedArticle>): Promise<ManifestEntry[]> {
  await cleanupOrphans();
  ensureDir(RAW_DIR);
  const items = Object.entries(matched).sort(([a], [b]) => a.localeCompare(b));
  const entries: ManifestEntry[] = [];
  let i = 1;
  for (const [url, p] of items) {
    const docId = String(i).padStart(4, "0");
    const slug = slugifyUrl(url);
    const base = `${docId}_sudoestebahia_${slug}`;
    const md = toMarkdown(url, p);
    await Bun.write(join(RAW_DIR, `${base}.md`), md);
    const meta = {
      id: docId,
      source_url: url,
      source_title: p.title || "",
      discovered_via: "sudoestebahia_full_scan",
      discovery_query:
        "sudoestebahia.com Lagoa Real (categoria + busca + id_enum + body_scan)",
      collected_at: new Date().toISOString(),
      published_at: p.date_iso,
      content_type: "html",
      language: "pt-BR",
      char_count: md.length,
      needs_ocr: false,
      domain: "sudoestebahia.com",
      categoria: p.categoria,
      autor: p.autor,
      tags: ["sudoestebahia", "noticias", "lagoa-real", "jornal"],
    };
    await writeJson(join(RAW_DIR, `${base}.meta.json`), meta);
    entries.push({
      id: docId,
      url,
      title: p.title || "",
      needs_ocr: false,
      file: `${base}.md`,
    });
    i++;
  }
  console.log(`[sudoeste] salvos: ${entries.length} arquivos em ${RAW_DIR}`);
  return entries;
}

// ---------- Orchestrator ----------

export async function scrapeSudoestebahia(maxId = MAX_LEGACY_ID): Promise<ManifestEntry[]> {
  console.log("[sudoeste] fase A1: /categoria/lagoa-real");
  const catUrls = await fetchCategoryPage();
  console.log(`[sudoeste]   ${catUrls.length} URLs categoria`);

  console.log("[sudoeste] fase A2: busca");
  const searchUrls = new Set<string>();
  for (const q of ["Lagoa Real", "Lagoa Real Bahia", "Lagoa Real BA"]) {
    const us = await fetchSearch(q);
    for (const u of us) searchUrls.add(u);
    console.log(`[sudoeste]   '${q}': ${us.length}`);
  }

  console.log(`[sudoeste] fase A3: enum IDs 1..${maxId}`);
  const idMap = await enumIds(maxId);
  const legacy = new Set<string>();
  for (const v of Object.values(idMap)) {
    if (v && v.startsWith(`${BASE}/noticias/`)) legacy.add(v);
  }
  console.log(`[sudoeste]   ${legacy.size} URLs legacy redirect`);

  const candidates = [...new Set([...catUrls, ...searchUrls, ...legacy])].sort();
  await writeJson(CACHE_CANDIDATES, candidates);
  console.log(`[sudoeste] candidatos (dedup): ${candidates.length}`);

  console.log("[sudoeste] fase B: body scan");
  const matched = await scanBodies(candidates);
  console.log(`[sudoeste] matched: ${Object.keys(matched).length}`);
  await writeJson(CACHE_MATCHED, Object.keys(matched).sort());

  console.log("[sudoeste] fase C: salvando");
  return await saveAll(matched);
}

export async function saveFromCache(): Promise<ManifestEntry[]> {
  if (!(await fileExists(CACHE_PARSED))) {
    throw new Error(`cache parsed ausente: ${CACHE_PARSED}`);
  }
  const parsed = await readJson<Record<string, ParsedArticle | null>>(CACHE_PARSED);
  const matched: Record<string, ParsedArticle> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v) matched[k] = v;
  }
  console.log(`[sudoeste] save-from-cache: ${Object.keys(matched).length} matérias`);
  return await saveAll(matched);
}