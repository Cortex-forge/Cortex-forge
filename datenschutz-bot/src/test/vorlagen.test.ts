// Vorlagen für feste Dokumente (ADR-007): erkennen, Felder lesen, Abweichungen melden, feste Texte stehen lassen.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CONFIG_DIR, EXAMPLES_DIR } from "../config.js";
import { pseudonymize } from "../core/pseudonymize.js";
import { reidentify } from "../core/reidentify.js";
import { applyTemplate, matchTemplate } from "../core/templates.js";
import type { DocumentTemplate } from "../core/types.js";
import { JobStore } from "../store/jobs.js";
import { ConfigError, loadTemplates } from "../store/settings.js";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "dsb-vorlagen-"));
const muster = fs.readFileSync(path.join(EXAMPLES_DIR, "musterhotel-buchungsbestaetigung.txt"), "utf8");

const vorlage: DocumentTemplate = {
  id: "test-meldeblatt",
  name: "Meldeblatt Testhof",
  erkennen: ["Testhof", "Meldeblatt"],
  felder: [
    { bezeichnung: "Name", typ: "PERSON" },
    { bezeichnung: "Adresse", typ: "ADRESSE", zeilen: 2 },
    { bezeichnung: "Telefon", typ: "TELEFON" },
    { bezeichnung: "Begleitung", typ: "PERSON", pflicht: false },
    { bezeichnung: "Bemerkung", typ: "FREITEXT", pflicht: false },
  ],
  unveraendert: ["Testhof · Dorf 1 · 6100 Seefeld"],
};

test("Vorlage passt nur, wenn alle Erkennungsmerkmale im Text stehen; bei mehreren gilt die genaueste", () => {
  const allgemein: DocumentTemplate = { ...vorlage, id: "allgemein", erkennen: ["Testhof"] };
  assert.equal(matchTemplate("TESTHOF\nMELDEBLATT\nName: X", [vorlage])?.id, "test-meldeblatt");
  assert.equal(matchTemplate("Testhof\nRechnung", [vorlage]), undefined);
  assert.equal(matchTemplate("Testhof Meldeblatt", [allgemein, vorlage])?.id, "test-meldeblatt");
  assert.equal(matchTemplate("Testhof Meldeblatt", []), undefined);
});

test("Felder: Wert in derselben oder der nächsten Zeile, mehrzeilige Adresse, Strich heißt leer", () => {
  const text = [
    "Testhof · Dorf 1 · 6100 Seefeld",
    "Meldeblatt",
    "Name:      Sommer Freitag",
    "Adresse:",
    "Am Berg 3",
    "6020 Innsbruck",
    "Telefon\t0512 123456",
    "Begleitung:  –",
    "Bemerkung: Telefon und Name wie immer.",
    "Die Telefon: im Fließtext zählt nicht, nur am Zeilenanfang.",
  ].join("\n");
  const r = applyTemplate(text, vorlage);
  assert.deepEqual(
    r.findings.map((f) => [f.type, f.value]),
    [
      ["PERSON", "Sommer Freitag"],
      ["ADRESSE", "Am Berg 3"],
      ["ADRESSE", "6020 Innsbruck"],
      ["TELEFON", "0512 123456"],
    ],
  );
  assert.equal(r.findings[0]?.nachname, "Freitag");
  assert.deepEqual(r.fehlend, []);
  assert.deepEqual(r.fest, [[0, "Testhof · Dorf 1 · 6100 Seefeld".length]]);
});

test("Fehlende Pflichtfelder werden gemeldet; Bezeichnung ohne Trennzeichen ist kein Feld", () => {
  const r = applyTemplate("Testhof Meldeblatt\nName: Anna Huber\nTelefon und Internet inklusive", vorlage);
  assert.deepEqual(r.fehlend, ["Adresse", "Telefon"]);
  assert.deepEqual(r.findings.map((f) => f.value), ["Anna Huber"]);
  // Folgt auf eine leere Bezeichnung gleich das nächste Feld, ist der Wert leer.
  const leer = applyTemplate("Testhof Meldeblatt\nName:\nTelefon: 0512 123456", vorlage);
  assert.deepEqual(leer.fehlend, ["Name", "Adresse"]);
  assert.deepEqual(leer.findings.map((f) => f.value), ["0512 123456"]);
});

test("Musterdokument: alle Felder ersetzt, Briefkopf bleibt, Freitext läuft durch die Erkennung, Rückübersetzung stimmt", () => {
  const templates = loadTemplates(CONFIG_DIR);
  const r = pseudonymize(muster, { templates });
  for (const v of ["Zorwin", "Xylander", "Lärchenweg", "8010 Graz", "9876543", "z.xylander", "14.03.1979", "Quirina", "Valdessa", "G 417 XY", "Holzbau", "Nussallergie"]) {
    assert.ok(!r.text.includes(v), `"${v}" ist noch sichtbar`);
  }
  for (const v of ["Musterhotel Alpenblick ★★★★", "info@musterhotel-alpenblick.example", "UID ATU99999999", "Halbpension", "567,00 €"]) {
    assert.ok(r.text.includes(v), `"${v}" fehlt`);
  }
  assert.match(r.text, /Gast: {15}\[PERSON_1\]\n/);
  assert.match(r.text, /Frau \[PERSON_\d\] hat \[GESUNDHEIT_1\]/);
  assert.equal(reidentify(r.text, r.mapping).text, muster);
});

test("Ohne passende Vorlage bleibt alles wie bisher; eine Markierung von Hand gilt auch im Briefkopf", () => {
  const templates = loadTemplates(CONFIG_DIR);
  const text = "Rechnung vom Musterhotel Alpenblick an Anna Huber";
  assert.equal(pseudonymize(text, { templates }).text, pseudonymize(text).text);
  const marked = pseudonymize(muster, { templates, manual: [{ value: "Seefeld", type: "SONSTIGES" }] });
  assert.ok(!marked.text.includes("Seefeld"));
});

test("Vorlagen werden beim Laden geprüft: falsche Art und doppelte Kennung brechen ab", () => {
  const dir = tempDir();
  assert.deepEqual(loadTemplates(dir), []);
  fs.mkdirSync(path.join(dir, "vorlagen"));
  const write = (name: string, data: unknown) => fs.writeFileSync(path.join(dir, "vorlagen", name), JSON.stringify(data));
  write("a.json", { ...vorlage, felder: [{ bezeichnung: "Name", typ: "NAME" }] });
  assert.throws(() => loadTemplates(dir), (err: Error) => err instanceof ConfigError && /a\.json/.test(err.message));
  write("a.json", vorlage);
  write("b.json", vorlage);
  assert.throws(() => loadTemplates(dir), /doppelt/);
  fs.rmSync(path.join(dir, "vorlagen", "b.json"));
  assert.equal(loadTemplates(dir)[0]?.name, "Meldeblatt Testhof");
});

test("Ablage: erkannte Vorlage und fehlende Pflichtfelder stehen in der Prüfansicht und im Protokoll", () => {
  const store = new JobStore(tempDir(), CONFIG_DIR);
  const ok = store.create({ art: "hotel", text: muster });
  const d = store.detail(ok.id);
  assert.deepEqual(d.vorlage, { id: "musterhotel-buchungsbestaetigung", name: "Buchungsbestätigung Musterhotel Alpenblick", fehlend: [] });
  assert.ok(!(d.job.textKi ?? "").includes("Xylander"));
  const ohneTelefon = store.create({ art: "hotel", text: muster.replace(/^Telefon:.*\n/m, "") });
  assert.deepEqual(store.detail(ohneTelefon.id).vorlage?.fehlend, ["Telefon"]);
  assert.ok(
    store.protokoll(ohneTelefon.id).some((e) => /Vorlage „Buchungsbestätigung Musterhotel Alpenblick“ \(1 Pflichtfeld fehlt\)/.test(e.ereignis)),
  );
  const anderes = store.create({ art: "hotel", text: "Anfrage von Anna Huber" });
  assert.equal(store.detail(anderes.id).vorlage, undefined);
  // Die KI bekommt nur die Platzhalter-Fassung, keine Angaben zur Vorlage.
  store.releaseForAi(ok.id, store.detail(ok.id).job.rev);
  const ki = store.readForAi(ok.id) as unknown as Record<string, unknown>;
  assert.equal(ki.vorlage, undefined);
  assert.ok(!JSON.stringify(ki).includes("Xylander"));
});

test("Vorlagen bleiben bei langen Dokumenten schnell", () => {
  const templates = loadTemplates(CONFIG_DIR);
  const lang = muster + "Besondere Wünsche:\n" + "Telefon:            +43 664 1234567\nGast:               Anna Huber\n".repeat(3000);
  const t0 = performance.now();
  pseudonymize(lang, { templates });
  assert.ok(performance.now() - t0 < 3000, `${Math.round(performance.now() - t0)} ms`);
});
