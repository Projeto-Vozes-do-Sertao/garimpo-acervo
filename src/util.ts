/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Utilitários compartilhados. */

import { existsSync, mkdirSync } from "node:fs";

export function slugifyUrl(url: string, maxLen = 80): string {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/^\/|\/$/g, "").replace(/\//g, "_");
    let slug = path ? `${domain}_${path}` : domain;
    slug = slug.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    return slug.slice(0, maxLen);
  } catch {
    return url.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, maxLen);
  }
}

export function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export function normalize(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function hasLagoaReal(text: string): boolean {
  return normalize(text || "").includes("lagoa real");
}

const MONTH_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** "09 Abr 2024 / 07h45" → "2024-04-09T07:45:00-03:00" */
export function parsePtDate(s: string): string | null {
  if (!s) return null;
  const m = s.trim().match(/(\d{1,2})\s+(\w{3})\w*\s+(\d{4})\s*\/?\s*(\d{2})?h?(\d{2})?/);
  if (!m) return null;
  const [, d, mon, y, hh, mm] = m;
  const monN = MONTH_PT[mon.slice(0, 3).toLowerCase()];
  if (!monN) return null;
  const dd = String(parseInt(d, 10)).padStart(2, "0");
  const mmStr = String(monN).padStart(2, "0");
  return `${y}-${mmStr}-${dd}T${hh ?? "00"}:${mm ?? "00"}:00-03:00`;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function readJson<T>(path: string): Promise<T> {
  const f = Bun.file(path);
  return (await f.json()) as T;
}

export async function writeJson(path: string, data: unknown, pretty = true): Promise<void> {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await Bun.write(path, json);
}

export async function fileExists(path: string): Promise<boolean> {
  return await Bun.file(path).exists();
}