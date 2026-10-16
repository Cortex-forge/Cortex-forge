# Messung der Erkennung · 2026-10-16 · pruefset-1-nach-entwicklung

Testset: `testset/pruefset.json` (40 erfundene Fälle, davon 7 ohne sensible Angaben). Gemessen mit `npm run messung`.

> **Kein unabhängiger Wert.** Seit 2026-10-16 wird an Prüfset 1 entwickelt (Entscheidung Peter). Diese Messung zeigt nur, dass die Fehler daraus behoben sind. Wie gut die Erkennung auf neuen Dokumenten ist, zeigt das blind erstellte Prüfset 2.

**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen. Erwartete Werte zählen nur als ganze Wörter.

| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |
|---|---|---|---|---|---|---|---|
| Person | 173 | 171 | 98,8 % | 147 | 142 | 96,6 % | erreicht |
| Adresse | 49 | 49 | 100 % | 26 | 26 | 100 % | erreicht |
| Gesundheitsangabe | 48 | 48 | 100 % | 52 | 48 | 92,3 % | erreicht |
| Telefon | 43 | 43 | 100 % | 42 | 42 | 100 % | erreicht |
| E-Mail | 18 | 18 | 100 % | 18 | 18 | 100 % | erreicht |
| Firma | 18 | 17 | 94,4 % | 19 | 13 | 68,4 % | – |
| Geburtsdatum | 18 | 17 | 94,4 % | 17 | 17 | 100 % | – |
| Ausweisnummer | 16 | 16 | 100 % | 16 | 16 | 100 % | – |
| Religionsangabe | 10 | 10 | 100 % | 11 | 10 | 90,9 % | erreicht |
| IBAN | 9 | 9 | 100 % | 9 | 9 | 100 % | erreicht |
| Sonstiges | 8 | 8 | 100 % | 7 | 7 | 100 % | – |
| UID-Nummer | 7 | 7 | 100 % | 7 | 7 | 100 % | erreicht |
| Kfz-Kennzeichen | 5 | 5 | 100 % | 5 | 5 | 100 % | – |
| Steuernummer | 3 | 3 | 100 % | 3 | 3 | 100 % | – |
| Kreditkarte | 3 | 3 | 100 % | 3 | 3 | 100 % | erreicht |
| Kunden-/Vertragsnr. | 3 | 3 | 100 % | 4 | 3 | 75 % | – |
| Sozialversicherungsnr. | 3 | 3 | 100 % | 3 | 3 | 100 % | – |
| **Gesamt** | 434 | 430 | 99,1 % | 389 | 372 | 95,6 % | |

**Ziele: alle erreicht.**

## Übersehen (4)

- P11 · Person · „Wiśniewski, Kuba“ (Gästeblatt nach Meldegesetz, polnische Familie: Nachname in Großbuchstaben und Vorname getrennt, Nachname zuerst, Kosename, drei Datumsformate, Pass- und Ausweisnummer, polnische Adresse)
- P30 · Firma · „De Wolk“ (Niederländische Bitte um Rechnungskorrektur: kleine Firma mit Kurzform, KvK- und Btw-Nummer, IBAN, Kontaktperson mit Initiale und vollem Namen, Privatadresse einer Mitreisenden mit Doppelnamen; Rechnungs- und Zimmernummer als Fallen)
- P31 · Person · „W. v. H.“ (Lange, zweimal weitergeleitete Mail mit Kopfzeilen und Zitaten: Titel, Adelsname mit 'von' und 'v.', Initialen als Unterschrift, Doppelnamen, Herzschrittmacher, Allergie, Zöliakie, Firmenkreditkarte mit Ablaufdatum, Telefon und Fax mit Durchwahl, Nummer nach 'erreichbar unter', Stammgastnummer, Wiener Kennzeichen)
- P40 · Geburtsdatum · „27.4.1989“ (Vertrauliche Aktennotiz Personal: Aufenthaltstitel-, Pass- und SV-Nummer, zwei Geburtsdaten in verschiedenen Formaten, buddhistischer Feiertag, Arbeitsunfall mit Verletzung, neue Handynummer; Behörde, Termine und Personalzimmer als Fallen)

## Fehlalarme (13)

- P05 · Gesundheitsangabe · „senza glutine“ (gesundheit:ernaehrung)
- P10 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)
- P10 · Person · „Heather Grey“ (person:vorname)
- P10 · Firma · „Barclays Bank UK PLC“ (firma:rechtsform)
- P13 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)
- P16 · Firma · „Hotel Alpenrose Reservations“ (firma:kunde)
- P18 · Person · „Nikolaus“ (person:vorname)
- P19 · Gesundheitsangabe · „Krankenstand“ (gesundheit)
- P19 · Gesundheitsangabe · „Krankenstand“ (gesundheit)
- P23 · Religionsangabe · „Mindestaufenthalt“ (religion)
- P31 · Gesundheitsangabe · „glutenfrei“ (gesundheit:ernaehrung)
- P37 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)
- P37 · Firma · „Hotel Alpenrose GmbH“ (firma:rechtsform)

## Geschützt, aber mit falschem Typ (4)

- P06 · ersetzt als Kunden-/Vertragsnr., erwartet Sonstiges · „7730-2291-04“
- P21 · ersetzt als Person, erwartet Firma · „Gruppenreisen Anatolia-Alpin“
- P30 · ersetzt als Person, erwartet Firma · „Wolk“
- P30 · ersetzt als Person, erwartet Firma/Firma · „Fietsreizen De Wolk“
