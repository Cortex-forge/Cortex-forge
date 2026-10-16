import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CONFIG_DIR, EXAMPLES_DIR } from "../config.js";
import { pseudonymize } from "../core/pseudonymize.js";
import { reidentify } from "../core/reidentify.js";
import { decrypt, encrypt } from "../core/vault.js";
import { loadCompanies } from "../store/settings.js";

const example = (name: string) => fs.readFileSync(path.join(EXAMPLES_DIR, name), "utf8");

test("Hotel-Anfrage: kein Originalwert bleibt in der KI-Sicht", () => {
  const r = pseudonymize(example("hotel-anfrage.txt"));
  for (const original of ["Anna", "Huber", "Thomas", "Lena", "anna.huber@example.com", "0664 1234567", "Bergweg", "6020", "Innsbruck", "I-123AB", "Nussallergie"]) {
    assert.ok(!r.text.includes(original), `"${original}" ist noch sichtbar`);
  }
  // Was die KI zum Arbeiten braucht, bleibt stehen.
  for (const kept of ["12. bis 15. Februar 2027", "Doppelzimmer", "Zustellbett", "6 Jahre", "Parkplatz"]) {
    assert.ok(r.text.includes(kept), `"${kept}" fehlt`);
  }
});

test("Eingangsrechnung: kein Originalwert bleibt in der KI-Sicht, Beträge bleiben", () => {
  const r = pseudonymize(example("eingangsrechnung.txt"), { companies: loadCompanies(CONFIG_DIR) });
  for (const original of ["Alpenblick", "Industriestraße", "ATU12345678", "5223", "office@", "Gruber", "Dorfstraße", "Axams", "K-4711", "AT61", "Leitner"]) {
    assert.ok(!r.text.includes(original), `"${original}" ist noch sichtbar`);
  }
  for (const kept of ["687,00 €", "137,40 €", "824,40 €", "2026-0815", "30.09.2026", "Wartung Notbeleuchtung"]) {
    assert.ok(r.text.includes(kept), `"${kept}" fehlt`);
  }
  assert.ok(r.text.includes("[FIRMA_1: Elektroinstallateur]"));
});

// Review Claude #20
test("Rückübersetzung setzt nach einer Anrede nur den Nachnamen ein", () => {
  const r = pseudonymize("Anfrage von Anna Huber, erreichbar unter 0664 1234567");
  const back = reidentify("Sehr geehrte Frau [PERSON_1], wir rufen Sie unter [TELEFON_1] an. Liebe [PERSON_1]!", r.mapping);
  assert.equal(back.text, "Sehr geehrte Frau Huber, wir rufen Sie unter 0664 1234567 an. Liebe Anna Huber!");
  assert.deepEqual(back.unknown, []);
  assert.deepEqual(back.invented, []);

  const cases: Array<[string, string, string]> = [
    ["Gast: Frau Huber Anna, Bergweg 12, 6020 Innsbruck", "Sehr geehrte Frau [PERSON_1],", "Sehr geehrte Frau Huber,"],
    ["Anfrage von Maria von Trapp", "Sehr geehrte Frau [PERSON_1],", "Sehr geehrte Frau von Trapp,"],
    ["Mi chiamo Giulia Rossi.", "Gentile Sig.ra [PERSON_1],", "Gentile Sig.ra Rossi,"],
    ["Gast: Huber, Anna", "Liebe [PERSON_1], liebe Frau [PERSON_1]", "Liebe Anna Huber, liebe Frau Huber"],
  ];
  for (const [doc, ai, expected] of cases) assert.equal(reidentify(ai, pseudonymize(doc).mapping).text, expected, doc);
});

test("Unbekannte und veränderte Platzhalter sowie erfundene Kontaktdaten werden gemeldet", () => {
  const r = pseudonymize("Anfrage von Anna Huber");
  const back = reidentify("Hallo [person 1], Gruß [PERSON_7]. Rückruf unter 0512 999999 oder PERSON_1.", r.mapping);
  assert.equal(back.text, "Hallo Anna Huber, Gruß [PERSON_7]. Rückruf unter 0512 999999 oder Anna Huber.");
  assert.deepEqual(back.unknown, ["[PERSON_7]"]);
  assert.ok(back.repaired.includes("[person 1]"));
  assert.ok(back.repaired.includes("PERSON_1"));
  assert.equal(back.invented.length, 1);
  assert.equal(back.invented[0]?.type, "TELEFON");
  // Review Claude #1: auch "Telefonnummer: …" der KI fällt auf
  assert.equal(reidentify("Unsere Telefonnummer: 0512 999999", r.mapping).invented.length, 1);
});

// Review Claude #13
test("Falsch geschriebene Platzhalter: reparieren oder als Rest melden, nicht verwendete nennen", () => {
  const r = pseudonymize("Anfrage von Anna Huber, Tel. 0664 1234567");
  const back = reidentify("Sehr geehrte Frau [PERSON1], Rückruf an person_1 unter [TELEFON 1] bzw. (TELEFON_1).", r.mapping);
  assert.equal(back.text, "Sehr geehrte Frau Huber, Rückruf an Anna Huber unter 0664 1234567 bzw. (0664 1234567).");
  assert.deepEqual(back.leftovers, []);
  const broken = reidentify("Hallo [NAME_1], Ihre Nummer PERSON 1 und [PERSON_1 fehlt", r.mapping);
  assert.deepEqual(broken.leftovers.sort(), ["PERSON 1", "[NAME_1]", "[PERSON_1"].sort());
  assert.deepEqual(broken.unused, ["PERSON_1", "TELEFON_1"]);
});

// Review Codex #1 (Blocker)
test("Eingesetzte Originale werden nie noch einmal als Platzhalter ausgewertet", () => {
  const r = pseudonymize("Geheimer Code: PERSON_987654", { manual: [{ value: "PERSON_987654", type: "SONSTIGES" }] });
  assert.equal(r.text, "Geheimer Code: [SONSTIGES_1]");
  const back = reidentify("Ihr Code: [SONSTIGES_1]", r.mapping, { literal: r.literal });
  assert.equal(back.text, "Ihr Code: PERSON_987654");
  assert.deepEqual(back.unknown, []);
  assert.deepEqual(back.leftovers, []);
  assert.deepEqual(back.repaired, []);

  const mail = pseudonymize("Kontakt: PERSON_999@example.com");
  const back2 = reidentify("Mail: [EMAIL_1]", mail.mapping, { literal: mail.literal });
  assert.equal(back2.text, "Mail: PERSON_999@example.com");
  assert.deepEqual([...back2.unknown, ...back2.leftovers], []);
});

// Review Codex #11
test("Platzhalter aus dem Original bleiben bei der Rückübersetzung stehen", () => {
  const r = pseudonymize("Vorlage [PERSON_1]. Frau Anna Huber.");
  const back = reidentify("Vorlage [PERSON_1]. Sehr geehrte Frau [PERSON_2].", r.mapping, { literal: r.literal });
  assert.equal(back.text, "Vorlage [PERSON_1]. Sehr geehrte Frau Huber.");
  assert.deepEqual(back.unknown, []);
});

test("Platzhalter mit Beschreibung werden zurückübersetzt", () => {
  const r = pseudonymize("Rechnung von Alpenblick Elektrotechnik GmbH", {
    companies: [{ name: "Alpenblick Elektrotechnik GmbH", kategorie: "Elektroinstallateur" }],
  });
  assert.equal(reidentify("Wartung [FIRMA_1: Elektroinstallateur]", r.mapping).text, "Wartung Alpenblick Elektrotechnik GmbH");
  assert.equal(reidentify("Wartung [FIRMA_1]", r.mapping).text, "Wartung Alpenblick Elektrotechnik GmbH");
});

// Review Claude #26
test("Verschlüsselung: Rundweg, Manipulationsschutz und Bindung an Dokument und Feld", () => {
  const key = Buffer.alloc(32, 7);
  const sealed = encrypt(key, "Anna Huber, Bergweg 12", "D-1:geheim");
  assert.ok(!sealed.includes("Anna"));
  assert.equal(decrypt(key, sealed, "D-1:geheim"), "Anna Huber, Bergweg 12");
  const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.throws(() => decrypt(key, tampered, "D-1:geheim"));
  assert.throws(() => decrypt(Buffer.alloc(32, 8), sealed, "D-1:geheim"));
  // In ein anderes Dokument oder Feld kopiert: lässt sich nicht entschlüsseln.
  assert.throws(() => decrypt(key, sealed, "D-2:geheim"));
  assert.throws(() => decrypt(key, sealed, "D-1:ki"));
});
