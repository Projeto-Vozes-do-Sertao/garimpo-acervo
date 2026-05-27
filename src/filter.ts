/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Deduplica URLs e filtra domínios bloqueados. Port de collector/filter.py. */

import { BLOCKED_DOMAINS } from "./config.ts";
import type { DiscoveredURL } from "./types.ts";

function isBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((d) => host.includes(d));
  } catch {
    return true;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // strip trailing slash
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function filterUrls(urls: DiscoveredURL[]): DiscoveredURL[] {
  const seen = new Set<string>();
  const out: DiscoveredURL[] = [];
  let blocked = 0;
  let dups = 0;

  for (const u of urls) {
    if (isBlocked(u.url)) {
      blocked++;
      continue;
    }
    const norm = normalizeUrl(u.url);
    if (seen.has(norm)) {
      dups++;
      continue;
    }
    seen.add(norm);
    out.push(u);
  }

  console.log(
    `[filter] entradas=${urls.length} bloqueadas=${blocked} duplicadas=${dups} finais=${out.length}`,
  );
  return out;
}