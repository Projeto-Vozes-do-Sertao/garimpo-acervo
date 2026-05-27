/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Reconstrói manifest.json unificado escaneando data/raw/*.meta.json.
 *
 *  Enriquece com:
 *   - rights_layer (1/2/3) classificado por domínio via src/rights.ts
 *   - sha256 do markdown (prep para registro em blockchain — prova de existência)
 *   - museum_id (MDLR-YYYY-NNNNN) sequencial estável
 *
 *  Port de collector/manifest.py.
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

import { RAW_DIR, MANIFEST_PATH } from "./config.ts";
import { ensureDir, readJson, writeJson } from "./util.ts";
import { classifyRights } from "./rights.ts";
import type { DocMeta, ManifestEntry } from "./types.ts";

export interface Manifest {
  collected_at: string;
  total_documents: number;
  by_source_type: Record<string, number>;
  by_discovery_method: Record<string, number>;
  by_rights_layer: { "1": number; "2": number; "3": number };
  documents: ManifestEntry[];
}

async function sha256File(path: string): Promise<string | undefined> {
  try {
    const buf = await readFile(path);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return undefined;
  }
}

export async function rebuildManifest(): Promise<Manifest> {
  if (!existsSync(RAW_DIR)) {
    console.warn(`[manifest] ${RAW_DIR} não existe`);
    return {
      collected_at: new Date().toISOString(),
      total_documents: 0,
      by_source_type: {},
      by_discovery_method: {},
      by_rights_layer: { "1": 0, "2": 0, "3": 0 },
      documents: [],
    };
  }

  const files = (await readdir(RAW_DIR))
    .filter((f) => f.endsWith(".meta.json"))
    .sort();

  const entries: ManifestEntry[] = [];
  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byLayer: { "1": number; "2": number; "3": number } = { "1": 0, "2": 0, "3": 0 };

  for (const fname of files) {
    const path = join(RAW_DIR, fname);
    let meta: Partial<DocMeta>;
    try {
      meta = await readJson<DocMeta>(path);
    } catch {
      console.warn(`[manifest] meta inválido: ${fname}`);
      continue;
    }
    const mdFile = fname.replace(".meta.json", ".md");
    const mdPath = join(RAW_DIR, mdFile);
    const src = meta.discovered_via || "unknown";
    const ctype = meta.content_type || "html";

    // Rights classification — meta override beats auto-classify
    let layer = meta.rights_layer;
    let license = meta.rights_license;
    if (!layer) {
      const r = classifyRights(meta.source_url || "");
      layer = r.layer;
      license = r.license;
    }

    // Hash do conteúdo (prep para blockchain proof-of-existence)
    const sha = meta.sha256 ?? (await sha256File(mdPath));

    bySource[src] = (bySource[src] || 0) + 1;
    byType[ctype] = (byType[ctype] || 0) + 1;
    byLayer[String(layer) as "1" | "2" | "3"]++;

    entries.push({
      id: "",
      url: meta.source_url || "",
      title: meta.source_title || "",
      domain: meta.domain || "",
      source: src,
      published_at: meta.published_at ?? null,
      needs_ocr: meta.needs_ocr ?? false,
      file: mdFile,
      meta_file: fname,
      rights_layer: layer,
      rights_license: license,
      sha256: sha,
    });
  }

  entries.sort((a, b) => {
    const s = (a.source || "").localeCompare(b.source || "");
    return s !== 0 ? s : a.file.localeCompare(b.file);
  });
  const year = new Date().getFullYear();
  entries.forEach((e, i) => {
    e.id = String(i + 1).padStart(4, "0");
    e.museum_id = `MDLR-${year}-${String(i + 1).padStart(5, "0")}`;
  });

  const manifest: Manifest = {
    collected_at: new Date().toISOString(),
    total_documents: entries.length,
    by_source_type: byType,
    by_discovery_method: bySource,
    by_rights_layer: byLayer,
    documents: entries,
  };

  ensureDir(join(MANIFEST_PATH, ".."));
  await writeJson(MANIFEST_PATH, manifest);
  console.log(
    `[manifest] unificado: ${entries.length} docs, fontes=${JSON.stringify(bySource)}, ` +
      `camadas L1=${byLayer["1"]} L2=${byLayer["2"]} L3=${byLayer["3"]}`,
  );
  return manifest;
}