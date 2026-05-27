/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** Classificação de direitos por domínio.
 *
 *  Mapeia para 3 camadas conforme política do Museu Digital de Lagoa Real:
 *    L1 — Domínio público / licença aberta (CC0, CC BY, CC BY-SA, LAI)
 *    L2 — Autorização expressa (cessão assinada por detentor de direitos)
 *    L3 — Copyright restrito (catálogo referencial, só metadados públicos)
 *
 *  Override individual via meta.json (`rights_layer_override` ou `rights_license`).
 */

export type RightsLayer = 1 | 2 | 3;

export interface RightsInfo {
  layer: RightsLayer;
  license: string; // ex: "CC BY-SA 4.0", "LAI 12.527/11", "domínio público", "copyright reservado"
  reason: string; // explicação curta
}

const PATTERNS: Array<{
  match: (host: string, url: string) => boolean;
  info: RightsInfo;
}> = [
  // L1 — Wikipedia
  {
    match: (h) => h.endsWith("wikipedia.org") || h.endsWith("wikimedia.org"),
    info: {
      layer: 1,
      license: "CC BY-SA 4.0",
      reason: "Wikipedia — licença livre com atribuição",
    },
  },
  // L1 — Órgãos públicos federais e estaduais
  {
    match: (h) =>
      h.endsWith(".gov.br") ||
      h.endsWith(".ba.gov.br") ||
      h === "gov.br" ||
      h.endsWith(".ibge.gov.br") ||
      h.endsWith("ibge.gov.br") ||
      h.includes("portaldatransparencia"),
    info: {
      layer: 1,
      license: "LAI 12.527/11",
      reason: "Órgão público — Lei de Acesso à Informação",
    },
  },
  // L1 — Instituições acadêmicas (publicações abertas)
  {
    match: (h) =>
      h.endsWith(".edu.br") ||
      h.includes("scielo.br") ||
      h.includes("redalyc.org") ||
      h.includes("bn.gov.br"),
    info: {
      layer: 1,
      license: "acesso aberto acadêmico",
      reason: "Publicação acadêmica em acesso aberto",
    },
  },
  // L3 — Jornais com copyright reservado
  {
    match: (h) =>
      h.includes("sudoestebahia.com") ||
      h.includes("iguanambi.com.br") ||
      h.includes("tribunadabahia.com.br") ||
      h.includes("correio24horas.com.br") ||
      h.includes("metro1.com.br") ||
      h.includes("g1.globo.com"),
    info: {
      layer: 3,
      license: "copyright reservado ao veículo",
      reason: "Veículo jornalístico — uso interno/citação somente",
    },
  },
];

export function classifyRights(url: string): RightsInfo {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return {
      layer: 3,
      license: "indeterminado",
      reason: "URL inválida — tratado como restrito por precaução",
    };
  }
  for (const p of PATTERNS) {
    if (p.match(host, url)) return p.info;
  }
  // Fallback conservador: sem match conhecido → L3 (catálogo referencial)
  return {
    layer: 3,
    license: "indeterminado",
    reason: "Domínio desconhecido — tratado como restrito por precaução",
  };
}

/** Determina se metadados/conteúdo podem ser servidos publicamente integralmente. */
export function canServePublic(layer: RightsLayer): boolean {
  return layer === 1 || layer === 2;
}