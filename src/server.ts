/**
 * -----------------------------------------------------------------------------
 * Autor: Igor Duca
 * Data: 2026-05-27
 * Vozes do Sertão — um projeto da Liga Colaborativa dos Povos
 * Acervo: Museu Digital de Lagoa Real
 * -----------------------------------------------------------------------------
 */

/** HTTP API (Fastify + Bun) — endpoints espelhando o CLI.
 *  Coletor de fontes sobre Lagoa Real (BA).
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { DATA_DIR, MANIFEST_PATH, PDF_DIR, RAW_DIR } from "./config.ts";
import { rebuildManifest } from "./manifest.ts";
import { canServePublic } from "./rights.ts";
import { scrapeIguanambi } from "./scrape-iguanambi.ts";
import { scrapeSudoestebahia, saveFromCache, MAX_LEGACY_ID } from "./scrape-sudoestebahia.ts";
import { discoverAll } from "./discover.ts";
import { filterUrls } from "./filter.ts";
import { scrapeUrls } from "./scrape.ts";
import { saveDocuments } from "./save.ts";
import { generatePdf } from "./pdf-generator.ts";
import { ensureDir, fileExists, readJson, writeJson } from "./util.ts";
import type { DiscoveredURL } from "./types.ts";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const CACHE_PATH = join(DATA_DIR, "cache_discovered_urls.json");
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN || "";

/** Decide se a requisição pode acessar conteúdo restrito (L3 body, scrape jobs). */
function isInternalRequest(req: { headers: Record<string, unknown> }): boolean {
  if (!INTERNAL_TOKEN) return false;
  const hdr = String(req.headers["x-internal-token"] || "");
  return hdr === INTERNAL_TOKEN;
}

// --- Job tracker (jobs longos rodam em background, status via /jobs/:id) ---
type JobStatus = "pending" | "running" | "completed" | "failed";
interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  started_at: string;
  finished_at?: string;
  result?: unknown;
  error?: string;
}
const jobs = new Map<string, Job>();

function newJob(kind: string): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    kind,
    status: "running",
    started_at: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

function runJob(job: Job, fn: () => Promise<unknown>): void {
  fn()
    .then((r) => {
      job.status = "completed";
      job.result = r;
      job.finished_at = new Date().toISOString();
    })
    .catch((e) => {
      job.status = "failed";
      job.error = String(e?.message || e);
      job.finished_at = new Date().toISOString();
    });
}

// --- Build server ---

async function buildServer() {
  const fastify = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" } });
  await fastify.register(cors, { origin: true });
  await fastify.register(sensible);

  ensureDir(DATA_DIR);

  // === Meta ===
  fastify.get("/", async () => ({
    service: "vozes-do-sertao-ts",
    version: "0.1.0",
    runtime: "bun",
    endpoints: [
      "GET  /health",
      "GET  /manifest",
      "POST /manifest/rebuild",
      "GET  /docs",
      "GET  /docs/:id",
      "POST /scrape/iguanambi",
      "POST /scrape/sudoeste",
      "POST /scrape/sudoeste/save",
      "POST /scrape/discover",
      "POST /pdf",
      "GET  /pdf/:filename",
      "GET  /jobs/:id",
    ],
  }));

  fastify.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  // === Manifest ===
  fastify.get("/manifest", async (_req, reply) => {
    if (!(await fileExists(MANIFEST_PATH))) {
      return reply.notFound("manifest.json não existe — rode /manifest/rebuild");
    }
    return await readJson(MANIFEST_PATH);
  });

  fastify.post("/manifest/rebuild", async () => {
    const m = await rebuildManifest();
    return { ok: true, total: m.total_documents, by_source: m.by_discovery_method };
  });

  // === Docs ===
  const DocsQuery = z.object({
    source: z.string().optional(),
    domain: z.string().optional(),
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(2000).optional(),
  });

  fastify.get("/docs", async (req, reply) => {
    if (!(await fileExists(MANIFEST_PATH))) {
      return reply.notFound("manifest.json não existe");
    }
    const m = await readJson<{ documents: Array<Record<string, unknown>> }>(MANIFEST_PATH);
    const parsed = DocsQuery.safeParse(req.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { source, domain, q, limit } = parsed.data;
    let docs = m.documents;
    if (source) docs = docs.filter((d) => d.source === source);
    if (domain) docs = docs.filter((d) => String(d.domain || "").includes(domain));
    if (q) {
      const qLow = q.toLowerCase();
      docs = docs.filter((d) =>
        String(d.title || "").toLowerCase().includes(qLow) ||
        String(d.url || "").toLowerCase().includes(qLow),
      );
    }
    if (limit) docs = docs.slice(0, limit);
    // Lista só metadados (sem markdown), seguro para servir publicamente.
    return { total: docs.length, internal: isInternalRequest(req), documents: docs };
  });

  const DocViewQuery = z.object({
    view: z.enum(["public", "internal"]).optional(),
  });

  fastify.get<{ Params: { id: string } }>("/docs/:id", async (req, reply) => {
    if (!(await fileExists(MANIFEST_PATH))) {
      return reply.notFound("manifest.json não existe");
    }
    const m = await readJson<{ documents: Array<Record<string, unknown>> }>(MANIFEST_PATH);
    const id = req.params.id;
    const doc = m.documents.find((d) => d.id === id);
    if (!doc) return reply.notFound(`doc ${id} não encontrado`);

    const viewParsed = DocViewQuery.safeParse(req.query);
    const wantInternal =
      (viewParsed.success && viewParsed.data.view === "internal") || false;
    const internalOk = isInternalRequest(req);
    const layer = Number(doc.rights_layer || 3) as 1 | 2 | 3;

    // Camada 3 sem token → catálogo referencial (só metadados + URL fonte)
    if (layer === 3 && !(wantInternal && internalOk)) {
      return {
        ...doc,
        markdown: null,
        meta: null,
        access_notice:
          "Camada 3 (catálogo referencial): direitos autorais reservados ao veículo. " +
          "O texto integral não é redistribuído pelo museu. Consulte a fonte original.",
        source_url: doc.url,
      };
    }

    // Sem token mas pediu internal → 403
    if (wantInternal && !internalOk) {
      return reply
        .code(403)
        .send({ error: "view=internal requer header x-internal-token" });
    }

    const file = String(doc.file || "");
    const mdPath = join(RAW_DIR, file);
    const metaPath = join(RAW_DIR, file.replace(/\.md$/, ".meta.json"));
    if (!existsSync(mdPath)) return reply.notFound(`arquivo ${file} não existe`);
    const markdown = await readFile(mdPath, "utf-8");
    const meta = existsSync(metaPath) ? await readJson(metaPath) : null;
    return { ...doc, markdown, meta };
  });

  // === Scrape: iguanambi ===
  fastify.post("/scrape/iguanambi", async (req, reply) => {
    if (!isInternalRequest(req)) {
      return reply.code(403).send({ error: "requer x-internal-token" });
    }
    const job = newJob("iguanambi");
    runJob(job, async () => {
      const entries = await scrapeIguanambi();
      await rebuildManifest();
      return { count: entries.length };
    });
    return { job_id: job.id, status: job.status };
  });

  // === Scrape: sudoeste ===
  const SudoesteBody = z.object({
    max_id: z.coerce.number().int().positive().optional(),
  });

  fastify.post("/scrape/sudoeste", async (req, reply) => {
    if (!isInternalRequest(req)) {
      return reply.code(403).send({ error: "requer x-internal-token" });
    }
    const parsed = SudoesteBody.safeParse(req.body || {});
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const maxId = parsed.data.max_id ?? MAX_LEGACY_ID;
    const job = newJob("sudoeste");
    runJob(job, async () => {
      const entries = await scrapeSudoestebahia(maxId);
      await rebuildManifest();
      return { count: entries.length };
    });
    return { job_id: job.id, status: job.status, max_id: maxId };
  });

  fastify.post("/scrape/sudoeste/save", async (req, reply) => {
    if (!isInternalRequest(req)) {
      return reply.code(403).send({ error: "requer x-internal-token" });
    }
    const job = newJob("sudoeste-save");
    runJob(job, async () => {
      const entries = await saveFromCache();
      await rebuildManifest();
      return { count: entries.length };
    });
    return { job_id: job.id, status: job.status };
  });

  // === Scrape: discover pipeline (Exa + Firecrawl) ===
  fastify.post("/scrape/discover", async (req, reply) => {
    if (!isInternalRequest(req)) {
      return reply.code(403).send({ error: "requer x-internal-token" });
    }
    const job = newJob("discover");
    runJob(job, async () => {
      let discovered: DiscoveredURL[];
      if (await fileExists(CACHE_PATH)) {
        discovered = await readJson<DiscoveredURL[]>(CACHE_PATH);
      } else {
        discovered = await discoverAll();
        await writeJson(CACHE_PATH, discovered);
      }
      const filtered = filterUrls(discovered);
      const docs = await scrapeUrls(filtered);
      const entries = await saveDocuments(docs);
      await rebuildManifest();
      return { discovered: discovered.length, filtered: filtered.length, saved: entries.length };
    });
    return { job_id: job.id, status: job.status };
  });

  // === Jobs ===
  fastify.get<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const job = jobs.get(req.params.id);
    if (!job) return reply.notFound("job não encontrado");
    return job;
  });

  fastify.get("/jobs", async () => ({
    jobs: [...jobs.values()],
  }));

  // === LGPD: pedido de remoção ===
  const RemoveBody = z.object({
    document_id: z.string().min(1),
    requester_name: z.string().min(1),
    requester_email: z.string().email(),
    reason: z.string().min(10),
  });

  const REMOVE_LOG = join(DATA_DIR, "lgpd_remove_requests.jsonl");

  fastify.post("/remove-request", async (req, reply) => {
    const parsed = RemoveBody.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const record = {
      ...parsed.data,
      submitted_at: new Date().toISOString(),
      ip: req.ip,
      status: "pending",
    };
    ensureDir(DATA_DIR);
    await Bun.write(
      REMOVE_LOG,
      `${JSON.stringify(record)}\n`,
      { createPath: true } as any,
    ).catch(async () => {
      // append manual
      const cur = (await fileExists(REMOVE_LOG)) ? await Bun.file(REMOVE_LOG).text() : "";
      await Bun.write(REMOVE_LOG, cur + JSON.stringify(record) + "\n");
    });
    return {
      ok: true,
      message:
        "Pedido registrado. Será analisado conforme política LGPD (Lei 13.709/18) " +
        "no prazo de 15 dias úteis.",
    };
  });

  // === PDF generation ===
  const PdfBody = z.object({
    source: z.string().min(1),
    filename: z.string().optional(),
  });

  fastify.post("/pdf", async (req, reply) => {
    const parsed = PdfBody.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { source, filename } = parsed.data;
    const output = filename ? join(PDF_DIR, filename) : undefined;
    try {
      const path = await generatePdf(source, output);
      const file = Bun.file(path);
      return {
        ok: true,
        path,
        filename: path.split("/").pop(),
        size_kb: Math.round(file.size / 1024),
        download_url: `/pdf/${path.split("/").pop()}`,
      };
    } catch (e) {
      return reply.internalServerError(String((e as Error).message));
    }
  });

  fastify.get<{ Params: { filename: string } }>("/pdf/:filename", async (req, reply) => {
    const fname = req.params.filename;
    if (fname.includes("/") || fname.includes("..")) return reply.badRequest("nome inválido");
    const p = join(PDF_DIR, fname);
    if (!existsSync(p)) return reply.notFound("pdf não encontrado");
    const file = Bun.file(p);
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `inline; filename="${fname}"`);
    return reply.send(await file.arrayBuffer());
  });

  return fastify;
}

// --- Boot ---

const server = await buildServer();
await server.listen({ port: PORT, host: HOST });
console.log(`[server] http://${HOST}:${PORT} (Bun ${Bun.version})`);