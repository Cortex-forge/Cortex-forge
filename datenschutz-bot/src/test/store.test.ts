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
import type { RechnungsPosition } from "../core/invoice.js";
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
  release(store, job.id);
  return job.id;
}

const rev = (store: JobStore, id: string) => store.detail(id).job.ergebnisRev ?? -1;
/** Für die KI freigeben, so wie der Mitarbeiter es nach der Prüfung tut (mit der angezeigten Fassung). */
const release = (store: JobStore, id: string) => store.releaseForAi(id, store.detail(id).job.rev);
/** Ergebnis speichern wie die KI: mit der Fassung, die sie gelesen hat. */
const save = (store: JobStore, id: string, ergebnis: ErgebnisKi) => store.saveResult(id, ergebnis, store.detail(id).job.kiFassung ?? 0);

test("Ablauf Rechnung: freigeben, Ergebnis, Nummer bei Freigabe, Abschluss archiviert und löscht", () => {
  const store = tempStore();
  const job = store.create({ art: "hotel", betreff: "Rechnung Aufenthalt", text: example("rechnungsauftrag.txt") });
  assert.match(job.id, /^D-[0-9a-f]{12}$/);
  assert.throws(() => store.readForAi(job.id), /noch nicht für die KI freigegeben/);
  assert.equal(store.listForAi().length, 0);

  release(store, job.id);
  const doc = store.readForAi(job.id);
  assert.ok(!doc.text.includes("Huber") && !doc.text.includes("Bergweg"));
  save(store, job.id, invoice);

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
  save(store, id, { art: "text", text: "Hallo Xqzyl, danke für Ihre Mail an [EMAIL_1]." });
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
  save(store, id, { art: "text", text: "Version A: Preis 100 EUR." });
  const geprueft = rev(store, id);
  save(store, id, { art: "text", text: "Version B: Preis 900 EUR." });
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
  save(store, id, invoice);
  const script = path.join(store.dataDir, "ki-prozess.mjs");
  fs.writeFileSync(
    script,
    `import { JobStore } from ${JSON.stringify(path.join(PROJECT_ROOT, "dist", "store", "jobs.js"))};
const store = new JobStore(process.argv[2], process.argv[3]);
const big = "Langer Text mit [PERSON_1]. ".repeat(4000);
let saved = 0;
for (let i = 0; i < 40; i++) {
  try { store.saveResult(process.argv[4], { art: "rechnung", rechnung: { empfaenger: "[PERSON_1]", anmerkung: big, positionen: [{ beschreibung: "Zimmer", menge: 1, einzelpreis: 100 + i, ust_satz: 10 }] } }, 1); saved++; }
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
    `const { JobStore } = await import(${jobs}); try { new JobStore(${JSON.stringify(store.dataDir)}, ${JSON.stringify(CONFIG_DIR)}).releaseForAi(${JSON.stringify(id)}, ${store.detail(id).job.rev}); process.exit(0); } catch (e) { process.exit(/gerade von einem anderen Vorgang/.test(e.message) ? 3 : 1); }`,
    { DSB_SPERRE_MS: "300" },
  );
  assert.equal(await exitCode(waiter), 3);
  fs.rmSync(lock);

  // 3) Eine Sperre eines beendeten Prozesses wird aufgeräumt.
  fs.writeFileSync(lock, `999999:${Date.now()}`);
  release(store, id);
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
    save(store, id, invoice);
    numbers.push(store.approve(id, rev(store, id)).rechnungsnummer ?? "");
    assert.throws(() => store.remove(id), /darf nicht gelöscht werden/);
  }
  assert.match(numbers[0] ?? "", /-0001$/);
  assert.match(numbers[1] ?? "", /-0002$/);
  // Beschädigter Zähler: nie wieder bei 1 anfangen.
  fs.writeFileSync(path.join(store.dataDir, "rechnungsnummern.json"), "{kaputt");
  const id = ready(store);
  save(store, id, invoice);
  assert.throws(() => store.approve(id, rev(store, id)), /beschädigt/);
});

// Review Claude #28
test("Herunterladen erst nach der Freigabe; Rückweg zur Prüfung", () => {
  const store = tempStore();
  const id = ready(store);
  save(store, id, { art: "text", text: "Sehr geehrte Frau [PERSON_1], ungeprüft." });
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
  release(store, job.id);
  assert.throws(() => store.mark(job.id, { value: "Projekt", type: "SONSTIGES" }), /nicht möglich/);
});

test("Zurück an die KI verwirft das Ergebnis", () => {
  const store = tempStore();
  const id = ready(store, example("hotel-anfrage.txt"));
  save(store, id, { art: "text", text: "Sehr geehrte Frau [PERSON_1]" });
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
  release(store, job.id);
  const { pruefung } = save(store, job.id, {
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

// ---------------------------------------------------------------------------
// Zweite Prüfrunde (Codex 2)

/** Dateioperation, die für eine bestimmte Datei einmal oder immer scheitert (simulierter Schreibfehler). */
function failRenameFor(suffix: string): () => void {
  const original = fs.renameSync;
  fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
    if (String(to).endsWith(suffix)) throw Object.assign(new Error("simulierter Schreibfehler"), { code: "EIO" });
    return original(from, to);
  }) as typeof fs.renameSync;
  return () => {
    fs.renameSync = original;
  };
}

function configCopy(): string {
  const dir = tempDir();
  for (const f of ["firma.json", "firmen.json", "kontenplan.json"]) fs.copyFileSync(path.join(CONFIG_DIR, f), path.join(dir, f));
  return dir;
}

// Review Codex 2 #1 (Blocker)
test("Kontenplan: Bezeichnungen laufen durch die Erkennung, stehen in der Vorschau und bleiben wie geprüft", () => {
  const configDir = configCopy();
  const plan = (konten: Array<{ nummer: string; name: string }>) =>
    fs.writeFileSync(path.join(configDir, "kontenplan.json"), JSON.stringify({ konten }));
  plan([{ nummer: "3300", name: "Lieferant Anna Huber" }, { nummer: "7200", name: "Instandhaltung" }]);
  const store = new JobStore(tempDir(), configDir);
  const job = store.create({ art: "buchhaltung", text: "Lieferant Anna Huber; Wartung 10 EUR." });
  const d = store.detail(job.id);
  assert.equal(d.job.textKi, "Lieferant [PERSON_1]; Wartung 10 EUR.");
  assert.deepEqual(d.job.kontenplanKi, [{ nummer: "3300", name: "Lieferant [PERSON_1]" }, { nummer: "7200", name: "Instandhaltung" }]);
  assert.deepEqual(d.konten[0]?.markierungen.map((m) => [m.start, m.end, m.id]), [[10, 20, "PERSON_1"]]);
  assert.deepEqual(d.markierungen.map((m) => m.id), ["PERSON_1"], "Fundstellen im Text bleiben im Text");
  release(store, job.id);
  // Eine später geänderte Konfiguration ändert nicht, was die KI bekommt.
  plan([{ nummer: "3301", name: "Lieferant Lisa Gruber" }]);
  const doc = store.readForAi(job.id);
  assert.deepEqual(doc.kontenplan, d.job.kontenplanKi);
  assert.ok(!/Huber|Gruber/.test(JSON.stringify(doc)));

  // Nicht erkannte Namen im Kontenplan lassen sich schwärzen.
  plan([{ nummer: "3302", name: "Lieferant Zorwin Xylander" }]);
  const other = store.create({ art: "buchhaltung", text: "Beleg ohne Namen." });
  assert.equal(store.detail(other.id).job.kontenplanKi?.[0]?.name, "Lieferant Zorwin Xylander");
  assert.equal(store.mark(other.id, { value: "Zorwin Xylander", type: "PERSON" }).treffer, 1);
  assert.equal(store.detail(other.id).job.kontenplanKi?.[0]?.name, "Lieferant [PERSON_1]");
});

// Review Codex 2 #2 (Blocker)
test("Freigabe für die KI gilt nur für die geprüfte Fassung des Dokuments", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", text: "Kontakt: anna.huber@example.com" });
  const geprueft = store.detail(job.id).job.rev;
  assert.equal(store.detail(job.id).job.textKi, "Kontakt: [EMAIL_1]");
  store.exclude(job.id, "anna.huber@example.com"); // zweites Fenster
  assert.throws(() => store.releaseForAi(job.id, geprueft), /inzwischen geändert/);
  assert.equal(store.detail(job.id).job.status, "neu");
  assert.throws(() => store.readForAi(job.id), /noch nicht für die KI freigegeben/);
});

// Review Codex 2 #4
test("Ergebnisse zu einer überholten Fassung werden abgelehnt", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", text: "Anna Huber reist mit Lisa Gruber." });
  release(store, job.id);
  const alt = store.readForAi(job.id);
  assert.equal(alt.fassung, 1);
  assert.equal(alt.text, "[PERSON_1] reist mit [PERSON_2].");
  store.backToReview(job.id);
  store.mark(job.id, { value: "Anna Huber", type: "SONSTIGES" });
  release(store, job.id);
  const neu = store.readForAi(job.id);
  assert.equal(neu.fassung, 2);
  // Stabile Nummern (Review Claude 2 #5): Lisa behält [PERSON_2], [PERSON_1] wird nie neu vergeben.
  assert.equal(neu.text, "[SONSTIGES_1] reist mit [PERSON_2].");
  assert.throws(() => store.saveResult(job.id, { art: "text", text: "Sehr geehrte Frau [PERSON_1]" }, alt.fassung), /seit dem Lesen geändert/);
  assert.equal(store.detail(job.id).ergebnis, undefined);
  store.saveResult(job.id, { art: "text", text: "Sehr geehrte Frau [PERSON_2]" }, neu.fassung);
  const r = store.detail(job.id).ergebnis;
  assert.equal(r?.art === "text" ? r.text : "", "Sehr geehrte Frau Gruber");
});

// Review Codex 2 #3
test("Sperre: vollständig angelegt, nur der Besitzer gibt frei, nie nur wegen des Alters entfernt", async () => {
  const dir = tempDir();
  const lock = path.join(dir, "sperren", "probe.lock");
  new JobStore(dir, CONFIG_DIR);
  const jobs = JSON.stringify(path.join(PROJECT_ROOT, "dist", "store", "jobs.js"));
  /** Ein anderer Prozess versucht die Sperre zu bekommen: 0 = bekommen, 3 = nach der Wartezeit aufgegeben. */
  const tryLock = () =>
    new Promise<number>((resolve) => {
      const c = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const { JobStore } = await import(${jobs}); try { new JobStore(${JSON.stringify(dir)}, ${JSON.stringify(CONFIG_DIR)}).withLock("probe", () => {}); process.exit(0); } catch (e) { process.exit(/gerade von einem anderen Vorgang/.test(e.message) ? 3 : 1); }`,
        ],
        { env: { ...process.env, DSB_SPERRE_MS: "300" }, stdio: "ignore" },
      );
      c.on("exit", (code) => resolve(code ?? -1));
    });
  const bootId = fs.existsSync("/proc/sys/kernel/random/boot_id") ? fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim() : "";
  const bootZeit = Date.now() - os.uptime() * 1000;
  const ownStart = fs.existsSync("/proc/self/stat")
    ? (() => {
        const stat = fs.readFileSync(`/proc/${process.pid}/stat`, "utf8");
        return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      })()
    : undefined;
  const owner = (extra: Record<string, unknown>) => JSON.stringify({ pid: process.pid, boot: bootId, bootZeit, ...(ownStart ? { start: ownStart } : {}), token: "t", ...extra });

  // Leere, frische Sperrdatei (gerade angelegt, Inhalt kommt noch): Sie wird respektiert, nicht entfernt.
  fs.writeFileSync(lock, "");
  assert.equal(await tryLock(), 3);
  assert.ok(fs.existsSync(lock));
  // Bleibt sie leer und alt (Absturz beim Anlegen), wird sie aufgeräumt.
  fs.utimesSync(lock, new Date(Date.now() - 20_000), new Date(Date.now() - 20_000));
  assert.equal(await tryLock(), 0);
  assert.ok(!fs.existsSync(lock));

  // Lebender Besitzer: Die Sperre bleibt, egal wie alt sie ist.
  fs.writeFileSync(lock, owner({}));
  fs.utimesSync(lock, new Date(0), new Date(0));
  assert.equal(await tryLock(), 3);
  // Aus einem früheren Systemstart: verwaist.
  fs.writeFileSync(lock, owner({ boot: bootId ? "frueherer-start" : "", bootZeit: bootZeit - 86_400_000 }));
  assert.equal(await tryLock(), 0);
  // Unter Linux: gleiche Prozessnummer, aber ein anderer Prozess (Nummer neu vergeben).
  if (ownStart) {
    fs.writeFileSync(lock, owner({ start: "1" }));
    assert.equal(await tryLock(), 0);
  }

  // Nur der Besitzer gibt frei: Wurde die Sperre inzwischen von jemand anderem übernommen, bleibt sie.
  class OffeneSperre extends JobStore {
    sperre(fn: () => void) {
      this.withLock("probe", fn);
    }
  }
  const s = new OffeneSperre(dir, CONFIG_DIR);
  s.sperre(() => fs.writeFileSync(lock, owner({ token: "fremd" })));
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).token, "fremd");
  fs.rmSync(lock);
  s.sperre(() => assert.ok(fs.existsSync(lock)));
  assert.ok(!fs.existsSync(lock));
  assert.deepEqual(fs.readdirSync(path.join(dir, "sperren")), []);
});

test("Ohne Hardlinks (z. B. FAT, Netzlaufwerk) funktionieren Ablage und Sperren weiter", () => {
  const original = fs.linkSync;
  fs.linkSync = (() => {
    throw Object.assign(new Error("Hardlinks nicht unterstützt"), { code: "ENOTSUP" });
  }) as typeof fs.linkSync;
  try {
    const store = tempStore();
    const id = ready(store);
    save(store, id, { art: "text", text: "Sehr geehrte Frau [PERSON_1]" });
    store.approve(id, rev(store, id));
    assert.equal(store.detail(id).job.status, "freigegeben");
    for (const sub of ["dokumente", "sperren"]) {
      assert.ok(!fs.readdirSync(path.join(store.dataDir, sub)).some((f) => f.endsWith(".tmp") || f.endsWith(".lock")), `Reste in ${sub}`);
    }
  } finally {
    fs.linkSync = original;
  }
});

// Review Codex 2 #9
test("Rechnungsnummern: Fehler bei der Freigabe verbrauchen keine Nummer, keine Nummer doppelt", () => {
  const configDir = configCopy();
  const store = new JobStore(tempDir(), configDir);
  const counterFile = path.join(store.dataDir, "rechnungsnummern.json");
  const id = ready(store);
  save(store, id, invoice);
  // Firmendaten fehlerhaft: Abbruch vor der Nummernvergabe.
  fs.writeFileSync(path.join(configDir, "firma.json"), "{kaputt");
  assert.throws(() => store.approve(id, rev(store, id)), ConfigError);
  fs.copyFileSync(path.join(CONFIG_DIR, "firma.json"), path.join(configDir, "firma.json"));
  // Speichern scheitert nach der Reservierung: keine Nummer verbraucht.
  const restore = failRenameFor(`${id}.json`);
  try {
    assert.throws(() => store.approve(id, rev(store, id)), /simulierter Schreibfehler/);
  } finally {
    restore();
  }
  assert.ok(!fs.existsSync(counterFile));
  assert.equal(store.detail(id).job.status, "zur_pruefung");
  assert.match(store.approve(id, rev(store, id)).rechnungsnummer ?? "", /-0001$/);
  // Absturz zwischen Speichern und Zählen (Zähler fehlt): Die Nummer im Dokument zählt mit.
  fs.rmSync(counterFile);
  const id2 = ready(store);
  save(store, id2, invoice);
  assert.match(store.approve(id2, rev(store, id2)).rechnungsnummer ?? "", /-0002$/);
});

// Review Codex 2 #10
test("Abschluss lässt sich nach einem Schreibfehler wiederholen; eine fremde Rechnung im Archiv bleibt ein Fehler", () => {
  const store = tempStore();
  const archiv = (nummer: string) => path.join(store.dataDir, "rechnungen", `${nummer}.json`);
  const id = ready(store);
  save(store, id, invoice);
  const nummer = store.approve(id, rev(store, id)).rechnungsnummer ?? "";
  const restore = failRenameFor(`${id}.json`);
  try {
    assert.throws(() => store.close(id), /simulierter Schreibfehler/);
  } finally {
    restore();
  }
  assert.equal(store.detail(id).job.status, "freigegeben");
  assert.ok(fs.existsSync(archiv(nummer)));
  store.close(id);
  assert.equal(store.detail(id).job.status, "abgeschlossen");
  assert.ok(store.archivedInvoice(nummer).html.includes("Anna Huber"));

  const id2 = ready(store);
  save(store, id2, invoice);
  const nummer2 = store.approve(id2, rev(store, id2)).rechnungsnummer ?? "";
  fs.copyFileSync(archiv(nummer), archiv(nummer2));
  assert.throws(() => store.close(id2), /andere Rechnung/);
  assert.equal(store.detail(id2).job.status, "freigegeben");
});

// Review Codex 2 #11 und #12
test("Rechnung: Mengen und Preise so genau wie gerechnet, keine gemischten Brutto- und Nettopreise", () => {
  const store = tempStore();
  const id = ready(store);
  const rechnung = (positionen: RechnungsPosition[]): ErgebnisKi => ({
    art: "rechnung",
    rechnung: { empfaenger: "[PERSON_1]", empfaenger_adresse: "[ADRESSE_1]", leistungszeitraum: "Oktober 2026", positionen },
  });
  const { summen } = save(store, id, rechnung([
    { beschreibung: "Beratung", menge: 0.125, einheit: "Std.", einzelpreis: 80, ust_satz: 20 },
    { beschreibung: "Strom", menge: 100, einheit: "kWh", einzelpreis: 0.0825, ust_satz: 20 },
  ]));
  assert.equal(summen?.netto, 18.25);
  const r = store.detail(id).ergebnis;
  const html = r?.art === "rechnung" ? r.html : "";
  assert.match(html, /0,125 Std\./);
  assert.match(html, /€\s0,0825/);
  assert.match(html, /€\s10,00/);
  assert.throws(() => save(store, id, rechnung([{ beschreibung: "X", menge: 0.1234, einzelpreis: 10, ust_satz: 20 }])), /höchstens 3 Nachkommastellen/);
  assert.throws(() => save(store, id, rechnung([{ beschreibung: "X", menge: 1, einzelpreis: 1.23456, ust_satz: 20 }])), /höchstens 4 Nachkommastellen/);
  assert.throws(
    () => save(store, id, rechnung([
      { beschreibung: "Bruttopreis", menge: 1, einzelpreis: 120, preis_ist_brutto: true, ust_satz: 20 },
      { beschreibung: "Nettopreis", menge: 1, einzelpreis: 100, ust_satz: 20 },
    ])),
    /mischen Brutto- und Nettopreise/,
  );
});

// Review Codex 2 #7
test("Markieren: die ausgewählte Stelle wird geschwärzt, auch wenn der Text anderswo als ganzes Wort steht", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", text: "Code ZORWIN und ZORWINBETA." });
  const at = "Code ZORWIN und ".length;
  assert.equal(store.mark(job.id, { value: "ZORWIN", type: "SONSTIGES" }, [at, at + 6]).treffer, 2);
  assert.equal(store.detail(job.id).job.textKi, "Code [SONSTIGES_1] und [SONSTIGES_2].");
  assert.throws(() => store.mark(job.id, { value: "ZORWIN", type: "SONSTIGES" }, [1, 7]), /passt nicht zum Dokument/);
});

// Review Claude 2 #5
test("Platzhalter-Nummern bleiben stabil: Nachschwärzen verschiebt nichts, verworfene Nummern kommen nicht wieder", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", text: "Hallo, hier schreibt Gstrein im Auftrag von Frau Anna Huber. Sie reist mit Thomas an." });
  const vorher = store.detail(job.id).zuordnung.map((e) => `${e.id}=${e.original}`);
  assert.deepEqual(vorher, ["PERSON_1=Anna Huber", "PERSON_2=Thomas"]);
  store.mark(job.id, { value: "Gstrein", type: "PERSON" });
  assert.equal(store.detail(job.id).job.textKi, "Hallo, hier schreibt [PERSON_3] im Auftrag von Frau [PERSON_1]. Sie reist mit [PERSON_2] an.");
  store.exclude(job.id, "Thomas");
  assert.equal(store.detail(job.id).job.textKi, "Hallo, hier schreibt [PERSON_3] im Auftrag von Frau [PERSON_1]. Sie reist mit Thomas an.");
  store.mark(job.id, { value: "Auftrag", type: "SONSTIGES" });
  store.undoMark(job.id, "Thomas");
  assert.equal(
    store.detail(job.id).job.textKi,
    "Hallo, hier schreibt [PERSON_3] im [SONSTIGES_1] von Frau [PERSON_1]. Sie reist mit [PERSON_2] an.",
    "Thomas bekommt seine alte Nummer zurück",
  );
});

// Review Claude 2 #7: Gegenprobe beim Speichern
test("Speichern prüft, dass die Datei noch den geladenen Stand hat", () => {
  const store = tempStore();
  const job = store.create({ art: "allgemein", text: "Anna Huber fragt an." });
  const file = docFile(store, job.id);
  // Nach dem Laden schreibt jemand an der Sperre vorbei (als wäre sie verloren gegangen).
  const original = fs.readFileSync;
  let geladen = false;
  fs.readFileSync = ((pfad: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    const out = (original as (...a: unknown[]) => unknown)(pfad, ...rest);
    if (!geladen && String(pfad) === file) {
      geladen = true;
      const fremd = JSON.parse(String(out)) as { rev: number };
      fremd.rev += 1;
      fs.writeFileSync(file, JSON.stringify(fremd));
    }
    return out;
  }) as typeof fs.readFileSync;
  try {
    assert.throws(() => store.mark(job.id, { value: "fragt", type: "SONSTIGES" }), /gleichzeitig geändert/);
  } finally {
    fs.readFileSync = original;
  }
  assert.equal(store.detail(job.id).manuell.length, 0, "nichts überschrieben");
});

// Review Claude 2 #15, #18, #19, #20
test("Übernommene übersehene Angaben werden als Leck gemeldet; Abschluss ohne Titel; neuer Typ beim Nachschwärzen; keine Gutschriften", () => {
  const store = tempStore();
  // #15: Die Erkennung übersieht eine Nummer (kein Signalwort), die KI übernimmt sie ins Ergebnis.
  // (über Zeilen verteilt, wie nach einem schlechten Kopieren aus einem PDF)
  const job = store.create({ art: "hotel", text: "Rückruf bitte:\n0512\n123456\nDanke." });
  assert.ok((store.detail(job.id).job.textKi ?? "").includes("123456"), "Voraussetzung: hier nicht erkannt");
  release(store, job.id);
  const { pruefung } = save(store, job.id, { art: "text", text: "Wir rufen Sie unter 0512 123456 zurück." });
  assert.ok(pruefung.erfunden.length > 0);
  assert.equal(JSON.stringify(pruefung).includes("Original"), false, "die KI erfährt nichts über das Original");
  assert.equal(store.detail(job.id).lecks.length, 1, "die Oberfläche meldet das Leck");

  // #18: Nach dem Abschluss bleibt kein Titel der Platzhalter-Fassung.
  store.approve(job.id, rev(store, job.id));
  store.close(job.id);
  assert.equal(store.list().dokumente.find((d) => d.id === job.id)?.titel, job.id);

  // #19: Wird derselbe Text mit anderem Typ geschwärzt, gilt der neue Typ.
  const zweites = store.create({ art: "allgemein", text: "Termin mit Gstrein am Montag." });
  store.mark(zweites.id, { value: "Gstrein", type: "SONSTIGES" });
  store.mark(zweites.id, { value: "Gstrein", type: "PERSON" });
  assert.equal(store.detail(zweites.id).job.textKi, "Termin mit [PERSON_1] am Montag.");

  // #20: Rabattzeilen ja, negative Rechnungssummen (Gutschrift ohne Bezug) nein.
  const id = ready(store);
  const rechnung = (positionen: RechnungsPosition[]): ErgebnisKi => ({ art: "rechnung", rechnung: { empfaenger: "[PERSON_1]", positionen } });
  save(store, id, rechnung([{ beschreibung: "Zimmer", menge: 1, einzelpreis: 200, ust_satz: 10 }, { beschreibung: "Rabatt", menge: 1, einzelpreis: -20, ust_satz: 10 }]));
  assert.throws(() => save(store, id, rechnung([{ beschreibung: "Gutschrift", menge: 1, einzelpreis: -500, ust_satz: 20 }])), /Gutschriften/);
});

// ---------------------------------------------------------------------------
// Dritte Prüfrunde (Codex 3)

// Review Codex 3 #3: echter verkürzter Schreibvorgang über ein Dateigrößenlimit des Betriebssystems, kein Nachbau
test("Unvollständiges Schreiben gilt als Fehler: das bisherige Dokument bleibt erhalten", { skip: process.platform === "win32" }, async () => {
  const store = tempStore();
  const id = ready(store, "Anfrage von Anna Huber.");
  const vorher = fs.readFileSync(docFile(store, id), "utf8");
  const jobs = JSON.stringify(path.join(PROJECT_ROOT, "dist", "store", "jobs.js"));
  const script = `const { JobStore } = await import(${jobs}); const s = new JobStore(${JSON.stringify(store.dataDir)}, ${JSON.stringify(CONFIG_DIR)}); try { s.saveResult(${JSON.stringify(id)}, { art: "text", text: "Antwort ".repeat(1500) }, 1); process.exit(0); } catch { process.exit(4); }`;
  // Höchstens 4 Blöcke je Datei: Das bestehende Dokument passt, das Dokument mit dem langen Ergebnis nicht.
  const code = await new Promise<number>((resolve) => {
    const c = spawn("/bin/sh", ["-c", 'ulimit -f 4 && exec "$0" --input-type=module -e "$1"', process.execPath, script], { stdio: "ignore" });
    c.on("exit", (exitCode) => resolve(exitCode ?? -1));
  });
  assert.equal(code, 4, "der Fehler wird gemeldet, nicht als Erfolg behandelt");
  assert.equal(fs.readFileSync(docFile(store, id), "utf8"), vorher);
  assert.equal(store.detail(id).job.status, "bereit");
  assert.deepEqual(fs.readdirSync(path.join(store.dataDir, "dokumente")).filter((f) => f.endsWith(".tmp")), []);
  // Ohne Limit klappt dasselbe Speichern.
  save(store, id, { art: "text", text: "Antwort ".repeat(1500) });
  assert.equal(store.detail(id).job.status, "zur_pruefung");
});

// Review Codex 3 #10
test("Schreibfehler und Abstürze hinterlassen keine Zwischendateien mit Originalen", () => {
  const store = tempStore();
  const dir = path.join(store.dataDir, "dokumente");
  const id = ready(store, "Anfrage von Anna Huber.");
  // fsync scheitert nur für die Zwischendatei des Dokuments (nicht für die Sperre).
  const { openSync, fsyncSync } = fs;
  const zwischen = new Set<number>();
  fs.openSync = ((pfad: fs.PathLike, ...rest: unknown[]) => {
    const fd = (openSync as (...a: unknown[]) => number)(pfad, ...rest);
    if (String(pfad).startsWith(`${docFile(store, id)}.`)) zwischen.add(fd);
    return fd;
  }) as typeof fs.openSync;
  fs.fsyncSync = ((fd: number) => {
    if (zwischen.has(fd)) throw Object.assign(new Error("simulierter Schreibfehler"), { code: "EIO" });
    fsyncSync(fd);
  }) as typeof fs.fsyncSync;
  try {
    assert.throws(() => save(store, id, { art: "text", text: "Sehr geehrte Frau [PERSON_1]" }), /simulierter Schreibfehler/);
  } finally {
    fs.openSync = openSync;
    fs.fsyncSync = fsyncSync;
  }
  assert.equal(zwischen.size, 1, "Voraussetzung: die Zwischendatei wurde angelegt");
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
  assert.equal(store.detail(id).job.status, "bereit");

  // Rest eines abgestürzten Speicherns: Löschen und Abschließen räumen ihn mit weg.
  const rest = (doc: string) => fs.copyFileSync(docFile(store, doc), `${docFile(store, doc)}.4242.0badc0de.tmp`);
  rest(id);
  store.remove(id);
  assert.deepEqual(fs.readdirSync(dir), []);
  const zweites = ready(store, "Anfrage von Lisa Gruber.");
  save(store, zweites, { art: "text", text: "Sehr geehrte Frau [PERSON_1]" });
  store.approve(zweites, rev(store, zweites));
  rest(zweites);
  store.close(zweites);
  assert.deepEqual(fs.readdirSync(dir), [`${zweites}.json`]);
  assert.ok(!allFiles(store.dataDir).includes("Gruber"));
});

// Review Codex 3 #7
test("Rechnungsfreigabe: auf die Rechnung kommen nur die Firmendaten aus dem geprüften Entwurf", () => {
  const configDir = configCopy();
  const store = new JobStore(tempDir(), configDir);
  const id = ready(store);
  save(store, id, invoice);
  const firmaFile = path.join(configDir, "firma.json");
  const firma = JSON.parse(fs.readFileSync(firmaFile, "utf8")) as Record<string, string>;
  fs.writeFileSync(firmaFile, JSON.stringify({ ...firma, iban: "AT02 2011 1000 0000 0018" }));
  assert.throws(() => store.approve(id, rev(store, id)), /Firmendaten .* seit dem Entwurf geändert/);
  assert.equal(store.detail(id).job.status, "zur_pruefung");
  assert.equal(store.detail(id).job.rechnungsnummer, undefined);
  // Neuer Entwurf mit den neuen Daten: Der wird geprüft und freigegeben.
  store.sendBack(id);
  save(store, id, invoice);
  const entwurf = store.detail(id).ergebnis;
  assert.ok(entwurf?.art === "rechnung" && entwurf.html.includes("AT02 2011 1000 0000 0018"));
  store.approve(id, rev(store, id));
  const fertig = store.export(id).inhalt;
  assert.ok(fertig.includes("AT02 2011 1000 0000 0018") && !fertig.includes(firma.iban ?? "?"));
});

// Review Codex 3 #11
test("Beschädigter Rechnungszähler: Abbruch vor jeder Änderung statt ungültiger Nummer", () => {
  const store = tempStore();
  const counterFile = path.join(store.dataDir, "rechnungsnummern.json");
  const id = ready(store);
  save(store, id, invoice);
  const year = String(new Date().getFullYear());
  for (const kaputt of [`{"${year}":"kaputt"}`, `{"${year}":-1}`, `{"${year}":1.5}`, `{"${year}":1e400}`, `{"20x6":1}`, "[]", "null", "7"]) {
    fs.writeFileSync(counterFile, kaputt);
    assert.throws(() => store.approve(id, rev(store, id)), /Rechnungsnummern ist beschädigt/, kaputt);
    assert.equal(store.detail(id).job.status, "zur_pruefung", kaputt);
  }
  fs.writeFileSync(counterFile, JSON.stringify({ [year]: 7 }));
  assert.equal(store.approve(id, rev(store, id)).rechnungsnummer, `${year}-0008`);
});
