import assert from "node:assert/strict";
import { test } from "node:test";
import { ibanIsValid } from "../core/detectors.js";
import { pseudonymize } from "../core/pseudonymize.js";

const ki = (text: string) => pseudonymize(text).text;

test("IBAN wird über die Prüfziffer erkannt", () => {
  assert.ok(ibanIsValid("AT61 1904 3002 3457 3201"));
  assert.ok(ibanIsValid("DE89 3704 0044 0532 0130 00"));
  assert.ok(!ibanIsValid("AT61 1904 3002 3457 3202"));
  assert.equal(ki("Konto AT61 1904 3002 3457 3201 (BIC: BKAUATWW)"), "Konto [IBAN_1] (BIC: BKAUATWW)");
});

test("Kontaktdaten und Kennnummern", () => {
  assert.equal(ki("Mail: anna@example.com"), "Mail: [EMAIL_1]");
  assert.equal(ki("Erreichbar bin ich unter 0664 1234567."), "Erreichbar bin ich unter [TELEFON_1].");
  assert.equal(ki("Tel.: +43 5223 12345"), "Tel.: [TELEFON_1]");
  assert.equal(ki("UID: ATU12345678"), "UID: [UID_1]");
  assert.equal(ki("Steuernummer 12 345/6789"), "Steuernummer [STEUERNR_1]");
  assert.equal(ki("Kreditkarte 4111 1111 1111 1111 gültig bis 12/28"), "Kreditkarte [KREDITKARTE_1] gültig bis 12/28");
  assert.equal(
    ki("Bitte SV-Nr. 1234 010180 und Reisepass P1234567 notieren. Geb. 01.01.1980."),
    "Bitte SV-Nr. [SVNR_1] und Reisepass [AUSWEIS_1] notieren. Geb. [GEBURTSDATUM_1].",
  );
  assert.equal(ki("Kundennummer: K-4711"), "Kundennummer: [KUNDENNR_1]");
  assert.equal(ki("Wir kommen mit dem Auto (Kennzeichen: I-123AB)."), "Wir kommen mit dem Auto (Kennzeichen: [KENNZEICHEN_1]).");
});

test("Namen über Anrede, Vorstellung, Vornamen und Signatur", () => {
  assert.equal(
    ki("Herr Dr. Max Müller und Frau Mag. Sabine Müller-Berger kommen am Montag."),
    "Herr Dr. [PERSON_1] und Frau Mag. [PERSON_2] kommen am Montag.",
  );
  assert.equal(ki("mein Name ist Huber und ich frage an."), "mein Name ist [PERSON_1] und ich frage an.");
  assert.equal(ki("Ich bin Ärztin und reise allein."), "Ich bin Ärztin und reise allein.");
  assert.equal(ki("my name is John Smith and I would like to book."), "my name is [PERSON_1] and I would like to book.");
  assert.equal(ki("Liebe Grüße\nKatarina Novak\n"), "Liebe Grüße\n[PERSON_1]\n");
  assert.equal(ki("Von: Anna Huber <anna@example.com>"), "Von: [PERSON_1] <[EMAIL_1]>");
});

test("Gleiche Person bekommt überall denselben Platzhalter", () => {
  assert.equal(
    ki("Anna Huber schreibt. Später: Frau Huber und Anna."),
    "[PERSON_1] schreibt. Später: Frau [PERSON_1] und [PERSON_1].",
  );
});

test("Adressen in DE, IT und EN", () => {
  assert.equal(ki("Bergweg 12, 6020 Innsbruck"), "[ADRESSE_1]");
  assert.equal(ki("Industriestraße 5, 6060 Hall in Tirol"), "[ADRESSE_1]");
  assert.equal(ki("Wohnhaft Maria-Theresien-Straße 18, A-6020 Innsbruck."), "Wohnhaft [ADRESSE_1].");
  assert.equal(ki("Via Roma 12, 39100 Bolzano"), "[ADRESSE_1]");
  assert.equal(ki("221 Baker Street, London"), "[ADRESSE_1], London");
});

test("Gesundheit und Religion (besondere Kategorien)", () => {
  assert.equal(ki("Lena hat eine schwere Nussallergie."), "[PERSON_1] hat [GESUNDHEIT_1].");
  assert.equal(
    ki("Mein Mann ist Diabetiker und wir essen halal. Unser Sohn ist allergisch gegen Gluten."),
    "Mein Mann ist [GESUNDHEIT_1] und wir essen [RELIGION_1]. Unser Sohn ist [GESUNDHEIT_2].",
  );
});

test("Keine Fehlalarme bei Beträgen, Daten und Nummern", () => {
  const unchanged = [
    "Der Preis beträgt 1500 Euro für 4 Personen.",
    "Parkplatz 3 ist reserviert, Spielplatz 5 Minuten entfernt.",
    "Max. Belegung 4 Personen. Anreise am 12. Jan. 2027.",
    "Rechnungsnummer: 0042-2026 vom 05.10.2026, Betrag 0,50 €",
    "Bestätigung\nDoppelzimmer\nFrühstück inklusive",
    "Fr. 12.02. Anreise, Sa. 13.02. Ausflug",
    "Summe netto 687,00 €, USt 20 % 137,40 €, Gesamt 824,40 €",
    "Leistungszeitraum: September 2026",
  ];
  for (const text of unchanged) assert.equal(ki(text), text);
});

test("Firmenverzeichnis gibt der KI die Kategorie statt des Namens", () => {
  const r = pseudonymize("Rechnung von Alpenblick Elektrotechnik GmbH", {
    companies: [{ name: "Alpenblick Elektrotechnik GmbH", kategorie: "Elektroinstallateur" }],
  });
  assert.equal(r.text, "Rechnung von [FIRMA_1: Elektroinstallateur]");
  assert.equal(ki("Lieferant: Bäckerei Huber KG liefert morgen."), "Lieferant: [FIRMA_1] liefert morgen.");
});

test("Manuelle Markierung und Ausnahme", () => {
  assert.equal(
    pseudonymize("Projekt Edelweiss läuft.", { manual: [{ value: "Edelweiss", type: "SONSTIGES" }] }).text,
    "Projekt [SONSTIGES_1] läuft.",
  );
  assert.equal(pseudonymize("Grüße von Thomas", { excluded: ["Thomas"] }).text, "Grüße von Thomas");
});
