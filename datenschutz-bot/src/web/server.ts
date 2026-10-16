#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { EXAMPLES_DIR, HOST, PORT, PROJECT_ROOT, PUBLIC_DIR } from "../config.js";
import { PLACEHOLDER_SOURCE } from "../core/placeholders.js";
import { ENTITY_LABELS, ENTITY_TYPES, isEntityType } from "../core/types.js";
import { KeyError } from "../core/vault.js";
import { ARTEN, ART_LABELS, JobError, JobStore, STATUS_LABELS } from "../store/jobs.js";
import { ConfigError } from "../store/settings.js";

// Die Oberfläche hat kein Login. Sie läuft deshalb nur auf dem eigenen Rechner (Loopback).
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
if (!LOOPBACK.has(HOST)) {
  console.error(
    `DSB_HOST=${HOST} wird nicht unterstützt: Die Oberfläche hat kein Login und läuft nur auf 127.0.0.1, localhost oder ::1.`,
  );
  process.exit(1);
}

const store = new JobStore();

const EXAMPLES = [
  { id: "hotel", titel: "Hotel-Anfrage", art: "hotel", betreff: "", datei: "hotel-anfrage.txt" },
  { id: "rechnung", titel: "Eingangsrechnung", art: "buchhaltung", betreff: "Eingangsrechnung Elektriker", datei: "eingangsrechnung.txt" },
  { id: "auftrag", titel: "Rechnungsauftrag", art: "hotel", betreff: "Rechnung Aufenthalt", datei: "rechnungsauftrag.txt" },
];

const STATIC: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/style.css": "style.css",
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: http.ServerResponse, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": type, ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers["content-type"] ?? "";
  if (!type.startsWith("application/json")) throw new HttpError(415, "Bitte JSON senden.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, "Anfrage zu groß.");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Ungültiges JSON.");
  }
}

function str(body: Record<string, unknown>, key: string, required = true): string {
  const v = body[key];
  if (typeof v === "string") return v;
  if (!required && (v === undefined || v === null)) return "";
  throw new HttpError(400, `Feld "${key}" fehlt.`);
}

function int(body: Record<string, unknown>, key: string): number {
  const v = body[key];
  if (typeof v === "number" && Number.isInteger(v)) return v;
  throw new HttpError(400, `Feld "${key}" fehlt.`);
}

/** Optionale Auswahl im Original: { start, end } als ganze Zahlen. */
function selection(body: Record<string, unknown>): [number, number] | undefined {
  const v = body.stelle;
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "Feld \"stelle\" ist ungültig.");
  const { start, end } = v as Record<string, unknown>;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end)) {
    throw new HttpError(400, "Feld \"stelle\" ist ungültig.");
  }
  return [start, end];
}

/**
 * Schutz gegen fremde Webseiten, die die lokale Oberfläche ansprechen (DNS-Rebinding, CSRF):
 * Der Host-Kopf muss immer eine lokale Adresse sein, und Änderungen dürfen nur von der eigenen Seite kommen.
 */
function checkOrigin(req: http.IncomingMessage) {
  const host = (req.headers.host ?? "").toLowerCase();
  const allowedHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`];
  if (!allowedHosts.includes(host)) throw new HttpError(403, "Zugriff nur über localhost.");
  const origin = req.headers.origin;
  if (req.method !== "GET" && origin && origin !== `http://${host}`) throw new HttpError(403, "Fremder Ursprung.");
}

function listForUi() {
  const { dokumente, defekt } = store.list();
  return {
    defekt,
    dokumente: dokumente.map((job) => ({
      id: job.id,
      art: job.art,
      status: job.status,
      erstellt: job.erstellt,
      aktualisiert: job.aktualisiert,
      ergebnisRev: job.ergebnisRev ?? null,
      titel: job.titel,
      ersetzt: job.anzahlPlatzhalter,
      hinweise: job.anzahlHinweise,
      rechnungsnummer: job.rechnungsnummer ?? null,
    })),
  };
}

function download(res: http.ServerResponse, file: { dateiname: string; typ: string; inhalt: string }) {
  send(res, 200, file.inhalt, file.typ, { "Content-Disposition": `attachment; filename="${file.dateiname}"` });
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  checkOrigin(req);
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;

  const staticFile = STATIC[p];
  if (req.method === "GET" && staticFile) {
    const file = path.join(PUBLIC_DIR, staticFile);
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] ?? "application/octet-stream");
  }

  if (req.method === "GET" && p === "/api/info") {
    return json(res, 200, {
      typen: ENTITY_TYPES.map((t) => ({ id: t, label: ENTITY_LABELS[t] })),
      arten: ARTEN.map((a) => ({ id: a, label: ART_LABELS[a] })),
      status: STATUS_LABELS,
      mcpPfad: path.join(PROJECT_ROOT, "dist", "mcp", "server.js"),
      platzhalterMuster: PLACEHOLDER_SOURCE,
    });
  }

  if (req.method === "GET" && p === "/api/beispiele") {
    return json(
      res,
      200,
      EXAMPLES.map(({ datei, ...e }) => ({ ...e, text: fs.readFileSync(path.join(EXAMPLES_DIR, datei), "utf8") })),
    );
  }

  if (p === "/api/dokumente") {
    if (req.method === "GET") return json(res, 200, listForUi());
    if (req.method === "POST") {
      const body = await readBody(req);
      const job = store.create({ art: str(body, "art"), betreff: str(body, "betreff", false), text: str(body, "text") });
      return json(res, 201, { id: job.id });
    }
  }

  const r = /^\/api\/rechnungen\/(\d{4}-\d{4,})$/.exec(p);
  if (r && req.method === "GET") {
    const nummer = r[1] ?? "";
    return download(res, { dateiname: `Rechnung-${nummer}.html`, typ: "text/html; charset=utf-8", inhalt: store.archivedInvoice(nummer).html });
  }

  const m = /^\/api\/dokumente\/(D-[0-9a-f]{12})(?:\/([a-z-]+))?$/.exec(p);
  if (m) {
    const id = m[1] ?? "";
    const action = m[2];
    if (!action && req.method === "GET") return json(res, 200, { ...store.detail(id), protokoll: store.protokoll(id) });
    if (!action && req.method === "DELETE") {
      store.remove(id);
      return json(res, 200, { ok: true });
    }
    if (action === "export" && req.method === "GET") return download(res, store.export(id));
    if (req.method === "POST") {
      const body = await readBody(req);
      switch (action) {
        case "markieren": {
          const typ = str(body, "typ");
          if (!isEntityType(typ)) throw new HttpError(400, "Unbekannter Typ.");
          const { treffer } = store.mark(id, { value: str(body, "wert"), type: typ }, selection(body));
          return json(res, 200, { ok: true, treffer });
        }
        case "ausnehmen":
          store.exclude(id, str(body, "wert"));
          break;
        case "zuruecknehmen":
          store.undoMark(id, str(body, "wert"));
          break;
        case "ki-freigeben":
          // rev: die Fassung, die der Mitarbeiter geprüft hat
          store.releaseForAi(id, int(body, "rev"));
          break;
        case "freigeben":
          store.approve(id, int(body, "ergebnisRev"));
          break;
        case "zurueck":
          store.sendBack(id);
          break;
        case "zur-pruefung":
          store.backToReview(id);
          break;
        case "abschliessen":
          store.close(id);
          break;
        default:
          throw new HttpError(404, "Unbekannte Aktion.");
      }
      return json(res, 200, { ok: true });
    }
  }

  throw new HttpError(404, "Nicht gefunden.");
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) return json(res, err.status, { fehler: err.message });
    if (err instanceof JobError) return json(res, 400, { fehler: err.message });
    if (err instanceof ConfigError || err instanceof KeyError) return json(res, 500, { fehler: err.message });
    // Ins Konsolenprotokoll nur die Art des Fehlers, keine Inhalte.
    console.error(`Interner Fehler (${err instanceof Error ? err.name : typeof err})`);
    return json(res, 500, { fehler: "Interner Fehler." });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Datenschutz-Bot läuft: http://${HOST === "::1" ? "[::1]" : HOST}:${PORT}`);
  console.log(`Daten liegen verschlüsselt in: ${store.dataDir}`);
});
