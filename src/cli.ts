#!/usr/bin/env bun
/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** CLI parity with `python -m collector.main`. */

import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { DATA_DIR } from "./config.ts";
import { ensureDir, readJson, writeJson } from "./util.ts";
import { discoverAll } from "./discover.ts";
import { filterUrls } from "./filter.ts";
import { scrapeUrls } from "./scrape.ts";
import { saveDocuments } from "./save.ts";
import { scrapeIguanambi } from "./scrape-iguanambi.ts";
import { scrapeSudoestebahia, saveFromCache, MAX_LEGACY_ID } from "./scrape-sudoestebahia.ts";
import { rebuildManifest } from "./manifest.ts";
import { generatePdf } from "./pdf-generator.ts";
import type { DiscoveredURL } from "./types.ts";

const CACHE_PATH = join(DATA_DIR, "cache_discovered_urls.json");

async function loadCache(): Promise<DiscoveredURL[]> {
  return await readJson<DiscoveredURL[]>(CACHE_PATH);
}

async function saveCache(urls: DiscoveredURL[]): Promise<void> {
  ensureDir(DATA_DIR);
  await writeJson(CACHE_PATH, urls);
  console.log(`[cache] ${urls.length} URLs salvas em ${CACHE_PATH}`);
}

const program = new Command();

program
  .name("vozes-do-sertao")
  .description("Coletor de fontes sobre Lagoa Real (BA) — TS port")
  .version("0.1.0");

program
  .command("iguanambi")
  .description("Scrape direto via WordPress REST API do iguanambi.com.br")
  .action(async () => {
    await scrapeIguanambi();
    const m = await rebuildManifest();
    console.log(`[manifest] unificado: ${m.total_documents} docs`);
  });

program
  .command("sudoeste")
  .description("Scrape sudoestebahia.com via enum legacy IDs + body scan")
  .option("--max-id <n>", "ID máximo a enumerar", String(MAX_LEGACY_ID))
  .action(async (opts) => {
    await scrapeSudoestebahia(parseInt(opts.maxId, 10));
    const m = await rebuildManifest();
    console.log(`[manifest] unificado: ${m.total_documents} docs`);
  });

program
  .command("sudoeste-save")
  .description("Re-salva sudoeste a partir do cache parsed (sem re-scrape)")
  .action(async () => {
    await saveFromCache();
    const m = await rebuildManifest();
    console.log(`[manifest] unificado: ${m.total_documents} docs`);
  });

program
  .command("manifest")
  .description("Reconstrói manifest.json escaneando data/raw/*.meta.json")
  .action(async () => {
    await rebuildManifest();
  });

program
  .command("pdf <source>")
  .description("Gera PDF branded de uma matéria (URL, .md ou substring do título)")
  .option("-o, --output <file>", "Caminho do PDF de saída")
  .action(async (source: string, opts: { output?: string }) => {
    const path = await generatePdf(source, opts.output);
    const size = Math.round(Bun.file(path).size / 1024);
    console.log(`PDF gerado: ${path}  (${size} KB)`);
  });

program
  .command("discover")
  .description("Pipeline padrão: Exa + Firecrawl → filter → scrape → save")
  .option("--use-cache", "Usa cache de URLs descobertas se existir")
  .action(async (opts) => {
    let discovered: DiscoveredURL[];
    if (opts.useCache && existsSync(CACHE_PATH)) {
      console.log("[main] usando cache");
      discovered = await loadCache();
    } else {
      discovered = await discoverAll();
      if (discovered.length === 0) {
        console.error("nenhuma URL descoberta — verifique API keys no .env");
        process.exit(1);
      }
      await saveCache(discovered);
    }
    const filtered = filterUrls(discovered);
    if (filtered.length === 0) {
      console.error("todas URLs filtradas");
      process.exit(1);
    }
    const docs = await scrapeUrls(filtered);
    if (docs.length === 0) {
      console.error("nenhum documento scrapado");
      process.exit(1);
    }
    await saveDocuments(docs);
    const m = await rebuildManifest();
    console.log(`[manifest] unificado: ${m.total_documents} docs`);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});