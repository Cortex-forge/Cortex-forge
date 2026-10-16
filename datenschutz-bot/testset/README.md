# Testset mit Lösungsblatt

`faelle.json` enthält erfundene, realistische Dokumente (Hotel-Anfragen, Rechnungen, Belege, Notizen) auf Deutsch, Englisch, Italienisch und Niederländisch. Zu jedem Fall steht im Feld `sensibel`, welche Angaben die KI nicht sehen darf, genau so geschrieben wie im Text.

Die Datenschutz-Probe sucht jede Angabe auch in Teilen (Nachname ohne Vorname, Ziffernfolgen einer IBAN). Steht ein Namensteil im selben Text als gewöhnliches Wort ("an euren Koch" neben "Thomas Koch"), nennt ihn das Feld `teilwort_erlaubt`.

Absichtlich enthalten sind auch schwierige Fälle: kleingeschriebene Namen, Namen ohne Anrede, Namenszusätze wie „van der“, ausländische Telefonformate, Adressen ohne Straßen-Endung, Gesundheitsangaben in Umschreibungen. Dazu kommen Fälle ganz ohne sensible Angaben, um Fehlalarme zu messen.

Messen: `npm run build && npm run messung` (Bericht in `messungen/`, nicht im Repo); `npm run messung -- --ablegen nach-korrektur` legt ihn in `docs/03-qualitaet/` ab.

## Die Testsets

| Datei | Rolle | Regel |
|---|---|---|
| `faelle.json` | Entwicklungsset (T01 ff.) | Daran wird entwickelt; neue Fälle unten anhängen |
| `pruefset.json` | Prüfset 1 (P01–P40), blind von einem eigenen Agenten erstellt | Seit 2026-10-16 zum Entwickeln freigegeben (Entscheidung Peter). Letzte blinde Messung vorher: 72,8 % Trefferquote, 91,7 % Genauigkeit |
| `pruefset-2.json` | Prüfset 2 (Q01–Q50), blind erstellt von einem Agenten, der weder Code noch Testsets kannte | Nur messen, nie hineinschauen, nie daran entwickeln |

## Regeln
- Nur erfundene Daten. Domains `example.com`/`.example`, IBANs mit gültiger Prüfziffer aber erfundenen Konten.
- Neue Fälle unten anhängen, IDs fortlaufend (`T37`, `T38`, …).
- Nach Änderungen an der Erkennung neu messen und den Bericht committen.
