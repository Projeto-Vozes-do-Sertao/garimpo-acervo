/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/**
 * Configurações do coletor: queries, domínios, filtros.
 * Port direto de collector/config.py.
 */

import { resolve } from "node:path";

export const PROJECT_ROOT = resolve(import.meta.dir, "..");
export const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(PROJECT_ROOT, "data");
export const RAW_DIR = resolve(DATA_DIR, "raw");
export const PDF_DIR = resolve(DATA_DIR, "pdf");
export const IMAGE_DIR = resolve(DATA_DIR, "images");
export const MANIFEST_PATH = resolve(DATA_DIR, "manifest.json");

// Branding (logos)
export const BRANDING_DIR =
  process.env.BRANDING_DIR ||
  "/Users/duca/Documents/Liga/Projeto Vozes do Sertão";
export const LOGO_MAIN = resolve(BRANDING_DIR, "logo projeto.png");
export const LOGO_LIGA = resolve(BRANDING_DIR, "liga-logo.png");

// Queries de descoberta
export const SEMANTIC_QUERIES = [
  "história e emancipação política do município de Lagoa Real Bahia",
  "Lagoa Real Bahia comunidades rurais povoamento sertão",
  "Lagoa Real Bahia personalidades políticas líderes comunitários",
  "Lagoa Real Bahia desenvolvimento agrícola economia",
  "Lagoa Real Bahia cultura tradições vaqueiros sertão",
  "Lagoa Real Bahia educação saúde infraestrutura",
];

export const KEYWORD_QUERIES = [
  '"Lagoa Real" Bahia história',
  '"Lagoa Real" emancipação município',
  '"Lagoa Real" prefeitura',
  '"Lagoa Real" IBGE',
  '"Lagoa Real" Vitória da Conquista',
  '"Lagoa Real" Bahia governo',
];

export const EXA_NUM_RESULTS = 10;
export const FIRECRAWL_SEARCH_LIMIT = 10;

export const PRIORITY_DOMAINS = [
  "wikipedia.org",
  "ibge.gov.br",
  "bn.gov.br",
  "scielo.br",
  "redalyc.org",
  "ufba.br",
  "uesb.edu.br",
  "tribunadabahia.com.br",
  "gov.br",
  ".edu.br",
];

export const BLOCKED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "shopee.com.br",
  "mercadolivre.com.br",
  "amazon.com.br",
];