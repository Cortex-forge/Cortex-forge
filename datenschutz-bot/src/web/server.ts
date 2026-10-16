#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { EXAMPLES_DIR, HOST, PORT, PROJECT_ROOT, PUBLIC_DIR } from "../config.js";
import { bookingsToCsv } from "../core/accounting.js";
import { ENTITY_LABELS, ENTITY_TYPES, isEntityType } from "../core/types.js";
import { ARTEN, ART_LABELS, JobError, JobStore, STATUS_LABELS } from "../store/jobs.js";

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

/** Schutz gegen fremde Webseiten, die die lokale Oberfläche ansprechen (DNS-Rebinding, CSRF). */
function checkOrigin(req: http.IncomingMessage) {
  const host = (req.headers.host ?? "").toLowerCase();
  const allowedHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`];
  if (HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1") {
    if (!allowedHosts.includes(host)) throw new HttpError(403, "Zugriff nur über localhost.");
  }
  const origin = req.headers.origin;
  if (req.method !== "GET" && origin && origin !== `http://${host}`) throw new HttpError(403, "Fremder Ursprung.");
}

/** Titel eines Dokuments: Betreff-Zeile einer E-Mail, sonst die erste Zeile. */
function titleOf(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const subject = lines.find((l) => /^(Betreff|Subject|Oggetto|Onderwerp)\s*:/i.test(l));
  return (subject ? subject.replace(/^[^:]+:\s*/, "") : (lines[0] ?? "")).slice(0, 90);
}

function listForUi() {
  return store.list().map((job) => {
    let titel = job.betreffKi || titleOf(job.textKi);
    try {
      const detail = store.detail(job.id);
      if (detail.original) titel = titleOf(detail.original);
    } catch {
      // Originaldaten gelöscht: Platzhalter-Titel anzeigen.
    }
    return {
      id: job.id,
      art: job.art,
      status: job.status,
      erstellt: job.erstellt,
      aktualisiert: job.aktualisiert,
      titel,
      ersetzt: job.platzhalter.length,
      hinweise: job.pruefung
        ? job.pruefung.unbekannt.length + job.pruefung.erfunden.length + job.pruefung.hinweise.length
        : 0,
    };
  });
}

function exportResult(res: http.ServerResponse, id: string) {
  const detail = store.detail(id);
  const result = detail.ergebnis;
  if (!result) throw new HttpError(404, "Noch kein Ergebnis vorhanden.");
  const base = `${id}${detail.job.rechnungsnummer ? "-" + detail.job.rechnungsnummer : ""}`;
  if (result.art === "text") {
    const body = (result.titel ? result.titel + "\n\n" : "") + result.text + "\n";
    send(res, 200, body, "text/plain; charset=utf-8", { "Content-Disposition": `attachment; filename="${base}.txt"` });
  } else if (result.art === "buchungen") {
    send(res, 200, "﻿" + bookingsToCsv(result.buchungen), "text/csv; charset=utf-8", {
      "Content-Disposition": `attachment; filename="${base}-buchungen.csv"`,
    });
  } else {
    send(res, 200, result.html, "text/html; charset=utf-8", {
      "Content-Disposition": `attachment; filename="${base}-rechnung.html"`,
    });
  }
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

  const m = /^\/api\/dokumente\/(D-[0-9a-f]{6})(?:\/([a-z-]+))?$/.exec(p);
  if (m) {
    const id = m[1] ?? "";
    const action = m[2];
    if (!action && req.method === "GET") return json(res, 200, { ...store.detail(id), protokoll: store.protokoll(id) });
    if (!action && req.method === "DELETE") {
      store.remove(id);
      return json(res, 200, { ok: true });
    }
    if (action === "export" && req.method === "GET") return exportResult(res, id);
    if (req.method === "POST") {
      const body = await readBody(req);
      switch (action) {
        case "markieren": {
          const typ = str(body, "typ");
          if (!isEntityType(typ)) throw new HttpError(400, "Unbekannter Typ.");
          store.mark(id, { value: str(body, "wert"), type: typ });
          break;
        }
        case "ausnehmen":
          store.exclude(id, str(body, "wert"));
          break;
        case "zuruecknehmen":
          store.undoMark(id, str(body, "wert"));
          break;
        case "ki-freigeben":
          store.releaseForAi(id);
          break;
        case "freigeben":
          store.approve(id);
          break;
        case "zurueck":
          store.sendBack(id);
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
    console.error(err);
    return json(res, 500, { fehler: "Interner Fehler." });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Datenschutz-Bot läuft: http://${HOST === "::1" ? "[::1]" : HOST}:${PORT}`);
  console.log(`Daten liegen verschlüsselt in: ${store.dataDir}`);
});
