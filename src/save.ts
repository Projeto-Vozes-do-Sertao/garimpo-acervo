/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Persistência local de documentos + metadata. Port de collector/save.py. */

import { join } from "node:path";
import { RAW_DIR, PRIORITY_DOMAINS } from "./config.ts";
import { ensureDir, slugifyUrl } from "./util.ts";
import type { ManifestEntry, ScrapedDoc } from "./types.ts";

const DOMAIN_MAP: Record<string, string> = {
  "wikipedia.org": "wikipedia",
  "ibge.gov.br": "ibge",
  "bn.gov.br": "biblioteca-nacional",
  "scielo.br": "academico",
  "redalyc.org": "academico",
  "ufba.br": "academico",
  "uesb.edu.br": "academico",
  "tribunadabahia.com.br": "jornal",
  "gov.br": "governo",
};

function classifyDomain(url: string): string[] {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return ["outro"];
  }
  const tags: string[] = [];
  for (const [key, tag] of Object.entries(DOMAIN_MAP)) {
    if (host.includes(key)) {
      tags.push(tag);
      break;
    }
  }
  if (tags.length === 0) tags.push("outro");
  return tags;
}

export async function saveDocuments(docs: ScrapedDoc[]): Promise<ManifestEntry[]> {
  ensureDir(RAW_DIR);
  const entries: ManifestEntry[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const docId = String(i + 1).padStart(4, "0");
    const slug = slugifyUrl(doc.url);
    const base = `${docId}_${slug}`;
    const mdPath = join(RAW_DIR, `${base}.md`);
    const metaPath = join(RAW_DIR, `${base}.meta.json`);

    await Bun.write(mdPath, doc.markdown);

    const tags = classifyDomain(doc.url);
    const q = doc.query.toLowerCase();
    if (q.includes("história") || q.includes("emancipação")) tags.push("historia");
    if (q.includes("agrícola") || q.includes("econômico")) tags.push("economia");
    if (q.includes("política")) tags.push("politica");

    let domain = "";
    try {
      domain = new URL(doc.url).hostname;
    } catch {
      /* noop */
    }

    const meta = {
      id: docId,
      source_url: doc.url,
      source_title: doc.title,
      discovered_via: doc.source,
      discovery_query: doc.query,
      collected_at: new Date().toISOString(),
      content_type: doc.content_type,
      language: "pt-BR",
      char_count: doc.char_count,
      needs_ocr: doc.needs_ocr,
      domain,
      tags: [...new Set(tags)].sort(),
    };
    await Bun.write(metaPath, JSON.stringify(meta, null, 2));

    entries.push({
      id: docId,
      url: doc.url,
      title: doc.title,
      needs_ocr: doc.needs_ocr,
      file: `${base}.md`,
    });
    console.log(`[save] ${base} (${doc.char_count} chars)`);
  }

  console.log(`[save] total salvo: ${entries.length} documentos em ${RAW_DIR}`);
  return entries;
}