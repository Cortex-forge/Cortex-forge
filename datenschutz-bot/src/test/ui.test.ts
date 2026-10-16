// Oberfläche im echten Browser (Chromium über das DevTools-Protokoll, ohne zusätzliche Abhängigkeit).
// Ohne Chromium wird der Test übersprungen; Pfad bei Bedarf mit DSB_CHROMIUM angeben.
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

function findChromium(): string | undefined {
  return [
    process.env.DSB_CHROMIUM,
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].find((p): p is string => !!p && fs.existsSync(p));
}

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

/** Wartet, bis ein Prozess eine Zeile mit dem Muster ausgibt. */
function waitForOutput(child: ChildProcess, stream: "stdout" | "stderr", re: RegExp): Promise<RegExpExecArray> {
  return new Promise((resolve, reject) => {
    let out = "";
    child[stream]?.on("data", (d) => {
      out += String(d);
      const m = re.exec(out);
      if (m) resolve(m);
    });
    child.on("exit", () => reject(new Error(`Prozess beendet: ${out.slice(-500)}`)));
  });
}

interface CdpMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

/** Kleiner Client für das DevTools-Protokoll. */
class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  private readonly listeners: Array<(m: CdpMessage) => void> = [];
  constructor(private readonly ws: WebSocket) {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as CdpMessage;
      const waiting = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
      if (waiting && msg.id !== undefined) {
        this.pending.delete(msg.id);
        if (msg.error) waiting.reject(new Error(msg.error.message));
        else waiting.resolve(msg.result ?? {});
      } else {
        for (const l of this.listeners) l(msg);
      }
    };
  }
  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    return new Cdp(ws);
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn: (m: CdpMessage) => void): void {
    this.listeners.push(fn);
  }
  close(): void {
    this.ws.close();
  }
}

const chromium = findChromium();

// Review Codex 2 #13 (verspätete Antworten), #2 (Freigabe mit geprüfter Fassung), #7 (Auswahl mit Position);
// Codex 3 #2 (Zugang nicht an andere Dienste), #12 (verspätete Fehler)
test("Oberfläche im Browser: Zugang bleibt bei der Seite, überholte Antworten und Fehler verworfen, Auswahl und Freigabe mit Stelle und Fassung", {
  skip: chromium ? false : "kein Chromium gefunden (DSB_CHROMIUM setzen)",
  timeout: 60_000,
}, async () => {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-ui-"));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-ui-profil-"));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-ui-downloads-"));
  // Ein anderer Dienst auf demselben Rechner (anderer Port): Er merkt sich, was der Browser ihm schickt.
  const otherPort = await freePort();
  const seen: http.IncomingHttpHeaders[] = [];
  const other = http.createServer((req, res) => {
    seen.push(req.headers);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>Anderer Dienst</title><p>anderer Dienst</p>");
  });
  await new Promise<void>((resolve) => other.listen(otherPort, "127.0.0.1", resolve));
  const store = new JobStore(dataDir, CONFIG_DIR);
  const a = store.create({ art: "allgemein", betreff: "Dokument A", text: "Erstes Dokument." });
  const b = store.create({ art: "allgemein", betreff: "Dokument B", text: "Code ZORWIN und ZORWINBETA." });

  const server = spawn(process.execPath, [path.join(PROJECT_ROOT, "dist", "web", "server.js")], {
    env: { ...process.env, DSB_PORT: String(port), DSB_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = spawn(
    chromium ?? "",
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let cdp: Cdp | undefined;
  try {
    const [, startLink, token] = await waitForOutput(server, "stdout", /(\/#zugang=([A-Za-z0-9_-]+))/);
    const [, wsUrl] = await waitForOutput(browser, "stderr", /DevTools listening on (ws:\/\/\S+)/);
    cdp = await Cdp.connect(wsUrl ?? "");
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
    const send = (method: string, params: Record<string, unknown> = {}) => (cdp as Cdp).send(method, params, sessionId);
    const evaluate = async (expression: string): Promise<unknown> => {
      const r = (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })) as {
        result: { value?: unknown };
        exceptionDetails?: unknown;
      };
      if (r.exceptionDetails) throw new Error(`Fehler im Browser: ${JSON.stringify(r.exceptionDetails)}`);
      return r.result.value;
    };
    const waitFor = async (expression: string, what: string) => {
      for (let i = 0; i < 160; i++) {
        if (await evaluate(expression)) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.fail(`Zeitüberschreitung: ${what}`);
    };

    // Detail-Anfragen abfangen; im Haltemodus werden sie erst auf Kommando beantwortet.
    const held: Array<{ requestId: string; url: string }> = [];
    let hold = false;
    cdp.on((m) => {
      if (m.method !== "Fetch.requestPaused" || m.sessionId !== sessionId) return;
      const params = m.params as { requestId: string; request: { url: string } };
      if (hold) held.push({ requestId: params.requestId, url: params.request.url });
      else void send("Fetch.continueRequest", { requestId: params.requestId });
    });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/dokumente/D-*", requestStage: "Request" }] });
    await send("Page.enable");
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    // Über den Start-Link: Die Seite übernimmt den Schlüssel und entfernt ihn aus der Adresse.
    await send("Page.navigate", { url: `http://127.0.0.1:${port}${startLink}` });
    await waitFor(`location.href === "http://127.0.0.1:${port}/" && !!document.querySelector("#f-text")`, "Seite geladen");
    await waitFor(`document.querySelectorAll(".doc-item").length === 2`, "Liste geladen");

    // 0) Codex 3 #2: Ein anderer Dienst auf dem Rechner bekommt den Schlüssel nicht, es gibt kein Cookie.
    await send("Page.navigate", { url: `http://127.0.0.1:${otherPort}/` });
    await waitFor(`document.title === "Anderer Dienst"`, "anderer Dienst geladen");
    assert.ok(seen.length > 0);
    for (const headers of seen) {
      assert.equal(headers.cookie, undefined, "kein Cookie an andere Dienste");
      assert.ok(!JSON.stringify(headers).includes(token ?? "?"), "kein Schlüssel an andere Dienste");
    }
    const { cookies } = (await cdp.send("Storage.getCookies")) as { cookies: unknown[] };
    assert.deepEqual(cookies, [], "der Browser speichert kein Cookie");
    // Zurück zur Oberfläche ohne Start-Link: Der Tab kennt den Schlüssel noch.
    await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await waitFor(`document.querySelectorAll(".doc-item").length === 2`, "Liste wieder geladen");

    // 1) A anfragen, zu B wechseln; B antwortet zuerst, A zuletzt: sichtbar bleibt B.
    hold = true;
    await evaluate(`location.hash = ${JSON.stringify(a.id)}`);
    for (let i = 0; i < 100 && held.length < 1; i++) await new Promise((r) => setTimeout(r, 20));
    await evaluate(`location.hash = ${JSON.stringify(b.id)}`);
    for (let i = 0; i < 100 && held.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(held.length, 2, "beide Anfragen angehalten");
    const reqA = held.find((h) => h.url.endsWith(a.id));
    const reqB = held.find((h) => h.url.endsWith(b.id));
    assert.ok(reqA && reqB);
    hold = false;
    await send("Fetch.continueRequest", { requestId: reqB.requestId });
    await waitFor(`document.querySelector(".doc-head .sub")?.textContent.includes(${JSON.stringify(b.id)})`, "B angezeigt");
    await send("Fetch.continueRequest", { requestId: reqA.requestId });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await evaluate(`location.hash`), `#${b.id}`);
    assert.ok(String(await evaluate(`document.querySelector(".doc-head .sub").textContent`)).includes(b.id), "B bleibt sichtbar");

    // 1b) Codex 3 #12: Ein verspäteter Fehler einer alten Anfrage löscht keinen angefangenen Entwurf.
    hold = true;
    await evaluate(`location.hash = ${JSON.stringify(a.id)}`);
    for (let i = 0; i < 100 && held.length < 3; i++) await new Promise((r) => setTimeout(r, 20));
    const late = held[2];
    assert.ok(late?.url.endsWith(a.id), "Anfrage für A angehalten");
    hold = false;
    await evaluate(`location.hash = "neu"`);
    await waitFor(`!!document.querySelector("#f-text")`, "Formular für ein neues Dokument");
    await evaluate(`(() => { const t = document.querySelector("#f-text"); t.value = "Entwurf, bitte nicht verlieren"; t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await send("Fetch.fulfillRequest", {
      requestId: late?.requestId,
      responseCode: 404,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ fehler: "Unbekanntes Dokument" })).toString("base64"),
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await evaluate(`document.querySelector("#f-text")?.value`), "Entwurf, bitte nicht verlieren");
    assert.equal(await evaluate(`location.hash`), "#neu");
    await evaluate(`location.hash = ${JSON.stringify(b.id)}`);
    await waitFor(`document.querySelector(".doc-head .sub")?.textContent.includes(${JSON.stringify(b.id)})`, "B wieder angezeigt");

    // 1c) Claude 3 #13: Wird das Dokument woanders geändert, bleibt die geprüfte Ansicht und Freigeben ist gesperrt.
    await evaluate(`location.hash = ${JSON.stringify(a.id)}`);
    await waitFor(`document.querySelector(".doc-head .sub")?.textContent.includes(${JSON.stringify(a.id)})`, "A angezeigt");
    const releaseButton = `([...document.querySelectorAll("button")].find((x) => x.textContent === "Für KI freigeben"))`;
    store.mark(a.id, { value: "Erstes", type: "SONSTIGES" });
    await waitFor(`document.body.textContent.includes("inzwischen geändert")`, "Hinweis auf geänderte Fassung");
    assert.equal(await evaluate(`${releaseButton}.disabled`), true, "alte Fassung nicht freigebbar");
    assert.ok(!String(await evaluate(`document.body.textContent`)).includes("[SONSTIGES_1]"), "kein stiller Austausch");
    await evaluate(`[...document.querySelectorAll("button")].find((x) => x.textContent === "Neue Fassung anzeigen").click()`);
    await waitFor(`document.body.textContent.includes("[SONSTIGES_1]") && !${releaseButton}.disabled`, "neue Fassung angezeigt");
    await evaluate(`location.hash = ${JSON.stringify(b.id)}`);
    await waitFor(`document.querySelector(".doc-head .sub")?.textContent.includes(${JSON.stringify(b.id)})`, "B wieder angezeigt");

    // 2) Auswahl mitten im Wort schwärzen: Die Oberfläche schickt die genaue Stelle mit.
    await evaluate(`(() => {
      const node = document.getElementById("orig").firstChild;
      const at = node.data.indexOf("ZORWINBETA");
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 6);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    })()`);
    await waitFor(`document.getElementById("sel-label").textContent.includes("ZORWIN")`, "Auswahl erkannt");
    await evaluate(`document.querySelector('select[aria-label="Art der Angabe"]').value = "SONSTIGES"`);
    await evaluate(`[...document.querySelectorAll("button")].find((x) => x.textContent === "Schwärzen").click()`);
    await waitFor(`[...document.querySelectorAll("pre.doc")].some((p) => p.textContent.includes("[SONSTIGES_2]"))`, "Stelle geschwärzt");
    assert.equal(store.detail(b.id).job.textKi, "Code [SONSTIGES_1] und [SONSTIGES_2].");

    // 3) Freigeben: die angezeigte Fassung wird genannt und angenommen.
    await evaluate(`[...document.querySelectorAll("button")].find((x) => x.textContent === "Für KI freigeben").click()`);
    await waitFor(`document.querySelector(".doc-head .badge")?.textContent === "Bereit für KI"`, "freigegeben");
    assert.equal(store.detail(b.id).job.status, "bereit");
    assert.equal(store.detail(b.id).job.kiFassung, 1);

    // 4) Review Claude 2 #11: Ersetzt die KI ihr Ergebnis, bleibt die gelesene Fassung stehen und Freigeben ist gesperrt.
    const resultText = `(document.querySelector(".result-text")?.textContent ?? "")`;
    const approveButton = `([...document.querySelectorAll("button")].find((x) => x.textContent === "Freigeben ✓"))`;
    store.saveResult(b.id, { art: "text", text: "Fassung A" }, 1);
    await waitFor(`${resultText} === "Fassung A"`, "Fassung A angezeigt");
    store.saveResult(b.id, { art: "text", text: "Fassung B" }, 1);
    await waitFor(`document.body.textContent.includes("inzwischen ersetzt")`, "Hinweis auf neue Fassung");
    assert.equal(await evaluate(resultText), "Fassung A", "kein Austausch unter der Maus");
    assert.equal(await evaluate(`${approveButton}.disabled`), true, "alte Fassung nicht freigebbar");
    await evaluate(`[...document.querySelectorAll("button")].find((x) => x.textContent === "Neue Fassung anzeigen").click()`);
    await waitFor(`${resultText} === "Fassung B" && !${approveButton}.disabled`, "Fassung B angezeigt");
    await evaluate(`${approveButton}.click()`);
    await waitFor(`document.querySelector(".doc-head .badge")?.textContent === "Freigegeben"`, "freigegeben");
    const fertig = store.detail(b.id).ergebnis;
    assert.equal(fertig?.art === "text" ? fertig.text : "", "Fassung B");

    // 5) Herunterladen geht über die Seite (mit Schlüssel), nicht über einen einfachen Link.
    await evaluate(`[...document.querySelectorAll("button")].find((x) => x.textContent === "Herunterladen").click()`);
    const datei = path.join(downloads, `${b.id}.txt`);
    for (let i = 0; i < 100 && !fs.existsSync(datei); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(fs.readFileSync(datei, "utf8"), "Fassung B\n");

    // 6) Codex 4 #2: Eingefügter Originaltext landet nicht im Browserprofil (Wiederherstellen der Sitzung).
    const marker = "FiktiverPruefwertQXRV45321709";
    await evaluate(`location.hash = "neu"`);
    await waitFor(`!!document.querySelector("#f-text")`, "Formular für ein neues Dokument");
    await evaluate(`(() => {
      const t = document.querySelector("#f-text");
      t.value = "Notiz ${marker} für morgen";
      t.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#f-betreff").value = "Betreff ${marker}";
      document.querySelector("form").requestSubmit();
    })()`);
    await waitFor(`location.hash.startsWith("#D-") && !!document.getElementById("orig")`, "Original angezeigt");
    await evaluate(`location.hash = ${JSON.stringify(b.id)}`);
    await waitFor(`document.querySelector(".doc-head .sub")?.textContent.includes(${JSON.stringify(b.id)})`, "B angezeigt");
    const closed = new Promise((resolve) => browser.once("exit", resolve));
    await cdp.send("Browser.close").catch(() => undefined);
    await closed;
    const funde: string[] = [];
    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.isFile()) {
          const buf = fs.readFileSync(full);
          if (buf.includes(Buffer.from(marker, "utf8")) || buf.includes(Buffer.from(marker, "utf16le"))) funde.push(path.relative(profile, full));
        }
      }
    };
    scan(profile);
    assert.deepEqual(funde, [], "Originaltext im Browserprofil");
  } finally {
    cdp?.close();
    browser.kill();
    server.kill();
    other.close();
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(downloads, { recursive: true, force: true });
  }
});
