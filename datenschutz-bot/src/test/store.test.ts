import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CONFIG_DIR, EXAMPLES_DIR } from "../config.js";
import { JobStore } from "../store/jobs.js";

const example = (name: string) => fs.readFileSync(path.join(EXAMPLES_DIR, name), "utf8");
const tempStore = () => new JobStore(fs.mkdtempSync(path.join(os.tmpdir(), "dsb-test-")), CONFIG_DIR);

test("Ablauf Rechnung: freigeben, Ergebnis, Nummer bei Freigabe, Abschluss löscht Originale", () => {
  const store = tempStore();
  const job = store.create({ art: "hotel", betreff: "Rechnung Aufenthalt", text: example("rechnungsauftrag.txt") });

  assert.throws(() => store.readForAi(job.id), /noch nicht für die KI freigegeben/);
  assert.equal(store.listForAi().length, 0);

  store.releaseForAi(job.id);
  const doc = store.readForAi(job.id);
  assert.ok(!doc.text.includes("Huber") && !doc.text.includes("Bergweg"));

  store.saveResult(job.id, {
    art: "rechnung",
    rechnung: {
      empfaenger: "[PERSON_1]",
      empfaenger_adresse: "[ADRESSE_1]",
      leistungszeitraum: "12.02.2027 bis 15.02.2027",
      positionen: [{ beschreibung: "Doppelzimmer", menge: 3, einzelpreis: 189, preis_ist_brutto: true, ust_satz: 10 }],
    },
  });

  // Auf der Platte stehen die Originale nur verschlüsselt.
  const raw = fs.readFileSync(path.join(store.dataDir, "dokumente", `${job.id}.json`), "utf8");
  for (const original of ["Anna", "Huber", "Bergweg", "Innsbruck"]) assert.ok(!raw.includes(original), original);

  const approved = store.approve(job.id);
  assert.match(approved.rechnungsnummer ?? "", /^\d{4}-0001$/);
  const result = store.detail(job.id).ergebnis;
  assert.equal(result?.art, "rechnung");
  if (result?.art === "rechnung") {
    assert.ok(result.html.includes("Anna Huber"));
    assert.ok(result.html.includes(approved.rechnungsnummer ?? "?"));
  }

  store.close(job.id);
  const closed = store.detail(job.id);
  assert.equal(closed.original, "");
  assert.equal(closed.ergebnis, undefined);
  assert.ok(!fs.readFileSync(path.join(store.dataDir, "dokumente", `${job.id}.json`), "utf8").includes("geheim"));

  const events = store.protokoll(job.id).map((e) => e.ereignis);
  assert.ok(events.some((e) => e.includes("Von der KI gelesen")));
  assert.ok(events.some((e) => e.includes("Originaldaten und Zuordnung gelöscht")));
});

test("Rechnungsnummern laufen fortlaufend weiter", () => {
  const store = tempStore();
  const numbers: string[] = [];
  for (let i = 0; i < 2; i++) {
    const job = store.create({ art: "hotel", text: example("rechnungsauftrag.txt") });
    store.releaseForAi(job.id);
    store.saveResult(job.id, {
      art: "rechnung",
      rechnung: { empfaenger: "[PERSON_1]", positionen: [{ beschreibung: "Zimmer", menge: 1, einzelpreis: 100, ust_satz: 10 }] },
    });
    numbers.push(store.approve(job.id).rechnungsnummer ?? "");
  }
  assert.match(numbers[0] ?? "", /-0001$/);
  assert.match(numbers[1] ?? "", /-0002$/);
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
  const job = store.create({ art: "hotel", text: example("hotel-anfrage.txt") });
  store.releaseForAi(job.id);
  store.saveResult(job.id, { art: "text", text: "Sehr geehrte Frau [PERSON_1]" });
  assert.equal(store.detail(job.id).job.status, "zur_pruefung");
  store.sendBack(job.id);
  const d = store.detail(job.id);
  assert.equal(d.job.status, "bereit");
  assert.equal(d.ergebnis, undefined);
  assert.equal(d.job.ergebnisKi, undefined);
});
