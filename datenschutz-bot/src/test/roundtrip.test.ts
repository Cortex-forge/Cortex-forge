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

test("Rückübersetzung setzt nach einer Anrede nur den Nachnamen ein", () => {
  const r = pseudonymize("Anfrage von Anna Huber, erreichbar unter 0664 1234567");
  const back = reidentify("Sehr geehrte Frau [PERSON_1], wir rufen Sie unter [TELEFON_1] an. Liebe [PERSON_1]!", r.mapping);
  assert.equal(back.text, "Sehr geehrte Frau Huber, wir rufen Sie unter 0664 1234567 an. Liebe Anna Huber!");
  assert.deepEqual(back.unknown, []);
  assert.deepEqual(back.invented, []);
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
});

test("Platzhalter mit Beschreibung werden zurückübersetzt", () => {
  const r = pseudonymize("Rechnung von Alpenblick Elektrotechnik GmbH", {
    companies: [{ name: "Alpenblick Elektrotechnik GmbH", kategorie: "Elektroinstallateur" }],
  });
  assert.equal(reidentify("Wartung [FIRMA_1: Elektroinstallateur]", r.mapping).text, "Wartung Alpenblick Elektrotechnik GmbH");
  assert.equal(reidentify("Wartung [FIRMA_1]", r.mapping).text, "Wartung Alpenblick Elektrotechnik GmbH");
});

test("Verschlüsselung: Rundweg und Manipulationsschutz", () => {
  const key = Buffer.alloc(32, 7);
  const sealed = encrypt(key, "Anna Huber, Bergweg 12");
  assert.ok(!sealed.includes("Anna"));
  assert.equal(decrypt(key, sealed), "Anna Huber, Bergweg 12");
  const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.throws(() => decrypt(key, tampered));
  assert.throws(() => decrypt(Buffer.alloc(32, 8), sealed));
});
