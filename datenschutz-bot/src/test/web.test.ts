import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CONFIG_DIR, PROJECT_ROOT } from "../config.js";
import { JobStore } from "../store/jobs.js";

const SERVER = path.join(PROJECT_ROOT, "dist", "web", "server.js");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function request(
  port: number,
  method: string,
  pfad: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string; json: () => Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: pfad,
        headers: {
          Host: `127.0.0.1:${port}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (text += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) as Record<string, unknown> }),
        );
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function start(env: Record<string, string>): { child: ChildProcess; ready: Promise<void>; exit: Promise<number> } {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout?.on("data", (d) => {
      out += String(d);
      if (out.includes("läuft")) resolve();
    });
    child.on("exit", () => reject(new Error(`Server beendet: ${out}`)));
  });
  ready.catch(() => {});
  const exit = new Promise<number>((resolve) => child.on("exit", (code) => resolve(code ?? -1)));
  return { child, ready, exit };
}

// Review Claude #19
test("Oberfläche startet nicht auf Netzwerk-Adressen (kein Login)", async () => {
  const { exit, child } = start({ DSB_HOST: "0.0.0.0", DSB_PORT: String(await freePort()), DSB_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "dsb-web-")) });
  let err = "";
  child.stderr?.on("data", (d) => (err += String(d)));
  assert.equal(await exit, 1);
  assert.match(err, /kein Login/);
});

test("Oberfläche: Host- und Ursprungsprüfung, Freigabe nur der geprüften Fassung, Export erst danach", async () => {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-web-"));
  const { child, ready } = start({ DSB_PORT: String(port), DSB_DATA_DIR: dataDir });
  try {
    await ready;
    // Fremder Host (DNS-Rebinding) und fremder Ursprung (CSRF) werden abgelehnt.
    assert.equal((await request(port, "GET", "/api/info", { headers: { Host: `evil.example:${port}` } })).status, 403);
    assert.equal(
      (await request(port, "POST", "/api/dokumente", { body: { art: "hotel", text: "x" }, headers: { Origin: "http://evil.example" } })).status,
      403,
    );
    assert.equal((await request(port, "POST", "/api/dokumente", { body: undefined, headers: { "Content-Type": "text/plain" } })).status, 415);

    const created = await request(port, "POST", "/api/dokumente", {
      body: { art: "hotel", betreff: "Anfrage", text: "Anfrage von Anna Huber, Tel. 0664 1234567" },
    });
    assert.equal(created.status, 201);
    const id = String(created.json().id);
    assert.match(id, /^D-[0-9a-f]{12}$/);

    const notFound = await request(port, "POST", `/api/dokumente/${id}/markieren`, { body: { wert: "Lawine", typ: "SONSTIGES" } });
    assert.equal(notFound.status, 400);
    assert.match(String(notFound.json().fehler), /nicht im Dokument gefunden/);
    const marked = await request(port, "POST", `/api/dokumente/${id}/markieren`, { body: { wert: "anfrage", typ: "SONSTIGES" } });
    assert.equal(marked.json().treffer, 2);

    assert.equal((await request(port, "POST", `/api/dokumente/${id}/ki-freigeben`, { body: {} })).status, 200);
    // Die "KI" arbeitet in einem anderen Prozess mit demselben Datenordner.
    const ki = new JobStore(dataDir, CONFIG_DIR);
    ki.saveResult(id, { art: "text", text: "Version A für Frau [PERSON_1]" });
    const shownRev = (await request(port, "GET", `/api/dokumente/${id}`)).json().job as { ergebnisRev: number };
    ki.saveResult(id, { art: "text", text: "Version B für Frau [PERSON_1]" });

    assert.equal((await request(port, "GET", `/api/dokumente/${id}/export`)).status, 400, "kein Export vor der Freigabe");
    const stale = await request(port, "POST", `/api/dokumente/${id}/freigeben`, { body: { ergebnisRev: shownRev.ergebnisRev } });
    assert.equal(stale.status, 400);
    assert.match(String(stale.json().fehler), /inzwischen geändert/);

    const current = (await request(port, "GET", `/api/dokumente/${id}`)).json().job as { ergebnisRev: number };
    assert.equal((await request(port, "POST", `/api/dokumente/${id}/freigeben`, { body: { ergebnisRev: current.ergebnisRev } })).status, 200);
    const exported = await request(port, "GET", `/api/dokumente/${id}/export`);
    assert.equal(exported.status, 200);
    assert.match(String(exported.headers["content-disposition"]), /attachment/);
    assert.equal(exported.text, "Version B für Frau Huber\n");

    const list = (await request(port, "GET", "/api/dokumente")).json() as { dokumente: Array<{ id: string; titel: string }>; defekt: number };
    assert.equal(list.defekt, 0);
    assert.deepEqual(list.dokumente.map((d) => d.id), [id]);
  } finally {
    child.kill();
  }
});
