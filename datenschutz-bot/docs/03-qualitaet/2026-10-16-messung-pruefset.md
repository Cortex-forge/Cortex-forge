# Messung der Erkennung · 2026-10-16 · pruefset

Testset: `testset/pruefset.json` (40 erfundene Fälle, davon 7 ohne sensible Angaben). Gemessen mit `npm run messung`.

**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen. Erwartete Werte zählen nur als ganze Wörter.

| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |
|---|---|---|---|---|---|---|---|
| Person | 173 | 146 | 84,4 % | 141 | 128 | 90,8 % | nicht erreicht |
| Adresse | 49 | 32 | 65,3 % | 25 | 25 | 100 % | nicht erreicht |
| Gesundheitsangabe | 48 | 23 | 47,9 % | 31 | 24 | 77,4 % | nicht erreicht |
| Telefon | 43 | 35 | 81,4 % | 36 | 36 | 100 % | nicht erreicht |
| E-Mail | 18 | 18 | 100 % | 18 | 18 | 100 % | erreicht |
| Firma | 18 | 13 | 72,2 % | 12 | 7 | 58,3 % | – |
| Geburtsdatum | 18 | 14 | 77,8 % | 14 | 14 | 100 % | – |
| Ausweisnummer | 16 | 1 | 6,3 % | 1 | 1 | 100 % | – |
| Religionsangabe | 10 | 5 | 50 % | 6 | 6 | 100 % | nicht erreicht |
| IBAN | 9 | 9 | 100 % | 9 | 9 | 100 % | erreicht |
| Sonstiges | 8 | 0 | 0 % | 0 | 0 | – | – |
| UID-Nummer | 7 | 5 | 71,4 % | 5 | 5 | 100 % | nicht erreicht |
| Kfz-Kennzeichen | 5 | 3 | 60 % | 3 | 3 | 100 % | – |
| Steuernummer | 3 | 1 | 33,3 % | 1 | 1 | 100 % | – |
| Kreditkarte | 3 | 3 | 100 % | 3 | 3 | 100 % | erreicht |
| Sozialversicherungsnr. | 3 | 2 | 66,7 % | 2 | 2 | 100 % | – |
| Kunden-/Vertragsnr. | 3 | 2 | 66,7 % | 2 | 2 | 100 % | – |
| **Gesamt** | 434 | 312 | 71,9 % | 309 | 284 | 91,9 % | |

## Übersehen (122)

- P01 · Gesundheitsangabe · „Notfall-Pen“ (Familienanfrage aus Deutschland, Kind mit Allergie, deutsche Telefonnummer, Doppelname, Adresse ohne Straßen-Endung)
- P02 · Gesundheitsangabe · „spinal injury“ (Irische Anfrage, Rollstuhl und Verletzung umschrieben, irische Handynummer, Eircode, Vorname des Partners allein)
- P02 · Person · „Ciarán“ (Irische Anfrage, Rollstuhl und Verletzung umschrieben, irische Handynummer, Eircode, Vorname des Partners allein)
- P02 · Adresse · „Dublin 6, D06 K2P7“ (Irische Anfrage, Rollstuhl und Verletzung umschrieben, irische Handynummer, Eircode, Vorname des Partners allein)
- P03 · Adresse · „Unterdorf 23“ (Lieferantenrechnung einer kleinen Bäckerei mit UID, Steuernummer, Firmenbuchnummer, IBAN, Ansprechpartnerin; viele Beträge und Rechnungsnummer als Fallen)
- P03 · Sonstiges · „FN 418237 m“ (Lieferantenrechnung einer kleinen Bäckerei mit UID, Steuernummer, Firmenbuchnummer, IBAN, Ansprechpartnerin; viele Beträge und Rechnungsnummer als Fallen)
- P05 · Steuernummer · „ZNTFNC88D52A952W“ (Italienische Anfrage, Tochter mit Zöliakie, Codice fiscale für die Rechnung, Handynummer ohne Ländervorwahl)
- P05 · Telefon · „347 821 0936“ (Italienische Anfrage, Tochter mit Zöliakie, Codice fiscale für die Rechnung, Handynummer ohne Ländervorwahl)
- P06 · Gesundheitsangabe · „Kardiologie“ (Storno in österreichischem Ton, Herzinfarkt des Ehemanns, Kreditkarte mit anderem Karteninhaber, Polizzennummer, Telefon mit Schrägstrich nach 'Telefonnummer')
- P06 · Sonstiges · „7730-2291-04“ (Storno in österreichischem Ton, Herzinfarkt des Ehemanns, Kreditkarte mit anderem Karteninhaber, Polizzennummer, Telefon mit Schrägstrich nach 'Telefonnummer')
- P06 · Telefon · „0664 / 312 87 40“ (Storno in österreichischem Ton, Herzinfarkt des Ehemanns, Kreditkarte mit anderem Karteninhaber, Polizzennummer, Telefon mit Schrägstrich nach 'Telefonnummer')
- P07 · Kfz-Kennzeichen · „GZ-418-T“ (Niederländische Anfrage zu Parken und später Ankunft, Kennzeichen, zwei Handynummern in NL-Formaten, Name mit 'van den', Allergie des Kindes)
- P07 · Gesundheitsangabe · „allergisch voor katten“ (Niederländische Anfrage zu Parken und später Ankunft, Kennzeichen, zwei Handynummern in NL-Formaten, Name mit 'van den', Allergie des Kindes)
- P07 · Telefon · „06-29374415“ (Niederländische Anfrage zu Parken und später Ankunft, Kennzeichen, zwei Handynummern in NL-Formaten, Name mit 'van den', Allergie des Kindes)
- P07 · Adresse · „Kromme Nieuwegracht 52“ (Niederländische Anfrage zu Parken und später Ankunft, Kennzeichen, zwei Handynummern in NL-Formaten, Name mit 'van den', Allergie des Kindes)
- P10 · Firma · „MOORLAND TEXTILES LTD“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P10 · Adresse · „Unit 4, Calder Mill, 27 Canal Road“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P10 · Adresse · „Leeds LS12 2PL“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P10 · UID-Nummer · „GB 284 7193 56“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P10 · Sonstiges · „09817342“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P10 · Sonstiges · „41877654“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P10 · Person · „Imran Qureshi“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P10 · Telefon · „+44 113 496 0712“ (Rechnung eines kleinen britischen Lieferanten: Firmenname in Großbuchstaben und normal, UK-Adresse, VAT-Nummer, Company No., IBAN und Kontonummer; Produktname 'Heather Grey' als Falle)
- P11 · Adresse · „ul. Długa 17 m. 4“ (Gästeblatt nach Meldegesetz, polnische Familie: Nachname in Großbuchstaben und Vorname getrennt, Nachname zuerst, Kosename, drei Datumsformate, Pass- und Ausweisnummer, polnische Adresse)
- P11 · Adresse · „31-147 Kraków“ (Gästeblatt nach Meldegesetz, polnische Familie: Nachname in Großbuchstaben und Vorname getrennt, Nachname zuerst, Kosename, drei Datumsformate, Pass- und Ausweisnummer, polnische Adresse)
- P11 · Ausweisnummer · „EA 4417302“ (Gästeblatt nach Meldegesetz, polnische Familie: Nachname in Großbuchstaben und Vorname getrennt, Nachname zuerst, Kosename, drei Datumsformate, Pass- und Ausweisnummer, polnische Adresse)
- P11 · Person · „Wiśniewski, Kuba“ (Gästeblatt nach Meldegesetz, polnische Familie: Nachname in Großbuchstaben und Vorname getrennt, Nachname zuerst, Kosename, drei Datumsformate, Pass- und Ausweisnummer, polnische Adresse)
- P13 · Firma · „CASEIFICIO MORESCHINI di Moreschini Luca & C. s.n.c.“ (Italienische Rechnung einer kleinen Käserei aus dem Trentino: Firmenname mit Inhabername, Partita IVA, PEC-Adresse, IBAN, Referentin; Gesetzesverweis und DDT-Nummer als Fallen)
- P13 · Adresse · „38027 Malè (TN)“ (Italienische Rechnung einer kleinen Käserei aus dem Trentino: Firmenname mit Inhabername, Partita IVA, PEC-Adresse, IBAN, Referentin; Gesetzesverweis und DDT-Nummer als Fallen)
- P15 · Gesundheitsangabe · „mitn rücken“ (WhatsApp-Verlauf im Tiroler Dialekt, klein geschrieben, Kosenamen, Rückenleiden umschrieben, Absender nur als Nummer)
- P15 · Person · „Burgi“ (WhatsApp-Verlauf im Tiroler Dialekt, klein geschrieben, Kosenamen, Rückenleiden umschrieben, Absender nur als Nummer)
- P16 · Adresse · „2140 N. Lincoln Park West, Apt 9C“ (Weitergeleitete Mail mit Kopfzeilen und Zitat: koschere Ernährung, Diabetes umschrieben, US-Adresse mit Apartment, US-Telefon in Klammern, Nachname mit Bindestrich auch allein, Mitarbeiterin mit Vorname und vollem Namen)
- P17 · Person · „Szabó Réka“ (Kurze Telefonnotiz der Rezeption: ungarischer Name in ungarischer Reihenfolge, dieselbe Nummer international und national, Vorname der Mitarbeiterin; Hunderasse 'Golden Retriever', Angebotsnummer und Rabattcode als Fallen)
- P17 · Telefon · „06 30 418 2275“ (Kurze Telefonnotiz der Rezeption: ungarischer Name in ungarischer Reihenfolge, dieselbe Nummer international und national, Vorname der Mitarbeiterin; Hunderasse 'Golden Retriever', Angebotsnummer und Rabattcode als Fallen)
- P19 · Person · „Jelena M.“ (Dienstplan als Tabelle: nur Vornamen, Vorname mit Initiale, nur Nachname, Doppelvorname; Knie-OP und Freitagsgebet als besondere Kategorien; Kürzel und Uhrzeiten als Fallen)
- P19 · Person · „Kowalski“ (Dienstplan als Tabelle: nur Vornamen, Vorname mit Initiale, nur Nachname, Doppelvorname; Knie-OP und Freitagsgebet als besondere Kategorien; Kürzel und Uhrzeiten als Fallen)
- P19 · Person · „Kowalski“ (Dienstplan als Tabelle: nur Vornamen, Vorname mit Initiale, nur Nachname, Doppelvorname; Knie-OP und Freitagsgebet als besondere Kategorien; Kürzel und Uhrzeiten als Fallen)
- P19 · Person · „Lisa-Marie“ (Dienstplan als Tabelle: nur Vornamen, Vorname mit Initiale, nur Nachname, Doppelvorname; Knie-OP und Freitagsgebet als besondere Kategorien; Kürzel und Uhrzeiten als Fallen)
- P19 · Person · „Lisa-Marie“ (Dienstplan als Tabelle: nur Vornamen, Vorname mit Initiale, nur Nachname, Doppelvorname; Knie-OP und Freitagsgebet als besondere Kategorien; Kürzel und Uhrzeiten als Fallen)
- P19 · Religionsangabe · „Freitagsgebet“ (Dienstplan als Tabelle: nur Vornamen, Vorname mit Initiale, nur Nachname, Doppelvorname; Knie-OP und Freitagsgebet als besondere Kategorien; Kürzel und Uhrzeiten als Fallen)
- P20 · Gesundheitsangabe · „gynaecoloog“ (Niederländische Stornierung wegen Schwangerschaft und Schwangerschaftsdiabetes, Rückzahlung auf NL-IBAN, abgekürzter Name 't.n.v.', Partner mit 'de', Telefon mit 0031)
- P20 · Person · „S. van Dijk“ (Niederländische Stornierung wegen Schwangerschaft und Schwangerschaftsdiabetes, Rückzahlung auf NL-IBAN, abgekürzter Name 't.n.v.', Partner mit 'de', Telefon mit 0031)
- P21 · Kfz-Kennzeichen · „K-AT 4417“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Telefon · „0172 / 448 19 02“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Sonstiges · „HRB 98417“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · UID-Nummer · „DE 287 401 935“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „U 18837342“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „U 18837343“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Gesundheitsangabe · „Gehstock“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „L01X84T27“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „L01X91R33“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „C4J7N2X81“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „T22000129“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „T22000130“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „117283340“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Ausweisnummer · „117283341“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P21 · Gesundheitsangabe · „unsicher auf den Beinen“ (Lange Mail eines kleinen Reiseveranstalters mit Rooming List als CSV: Nachname und Vorname in getrennten Spalten, viele Geburtsdaten und Ausweisnummern, Gesundheit und Religion in der Hinweisspalte, Bus-Kennzeichen, USt-IdNr. und Handelsregister des Veranstalters, Schlaganfall umschrieben)
- P24 · Person · „Noura“ (Buchungsbestätigung eines Portals (Deutsch/Englisch): Name in Großbuchstaben mit Nachname zuerst, Weiterleitungs-Mail des Portals, Nummer der Emirate, Religion und Migräne im Sonderwunsch; Buchungsnummer sieht wie Telefonnummer aus)
- P24 · Gesundheitsangabe · „migraine“ (Buchungsbestätigung eines Portals (Deutsch/Englisch): Name in Großbuchstaben mit Nachname zuerst, Weiterleitungs-Mail des Portals, Nummer der Emirate, Religion und Migräne im Sonderwunsch; Buchungsnummer sieht wie Telefonnummer aus)
- P24 · Religionsangabe · „Qibla“ (Buchungsbestätigung eines Portals (Deutsch/Englisch): Name in Großbuchstaben mit Nachname zuerst, Weiterleitungs-Mail des Portals, Nummer der Emirate, Religion und Migräne im Sonderwunsch; Buchungsnummer sieht wie Telefonnummer aus)
- P26 · Geburtsdatum · „7. Juli 1997“ (Bewerbung einer bosnischen Rezeptionistin: ausgeschriebenes Geburtsdatum, Behinderung und Hörgerät umschrieben, Adresse mit Stiege und Tür; Software-Marken und Jobportal als Fallen)
- P26 · Gesundheitsangabe · „Hörminderung“ (Bewerbung einer bosnischen Rezeptionistin: ausgeschriebenes Geburtsdatum, Behinderung und Hörgerät umschrieben, Adresse mit Stiege und Tür; Software-Marken und Jobportal als Fallen)
- P27 · Telefon · „05212 / 4 77 31“ (Ärztliche Bestätigung für einen Mitarbeiter: Ärztin mit Titeln und später nur Nachname, Ordinationsadresse, SVNR, Diagnose mit Fach- und Alltagswort, Arbeitsunfähigkeit; Ordinationszeiten als Fallen)
- P27 · Gesundheitsangabe · „Lumbago“ (Ärztliche Bestätigung für einen Mitarbeiter: Ärztin mit Titeln und später nur Nachname, Ordinationsadresse, SVNR, Diagnose mit Fach- und Alltagswort, Arbeitsunfähigkeit; Ordinationszeiten als Fallen)
- P27 · Gesundheitsangabe · „Hexenschuss“ (Ärztliche Bestätigung für einen Mitarbeiter: Ärztin mit Titeln und später nur Nachname, Ordinationsadresse, SVNR, Diagnose mit Fach- und Alltagswort, Arbeitsunfähigkeit; Ordinationszeiten als Fallen)
- P27 · Gesundheitsangabe · „arbeitsunfähig“ (Ärztliche Bestätigung für einen Mitarbeiter: Ärztin mit Titeln und später nur Nachname, Ordinationsadresse, SVNR, Diagnose mit Fach- und Alltagswort, Arbeitsunfähigkeit; Ordinationszeiten als Fallen)
- P29 · Person · „Hechenblaikner“ (Italienischer Saisonmitarbeiter schickt Daten für den Dienstvertrag: Codice fiscale, Carta d'identità, Geburtsdatum mit Schrägstrichen, IBAN, Adresse mit Buchstaben-Hausnummer, Laktoseintoleranz, Vorname allein als Gruß)
- P29 · Geburtsdatum · „14/07/1995“ (Italienischer Saisonmitarbeiter schickt Daten für den Dienstvertrag: Codice fiscale, Carta d'identità, Geburtsdatum mit Schrägstrichen, IBAN, Adresse mit Buchstaben-Hausnummer, Laktoseintoleranz, Vorname allein als Gruß)
- P29 · Steuernummer · „DLLMTT95L14L378V“ (Italienischer Saisonmitarbeiter schickt Daten für den Dienstvertrag: Codice fiscale, Carta d'identità, Geburtsdatum mit Schrägstrichen, IBAN, Adresse mit Buchstaben-Hausnummer, Laktoseintoleranz, Vorname allein als Gruß)
- P29 · Ausweisnummer · „CA48211XK“ (Italienischer Saisonmitarbeiter schickt Daten für den Dienstvertrag: Codice fiscale, Carta d'identità, Geburtsdatum mit Schrägstrichen, IBAN, Adresse mit Buchstaben-Hausnummer, Laktoseintoleranz, Vorname allein als Gruß)
- P29 · Gesundheitsangabe · „intollerante al lattosio“ (Italienischer Saisonmitarbeiter schickt Daten für den Dienstvertrag: Codice fiscale, Carta d'identità, Geburtsdatum mit Schrägstrichen, IBAN, Adresse mit Buchstaben-Hausnummer, Laktoseintoleranz, Vorname allein als Gruß)
- P30 · Firma · „De Wolk“ (Niederländische Bitte um Rechnungskorrektur: kleine Firma mit Kurzform, KvK- und Btw-Nummer, IBAN, Kontaktperson mit Initiale und vollem Namen, Privatadresse einer Mitreisenden mit Doppelnamen; Rechnungs- und Zimmernummer als Fallen)
- P30 · Person · „K. Dijkstra“ (Niederländische Bitte um Rechnungskorrektur: kleine Firma mit Kurzform, KvK- und Btw-Nummer, IBAN, Kontaktperson mit Initiale und vollem Namen, Privatadresse einer Mitreisenden mit Doppelnamen; Rechnungs- und Zimmernummer als Fallen)
- P30 · Adresse · „Vismarkt 14“ (Niederländische Bitte um Rechnungskorrektur: kleine Firma mit Kurzform, KvK- und Btw-Nummer, IBAN, Kontaktperson mit Initiale und vollem Namen, Privatadresse einer Mitreisenden mit Doppelnamen; Rechnungs- und Zimmernummer als Fallen)
- P30 · Sonstiges · „74120598“ (Niederländische Bitte um Rechnungskorrektur: kleine Firma mit Kurzform, KvK- und Btw-Nummer, IBAN, Kontaktperson mit Initiale und vollem Namen, Privatadresse einer Mitreisenden mit Doppelnamen; Rechnungs- und Zimmernummer als Fallen)
- P30 · Person · „Joke Bakker-Visser“ (Niederländische Bitte um Rechnungskorrektur: kleine Firma mit Kurzform, KvK- und Btw-Nummer, IBAN, Kontaktperson mit Initiale und vollem Namen, Privatadresse einer Mitreisenden mit Doppelnamen; Rechnungs- und Zimmernummer als Fallen)
- P30 · Adresse · „Prinsengracht 7-II“ (Niederländische Bitte um Rechnungskorrektur: kleine Firma mit Kurzform, KvK- und Btw-Nummer, IBAN, Kontaktperson mit Initiale und vollem Namen, Privatadresse einer Mitreisenden mit Doppelnamen; Rechnungs- und Zimmernummer als Fallen)
- P31 · Kunden-/Vertragsnr. · „SG-2291“ (Lange, zweimal weitergeleitete Mail mit Kopfzeilen und Zitaten: Titel, Adelsname mit 'von' und 'v.', Initialen als Unterschrift, Doppelnamen, Herzschrittmacher, Allergie, Zöliakie, Firmenkreditkarte mit Ablaufdatum, Telefon und Fax mit Durchwahl, Nummer nach 'erreichbar unter', Stammgastnummer, Wiener Kennzeichen)
- P31 · Person · „von Hagenberg“ (Lange, zweimal weitergeleitete Mail mit Kopfzeilen und Zitaten: Titel, Adelsname mit 'von' und 'v.', Initialen als Unterschrift, Doppelnamen, Herzschrittmacher, Allergie, Zöliakie, Firmenkreditkarte mit Ablaufdatum, Telefon und Fax mit Durchwahl, Nummer nach 'erreichbar unter', Stammgastnummer, Wiener Kennzeichen)
- P31 · Gesundheitsangabe · „Kardiologen“ (Lange, zweimal weitergeleitete Mail mit Kopfzeilen und Zitaten: Titel, Adelsname mit 'von' und 'v.', Initialen als Unterschrift, Doppelnamen, Herzschrittmacher, Allergie, Zöliakie, Firmenkreditkarte mit Ablaufdatum, Telefon und Fax mit Durchwahl, Nummer nach 'erreichbar unter', Stammgastnummer, Wiener Kennzeichen)
- P31 · Sonstiges · „08/28“ (Lange, zweimal weitergeleitete Mail mit Kopfzeilen und Zitaten: Titel, Adelsname mit 'von' und 'v.', Initialen als Unterschrift, Doppelnamen, Herzschrittmacher, Allergie, Zöliakie, Firmenkreditkarte mit Ablaufdatum, Telefon und Fax mit Durchwahl, Nummer nach 'erreichbar unter', Stammgastnummer, Wiener Kennzeichen)
- P31 · Person · „W. v. H.“ (Lange, zweimal weitergeleitete Mail mit Kopfzeilen und Zitaten: Titel, Adelsname mit 'von' und 'v.', Initialen als Unterschrift, Doppelnamen, Herzschrittmacher, Allergie, Zöliakie, Firmenkreditkarte mit Ablaufdatum, Telefon und Fax mit Durchwahl, Nummer nach 'erreichbar unter', Stammgastnummer, Wiener Kennzeichen)
- P33 · Person · „Wang Lei“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Person · „Wang Lei“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Person · „Wang Lei“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Person · „Wang Lei“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Ausweisnummer · „EJ5582731“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Person · „Chen Xiaoyu“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Ausweisnummer · „EJ5582904“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Person · „Lily“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Person · „Lily“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P33 · Sonstiges · „wanglei_sh88“ (WhatsApp-Verlauf Englisch/Deutsch mit chinesischem Gast: chinesische Namen mit Nachname zuerst, Anrede nur mit Nachname, Passnummern, chinesische Handynummer, WeChat-ID, Vorname des Fahrers, Allergie; Zugzeit als Falle)
- P34 · Religionsangabe · „Jain“ (Englische Hochzeitsanfrage aus London: Religion über Ernährung (Jain), Sehbehinderung mit Blindenhund, Elektromobil, kleine Hochzeitsagentur, UK-Adresse mit Flat, UK-Nummern mit und ohne +44, Vorname allein)
- P34 · Gesundheitsangabe · „partially sighted“ (Englische Hochzeitsanfrage aus London: Religion über Ernährung (Jain), Sehbehinderung mit Blindenhund, Elektromobil, kleine Hochzeitsagentur, UK-Adresse mit Flat, UK-Nummern mit und ohne +44, Vorname allein)
- P34 · Gesundheitsangabe · „guide dog“ (Englische Hochzeitsanfrage aus London: Religion über Ernährung (Jain), Sehbehinderung mit Blindenhund, Elektromobil, kleine Hochzeitsagentur, UK-Adresse mit Flat, UK-Nummern mit und ohne +44, Vorname allein)
- P34 · Gesundheitsangabe · „mobility scooter“ (Englische Hochzeitsanfrage aus London: Religion über Ernährung (Jain), Sehbehinderung mit Blindenhund, Elektromobil, kleine Hochzeitsagentur, UK-Adresse mit Flat, UK-Nummern mit und ohne +44, Vorname allein)
- P34 · Person · „Harriet Quinn“ (Englische Hochzeitsanfrage aus London: Religion über Ernährung (Jain), Sehbehinderung mit Blindenhund, Elektromobil, kleine Hochzeitsagentur, UK-Adresse mit Flat, UK-Nummern mit und ohne +44, Vorname allein)
- P34 · Adresse · „Flat 3, 41 Wellington Road“ (Englische Hochzeitsanfrage aus London: Religion über Ernährung (Jain), Sehbehinderung mit Blindenhund, Elektromobil, kleine Hochzeitsagentur, UK-Adresse mit Flat, UK-Nummern mit und ohne +44, Vorname allein)
- P34 · Adresse · „Harrow HA1 4LP“ (Englische Hochzeitsanfrage aus London: Religion über Ernährung (Jain), Sehbehinderung mit Blindenhund, Elektromobil, kleine Hochzeitsagentur, UK-Adresse mit Flat, UK-Nummern mit und ohne +44, Vorname allein)
- P35 · Gesundheitsangabe · „ricoverata“ (Italienische Stornierung aus dem Tessin wegen Krankenhausaufenthalt und Herzoperation der Ehefrau, Kreditkarte und Schweizer IBAN, Schweizer Festnetz- und Handynummer, Adresse in Lugano; Buchungsnummer und Prozente als Fallen)
- P35 · Gesundheitsangabe · „intervento al cuore“ (Italienische Stornierung aus dem Tessin wegen Krankenhausaufenthalt und Herzoperation der Ehefrau, Kreditkarte und Schweizer IBAN, Schweizer Festnetz- und Handynummer, Adresse in Lugano; Buchungsnummer und Prozente als Fallen)
- P35 · Gesundheitsangabe · „riabilitazione“ (Italienische Stornierung aus dem Tessin wegen Krankenhausaufenthalt und Herzoperation der Ehefrau, Kreditkarte und Schweizer IBAN, Schweizer Festnetz- und Handynummer, Adresse in Lugano; Buchungsnummer und Prozente als Fallen)
- P36 · Firma · „Unterwegerhof“ (Sehr kurze WhatsApp eines Bauern im Tiroler Dialekt, alles klein: Kosename im Kontaktnamen, Hofname, Vorname klein geschrieben, Nummer ohne Hinweiswort; Mengen als Fallen)
- P36 · Person · „hannes“ (Sehr kurze WhatsApp eines Bauern im Tiroler Dialekt, alles klein: Kosename im Kontaktnamen, Hofname, Vorname klein geschrieben, Nummer ohne Hinweiswort; Mengen als Fallen)
- P37 · Adresse · „Gewerbezone 12“ (Zahlungserinnerung an einen kleinen Firmenkunden: Firmenname mit Familiennamen, Name mit 'jun.', Nachname allein in der Anrede, Mitarbeiterin mit spanischem Doppelnachnamen, Gewerbezone als Adresse ohne Straßen-Endung, Kundennummer, UID; Rechnungsnummer, Beträge und Durchwahl als Fallen)
- P38 · Firma · „Enoteca Pichler s.a.s.“ (Südtiroler Weinhändler schreibt Deutsch und Italienisch gemischt: zweisprachiger Firmenname und Adresse, P.IVA, IBAN, Fahrer mit Kennzeichen, Vornamen allein; Weinnamen, Jahrgänge und Preise als Fallen)
- P38 · Adresse · „Handwerkerzone Nord 4“ (Südtiroler Weinhändler schreibt Deutsch und Italienisch gemischt: zweisprachiger Firmenname und Adresse, P.IVA, IBAN, Fahrer mit Kennzeichen, Vornamen allein; Weinnamen, Jahrgänge und Preise als Fallen)
- P38 · Adresse · „Zona artigianale Nord 4“ (Südtiroler Weinhändler schreibt Deutsch und Italienisch gemischt: zweisprachiger Firmenname und Adresse, P.IVA, IBAN, Fahrer mit Kennzeichen, Vornamen allein; Weinnamen, Jahrgänge und Preise als Fallen)
- P38 · Adresse · „39042 Brixen/Bressanone“ (Südtiroler Weinhändler schreibt Deutsch und Italienisch gemischt: zweisprachiger Firmenname und Adresse, P.IVA, IBAN, Fahrer mit Kennzeichen, Vornamen allein; Weinnamen, Jahrgänge und Preise als Fallen)
- P38 · Telefon · „348 902 1137“ (Südtiroler Weinhändler schreibt Deutsch und Italienisch gemischt: zweisprachiger Firmenname und Adresse, P.IVA, IBAN, Fahrer mit Kennzeichen, Vornamen allein; Weinnamen, Jahrgänge und Preise als Fallen)
- P39 · Gesundheitsangabe · „hüft op“ (Anfrage komplett klein geschrieben und fast ohne Satzzeichen: Hüft-OP und Dialyse mehrfach umschrieben, Gehbehinderung, Telefonnummer ohne Hinweiswort, Namen klein mit gemeinsamem Nachnamen)
- P39 · Gesundheitsangabe · „nicht gut stiegen steigen kann“ (Anfrage komplett klein geschrieben und fast ohne Satzzeichen: Hüft-OP und Dialyse mehrfach umschrieben, Gehbehinderung, Telefonnummer ohne Hinweiswort, Namen klein mit gemeinsamem Nachnamen)
- P40 · Person · „Pemba Sherpa“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Ausweisnummer · „RWR 0418823“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Ausweisnummer · „10894417“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Sozialversicherungsnr. · „3584 270488“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Geburtsdatum · „1988/04/27“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Geburtsdatum · „27.4.1989“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Religionsangabe · „Losar“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Religionsangabe · „buddhistischer Feiertag“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Gesundheitsangabe · „Arbeitsunfall“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)
- P40 · Gesundheitsangabe · „Schnittverletzung“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)

## Fehlalarme (17)

- P04 · Gesundheitsangabe · „Glutenfreie“ (gesundheit)
- P04 · Gesundheitsangabe · „laktosefreie“ (gesundheit)
- P05 · Gesundheitsangabe · „senza glutine“ (gesundheit)
- P10 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)
- P10 · Person · „Heather Grey“ (person:vorname)
- P10 · Firma · „Barclays Bank UK PLC“ (firma:rechtsform)
- P13 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)
- P13 · Gesundheitsangabe · „operazione“ (gesundheit)
- P18 · Person · „Nikolaus“ (person:vorname)
- P19 · Gesundheitsangabe · „Krankenstand“ (gesundheit)
- P19 · Gesundheitsangabe · „Krankenstand“ (gesundheit)
- P22 · Person · „Mia“ (person:vorname)
- P31 · Person · „Kanzlei“ (person:wiederholung)
- P31 · Gesundheitsangabe · „glutenfrei“ (gesundheit)
- P35 · Person · „Mia“ (person:vorname)
- P37 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)
- P37 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)

## Geschützt, aber mit falschem Typ (8)

- P13 · ersetzt als Person, erwartet Firma · „MORESCHINI“
- P13 · ersetzt als Person, erwartet Firma · „Moreschini“
- P13 · ersetzt als Person, erwartet Firma · „Luca“
- P21 · ersetzt als Person, erwartet Firma · „Gruppenreisen Anatolia-Alpin“
- P30 · ersetzt als Person, erwartet Firma · „Wolk“
- P30 · ersetzt als Person, erwartet Firma/Firma · „Fietsreizen De Wolk“
- P31 · ersetzt als Person, erwartet Firma · „Kanzlei“
- P38 · ersetzt als Person, erwartet Firma · „Pichler“
