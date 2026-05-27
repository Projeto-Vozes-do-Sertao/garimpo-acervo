/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Tipos compartilhados. */

export interface DiscoveredURL {
  url: string;
  title: string;
  source: "exa" | "firecrawl_search" | string;
  query: string;
}

export interface ScrapedDoc {
  url: string;
  title: string;
  markdown: string;
  content_type: "html" | "pdf_native" | "pdf_ocr";
  needs_ocr: boolean;
  char_count: number;
  source: string;
  query: string;
}

export interface ManifestEntry {
  id: string;
  museum_id?: string; // MDLR-YYYY-NNNNN
  url: string;
  title: string;
  domain?: string;
  source?: string;
  published_at?: string | null;
  needs_ocr: boolean;
  file: string;
  meta_file?: string;
  rights_layer?: 1 | 2 | 3;
  rights_license?: string;
  sha256?: string;
}

export interface DocMeta {
  id: string;
  source_url: string;
  source_title: string;
  discovered_via: string;
  discovery_query: string;
  collected_at: string;
  published_at?: string | null;
  modified_at?: string | null;
  content_type: string;
  language: string;
  char_count: number;
  needs_ocr: boolean;
  domain: string;
  categoria?: string | null;
  autor?: string | null;
  tags: string[];
  rights_layer?: 1 | 2 | 3;
  rights_license?: string;
  rights_reason?: string;
  sha256?: string;
}

export interface Block {
  type: "p" | "h2" | "h3" | "h4" | "h5" | "img" | "list" | "quote";
  text?: string;
  items?: string[];
  src?: string;
  caption?: string;
}

export interface Article {
  url: string;
  title: string;
  subtitle: string | null;
  date_iso: string | null;
  autor: string | null;
  categoria: string | null;
  domain: string;
  hero_image: Block | null;
  blocks: Block[];
}