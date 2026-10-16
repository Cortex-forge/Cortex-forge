# Messung der Erkennung · 2026-10-16 · Ausgangslage vor Korrekturen

Testset: `testset/faelle.json` (36 erfundene Fälle, davon 5 ohne sensible Angaben). Gemessen mit `npm run messung`.

**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die wirklich sensibel waren.

| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |
|---|---|---|---|---|---|---|---|
| Person | 70 | 49 | 70 % | 51 | 49 | 96.1 % | nicht erreicht |
| Adresse | 15 | 9 | 60 % | 13 | 13 | 100 % | nicht erreicht |
| Telefon | 13 | 11 | 84.6 % | 11 | 11 | 100 % | nicht erreicht |
| E-Mail | 12 | 12 | 100 % | 12 | 12 | 100 % | erreicht |
| Gesundheitsangabe | 12 | 9 | 75 % | 9 | 9 | 100 % | nicht erreicht |
| Firma | 7 | 4 | 57.1 % | 5 | 5 | 100 % | – |
| IBAN | 7 | 7 | 100 % | 7 | 7 | 100 % | erreicht |
| UID-Nummer | 4 | 4 | 100 % | 4 | 4 | 100 % | erreicht |
| Kunden-/Vertragsnr. | 3 | 2 | 66.7 % | 2 | 2 | 100 % | – |
| Geburtsdatum | 2 | 1 | 50 % | 1 | 1 | 100 % | – |
| Kreditkarte | 2 | 2 | 100 % | 2 | 2 | 100 % | erreicht |
| Religionsangabe | 2 | 2 | 100 % | 2 | 2 | 100 % | erreicht |
| Steuernummer | 2 | 2 | 100 % | 2 | 2 | 100 % | – |
| Ausweisnummer | 1 | 1 | 100 % | 1 | 1 | 100 % | – |
| Sozialversicherungsnr. | 1 | 1 | 100 % | 1 | 1 | 100 % | – |
| Sonstiges | 1 | 0 | 0 % | 0 | 0 | – | – |
| Kfz-Kennzeichen | 1 | 1 | 100 % | 1 | 1 | 100 % | – |
| **Gesamt** | 155 | 117 | 75.5 % | 124 | 122 | 98.4 % | |

## Übersehen (38)

- T02 · Person · „steffi“ (Kleingeschrieben, Dialekt, ohne Anrede)
- T02 · Person · „steffi“ (Kleingeschrieben, Dialekt, ohne Anrede)
- T02 · Person · „gerhard lechner“ (Kleingeschrieben, Dialekt, ohne Anrede)
- T02 · Adresse · „sportplatzweg 3, 6370 kitzbühel“ (Kleingeschrieben, Dialekt, ohne Anrede)
- T03 · Person · „James O'Neill“ (Englisch, Namen nicht in der Liste, O'Neill)
- T03 · Person · „Siobhan“ (Englisch, Namen nicht in der Liste, O'Neill)
- T03 · Person · „Tom“ (Englisch, Namen nicht in der Liste, O'Neill)
- T03 · Person · „Grace Walker“ (Englisch, Namen nicht in der Liste, O'Neill)
- T04 · Telefon · „347 1234567“ (Italienisch, Handynummer ohne 0)
- T05 · Person · „van der Berg“ (Niederländisch, van der, Postleitzahl mit Buchstaben)
- T05 · Person · „van der Berg“ (Niederländisch, van der, Postleitzahl mit Buchstaben)
- T05 · Person · „Johannes van der Berg“ (Niederländisch, van der, Postleitzahl mit Buchstaben)
- T05 · Adresse · „Keizersgracht 123, 1015 CJ Amsterdam“ (Niederländisch, van der, Postleitzahl mit Buchstaben)
- T07 · Person · „Novak“ (Beschwerde, Nachname ohne Anrede)
- T07 · Person · „Bernd Kowalski“ (Beschwerde, Nachname ohne Anrede)
- T08 · Geburtsdatum · „3. März 1984“ (Meldedaten mit Geburtsdatum, Pass, Kreditkarte)
- T12 · Person · „mario rossi“ (Interne Notiz, kleingeschrieben)
- T13 · Firma · „Müller & Söhne OG“ (Handwerkerrechnung, Firma mit &, Kunde ohne Rechtsform)
- T13 · Adresse · „Gewerbepark 4, 6111 Volders“ (Handwerkerrechnung, Firma mit &, Kunde ohne Rechtsform)
- T13 · Firma · „Gasthof Sonnhof“ (Handwerkerrechnung, Firma mit &, Kunde ohne Rechtsform)
- T14 · Telefon · „0800 123 456“ (Telekom-Rechnung, Hotline-Nummer)
- T14 · Firma · „Pension Alpenblick“ (Telekom-Rechnung, Hotline-Nummer)
- T15 · Adresse · „Via dei Mille 12/b, 39100 Bolzano“ (Italienische Lieferantenrechnung)
- T16 · Adresse · „83022 Rosenheim“ (Deutsche Rechnung, Adresse mit Mittelpunkt getrennt)
- T18 · Gesundheitsangabe · „Krankenstand“ (Lohnzettel mit SV-Nummer und Krankenstand)
- T18 · Gesundheitsangabe · „Grippe“ (Lohnzettel mit SV-Nummer und Krankenstand)
- T20 · Kunden-/Vertragsnr. · „88231“ (Mahnung mit Kundennummer 'KdNr')
- T21 · Person · „Jovana Petrović“ (Bewerbung mit Sonderzeichen im Namen)
- T22 · Person · „Aylin“ (Dienstplan mit Vornamen)
- T26 · Gesundheitsangabe · „erkrankt“ (Storno mit Erkrankung und IBAN)
- T27 · Adresse · „1420 Pine Street, Denver, CO 80202“ (US-Adresse)
- T30 · Sonstiges · „@bergliebe_tirol“ (Stammgast mit Instagram-Namen)
- T33 · Person · „Ömer Yılmaz“ (Lieferschein mit Fahrer und Kennzeichen)
- T35 · Person · „Gstrein“ (Protokoll mit Nachnamen ohne Anrede)
- T35 · Person · „Gstrein“ (Protokoll mit Nachnamen ohne Anrede)
- T35 · Person · „Kathrein“ (Protokoll mit Nachnamen ohne Anrede)
- T35 · Person · „Kathrein“ (Protokoll mit Nachnamen ohne Anrede)
- T35 · Person · „Auer“ (Protokoll mit Nachnamen ohne Anrede)

## Fehlalarme (2)

- T06 · Person · „Assistenz der Geschäftsführung“ (person:signatur)
- T11 · Person · „Booking Team“ (person:kopfzeile)
