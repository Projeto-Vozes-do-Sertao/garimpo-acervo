/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Scraper via Firecrawl scrape (markdown limpo).
 *  Port de collector/scrape.py.
 */

import FirecrawlApp from "@mendable/firecrawl-js";

import type { DiscoveredURL, ScrapedDoc } from "./types.ts";

function getFirecrawl(): FirecrawlApp {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY ausente");
  return new FirecrawlApp({ apiKey: key });
}

function detectContentType(url: string, markdown: string): {
  content_type: ScrapedDoc["content_type"];
  needs_ocr: boolean;
} {
  const isPdf = url.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { content_type: "html", needs_ocr: false };
  if (markdown && markdown.trim().length > 100) {
    return { content_type: "pdf_native", needs_ocr: false };
  }
  return { content_type: "pdf_ocr", needs_ocr: true };
}

async function scrapeOne(item: DiscoveredURL): Promise<ScrapedDoc | null> {
  const fc = getFirecrawl();
  try {
    const res = (await fc.scrapeUrl(item.url, {
      formats: ["markdown"],
      onlyMainContent: true,
    })) as any;
    if (!res?.success && !res?.data && !res?.markdown) {
      console.warn(`[scrape] sem dados ${item.url}`);
      return null;
    }
    const markdown: string = res.markdown ?? res.data?.markdown ?? "";
    const title: string =
      res.metadata?.title ?? res.data?.metadata?.title ?? item.title ?? "";
    const ct = detectContentType(item.url, markdown);
    return {
      url: item.url,
      title,
      markdown: markdown || "",
      content_type: ct.content_type,
      needs_ocr: ct.needs_ocr,
      char_count: markdown.length,
      source: item.source,
      query: item.query,
    };
  } catch (e) {
    console.error(`[scrape] erro ${item.url}: ${e}`);
    return null;
  }
}

export async function scrapeUrls(items: DiscoveredURL[]): Promise<ScrapedDoc[]> {
  const out: ScrapedDoc[] = [];
  let i = 0;
  for (const item of items) {
    i++;
    console.log(`[scrape] ${i}/${items.length} ${item.url}`);
    const doc = await scrapeOne(item);
    if (doc) out.push(doc);
    // gentle rate-limit
    await Bun.sleep(250);
  }
  console.log(`[scrape] total: ${out.length}/${items.length} sucesso`);
  return out;
}