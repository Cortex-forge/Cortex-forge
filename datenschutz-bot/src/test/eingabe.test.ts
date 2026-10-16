import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CONFIG_DIR } from "../config.js";
import { decodeEncodedWords, decodeMail, htmlToText } from "../core/mail.js";
import { prepareDocument } from "../core/normalize.js";
import { pseudonymize } from "../core/pseudonymize.js";
import { JobStore } from "../store/jobs.js";

const tempStore = () => new JobStore(fs.mkdtempSync(path.join(os.tmpdir(), "dsb-eingabe-")), CONFIG_DIR);
const kiSicht = (store: JobStore, text: string) => store.detail(store.create({ art: "hotel", text }).id).job.textKi ?? "";

// Review Claude 2 #1 (Blocker): .eml mit Quoted-Printable, Base64, encoded words, HTML und Anhang
test("E-Mails im MIME-Format werden vor der Erkennung entschlüsselt, Anhänge weggelassen", () => {
  const body = "Sehr geehrte Damen und Herren,\nich bin Jürgen Müller.\nMeine Telefonnummer: 0664 1234567\nIBAN: AT61 1904 3002 3457 3201\n";
  const eml = [
    "From: =?utf-8?Q?J=C3=BCrgen_M=C3=BCller?= <j.mueller@example.com>",
    "To: info@hotel.example",
    "Subject: =?utf-8?B?" + Buffer.from("Anfrage für März").toString("base64") + "?=",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="aussen"',
    "",
    "--aussen",
    'Content-Type: multipart/alternative; boundary="innen"',
    "",
    "--innen",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...(Buffer.from("<p>" + body.replace(/\n/g, "<br>") + "</p>").toString("base64").match(/.{1,76}/g) ?? []),
    "--innen--",
    "--aussen",
    'Content-Type: application/pdf; name="Reisepass Jürgen Müller.pdf"',
    "Content-Disposition: attachment",
    "Content-Transfer-Encoding: base64",
    "",
    "JVBERi0xLjQK",
    "--aussen--",
  ].join("\n");
  const store = tempStore();
  const job = store.create({ art: "hotel", text: eml });
  const d = store.detail(job.id);
  assert.match(d.original, /^Von: Jürgen Müller <j\.mueller@example\.com>\nAn: info@hotel\.example\nBetreff: Anfrage für März/);
  assert.ok(!d.original.includes("Reisepass"), "Anhang weggelassen");
  for (const geheim of ["Jürgen", "Müller", "mueller", "0664", "1234567", "3457"]) assert.ok(!(d.job.textKi ?? "").includes(geheim), geheim);
  assert.ok(store.protokoll(job.id).some((e) => e.ereignis.includes("E-Mail entschlüsselt, 1 Anhang/Teil weggelassen")));

  // Quoted-Printable mit weichem Zeilenumbruch und ISO-8859-1
  const qp = decodeMail(
    ["Subject: Test", "MIME-Version: 1.0", "Content-Type: text/plain; charset=iso-8859-1", "Content-Transfer-Encoding: quoted-printable", "", "Gr=FC=DFe von J=FCrgen M=FC=", "ller"].join("\n"),
  );
  assert.equal(qp?.text, "Betreff: Test\n\nGrüße von Jürgen Müller");
  assert.equal(decodeEncodedWords("=?ISO-8859-1?Q?Gr=FCnwald?= =?utf-8?B?" + Buffer.from(", Jürgen").toString("base64") + "?="), "Grünwald, Jürgen");
  // Ohne MIME-Angaben bleibt ein Text, wie er ist (auch mit "Von:"-Zeile).
  assert.equal(decodeMail("Von: Anna Huber\nBetreff: Anfrage\n\nHallo!"), null);
});

test("HTML wird zu Text, Entities werden aufgelöst; lineare Laufzeit auch bei vielen spitzen Klammern", () => {
  const store = tempStore();
  assert.equal(
    kiSicht(store, "<p>Sehr geehrte Frau M&uuml;ller,</p><p>Gru&szlig;, J&uuml;rgen Gr&uuml;nwald<br>Tel.&nbsp;0512&nbsp;123456</p>"),
    "Sehr geehrte Frau [PERSON_1],\nGruß, [PERSON_2]\nTel. [TELEFON_1]",
  );
  assert.equal(htmlToText("<div>a &lt; b</div><script>alert(1)</script>c"), "a < b\nc");
  const t0 = performance.now();
  htmlToText("<p>" + "<".repeat(200_000) + "x");
  htmlToText("<p>" + "<a ".repeat(70_000));
  assert.ok(performance.now() - t0 < 1000, "htmlToText zu langsam");
});

// Review Claude 2 #3: geschützte Leerzeichen, zerlegte Umlaute, weiche Trennzeichen, Nullbreite, falscher Zeichensatz
test("Eingaben werden vereinheitlicht: Sonder-Leerzeichen, NFD, unsichtbare Zeichen; Ersatzzeichen werden abgelehnt", () => {
  const store = tempStore();
  const nbsp = "\u00A0";
  const schmal = "\u202F";
  const faelle: Array<[string, string]> = [
    [`Anfrage von Anna${nbsp}Huber für zwei Nächte.`, "Anfrage von [PERSON_1] für zwei Nächte."],
    [`Sehr geehrte Frau${nbsp}Gstrein,`, "Sehr geehrte Frau [PERSON_1],"],
    [`Telefon: 0664${nbsp}1234567`, "Telefon: [TELEFON_1]"],
    [`IBAN AT61${schmal}1904${schmal}3002${schmal}3457${schmal}3201`, "IBAN [IBAN_1]"],
    [`Adresse: Bergweg${nbsp}12, 6020${nbsp}Innsbruck`, "Adresse: [ADRESSE_1]"],
    ["Sehr geehrte Frau Mu\u0308ller,", "Sehr geehrte Frau [PERSON_1],"],
    ["Gast: Frau Hu\u00ADber-Lechner", "Gast: Frau [PERSON_1]"],
    ["Mail: anna.huber\u200B@example.com", "Mail: [EMAIL_1]"],
  ];
  for (const [text, erwartet] of faelle) assert.equal(kiSicht(store, text), erwartet, JSON.stringify(text));
  assert.equal(prepareDocument("Zeile\u2028zwei").text, "Zeile\nzwei");
  assert.throws(() => store.create({ art: "hotel", text: "Sehr geehrte Frau M\uFFFDller" }), /unlesbare Zeichen/);
});

test("Codierte Blöcke mit lesbarem Inhalt werden immer geschwärzt, zufällige Zeichenketten nicht", () => {
  const geheim = Buffer.from("ich bin Jürgen Müller, Telefon 0664 1234567, IBAN AT61 1904 3002 3457 3201").toString("base64");
  const view = pseudonymize("Inhalt:\n" + (geheim.match(/.{1,76}/g) ?? []).join("\n")).text;
  assert.equal(view, "Inhalt:\n[SONSTIGES_1: codierter Text]\n[SONSTIGES_2: codierter Text]");
  assert.equal(pseudonymize("Von: J=C3=BCrgen M=C3=BCller").text, "Von: [SONSTIGES_1: codierter Text] [SONSTIGES_2: codierter Text]");
  const zufall = "Bild iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg== Hash 3f2a9c4b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a Wort Donaudampfschifffahrtsgesellschaft";
  assert.equal(pseudonymize(zufall).text, zufall);
});
