import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPhones, ibanIsValid, manualMatches, manualSpans } from "../core/detectors.js";
import { pseudonymize } from "../core/pseudonymize.js";
import { reidentify } from "../core/reidentify.js";

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
  assert.equal(ki("Kreditkarte 4111 1111 1111 1111 gültig bis 12/28"), "Kreditkarte [KREDITKARTE_1] gültig bis [SONSTIGES_1: Ablaufdatum]");
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

test("Gleiche Person bekommt überall denselben Platzhalter; ein Vorname allein bekommt einen eigenen", () => {
  assert.equal(ki("Bitte an Herrn Gruber. Gruber ruft zurück."), "Bitte an Herrn [PERSON_1]. [PERSON_1] ruft zurück.");
  // Review Claude 2 #9: Ein Vorname allein kann eine andere Person sein. Er bekommt einen eigenen Platzhalter, und
  // zurückübersetzt wird genau dieser Vorname, nie der volle Name einer anderen Person.
  // Review Claude 3 #16: Auch "Frau Huber" bekommt einen eigenen Platzhalter, wenn "Anna Huber" nie mit "Frau" stand
  // (es kann der Ehepartner sein). Mit derselben Anrede ist es dieselbe Person.
  const r = pseudonymize("Anna Huber schreibt. Später: Frau Huber und Anna.");
  assert.equal(r.text, "[PERSON_1] schreibt. Später: Frau [PERSON_2] und [PERSON_3].");
  assert.deepEqual(r.mapping.map((m) => m.original), ["Anna Huber", "Huber", "Anna"]);
  assert.equal(ki("Frau Anna Huber schreibt. Später: Frau Huber."), "Frau [PERSON_1] schreibt. Später: Frau [PERSON_1].");
  const t = pseudonymize("Unser Sohn Thomas (8) kommt mit. Ihr Ansprechpartner im Hotel ist Thomas Müller.");
  assert.equal(t.text, "Unser Sohn [PERSON_1] (8) kommt mit. Ihr Ansprechpartner im Hotel ist [PERSON_2].");
  assert.equal(reidentify("Für [PERSON_1] stellen wir ein Kinderbett bereit.", t.mapping).text, "Für Thomas stellen wir ein Kinderbett bereit.");
  // Kurze Nachnamen werden nachgezogen, kurze Allerweltswörter nicht.
  assert.equal(ki("Herr Wu reist an. Wu möchte ein ruhiges Zimmer."), "Herr [PERSON_1] reist an. [PERSON_1] möchte ein ruhiges Zimmer.");
  assert.equal(ki("Frau So kommt am Montag. So wird es gemacht."), "Frau [PERSON_1] kommt am Montag. So wird es gemacht.");
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
    tabelleMitAnfuehrungszeichen: "Name,Kommentar\n" + '"Huber, Anna","'.repeat(20_000),
    vieleNamen: Array.from({ length: 5000 }, (_, i) => `Frau Anna Huber${i} und HUBER${i}.`).join(" "),
    // Review Claude 4 #12: eine Kette von Vornamen ohne Satzzeichen
    vornamenKette: "Anna Lena Paul Maria ".repeat(10_000),
  };
  for (const [name, text] of Object.entries(inputs)) {
    const t0 = performance.now();
    pseudonymize(text);
    const ms = performance.now() - t0;
    assert.ok(ms < 3000, `${name}: ${Math.round(ms)} ms`);
  }
});

// Review Codex 2 #5: CSV mit Anführungszeichen
test("CSV: Trennzeichen und Zeilenumbrüche in Anführungszeichen verschieben keine Spalten", () => {
  assert.equal(ki('Kommentar,Telefon\n"spät, abends",5551234567'), 'Kommentar,Telefon\n"spät, abends",[TELEFON_1]');
  assert.equal(ki('Name,Kommentar\n"Xylander, Zorwin",Ankunft'), 'Name,Kommentar\n"[PERSON_1]",Ankunft');
  assert.equal(ki('Name;Adresse\n"Anna Huber";"Hauptstraße 5\n6020 Innsbruck"\n'), 'Name;Adresse\n"[PERSON_1]";"[ADRESSE_1]"\n');
  assert.equal(ki('Name;Telefon\n"Anna ""Ani"" Huber";0664 1234567'), 'Name;Telefon\n"[PERSON_1]";[TELEFON_1]');
  // Komma ohne Anführungszeichen: Die Spalten sind unsicher, also werden alle in Frage kommenden geschützt.
  assertHidden("Name,Kommentar,Telefon\nHuber, Zorwin,spät,5551234567", ["Huber", "Zorwin", "5551234567"]);
  // Kein Abschluss: Das Anführungszeichen gilt als normales Zeichen, die Zeile bleibt eine Zeile.
  assertHidden('Name;Telefon\n"Zorwin Xylander;5551234567\nDanke!', ["Zorwin", "5551234567"]);
  assert.ok(ki('Name;Telefon\n"Zorwin Xylander;5551234567\nDanke!').endsWith("\nDanke!"));
  // Text mit Kommas ist keine Tabelle.
  assert.equal(ki("Kommentar, bitte bis Montag, danke.\nAlles gut."), "Kommentar, bitte bis Montag, danke.\nAlles gut.");
});

// Review Codex 2 #6: Wiederholungen in anderer Schreibweise
test("Namen werden auch in anderer Groß-/Kleinschreibung nachgezogen, Alltagswörter nicht", () => {
  assert.equal(ki("Frau ANNA HUBER reist an; reserviert auf Huber."), "Frau [PERSON_1] reist an; reserviert auf [PERSON_1].");
  assert.equal(ki("Anna Huber kommt. Später: huber zahlt."), "[PERSON_1] kommt. Später: [PERSON_1] zahlt.");
  assert.equal(ki("Grüße, Anna Huber. PS: HUBER steht auf der Klingel."), "Grüße, [PERSON_1]. PS: [PERSON_1] steht auf der Klingel.");
  // Gegenproben: kleingeschriebene Alltagswörter bleiben stehen
  assert.equal(ki("Peter Klein bucht. Es wird ein klein wenig später."), "[PERSON_1] bucht. Es wird ein klein wenig später.");
  assert.equal(ki("Thanks, Grace Park. Parking is in the park behind the hotel."), "Thanks, [PERSON_1]. Parking is in the park behind the hotel.");
  assert.equal(ki("Mit freundlichen Grüßen\nMark Huber\n\nPS: please mark the date."), "Mit freundlichen Grüßen\n[PERSON_1]\n\nPS: please mark the date.");
});

// Review Codex 2 #7 und #8: ausgewählte Stelle immer schwärzen, lineare Laufzeit
test("Manuelle Markierung: ausgewählte Stelle wird immer geschwärzt; Suche in linearer Zeit", () => {
  const text = "Code ZORWIN und ZORWINBETA.";
  const inWord = text.indexOf("ZORWINBETA");
  assert.deepEqual(manualMatches(text, "ZORWIN"), [[5, 11]]);
  const spans = manualSpans(text, { value: "ZORWIN", type: "SONSTIGES", stellen: [[inWord, inWord + 6]] });
  assert.deepEqual(spans, [[5, 11], [inWord, inWord + 10]]);
  assert.equal(
    ki(text, { manual: [{ value: "ZORWIN", type: "SONSTIGES", stellen: [[inWord, inWord + 6]] }] }),
    "Code [SONSTIGES_1] und [SONSTIGES_2].",
  );
  for (const n of [50_000, 200_000]) {
    const t0 = performance.now();
    assert.deepEqual(manualMatches("q".repeat(n), "qq"), [[0, n]]);
    assert.ok(performance.now() - t0 < 500, `manualMatches bei ${n} Zeichen zu langsam`);
  }
});

// Review Claude 2 #4: häufige Schreibweisen außerhalb des Entwicklungssets
test("Telefon, IBAN, Geburtsdatum, SV-Nummer und Namen in weiteren üblichen Schreibweisen", () => {
  assert.equal(ki("Meine Nummer ist 0512 123456, bitte zurückrufen."), "Meine Nummer ist [TELEFON_1], bitte zurückrufen.");
  assert.equal(ki("Wir sind tagsüber im Büro: 089/12345678"), "Wir sind tagsüber im Büro: [TELEFON_1]");
  assert.equal(ki("Il mio numero è 333 4567890."), "Il mio numero è [TELEFON_1].");
  assert.equal(ki("Konto: de89 3704 0044 0532 0130 00"), "Konto: [IBAN_1]");
  assert.equal(ki("IBAN: AT61 1904 3002\n3457 3201"), "IBAN: [IBAN_1]");
  assert.equal(ki("IBAN AT61-1904-3002-3457-3201"), "IBAN [IBAN_1]");
  assert.equal(ki("Geburtstag: 12.03.1985"), "Geburtstag: [GEBURTSDATUM_1]");
  assert.equal(ki("Anna Huber, *12.03.1985"), "[PERSON_1], *[GEBURTSDATUM_1]");
  assert.equal(ki("Versicherungsnr 1234 010180"), "Versicherungsnr [SVNR_1]");
  assert.equal(ki("Reservierung: HUBER, 2 Personen"), "Reservierung: [PERSON_1], 2 Personen");
  assert.equal(ki("Gast: Anna Huber. Später: huber hat angerufen."), "Gast: [PERSON_1]. Später: [PERSON_1] hat angerufen.");
  assert.equal(ki("Mühlau 12, 6020 Innsbruck"), "[ADRESSE_1]");
  // Gegenproben
  for (const text of [
    "Rechnung Nr. 0815 4711 vom 3.4.",
    "Zimmer Nr. 012 3456",
    "Bestellnummer 0123 456789",
    "Telefonrechnung 0512 123456 bezahlt",
    "Wir feiern den 50. Geburtstag am 12.03.2027.",
    "Reservierung: Doppelzimmer für 2",
    "Zimmer 12, Lift 2, ISO 9001",
  ]) {
    assert.equal(ki(text), text);
  }
  assert.equal(ki("St.-Nr. 81 234/5678"), "St.-Nr. [STEUERNR_1]");
});

// Review Claude 2 #8: Namenszusätze
test("Nach „vom“, „von der“ oder „von“ folgt nicht immer ein Nachname", () => {
  assert.equal(ki("i bin der Ferdinand vom Skiclub"), "i bin der [PERSON_1] vom Skiclub");
  assert.equal(ki("Maria von Booking.com hat geschrieben"), "[PERSON_1] von Booking.com hat geschrieben");
  assert.equal(ki("Thomas von der Rezeption ruft zurück"), "[PERSON_1] von der Rezeption ruft zurück");
  assert.equal(ki("Sehr geehrte Frau von der Leyen,"), "Sehr geehrte Frau [PERSON_1],");
  assert.equal(ki("Ursula von der Leyen kommt."), "[PERSON_1] kommt.");
  assert.equal(ki("Grüße, Jan van den Berg"), "Grüße, [PERSON_1]");
});

// Review Claude 2 #6 und #16
test("Platzhalter-Muster bleibt linear; Abkürzungen mit Zahl gelten nicht als Platzhalter-Rest", () => {
  const mapping = [{ id: "PERSON_1", type: "PERSON" as const, original: "Anna Huber", variants: ["Anna Huber"] }];
  const t = "[PERSON" + " ".repeat(199_990) + "x";
  const t0 = performance.now();
  pseudonymize(t);
  reidentify(t, mapping);
  assert.ok(performance.now() - t0 < 1000, "Platzhalter-Muster zu langsam");
  assert.deepEqual(
    reidentify("Preis EUR 450, ISO 9001, COVID-19, LIFT 2, IMG_1234, [NAME_1], PERSON 1, PERSN_1, [KUNDE 2], [PERSON_1 fehlt", mapping).leftovers,
    ["[NAME_1]", "PERSON 1", "PERSN_1", "[KUNDE 2]", "[PERSON_1"],
  );
});

// ---------------------------------------------------------------------------
// Dritte Prüfrunde (Codex 3)

// Review Codex 3 #4
test("CSV: leere Spalten am Zeilenende, kürzere und ungewöhnliche Zeilen beenden die Tabelle nicht", () => {
  assert.equal(
    ki("Name;Telefon;Kommentar;Ankunft\nZorwin;5551234567;;\nZarwan;5557654321;;"),
    "Name;Telefon;Kommentar;Ankunft\n[PERSON_1];[TELEFON_1];;\n[PERSON_2];[TELEFON_2];;",
  );
  assertHidden("Name;Telefon;Kommentar\nZorwin;5551234567\nZarwan;5557654321;spät", ["Zorwin", "5551234567", "Zarwan", "5557654321"]);
  assertHidden("Name,Telefon\nZorwin,5551234567\na,b,c,d,e,f,g,h\nZarwan,5557654321", ["Zorwin", "5551234567", "Zarwan", "5557654321"]);
  // Gegenproben: Eine Zeile ohne Trennzeichen beendet die Tabelle, leere Kommentarspalten erzeugen keine Funde.
  assert.equal(ki("Name;Telefon;Kommentar\nZorwin;5551234567;;\nDanke, bis bald!"), "Name;Telefon;Kommentar\n[PERSON_1];[TELEFON_1];;\nDanke, bis bald!");
});

// Review Codex 3 #5
test("Nachnamen, die auch Hauptwörter sind: nach Vornamen und in Nachnamen-Feldern geschützt", () => {
  assert.equal(ki("Name: Anna\nNachname: Berg"), "Name: [PERSON_1]\nNachname: [PERSON_2]");
  assert.equal(ki("Sehr geehrte Frau Maria Sommer,"), "Sehr geehrte Frau [PERSON_1],");
  assert.equal(ki("Maria Sommer kommt. Im Sommer wandern wir auf den Berg."), "[PERSON_1] kommt. Im Sommer wandern wir auf den Berg.");
  assert.equal(ki("Familienname: WINTER"), "Familienname: [PERSON_1]");
  assert.equal(ki("Last name: Berg\nFirst name: Anna"), "Last name: [PERSON_1]\nFirst name: [PERSON_2]");
  assert.equal(ki("Achternaam: Visser"), "Achternaam: [PERSON_1]");
  assert.equal(ki("Gast: Winter"), "Gast: [PERSON_1]");
  // Gegenproben
  for (const text of ["Im Sommer wandern wir auf den Berg.", "Reservierung: Sommer 2027", "Surname: please fill in"]) assert.equal(ki(text), text);
  assert.equal(ki("Für Anna Frühstück aufs Zimmer."), "Für [PERSON_1] Frühstück aufs Zimmer.");
});

// Review Codex 3 #8
test("Kundennummern, die sich nur in Bindestrich oder Punkt unterscheiden, bleiben getrennt", () => {
  const r = pseudonymize("Kundennummer: A-123\nKundennummer: A123\nKundennummer: A-123");
  assert.equal(r.text, "Kundennummer: [KUNDENNR_1]\nKundennummer: [KUNDENNR_2]\nKundennummer: [KUNDENNR_1]");
  assert.equal(reidentify("[KUNDENNR_1] und [KUNDENNR_2]", r.mapping).text, "A-123 und A123");
  // Formatierte Nummern mit fester Form werden weiter zusammengeführt.
  assert.equal(ki("IBAN AT61 1904 3002 3457 3201, also AT611904300234573201"), "IBAN [IBAN_1], also [IBAN_1]");
});

// ---------------------------------------------------------------------------
// Dritte Claude-Prüfung und freigegebenes Prüfset 1

// Review Claude 3 #2, #3, #4
test("Doppelvornamen, Initialen und Nachnamen, die auch Hauptwörter sind", () => {
  assert.equal(ki("Anreise: Karl-Heinz Gruber mit Tochter Anna-Lena am 12. Mai."), "Anreise: [PERSON_1] mit Tochter [PERSON_2] am 12. Mai.");
  assert.equal(ki("Hallo, ich bin Anna-Lena und frage für meine Eltern an."), "Hallo, ich bin [PERSON_1] und frage für meine Eltern an.");
  assert.equal(ki("Sehr geehrte Frau A. Moosbrugger, danke für Ihre Nachricht."), "Sehr geehrte Frau [PERSON_1], danke für Ihre Nachricht.");
  assert.equal(ki("z. Hd. Herrn Dr. M. Leitgeb, Buchhaltung"), "z. Hd. Herrn Dr. [PERSON_1], Buchhaltung");
  assert.equal(ki("Mit freundlichen Grüßen\nM. Leitgeb"), "Mit freundlichen Grüßen\n[PERSON_1]");
  assert.equal(ki("t.a.v. de heer K. Dijkstra"), "t.a.v. de heer [PERSON_1]");
  assert.equal(ki("Thomas Keller bucht für 3 Nächte."), "[PERSON_1] bucht für 3 Nächte.");
  assert.equal(ki("Jelena M. hat Frühdienst."), "[PERSON_1] hat Frühdienst.");
  // Gegenproben
  for (const text of [
    "Wir fahren nach Baden-Baden und ins Rhein-Main-Gebiet.",
    "Fr. Anreise am Montag. Hr. Nr. 5 ruft an. S. 12 im Katalog.",
    "Wir kommen im Winter und gehen in den Keller.",
    "Attn. Accounts Payable",
  ]) {
    assert.equal(ki(text), text);
  }
});

// Review Claude 3 #10 (Anreden), Prüfset 1 (Verwandte, Chats, Reihenfolge Familienname zuerst, Tabellen mit Strichen)
test("Namen nach Verwandten, in Chats, nach Anreden in anderen Sprachen und in Tabellen mit senkrechten Strichen", () => {
  assert.equal(ki("My wife Noura needs a quiet room. Our daughter Lily is 6."), "My wife [PERSON_1] needs a quiet room. Our daughter [PERSON_2] is 6.");
  assert.equal(ki("Onze dochter Fenna (8) komt mee."), "Onze dochter [PERSON_1] (8) komt mee.");
  assert.equal(ki("hallo frau moosbrugger, passt das für euch?"), "hallo frau [PERSON_1], passt das für euch?");
  assert.equal(ki("Gentile signora Hechenblaikner, ecco i dati."), "Gentile signora [PERSON_1], ecco i dati.");
  assert.equal(ki("Herr Professor von Hagenberg kommt."), "Herr Professor [PERSON_1] kommt.");
  assert.equal(
    ki("[16.10.26, 08:12] Wang Lei: Good morning!\n[16.10.26, 08:13] Hotel Alpenrose Rezeption: Guten Morgen!"),
    "[16.10.26, 08:12] [PERSON_1]: Good morning!\n[16.10.26, 08:13] Hotel Alpenrose Rezeption: Guten Morgen!",
  );
  assert.equal(ki("[Mo 06:47] Sepp (Unterwegerhof): passt"), "[Mo 06:47] [PERSON_1] ([FIRMA_1]): passt");
  assert.equal(ki("My wife is Chen Xiaoyu."), "My wife is [PERSON_1].");
  assert.equal(
    ki("Name        | Mo   | Di\n------------|------|-----\nKowalski    | U    | U\nAushilfe    | –    | S"),
    "Name        | Mo   | Di\n------------|------|-----\n[PERSON_1]    | U    | U\nAushilfe    | –    | S",
  );
  // Gegenproben
  for (const text of [
    "die frau kommt morgen, meine frau hat urlaub",
    "Mia moglie è incinta.",
    "We fly via Hong Kong.",
    "Herr Professor hat angerufen.",
  ]) {
    assert.equal(ki(text).replace(/\[GESUNDHEIT_1\]/, "incinta"), text);
  }
});

// Review Claude 3 #9, #10, #14 und freigegebenes Prüfset 1: Kennungen, Telefon, Adressen, Firmen
test("Ausweis-, Register- und Kontonummern, Steuernummern, Kennzeichen, Konten in Messengern", () => {
  assert.equal(ki("Reisepass Nr. EA 4417302, ausgestellt in Krakau"), "Reisepass Nr. [AUSWEIS_1], ausgestellt in Krakau");
  assert.equal(ki("my passport number is EJ5582731"), "my passport number is [AUSWEIS_1]");
  assert.equal(ki("Carta d'identità n. CA48211XK"), "Carta d'identità n. [AUSWEIS_1]");
  assert.equal(ki("Führerscheinnummer: 12345678"), "Führerscheinnummer: [AUSWEIS_1]");
  assert.equal(ki("Nr;Name;Ausweis-Nr.\n1;Kaya;U 18837342"), "Nr;Name;Ausweis-Nr.\n1;[PERSON_1];[AUSWEIS_1]");
  assert.equal(ki("codice fiscale ZNTFNC88D52A952W"), "codice fiscale [STEUERNR_1]");
  assert.equal(ki("USt-IdNr. DE 287 401 935 · VAT Reg. No. GB 284 7193 56"), "USt-IdNr. [UID_1] · VAT Reg. No. [UID_2]");
  assert.equal(ki("FN 418237 m · Amtsgericht Köln HRB 98417"), "[SONSTIGES_1: Registernummer] · Amtsgericht Köln [SONSTIGES_2: Registernummer]");
  assert.equal(ki("Company No. 09817342"), "Company No. [SONSTIGES_1: Register- oder Kontonummer]");
  assert.equal(ki("Unsere Nummerntafel: IL-748KM. Kennzeichen des Busses: K-AT 4417."), "Unsere Nummerntafel: [KENNZEICHEN_1]. Kennzeichen des Busses: [KENNZEICHEN_2].");
  assert.equal(ki("met kenteken GZ-418-T"), "met kenteken [KENNZEICHEN_1]");
  assert.equal(ki("WeChat: wanglei_sh88"), "WeChat: [SONSTIGES_1: Messenger-Konto]");
  assert.equal(ki("Profil: https://www.linkedin.com/in/anna-moosbrugger-4711"), "Profil: [SONSTIGES_1: Profil-Link]");
  assert.equal(ki("Mail: anna.moosbrugger(at)example.com"), "Mail: [EMAIL_1]");
  assert.equal(ki("Rentenversicherungsnummer: 12 010180 A 123"), "Rentenversicherungsnummer: [SVNR_1]");
  assert.equal(ki("Stammgast-Nr. SG-2291"), "Stammgast-Nr. [KUNDENNR_1]");
  assert.equal(ki("bin am 7. Juli 1997 in Tuzla geboren"), "bin am [GEBURTSDATUM_1] in Tuzla geboren");
  assert.equal(ki("Nato a Trento il 14/07/1995"), "Nato a Trento il [GEBURTSDATUM_1]");
  // Gegenproben
  for (const text of ["Der Pass ist bis 2029 gültig.", "Rechnung Nr. 2026-0815", "Passwort ändern", "Gültig bis 31.12.2027"]) {
    assert.equal(ki(text), text);
  }
});

test("Telefonnummern mit Schrägstrich, Punkten, Paaren, ohne Ländervorwahl, in Links; lange Ziffernfolgen bleiben schnell", () => {
  assert.equal(ki("Meine Telefonnummer: 0664 / 312 87 40"), "Meine Telefonnummer: [TELEFON_1]");
  assert.equal(ki("oder mobil 0172 / 448 19 02."), "oder mobil [TELEFON_1].");
  assert.equal(ki("Tel. 05212 / 4 77 31"), "Tel. [TELEFON_1]");
  assert.equal(ki("Handy 0664.123.4567"), "Handy [TELEFON_1]");
  assert.equal(ki("Privat: 0512 12 34 56, ab 18 Uhr."), "Privat: [TELEFON_1], ab 18 Uhr.");
  assert.equal(ki("Potete chiamarmi al 347 821 0936 dopo le 18"), "Potete chiamarmi al [TELEFON_1] dopo le 18");
  assert.equal(ki("Bei Fragen: Lorenz Pichler, 348 902 1137"), "Bei Fragen: [PERSON_1], [TELEFON_1]");
  assert.equal(ki("Rückruf unter 0036 30 418 2275 (= 06 30 418 2275)"), "Rückruf unter [TELEFON_1] (= [TELEFON_2])");
  assert.equal(ki("accounts@moorland.example · +44 113 496 0712"), "[EMAIL_1] · [TELEFON_1]");
  assert.equal(ki("Schreib mir auf https://wa.me/436641234567"), "Schreib mir auf https://wa.me/[TELEFON_1]");
  // Gegenproben: Daten und Beträge
  for (const text of ["Geburtstag am 01.09.1953 gefeiert", "Betrag 1.234.567 EUR", "Zimmer 12, 3 Nächte"]) assert.equal(ki(text).includes("TELEFON"), false, text);
  const lang = Array.from({ length: 4700 }, () => "00" + "1234567890".repeat(4)).join(" ");
  const t0 = performance.now();
  pseudonymize(lang);
  assert.ok(performance.now() - t0 < 1500, `zu langsam: ${Math.round(performance.now() - t0)} ms`);
});

test("Adressen aus Großbritannien, Irland, den Niederlanden, Polen und Italien; Gewerbegebiete", () => {
  // Straße und Ort, die direkt aufeinander folgen, werden zu einer Adresse zusammengefasst.
  for (const text of [
    "Flat 3, 41 Wellington Road, Harrow HA1 4LP",
    "12A High Street, Oxford OX1 4AB",
    "14 Ashgrove Terrace, Dublin 6, D06 K2P7",
    "2140 N. Lincoln Park West, Apt 9C",
    "Kromme Nieuwegracht 52",
    "Gewerbezone 12\n6460 Imst",
  ]) {
    assert.equal(ki(text), "[ADRESSE_1]", text);
  }
  assert.equal(ki("Dat is Prinsengracht 7-II, 1015 DK Amsterdam."), "Dat is [ADRESSE_1].");
  assert.equal(ki("Wohnadresse: ul. Długa 17 m. 4, 31-147 Kraków, Polen"), "Wohnadresse: [ADRESSE_1], Polen");
  assert.equal(ki("Via del Lago 6 – 38027 Malè (TN)"), "[ADRESSE_1] – [ADRESSE_2]");
  assert.equal(ki("Handwerkerzone Nord 4 / Zona artigianale Nord 4\n39042 Brixen/Bressanone (BZ)"), "[ADRESSE_1] / [ADRESSE_2]");
  // Gegenproben
  for (const text of ["Weihnachtsmarkt 2026 am Hauptplatz", "Supermarkt 5 Minuten entfernt", "Kurzparkzone 2 Stunden"]) {
    assert.equal(ki(text), text);
  }
});

test("Firmen mit kleingeschriebener oder großgeschriebener Rechtsform und Verbindungswörtern", () => {
  assert.equal(ki("MOORLAND TEXTILES LTD\nRechnung"), "[FIRMA_1]\nRechnung");
  assert.equal(ki("CASEIFICIO MORESCHINI di Moreschini Luca & C. s.n.c.\nVia del Lago 6"), "[FIRMA_1]\n[ADRESSE_1]");
  assert.equal(ki("Enoteca Pichler s.a.s. liefert"), "[FIRMA_1] liefert");
  assert.equal(ki("An: Kanzlei Kreuzer-Eberharter\nBetreff: Aufenthalt"), "An: [FIRMA_1]\nBetreff: Aufenthalt");
});

// Review Claude 3 #5
test("CSV: Leerzeile mitten in der Tabelle und Spaltenköpfe mit Nummer", () => {
  assert.equal(
    ki("Nachname;Vorname;Telefon;E-Mail\nGstrein;Florian;;\nKathrein;Valentina;0512 562837;v.kathrein@example.com\n\nAuer;Quirin;0512 667788;"),
    "Nachname;Vorname;Telefon;E-Mail\n[PERSON_1];[PERSON_2];;\n[PERSON_3];[PERSON_4];[TELEFON_1];[EMAIL_1]\n\n[PERSON_5];[PERSON_6];[TELEFON_2];",
  );
  assert.equal(ki("Name;Tel. 1\nKathrein;0512 562837"), "Name;Tel. 1\n[PERSON_1];[TELEFON_1]");
  // Gegenprobe: Nach der Leerzeile folgt Text, keine Tabellenzeile.
  assert.equal(ki("Name;Telefon\nKathrein;0512 562837\n\nDanke für alles!"), "Name;Telefon\n[PERSON_1];[TELEFON_1]\n\nDanke für alles!");
});

// Review Claude 3 #6
test("Krebs und andere Leiden als Wortbildung, Sakramente und religiöse Feste", () => {
  assert.equal(ki("Mein Mann hat Lungenkrebs und braucht viel Ruhe."), "Mein Mann hat [GESUNDHEIT_1] und braucht viel Ruhe.");
  assert.equal(ki("Meine Mutter hat Krebs."), "Meine Mutter hat [GESUNDHEIT_1].");
  assert.equal(ki("Wegen meines Bandscheibenvorfalls und Rheuma brauche ich ein festes Bett."), "Wegen meines [GESUNDHEIT_1] und [GESUNDHEIT_2] brauche ich ein festes Bett.");
  assert.equal(ki("Feier zur Erstkommunion unserer Tochter"), "Feier zur [RELIGION_1] unserer Tochter");
  assert.equal(ki("Wir feiern die Bar Mitzwa unseres Sohnes."), "Wir feiern die [RELIGION_1] unseres Sohnes.");
  assert.equal(ki("Über das Zuckerfest bitte einen Gebetsplatz."), "Über das [RELIGION_1] bitte [RELIGION_2].");
  // Gegenproben
  for (const text of ["Auf der Karte: Flusskrebs mit Dill", "Wir haben Sie gebeten, den Gebetsteppich… nein: die Rechnung zu senden."]) {
    assert.equal(ki(text).includes("GESUNDHEIT"), false, text);
  }
});

// Review Claude 3 #10 (Betriebe ohne Rechtsform), #4 (Nachziehen von Nachnamen, die auch Hauptwörter sind)
test("Betriebe mit Branchenwort und Name; Nachnamen wie Sommer werden nachgezogen, das Hauptwort nicht", () => {
  assert.equal(ki("Die Rechnung der Tischlerei Moosbrugger kam."), "Die Rechnung der [FIRMA_1] kam.");
  assert.equal(ki("Wartung durch Elektro Valdessa."), "Wartung durch [FIRMA_1].");
  assert.equal(ki("Die Praxis Montag bis Freitag geöffnet."), "Die Praxis Montag bis Freitag geöffnet.");
  assert.equal(
    ki("Sehr geehrte Frau Sommer,\nIm Sommer wandern wir. Letzten Sommer auch. Sommer bringt den Schlüssel."),
    "Sehr geehrte Frau [PERSON_1],\nIm Sommer wandern wir. Letzten Sommer auch. [PERSON_1] bringt den Schlüssel.",
  );
});

// Review Codex 4 #3, #4
test("Zwei IBANs oder zwei Telefonnummern direkt hintereinander werden beide ersetzt", () => {
  assert.equal(ki("IBAN: AT61 1904 3002 3457 3201 DE89 3704 0044 0532 0130 00"), "IBAN: [IBAN_1] [IBAN_2]");
  // Die erste mit Tippfehler: Die zweite wird trotzdem gefunden.
  assertHidden("IBAN: AT61 1904 3002 3457 3202 DE89 3704 0044 0532 0130 00", ["DE89", "0532"]);
  // Ohne Wortgrenze, wie in Kopien aus PDF: Länge je Land und Prüfziffer entscheiden.
  assert.equal(ki("IBAN: AT611904300234573201BIC: BKAUATWW"), "IBAN: [IBAN_1]BIC: BKAUATWW");
  assert.equal(ki("IBANAT611904300234573201"), "IBAN[IBAN_1]");
  assert.equal(ki("Konto:AT61 1904 3002 3457 3201BIC BKAUATWW"), "Konto:[IBAN_1]BIC BKAUATWW");
  assert.equal(ki("IBAN AT611904300234573201DE89370400440532013000"), "IBAN [IBAN_1][IBAN_2]");
  // Gegenprobe: falsche Prüfziffer oder kein Ländercode mit passender Länge bleibt stehen.
  assert.equal(ki("Artikel AT611904300234573202X und CODE12345678901234567890AB"), "Artikel AT611904300234573202X und CODE12345678901234567890AB");
  assert.equal(ki("Tel.: 0512 123456 / 0512 654321"), "Tel.: [TELEFON_1] / [TELEFON_2]");
  assert.equal(ki("Tel. 0043 512 123456 / 0043 512 654321"), "Tel. [TELEFON_1] / [TELEFON_2]");
  assert.equal(ki("Tel.: +43 512 123456 / +43 664 1234567"), "Tel.: [TELEFON_1] / [TELEFON_2]");
  // Gegenprobe: Eine lange Ziffernfolge ohne neue Vorwahl wird nicht in Telefonnummern zerlegt.
  assert.deepEqual(detectPhones("Auftrag 0512 1234 5678 9012 3456 erledigt."), []);
});

// Review Codex 4 #5, #6
test("Verschieden geschriebene Kennungen und mehrdeutige Nachnamen werden nicht zusammengelegt", () => {
  const roundtrip = (text: string, options = {}) => {
    const r = pseudonymize(text, options);
    return { ki: r.text, zurueck: reidentify(r.text, r.mapping).text };
  };
  assert.deepEqual(roundtrip("Kennzeichen: B-AB 123 und Kennzeichen: BA-B 123"), {
    ki: "Kennzeichen: [KENNZEICHEN_1] und Kennzeichen: [KENNZEICHEN_2]",
    zurueck: "Kennzeichen: B-AB 123 und Kennzeichen: BA-B 123",
  });
  assert.deepEqual(roundtrip("Code AB12 und Code ab12", { manual: [{ value: "AB12", type: "SONSTIGES" }] }), {
    ki: "Code [SONSTIGES_1] und Code [SONSTIGES_2]",
    zurueck: "Code AB12 und Code ab12",
  });
  // Gegenprobe: dasselbe Kennzeichen zweimal bleibt ein Platzhalter.
  assert.equal(roundtrip("Kennzeichen: B-AB 123, nochmals Kennzeichen: B-AB 123").ki, "Kennzeichen: [KENNZEICHEN_1], nochmals Kennzeichen: [KENNZEICHEN_1]");
  // "Huber" allein gehört zu keiner der drei Personen.
  const text = "Anna Huber kommt. Hanna Huber kommt. Anna Maria Huber kommt. Huber zahlt.";
  const r = roundtrip(text);
  assert.equal(r.zurueck, text);
  assert.equal(r.ki, "[PERSON_1] kommt. [PERSON_2] kommt. [PERSON_3] kommt. [PERSON_4] zahlt.");
});

test("Bezeichnung ohne Leerzeichen direkt vor der Nummer (Kopien aus PDF)", () => {
  assert.equal(ki("UID-NummerATU12345678"), "UID-Nummer[UID_1]");
  assert.equal(ki("Telefon0664 1234567"), "Telefon[TELEFON_1]");
  assert.equal(ki("Tel.0512/123456"), "Tel.[TELEFON_1]");
  assert.equal(ki("Tel+43 664 1234567"), "Tel[TELEFON_1]");
  assert.equal(ki("Steuernummer12 345/6789"), "Steuernummer[STEUERNR_1]");
  // Gegenproben: ein Datum nach „Tel.“, „tel“ mitten im Wort
  assert.equal(ki("Tel.01.09.2026 und Hotel0664"), "Tel.01.09.2026 und Hotel0664");
});

test("Zeilenumbruch mitten in einer Angabe (Kopien aus PDF, schmale Spalten)", () => {
  assert.equal(ki("Gast: Anna\nHuber, Zimmer 12"), "Gast: [PERSON_1], Zimmer 12");
  assert.equal(ki("Sehr geehrte Frau\nHuber,"), "Sehr geehrte Frau\n[PERSON_1],");
  assert.equal(ki("Tel.: 0664\n1234567"), "Tel.: [TELEFON_1]");
  assert.equal(ki("Kundennummer\nK-4711"), "Kundennummer\n[KUNDENNR_1]");
  const r = pseudonymize("Gast: Anna\nHuber");
  assert.equal(reidentify(r.text, r.mapping).text, "Gast: Anna Huber");
  // Gegenproben: Eine Zeile mit Bezeichnung ist ein neues Feld; Firma und Adresse bleiben zeilenweise.
  assert.equal(ki("An: Florian Prantl\nBetreff: Anfrage"), "An: [PERSON_1]\nBetreff: Anfrage");
  assert.equal(ki("Danke, Hotel Alpenrose\nFormaggi und Wein kommen morgen."), ki("Danke, Hotel Alpenrose\n\nFormaggi und Wein kommen morgen.").replace("\n\n", "\n"));
});

// Review Claude 4 #7
test("Datum, Artikelnummer und Raumangaben sind keine Telefonnummer, Adresse oder Kartennummer", () => {
  for (const text of [
    "Reiseplan:\n03/05/2027 Anreise Innsbruck\n07/05/2027 Abreise",
    "Datum;Zimmer;Personen;Preis\n03/05/2027;Doppelzimmer;2;180,00",
    "03-05-2027 Anreise",
    "0815-2201  Duschgel 30 ml",
    "Zimmer A12 2027 ist schon belegt. Raum B2 1OG.",
    "TÜV-Prüfnummer 4711",
  ]) {
    assert.equal(ki(text), text);
  }
  // Gegenproben: echte Nummern, Postleitzahlen und Prüfnummern der Karte
  assert.equal(ki("0512 123456\nAnna Huber"), "[TELEFON_1]\n[PERSON_1]");
  assert.equal(ki("London SW1A 1AA. Dublin D02 X285."), "[ADRESSE_1]. [ADRESSE_2].");
  assert.equal(ki("CVC 123, Kartenprüfnummer 456"), "CVC [KREDITKARTE_1], Kartenprüfnummer [KREDITKARTE_2]");
});

// Review Claude 4 #6: Allerweltswörter sind keine besonderen Kategorien und keine Firmen
test("Allerweltswörter werden nicht Religion, Gesundheit oder Firma", () => {
  for (const text of [
    "die ganze Nacht hindurch", "im Sabbatical", "ein Mekka für Mountainbiker", "Sand in Taufers", "Bahnhof Staufen",
    "Die Baustelle vor dem Haus behindert leider die Zufahrt", "zu Behinderungen bei der Anreise", "Head of Operations",
    "Spülmaschinentabletten", "nicht gehen können, weil der Zug ausfällt", "Risotto mit Krebs", "Hals- und Beinbruch!",
    "Steuerberatung Jahresabschluss 2025 1.200,00 € netto", "Reinigung Bettwäsche 120 kg", "Elektro Überprüfung",
    "Praxis Öffnungszeiten", "Er sagte unter Eid aus.",
  ]) {
    assert.equal(ki(text), text);
  }
  // Gegenproben
  assert.equal(ki("Die Taufe ist am Sonntag, Eid al-Fitr feiern wir zuhause."), "Die [RELIGION_1] ist am Sonntag, [RELIGION_2] feiern wir zuhause.");
  assert.equal(ki("Mein Sohn ist gehbehindert, ich habe einen Behindertenpass."), "Mein Sohn ist [GESUNDHEIT_1], ich habe [GESUNDHEIT_2].");
  assert.equal(ki("Wartung durch Tischlerei Moosbrugger."), "Wartung durch [FIRMA_1].");
});

// Review Claude 4 #4
test("Gesundheit und Religion: Personenbezeichnungen, Diagnosen, Sinne, Zugehörigkeit, Akzente", () => {
  assertHidden("Unser Sohn ist Autist", ["Autist"]);
  assertHidden("Mein Vater ist blind, meine Mutter ist fast taub", ["blind", "taub"]);
  assertHidden("Ich bin HIV-positiv", ["HIV"]);
  assertHidden("Meine Frau hat Morbus Crohn", ["Morbus", "Crohn"]);
  assertHidden("Unsere Tochter hat Neurodermitis", ["Neurodermitis"]);
  assertHidden("mein Mann ist trockener Alkoholiker", ["Alkoholiker"]);
  assertHidden("Mein Mann hat Long Covid", ["Long Covid"]);
  assertHidden("Ich habe eine Angststörung", ["Angststörung"]);
  assertHidden("wegen Magersucht in Behandlung", ["Magersucht"]);
  assertHidden("Mon mari est diabétique", ["diabétique"]);
  assertHidden("Wir sind Juden, gläubige Christen, ich bin Atheist", ["Juden", "Christen", "Atheist"]);
  // Gegenproben: "blind" ohne Personenbezug, Gläubiger in der Buchhaltung
  assert.equal(ki("Ein Blind Date im Restaurant, Gläubiger laut Liste."), "Ein Blind Date im Restaurant, Gläubiger laut Liste.");
});

// Review Claude 4 #5
test("Personen: keine Zeitwörter als Nachname, kein Satzanfang, kein Gegenstand im Dativ, kein Ablaufplan als Chat", () => {
  assert.equal(ki("Ich komme mit meiner Tochter Lena Freitag Abend an."), "Ich komme mit meiner Tochter [PERSON_1] Freitag Abend an.");
  assert.equal(ki("Wir reisen mit Lukas Ende Mai an."), "Wir reisen mit [PERSON_1] Ende Mai an.");
  assert.equal(ki("Da hat Maria Recht."), "Da hat [PERSON_1] Recht.");
  const r = pseudonymize("Ob Anna mitkommt, weiß ich nicht.\nWenn Paul Zeit hat, kommt er auch.");
  assert.equal(r.text, "Ob [PERSON_1] mitkommt, weiß ich nicht.\nWenn [PERSON_2] Zeit hat, kommt er auch.");
  assert.ok(!reidentify("Liebe Frau [PERSON_1]", r.mapping).text.includes("Ob"));
  for (const text of [
    "Bitte stellen Sie meiner Frau Blumen aufs Zimmer und meinem Mann Champagner.",
    "[Wichtig] Anreise: bitte bis 18 Uhr",
    "12.05.2027, 14:30 - Ankunft Innsbruck: Abholung",
    "[09:00] Treffpunkt Lobby: alle",
  ]) {
    assert.equal(ki(text), text);
  }
  assert.equal(ki("Grüße, Lena M. Danach gehen wir essen."), "Grüße, [PERSON_1] Danach gehen wir essen.");
  // Gegenproben
  assert.equal(ki("Sehr geehrte Frau Freitag, Maria Sommer kommt."), "Sehr geehrte Frau [PERSON_1], [PERSON_2] kommt.");
  assert.equal(ki("Meine Frau Anna und ich kommen."), "Meine Frau [PERSON_1] und ich kommen.");
  assert.equal(ki("[16.10.26, 08:12] Wang Lei: Hallo"), "[16.10.26, 08:12] [PERSON_1]: Hallo");
  assert.equal(ki("Huber Anna, Zimmer 12"), "[PERSON_1], Zimmer 12");
});

// Review Claude 4 #3
test("Nachnamen nach Titel, Briefkürzel, Ehepaar und allein unter dem Gruß", () => {
  assert.equal(
    ki("Mag. Leitgeb hat gestern angerufen. Dr. Valdessa kommt erst am Montag."),
    "Mag. [PERSON_1] hat gestern angerufen. Dr. [PERSON_2] kommt erst am Montag.",
  );
  assert.equal(ki("Mit freundlichen Grüßen\ni. A. Leitgeb"), "Mit freundlichen Grüßen\ni. A. [PERSON_1]");
  assert.equal(ki("gez. Moosbrugger"), "gez. [PERSON_1]");
  assert.equal(ki("Ehepaar Moosbrugger reist am 12. Mai an"), "Ehepaar [PERSON_1] reist am 12. Mai an");
  assert.equal(ki("Eheleute Valdessa, Zimmer 14"), "Eheleute [PERSON_1], Zimmer 14");
  assert.equal(ki("Liebe Grüße\nMoosbrugger"), "Liebe Grüße\n[PERSON_1]");
  assert.equal(ki("Steuerberatung Mag. Leitgeb, Rechnung 2026-17"), "Steuerberatung Mag. [PERSON_1], Rechnung 2026-17");
  assert.equal(ki("Dr. med. Huber"), "Dr. med. [PERSON_1]");
  // Gegenproben: Abteilung, Anlage oder Zimmer unter dem Gruß
  for (const text of ["Mit freundlichen Grüßen\nRezeption", "Liebe Grüße\nDoppelzimmer", "Mit freundlichen Grüßen\nAnlage"]) {
    assert.equal(ki(text), text);
  }
});

// Review Claude 4 #2
test("Bekannte Nachnamen auch gebeugt und als Teil eines Doppelnamens", () => {
  assert.equal(
    ki("Anna Moosbrugger bucht für die ganze Familie. Die Moosbruggers reisen am Freitag an, Moosbruggers Hund kommt mit."),
    "[PERSON_1] bucht für die ganze Familie. Die [PERSON_1] reisen am Freitag an, [PERSON_1] Hund kommt mit.",
  );
  assert.equal(
    ki("Mr Jonathan Whitcombe booked room 12. Please send Whitcombe's invoice. The Whitcombes will arrive on Friday."),
    "Mr [PERSON_1] booked room 12. Please send [PERSON_1] invoice. The [PERSON_1] will arrive on Friday.",
  );
  assert.equal(ki("Anna Huber-Moosbrugger bucht. Bitte die Rechnung nicht an Huber."), "[PERSON_1] bucht. Bitte die Rechnung nicht an [PERSON_1].");
  // Gegenproben: Hauptwörter mit Endung nach Artikel bleiben
  assert.equal(ki("Maria Sommer kommt. Das Ende des Sommers naht."), "[PERSON_1] kommt. Das Ende des Sommers naht.");
});
