/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Descoberta de URLs via Exa (semântica) + Firecrawl (keyword search).
 *  Port de collector/discover.py.
 */

import Exa from "exa-js";
import FirecrawlApp from "@mendable/firecrawl-js";

import {
  EXA_NUM_RESULTS,
  FIRECRAWL_SEARCH_LIMIT,
  KEYWORD_QUERIES,
  SEMANTIC_QUERIES,
} from "./config.ts";
import type { DiscoveredURL } from "./types.ts";

function getExa(): Exa {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY ausente");
  return new Exa(key);
}

function getFirecrawl(): FirecrawlApp {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY ausente");
  return new FirecrawlApp({ apiKey: key });
}

async function discoverViaExa(): Promise<DiscoveredURL[]> {
  const exa = getExa();
  const out: DiscoveredURL[] = [];
  for (const query of SEMANTIC_QUERIES) {
    try {
      console.log(`[exa] ${query}`);
      const res = await exa.search(query, {
        type: "auto",
        numResults: EXA_NUM_RESULTS,
        useAutoprompt: true,
      });
      for (const r of res.results) {
        out.push({
          url: r.url,
          title: r.title || "",
          source: "exa",
          query,
        });
      }
      console.log(`[exa]   ${res.results.length} resultados`);
    } catch (e) {
      console.error(`[exa] erro '${query}': ${e}`);
    }
  }
  return out;
}

async function discoverViaFirecrawl(): Promise<DiscoveredURL[]> {
  const fc = getFirecrawl();
  const out: DiscoveredURL[] = [];
  for (const query of KEYWORD_QUERIES) {
    try {
      console.log(`[firecrawl-search] ${query}`);
      const res = (await fc.search(query, { limit: FIRECRAWL_SEARCH_LIMIT })) as any;
      const items = (res?.data ?? res?.web ?? []) as Array<{
        url: string;
        title?: string;
      }>;
      for (const r of items) {
        if (!r.url) continue;
        out.push({
          url: r.url,
          title: r.title || "",
          source: "firecrawl_search",
          query,
        });
      }
      console.log(`[firecrawl-search]   ${items.length} resultados`);
    } catch (e) {
      console.error(`[firecrawl-search] erro '${query}': ${e}`);
    }
  }
  return out;
}

export async function discoverAll(): Promise<DiscoveredURL[]> {
  const [a, b] = await Promise.all([
    discoverViaExa(),
    discoverViaFirecrawl(),
  ]);
  const all = [...a, ...b];
  console.log(`[discover] total: ${all.length} URLs descobertas`);
  return all;
}