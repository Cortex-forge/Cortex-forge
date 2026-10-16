import assert from "node:assert/strict";
import { test } from "node:test";
import { ibanIsValid } from "../core/detectors.js";
import { pseudonymize } from "../core/pseudonymize.js";

const ki = (text: string, options = {}) => pseudonymize(text, options).text;
const companies = [{ name: "Alpenblick Elektrotechnik GmbH", kategorie: "Elektroinstallateur" }];

/** Prüft, dass jeder der Werte vollständig aus der KI-Sicht verschwunden ist. */
function assertHidden(text: string, values: string[], options = {}) {
  const view = ki(text, options);
  for (const v of values) assert.ok(!view.includes(v), `"${v}" ist noch sichtbar in: ${view}`);
}

test("IBAN wird über die Prüfziffer erkannt", () => {
  assert.ok(ibanIsValid("AT61 1904 3002 3457 3201"));
  assert.ok(ibanIsValid("DE89 3704 0044 0532 0130 00"));
  assert.ok(!ibanIsValid("AT61 1904 3002 3457 3202"));
  assert.equal(ki("Konto AT61 1904 3002 3457 3201 (BIC: BKAUATWW)"), "Konto [IBAN_1] (BIC: BKAUATWW)");
  assert.equal(ki("IBAN:AT611904300234573201 BIC:BKAUATWW"), "IBAN:[IBAN_1] BIC:BKAUATWW");
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

// Review Claude #1 (Blocker), Codex #5
test("Telefonnummern nach „…nummer“, „Nr.“ und „unter der Nummer“", () => {
  const cases: Array<[string, string]> = [
    ["Meine Telefonnummer: 0664 1234567", "Meine Telefonnummer: [TELEFON_1]"],
    ["Handynummer 0664 1234567", "Handynummer [TELEFON_1]"],
    ["Mobilnummer: 0664 1234567", "Mobilnummer: [TELEFON_1]"],
    ["Faxnummer 0512 123456", "Faxnummer [TELEFON_1]"],
    ["Tel.-Nr.: 0512 123456", "Tel.-Nr.: [TELEFON_1]"],
    ["Sie erreichen mich unter der Nummer 0664 1234567.", "Sie erreichen mich unter der Nummer [TELEFON_1]."],
    ["Mobile number: +43 664 1234567", "Mobile number: [TELEFON_1]"],
    ["Telefonnummer: +43 5223 12345", "Telefonnummer: [TELEFON_1]"],
    ["Rufen Sie mich an: 0512 123456", "Rufen Sie mich an: [TELEFON_1]"],
    ["Il mio cellulare è 347 1234567.", "Il mio cellulare è [TELEFON_1]."],
    ["Call me: +1 (555) 123-4567", "Call me: [TELEFON_1]"],
    ["Kundenservice 0800 123 456", "Kundenservice [TELEFON_1]"],
    ["Kontakt: (0664) 1234567", "Kontakt: [TELEFON_1]"],
  ];
  for (const [input, expected] of cases) assert.equal(ki(input), expected, input);
});

test("Keine Telefonnummer: Rechnungs-, Buchungs- und Kundennummern bleiben stehen", () => {
  for (const text of [
    "Rechnungsnummer: 0042-2026 vom 05.10.2026",
    "Buchungsnummer: 4711081512",
    "Telefonrechnung Nr. 2026-0815",
    "Fattura n. 2026/0457 del 30/09/2026",
    "Rechnung 9 - 2026 - 033",
    "Zimmer 0123 4567 ist frei",
  ]) {
    assert.equal(ki(text), text);
  }
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
  assert.equal(ki("Cheers, James"), "Cheers, [PERSON_1]");
  assert.equal(ki("(ich glaube, er hieß Novak)"), "(ich glaube, er hieß [PERSON_1])");
});

// Review Claude #3
test("Namensformen: Nachname zuerst, Großbuchstaben, Tabellen, Geburtsname, Zusätze", () => {
  assert.equal(ki("Gast: Huber, Anna"), "Gast: [PERSON_1]");
  assert.equal(ki("Gast: Frau Huber Anna"), "Gast: Frau [PERSON_1]");
  assert.equal(ki("Mit freundlichen Grüßen\nHUBER Anna"), "Mit freundlichen Grüßen\n[PERSON_1]");
  assert.equal(ki("Mit freundlichen Grüßen\nANNA HUBER"), "Mit freundlichen Grüßen\n[PERSON_1]");
  assertHidden("Name;Vorname;Telefon\nHuber;Anna;0664 1234567\nGruber;Maria;0676 7654321", [
    "Huber",
    "Anna",
    "Gruber",
    "Maria",
    "1234567",
    "7654321",
  ]);
  assertHidden("Anmeldung: Maria Huber, geb. Gruber", ["Maria", "Huber", "Gruber"]);
  assert.equal(ki("Frau von der Leyen kommt am Montag."), "Frau [PERSON_1] kommt am Montag.");
  assertHidden("Wij zijn de familie van der Berg.\nMet vriendelijke groet,\nJohannes van der Berg", ["Berg", "Johannes"]);
  assertHidden("Anwesend: Gstrein, Kathrein, Auer (Architekt)\nGstrein schlägt vor, Kathrein prüft.", [
    "Gstrein",
    "Kathrein",
    "Auer",
  ]);
  assertHidden("Fahrer: Ömer Yılmaz, Kennzeichen IL-748 KM", ["Ömer", "Yılmaz", "748"]);
  assertHidden("hier ist die steffi vom tennisclub.\nrechnung an obmann gerhard lechner, danke.\nlg steffi", [
    "steffi",
    "gerhard",
    "lechner",
  ]);
  assertHidden("we are the Johnson family from Denver", ["Johnson"]);
});

// Review Codex #6
test("Namen mit Binnen-Großbuchstaben und Apostroph werden ganz ersetzt", () => {
  assert.equal(ki("Frau Anna McDonald"), "Frau [PERSON_1]");
  assert.equal(ki("Herr John O'Neill"), "Herr [PERSON_1]");
  assert.equal(ki("My name is James O'Neill."), "My name is [PERSON_1].");
});

// Review Claude #2 und Codex #7
test("Überschneidungen geben keine Zeichen frei", () => {
  assert.equal(ki("Anna Huber Bergweg 12, 6020 Innsbruck"), "[PERSON_1] [ADRESSE_1]");
  assert.equal(
    pseudonymize("Frau Anna Huber", { manual: [{ value: "Anna", type: "PERSON" }] }).text,
    "Frau [PERSON_1]",
  );
  assert.equal(
    pseudonymize("Frau Anna Huber", { manual: [{ value: "Anna", type: "SONSTIGES" }] }).text,
    "Frau [SONSTIGES_1] [PERSON_1]",
  );
  assert.equal(
    ki("Ansprechpartner Markus Leitner Alpenblick Elektrotechnik GmbH", { companies }),
    "Ansprechpartner [PERSON_1] [FIRMA_1: Elektroinstallateur]",
  );
});

test("Gleiche Person bekommt überall denselben Platzhalter", () => {
  assert.equal(
    ki("Anna Huber schreibt. Später: Frau Huber und Anna."),
    "[PERSON_1] schreibt. Später: Frau [PERSON_1] und [PERSON_1].",
  );
  assert.equal(ki("Bitte an Herrn Gruber. Gruber ruft zurück."), "Bitte an Herrn [PERSON_1]. [PERSON_1] ruft zurück.");
});

// Review Claude #15
test("Zusätze und Nachziehen machen keine Alltagswörter zu Namen", () => {
  assert.equal(
    ki("Ich will mit Thomas den Berg besteigen. Der Blick auf den Berg ist schön."),
    "Ich will mit [PERSON_1] den Berg besteigen. Der Blick auf den Berg ist schön.",
  );
  assert.equal(ki("Ich bespreche das mit Thomas zu Hause. Lena bleibt zu Hause."), "Ich bespreche das mit [PERSON_1] zu Hause. [PERSON_2] bleibt zu Hause.");
  assert.equal(
    ki("Anfrage von Thomas Koch.\nBitte gebt das an euren Koch weiter."),
    "Anfrage von [PERSON_1].\nBitte gebt das an euren Koch weiter.",
  );
  // Ausnahme gilt auch beim Nachziehen
  assert.equal(
    pseudonymize("Thomas Huber reist an. Unser Mitarbeiter Thomas holt ihn ab.", { excluded: ["Thomas"] }).text,
    "[PERSON_1] reist an. Unser Mitarbeiter Thomas holt ihn ab.",
  );
});

test("Adressen in DE, AT, IT, NL und EN", () => {
  assert.equal(ki("Bergweg 12, 6020 Innsbruck"), "[ADRESSE_1]");
  assert.equal(ki("Industriestraße 5, 6060 Hall in Tirol"), "[ADRESSE_1]");
  assert.equal(ki("Wohnhaft Maria-Theresien-Straße 18, A-6020 Innsbruck."), "Wohnhaft [ADRESSE_1].");
  assert.equal(ki("Via Roma 12, 39100 Bolzano"), "[ADRESSE_1]");
  assert.equal(ki("Via dei Mille 12/b, 39100 Bolzano"), "[ADRESSE_1]");
  assert.equal(ki("Keizersgracht 123, 1015 CJ Amsterdam"), "[ADRESSE_1]");
  assert.equal(ki("221 Baker Street, London"), "[ADRESSE_1], London");
  assert.equal(ki("1420 Pine Street, Denver, CO 80202, USA"), "[ADRESSE_1], USA");
  assert.equal(ki("Am Mühlbach 4 · 83022 Rosenheim"), "[ADRESSE_1]");
  assertHidden("sportplatzweg 3, 6370 kitzbühel", ["sportplatzweg", "6370", "kitzbühel"]);
});

// Review Claude #21
test("Zwei Adressen untereinander bleiben zwei Platzhalter", () => {
  assert.equal(ki("Industriestraße 5, 6060 Hall in Tirol\nDorfstraße 1, 6094 Axams"), "[ADRESSE_1]\n[ADRESSE_2]");
});

// Review Claude #9
test("Gesundheit und Religion (besondere Kategorien)", () => {
  assert.equal(ki("Lena hat eine schwere Nussallergie."), "[PERSON_1] hat [GESUNDHEIT_1].");
  assert.equal(
    ki("Mein Mann ist Diabetiker und wir essen halal. Unser Sohn ist allergisch gegen Gluten."),
    "Mein Mann ist [GESUNDHEIT_1] und wir essen [RELIGION_1]. Unser Sohn ist [GESUNDHEIT_2].",
  );
  assert.equal(
    ki("Mein Vater hatte eine Krebs-OP und ist sehbehindert, er braucht ein Hörgerät."),
    "Mein Vater hatte [GESUNDHEIT_1] und ist [GESUNDHEIT_2], er braucht [GESUNDHEIT_3].",
  );
  assert.equal(
    ki("Wir sind Muslime. Gibt es eine Moschee in der Nähe?"),
    "Wir sind [RELIGION_1]. Gibt es [RELIGION_2] in der Nähe?",
  );
  assertHidden("Krankenstand: 3 Tage (Grippe)", ["Krankenstand", "Grippe"]);
});

test("Keine Fehlalarme bei Wörtern, die Gesundheitswörter enthalten", () => {
  for (const text of [
    "Danke für die gute Kooperation.",
    "Die Rechnung liegt im Archiv.",
    "Dementsprechend buchen wir um.",
    "Auf der A12 gibt es Verkehrsbehinderungen.",
    "Die Fenster haben Jalousien gegen die Sonne.",
  ]) {
    assert.equal(ki(text), text);
  }
});

// Review Claude #10
test("Weitere Formate: Amex mit Prüfnummer, Geburtsdatum mit Schrägstrich, Umlaut-Domain, US-Telefon, Firma in Großbuchstaben", () => {
  assert.equal(ki("Kreditkarte: 3782 822463 10005, CVC 123"), "Kreditkarte: [KREDITKARTE_1], CVC [KREDITKARTE_2]");
  assert.equal(ki("DOB: 01/15/1980"), "DOB: [GEBURTSDATUM_1]");
  assert.equal(ki("Name: Petra Lindner, geb. am 3. März 1984"), "Name: [PERSON_1], geb. am [GEBURTSDATUM_1]");
  assert.equal(ki("Mail: anna.huber@müller-reisen.de"), "Mail: [EMAIL_1]");
  assert.equal(ki("+1 (555) 123-4567"), "[TELEFON_1]");
  assert.equal(ki("ALPENBLICK ELEKTROTECHNIK GMBH\nIndustriestraße 5", { companies }), "[FIRMA_1: Elektroinstallateur]\n[ADRESSE_1]");
  assert.equal(ki("Folgen Sie @bergliebe_tirol auf Insta"), "Folgen Sie [SONSTIGES_1: Social-Media-Konto] auf Insta");
});

// Review Claude #22
test("Keine Fehlalarme bei Beträgen, Daten, Nummern, Stockwerken und Jahreszahlen", () => {
  const unchanged = [
    "Der Preis beträgt 1500 Euro für 4 Personen.",
    "Parkplatz 3 ist reserviert, Spielplatz 5 Minuten entfernt.",
    "Max. Belegung 4 Personen. Anreise am 12. Jan. 2027.",
    "Rechnungsnummer: 0042-2026 vom 05.10.2026, Betrag 0,50 €",
    "Bestätigung\nDoppelzimmer\nFrühstück inklusive",
    "Fr. 12.02. Anreise, Sa. 13.02. Ausflug",
    "Summe netto 687,00 €, USt 20 % 137,40 €, Gesamt 824,40 €",
    "Leistungszeitraum: September 2026",
    "Liste:\n2027 Februar Anreise\n1203 Doppelzimmer frei",
    "Zimmer 12 im 2. OG, Lift vorhanden.",
    "Fußweg 5 Minuten zum Lift.",
    "Mit freundlichen Grüßen\nIhr Team vom Hotel Alpenrose",
  ];
  for (const text of unchanged) assert.equal(ki(text), text);
  // Absender ohne Person ("Booking Team"), Funktion statt Name in der Signatur
  assert.equal(ki("Von: Booking Team <reservations@example-booking.example>"), "Von: Booking Team <[EMAIL_1]>");
  assert.equal(
    ki("Mit freundlichen Grüßen\nMag. Daniel Strasser\nAssistenz der Geschäftsführung"),
    "Mit freundlichen Grüßen\nMag. [PERSON_1]\nAssistenz der Geschäftsführung",
  );
});

test("Firmenverzeichnis gibt der KI die Kategorie statt des Namens", () => {
  assert.equal(ki("Rechnung von Alpenblick Elektrotechnik GmbH", { companies }), "Rechnung von [FIRMA_1: Elektroinstallateur]");
  assert.equal(ki("Lieferant: Bäckerei Huber KG liefert morgen."), "Lieferant: [FIRMA_1] liefert morgen.");
  assert.equal(ki("Müller & Söhne OG\nInstallationen"), "[FIRMA_1]\nInstallationen");
  assert.equal(ki("Kunde: Gasthof Sonnhof, z. Hd. Herrn Peter Unterberger"), "Kunde: [FIRMA_1], z. Hd. Herrn [PERSON_1]");
});

// Review Claude #11
test("Manuelle Markierung: ohne Groß-/Kleinschreibung, Teilwort wird ganzes Wort, Ausnahme", () => {
  assert.equal(
    pseudonymize("Projekt Edelweiss läuft. EDELWEISS ist geheim.", { manual: [{ value: "Edelweiss", type: "SONSTIGES" }] }).text,
    "Projekt [SONSTIGES_1] läuft. [SONSTIGES_1] ist geheim.",
  );
  assert.equal(
    pseudonymize("Gast Hubertus kommt.", { manual: [{ value: "Hubert", type: "PERSON" }] }).text,
    "Gast [PERSON_1] kommt.",
  );
  assert.equal(pseudonymize("Grüße von Thomas", { excluded: ["Thomas"] }).text, "Grüße von Thomas");
});

// Review Codex #11
test("Platzhalter, die schon im Original stehen, kollidieren nicht mit neuen", () => {
  const r = pseudonymize("Vorlage [PERSON_1]. Frau Anna Huber.");
  assert.equal(r.text, "Vorlage [PERSON_1]. Frau [PERSON_2].");
  assert.deepEqual(r.literal, ["PERSON_1"]);
});

// Review Claude #16, Codex #9
test("Lange Eingaben ohne Treffer bleiben schnell (lineare Laufzeit)", () => {
  const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const inputs = {
    buchstaben: "x".repeat(200_000),
    grossbuchstaben: "A".repeat(200_000),
    trackingLink: "Link: https://t.example/c/" + Array.from({ length: 200_000 }, (_, i) => b64[(i * 7919) % 64]).join(""),
    leerzeichenNachSchluesselwort: "geb." + " ".repeat(200_000) + "x",
    bindestriche: "Aaa-".repeat(50_000),
    telefonnummern: "x 0123456 ".repeat(20_000),
    tabelle: ["Vorname;Nachname;Telefon"].concat(Array.from({ length: 5000 }, (_, i) => `Anna;Huber${i};0664 ${1000000 + i}`)).join("\n"),
  };
  for (const [name, text] of Object.entries(inputs)) {
    const t0 = performance.now();
    pseudonymize(text);
    const ms = performance.now() - t0;
    assert.ok(ms < 3000, `${name}: ${Math.round(ms)} ms`);
  }
});
