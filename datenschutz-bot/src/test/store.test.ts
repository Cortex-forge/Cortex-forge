import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CONFIG_DIR, EXAMPLES_DIR, PROJECT_ROOT } from "../config.js";
import { KeyError } from "../core/vault.js";
import { filesUnder } from "../scripts/probe-lib.js";
import { JobError, JobStore, type ErgebnisKi } from "../store/jobs.js";
import { ConfigError } from "../store/settings.js";

const example = (name: string) => fs.readFileSync(path.join(EXAMPLES_DIR, name), "utf8");
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dsb-test-"));
const tempStore = () => new JobStore(tempDir(), CONFIG_DIR);
const docFile = (store: JobStore, id: string) => path.join(store.dataDir, "dokumente", `${id}.json`);
/** Alle Dateien im Datenordner als Text (zum Suchen nach Klartext), ohne verschlüsselte Blöcke. */
const allFiles = (dir: string): string =>
  filesUnder(dir)
    .map((f) => f.content)
    .join("\n");

const invoice: ErgebnisKi = {
  art: "rechnung",
  rechnung: {
    empfaenger: "[PERSON_1]",
    empfaenger_adresse: "[ADRESSE_1]",
    leistungszeitraum: "12.02.2027 bis 15.02.2027",
    positionen: [{ beschreibung: "Doppelzimmer", menge: 3, einzelpreis: 189, preis_ist_brutto: true, ust_satz: 10 }],
  },
};

function ready(store: JobStore, text = example("rechnungsauftrag.txt")): string {
  const job = store.create({ art: "hotel", betreff: "Rechnung Aufenthalt", text });
  store.releaseForAi(job.id);
  return job.id;
}

const rev = (store: JobStore, id: string) => store.detail(id).job.ergebnisRev ?? -1;

test("Ablauf Rechnung: freigeben, Ergebnis, Nummer bei Freigabe, Abschluss archiviert und löscht", () => {
  const store = tempStore();
  const job = store.create({ art: "hotel", betreff: "Rechnung Aufenthalt", text: example("rechnungsauftrag.txt") });
  assert.match(job.id, /^D-[0-9a-f]{12}$/);
  assert.throws(() => store.readForAi(job.id), /noch nicht für die KI freigegeben/);
  assert.equal(store.listForAi().length, 0);

  store.releaseForAi(job.id);
  const doc = store.readForAi(job.id);
  assert.ok(!doc.text.includes("Huber") && !doc.text.includes("Bergweg"));
  store.saveResult(job.id, invoice);

  const approved = store.approve(job.id, rev(store, job.id));
  assert.match(approved.rechnungsnummer ?? "", /^\d{4}-0001$/);
  const result = store.detail(job.id).ergebnis;
  assert.equal(result?.art, "rechnung");
  if (result?.art === "rechnung") assert.ok(result.html.includes("Anna Huber") && result.html.includes(approved.rechnungsnummer ?? "?"));

  store.close(job.id);
  const closed = store.detail(job.id);
  assert.equal(closed.original, "");
  assert.equal(closed.ergebnis, undefined);
  assert.equal(closed.job.textKi, undefined);
  const raw = JSON.parse(fs.readFileSync(docFile(store, job.id), "utf8")) as Record<string, unknown>;
  assert.equal(raw.geheim, undefined);
  assert.equal(raw.ki, undefined);
  // Die Rechnung liegt verschlüsselt im Archiv und lässt sich weiter herunterladen.
  const archived = store.export(job.id);
  assert.ok(archived.inhalt.includes("Anna Huber") && archived.inhalt.includes(approved.rechnungsnummer ?? "?"));
  assert.ok(!allFiles(store.dataDir).includes("Anna"));

  const events = store.protokoll(job.id).map((e) => e.ereignis);
  assert.ok(events.some((e) => e.includes("Von der KI gelesen")));
  assert.ok(events.some((e) => e.includes("archiviert")));
});

// Review Claude #7, Codex #2 (Blocker)
test("Auf der Platte steht nichts im Klartext, auch nicht Übersehenes in der Platzhalter-Fassung", () => {
  const store = tempStore();
  // "Xqzyl Zqvorn" erkennt keine Regel: Es landet in der Platzhalter-Fassung, darf aber nie unverschlüsselt liegen.
  const id = ready(store, "Xqzyl Zqvorn fragt an. Mail: xq@example.com");
  assert.ok(store.readForAi(id).text.includes("Xqzyl"), "Testannahme: Name wird nicht erkannt");
  const check = (stage: string) => {
    const files = allFiles(store.dataDir);
    for (const v of ["Xqzyl", "Zqvorn", "xq@example.com"]) assert.ok(!files.includes(v), `${stage}: "${v}" im Klartext`);
  };
  check("bereit");
  store.saveResult(id, { art: "text", text: "Hallo Xqzyl, danke für Ihre Mail an [EMAIL_1]." });
  check("zur_pruefung");
  store.approve(id, rev(store, id));
  check("freigegeben");
  store.close(id);
  check("abgeschlossen");
});

// Review Claude #5 (Hoch), Codex #3
test("Freigabe gilt nur für die geprüfte Fassung", () => {
  const store = tempStore();
  const id = ready(store);
  store.saveResult(id, { art: "text", text: "Version A: Preis 100 EUR." });
  const geprueft = rev(store, id);
  store.saveResult(id, { art: "text", text: "Version B: Preis 900 EUR." });
  assert.throws(() => store.approve(id, geprueft), /inzwischen geändert/);
  assert.equal(store.detail(id).job.status, "zur_pruefung");
  store.approve(id, rev(store, id));
  const r = store.detail(id).ergebnis;
  assert.equal(r?.art === "text" ? r.text : "", "Version B: Preis 900 EUR.");
  assert.ok(store.protokoll(id).some((e) => e.ereignis.includes("neue Prüfung nötig")));
});

// Review Claude #4 (Hoch), Codex #4: echte, getrennte Prozesse schreiben gleichzeitig
test("Oberfläche und KI in getrennten Prozessen: keine verlorenen Änderungen, Abschluss bleibt Abschluss", async () => {
  const store = tempStore();
  const id = ready(store);
  store.saveResult(id, invoice);
  const script = path.join(store.dataDir, "ki-prozess.mjs");
  fs.writeFileSync(
    script,
    `import { JobStore } from ${JSON.stringify(path.join(PROJECT_ROOT, "dist", "store", "jobs.js"))};
const store = new JobStore(process.argv[2], process.argv[3]);
const big = "Langer Text mit [PERSON_1]. ".repeat(4000);
let saved = 0;
for (let i = 0; i < 40; i++) {
  try { store.saveResult(process.argv[4], { art: "rechnung", rechnung: { empfaenger: "[PERSON_1]", anmerkung: big, positionen: [{ beschreibung: "Zimmer", menge: 1, einzelpreis: 100 + i, ust_satz: 10 }] } }); saved++; }
  catch (e) { if (!/nicht möglich/.test(e.message)) throw e; break; }
}
console.log(saved);`,
  );
  const children = Array.from({ length: 3 }, () =>
    spawn(process.execPath, [script, store.dataDir, CONFIG_DIR, id], { stdio: ["ignore", "pipe", "pipe"] }),
  );
  const done = children.map(
    (c) =>
      new Promise<number>((resolve, reject) => {
        let err = "";
        c.stderr.on("data", (d) => (err += String(d)));
        c.on("exit", (code) => (code === 0 ? resolve(0) : reject(new Error(err))));
      }),
  );
  // Freigeben und abschließen, während die KI-Prozesse ihr Ergebnis ersetzen.
  let approved = false;
  for (let i = 0; i < 500 && !approved; i++) {
    try {
      store.approve(id, rev(store, id));
      approved = true;
    } catch (e) {
      if (!(e instanceof JobError)) throw e;
    }
  }
  assert.ok(approved, "Freigabe muss irgendwann gelingen");
  store.close(id);
  await Promise.all(done);

  const raw = JSON.parse(fs.readFileSync(docFile(store, id), "utf8")) as Record<string, unknown>;
  assert.equal(raw.status, "abgeschlossen");
  assert.equal(raw.geheim, undefined, "Originale dürfen nicht zurückkehren");
  assert.equal(raw.ki, undefined);
  assert.match(String(raw.rechnungsnummer), /-0001$/);
  assert.deepEqual(fs.readdirSync(path.join(store.dataDir, "rechnungen")), [`${raw.rechnungsnummer}.json`]);
  const counters = JSON.parse(fs.readFileSync(path.join(store.dataDir, "rechnungsnummern.json"), "utf8")) as Record<string, number>;
  assert.deepEqual(Object.values(counters), [1]);
  assert.equal(fs.readdirSync(path.join(store.dataDir, "sperren")).length, 0, "keine Sperre bleibt liegen");
});

test("Eine belegte Sperre lässt andere warten; liegengebliebene Sperren werden aufgeräumt", async () => {
  const store = tempStore();
  const id = ready(store);
  const lock = path.join(store.dataDir, "sperren", `dokument-${id}.lock`);
  const run = (code: string, env: Record<string, string> = {}) =>
    spawn(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const exitCode = (c: ReturnType<typeof run>) => new Promise<number>((resolve) => c.on("exit", (code) => resolve(code ?? -1)));

  // 1) Ein anderer Prozess hält die Sperre 400 ms: dieser Vorgang wartet und gelingt danach.
  const holder = run(`import fs from "node:fs"; setTimeout(() => fs.rmSync(${JSON.stringify(lock)}, { force: true }), 400);`);
  fs.writeFileSync(lock, `${holder.pid}:${Date.now()}`);
  const t0 = Date.now();
  store.backToReview(id);
  assert.ok(Date.now() - t0 >= 300, "hat auf die Sperre gewartet");
  assert.equal(store.detail(id).job.status, "neu");
  await exitCode(holder);

  // 2) Hält dieser Prozess die Sperre, bricht ein anderer nach der Wartezeit mit verständlicher Meldung ab.
  fs.writeFileSync(lock, `${process.pid}:${Date.now()}`);
  const jobs = JSON.stringify(path.join(PROJECT_ROOT, "dist", "store", "jobs.js"));
  const waiter = run(
    `const { JobStore } = await import(${jobs}); try { new JobStore(${JSON.stringify(store.dataDir)}, ${JSON.stringify(CONFIG_DIR)}).releaseForAi(${JSON.stringify(id)}); process.exit(0); } catch (e) { process.exit(/gerade von einem anderen Vorgang/.test(e.message) ? 3 : 1); }`,
    { DSB_SPERRE_MS: "300" },
  );
  assert.equal(await exitCode(waiter), 3);
  fs.rmSync(lock);

  // 3) Eine Sperre eines beendeten Prozesses wird aufgeräumt.
  fs.writeFileSync(lock, `999999:${Date.now()}`);
  store.releaseForAi(id);
  assert.equal(store.detail(id).job.status, "bereit");
});

// Review Codex #10
test("Dokument-IDs: lang, und eine Kollision überschreibt nie ein bestehendes Dokument", () => {
  class FixedIds extends JobStore {
    ids = ["D-aaaaaaaaaaaa", "D-aaaaaaaaaaaa", "D-bbbbbbbbbbbb"];
    protected override newId(): string {
      return this.ids.shift() ?? "D-cccccccccccc";
    }
  }
  const store = new FixedIds(tempDir(), CONFIG_DIR);
  const a = store.create({ art: "allgemein", text: "Erstes Dokument." });
  const b = store.create({ art: "allgemein", text: "Zweites Dokument." });
  assert.equal(a.id, "D-aaaaaaaaaaaa");
  assert.equal(b.id, "D-bbbbbbbbbbbb");
  assert.equal(store.detail(a.id).original, "Erstes Dokument.");
  assert.equal(store.detail(b.id).original, "Zweites Dokument.");
});

// Review Claude #18
test("Rechnungen mit Nummer lassen sich nicht löschen; Nummern laufen lückenlos", () => {
  const store = tempStore();
  const numbers: string[] = [];
  for (let i = 0; i < 2; i++) {
    const id = ready(store);
    store.saveResult(id, invoice);
    numbers.push(store.approve(id, rev(store, id)).rechnungsnummer ?? "");
    assert.throws(() => store.remove(id), /darf nicht gelöscht werden/);
  }
  assert.match(numbers[0] ?? "", /-0001$/);
  assert.match(numbers[1] ?? "", /-0002$/);
  // Beschädigter Zähler: nie wieder bei 1 anfangen.
  fs.writeFileSync(path.join(store.dataDir, "rechnungsnummern.json"), "{kaputt");
  const id = ready(store);
  store.saveResult(id, invoice);
  assert.throws(() => store.approve(id, rev(store, id)), /beschädigt/);
});

// Review Claude #28
test("Herunterladen erst nach der Freigabe; Rückweg zur Prüfung", () => {
  const store = tempStore();
  const id = ready(store);
  store.saveResult(id, { art: "text", text: "Sehr geehrte Frau [PERSON_1], ungeprüft." });
  assert.throws(() => store.export(id), /nicht möglich/);
  store.backToReview(id);
  const d = store.detail(id);
  assert.equal(d.job.status, "neu");
  assert.equal(d.ergebnis, undefined);
  store.mark(id, { value: "Aufenthalt", type: "SONSTIGES" });
  assert.ok(store.detail(id).job.betreffKi?.includes("[SONSTIGES_1]"));
});

// Review Claude #11 und #25
test("Markieren: Groß-/Kleinschreibung egal, Trefferzahl, Fehler bei 0 Treffern, Betreff bleibt Betreff", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", betreff: "Anfrage Edelweiss", text: "Gruppe EDELWEISS kommt im Mai.\n\nZweiter Absatz." });
  assert.equal(store.mark(job.id, { value: "Edelweiss", type: "SONSTIGES" }).treffer, 2);
  const d = store.detail(job.id);
  assert.equal(d.job.betreffKi, "Anfrage [SONSTIGES_1]");
  assert.equal(d.job.textKi, "Gruppe [SONSTIGES_1] kommt im Mai.\n\nZweiter Absatz.");
  assert.throws(() => store.mark(job.id, { value: "Lawine", type: "SONSTIGES" }), /nicht im Dokument gefunden/);
  // Markierung über Betreff und Text hinweg verschiebt nichts, sondern wird abgelehnt.
  assert.throws(() => store.mark(job.id, { value: "Edelweiss\n\nGruppe", type: "SONSTIGES" }), /nicht im Dokument gefunden/);
  assert.equal(store.detail(job.id).job.betreffKi, "Anfrage [SONSTIGES_1]");
});

test("Markieren und Ausnehmen ändern die KI-Sicht, danach ist es gesperrt", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", text: "Projekt Edelweiss mit Thomas besprochen." });
  assert.equal(store.detail(job.id).job.textKi, "Projekt Edelweiss mit [PERSON_1] besprochen.");
  store.mark(job.id, { value: "Edelweiss", type: "SONSTIGES" });
  store.exclude(job.id, "Thomas");
  assert.equal(store.detail(job.id).job.textKi, "Projekt [SONSTIGES_1] mit Thomas besprochen.");
  store.undoMark(job.id, "Thomas");
  assert.equal(store.detail(job.id).job.textKi, "Projekt [SONSTIGES_1] mit [PERSON_1] besprochen.");
  store.releaseForAi(job.id);
  assert.throws(() => store.mark(job.id, { value: "Projekt", type: "SONSTIGES" }), /nicht möglich/);
});

test("Zurück an die KI verwirft das Ergebnis", () => {
  const store = tempStore();
  const id = ready(store, example("hotel-anfrage.txt"));
  store.saveResult(id, { art: "text", text: "Sehr geehrte Frau [PERSON_1]" });
  store.sendBack(id);
  const d = store.detail(id);
  assert.equal(d.job.status, "bereit");
  assert.equal(d.ergebnis, undefined);
  assert.equal(d.job.ergebnisKi, undefined);
});

// Review Claude #23, Codex #12
test("Buchungen: Belegnummer wird zurückübersetzt, Platzhalter in Konten nur als Hinweis ohne Original", () => {
  const store = tempStore();
  const job = store.create({ art: "buchhaltung", text: "Beleg INV-42 von Anna Huber, Wartung 100 € netto." });
  store.mark(job.id, { value: "INV-42", type: "SONSTIGES" });
  store.releaseForAi(job.id);
  const { pruefung } = store.saveResult(job.id, {
    art: "buchungen",
    buchungen: [
      { datum: "01.10.2026", belegnummer: "[SONSTIGES_1]", konto: "[PERSON_1]", gegenkonto: "3300", text: "Wartung [PERSON_1]", netto: 100, ust_satz: 20 },
    ],
  });
  const r = store.detail(job.id).ergebnis;
  assert.equal(r?.art === "buchungen" ? r.buchungen[0]?.belegnummer : "", "INV-42");
  assert.equal(r?.art === "buchungen" ? r.buchungen[0]?.text : "", "Wartung Anna Huber");
  assert.equal(r?.art === "buchungen" ? r.buchungen[0]?.konto : "", "[PERSON_1]");
  assert.ok(!pruefung.nichtVerwendet.includes("SONSTIGES_1"));
  assert.ok(pruefung.hinweise.some((h) => h.includes("Im Feld Konto ist kein Platzhalter erlaubt")));
  assert.ok(!JSON.stringify(pruefung).includes("Anna"), "Prüfhinweise enthalten keine Originale");
});

// Review Claude #12
test("Fehlerhafte Konfiguration bricht ab, statt still weniger zu schützen", () => {
  const configDir = tempDir();
  for (const f of ["firma.json", "kontenplan.json"]) fs.copyFileSync(path.join(CONFIG_DIR, f), path.join(configDir, f));
  fs.writeFileSync(path.join(configDir, "firmen.json"), '{ "firmen": [ { "name": "Alpenblick Elektrotechnik GmbH", }, ] }');
  const store = new JobStore(tempDir(), configDir);
  assert.throws(() => store.create({ art: "allgemein", text: "Danke an Alpenblick Elektrotechnik." }), ConfigError);
  fs.writeFileSync(path.join(configDir, "firmen.json"), '{ "firmen": [ { "kategorie": "ohne Namen" } ] }');
  assert.throws(() => store.create({ art: "allgemein", text: "Test" }), /fehlerhaft/);
  fs.rmSync(path.join(configDir, "firmen.json"));
  assert.ok(store.create({ art: "allgemein", text: "Test" }).id, "eine fehlende Datei gilt als leer");
});

// Review Claude #26
test("Schlüssel: falscher Schlüssel wird erkannt, kein stiller zweiter Schlüssel, Blöcke nicht austauschbar", () => {
  const dir = tempDir();
  const store = new JobStore(dir, CONFIG_DIR);
  const a = store.create({ art: "allgemein", text: "Anna Huber fragt an." });
  const b = store.create({ art: "allgemein", text: "Thomas Gruber fragt an." });

  const previous = process.env.DSB_KEY;
  try {
    process.env.DSB_KEY = crypto.randomBytes(32).toString("base64");
    assert.throws(() => new JobStore(dir, CONFIG_DIR).detail(a.id), /anderen Schlüssel/);
    delete process.env.DSB_KEY;
    fs.renameSync(path.join(dir, ".schluessel"), path.join(dir, ".schluessel.weg"));
    assert.throws(() => new JobStore(dir, CONFIG_DIR).detail(a.id), KeyError);
    assert.ok(!fs.existsSync(path.join(dir, ".schluessel")), "kein neuer Schlüssel neben alten Dokumenten");
    fs.renameSync(path.join(dir, ".schluessel.weg"), path.join(dir, ".schluessel"));
  } finally {
    if (previous === undefined) delete process.env.DSB_KEY;
    else process.env.DSB_KEY = previous;
  }

  // Den verschlüsselten Originalteil von A in B kopieren: lässt sich nicht öffnen.
  const fileA = JSON.parse(fs.readFileSync(docFile(store, a.id), "utf8")) as Record<string, unknown>;
  const fileB = JSON.parse(fs.readFileSync(docFile(store, b.id), "utf8")) as Record<string, unknown>;
  fileB.geheim = fileA.geheim;
  fs.writeFileSync(docFile(store, b.id), JSON.stringify(fileB));
  assert.throws(() => new JobStore(dir, CONFIG_DIR).detail(b.id), /beschädigt oder wurden verändert/);
});

// Review Claude #27
test("Defekte Dateien und Protokollzeilen legen Liste und Protokoll nicht lahm", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", text: "Test" });
  fs.writeFileSync(path.join(store.dataDir, "dokumente", "D-cccccccccccc.json"), "{kaputt");
  fs.appendFileSync(path.join(store.dataDir, "protokoll.jsonl"), "{kaputt\n");
  store.log(job.id, "nach der kaputten Zeile", "system");
  const { dokumente, defekt } = store.list();
  assert.equal(defekt, 1);
  assert.deepEqual(dokumente.map((d) => d.id), [job.id]);
  assert.ok(store.protokoll(job.id).some((e) => e.ereignis === "nach der kaputten Zeile"));
});
