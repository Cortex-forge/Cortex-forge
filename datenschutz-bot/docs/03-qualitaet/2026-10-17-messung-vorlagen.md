# Messung der Erkennung · 2026-10-17 · Vorlagen-Testset (feste Dokumente, ADR-007)

Testset: `testset/vorlagen.json` (10 erfundene Fälle, davon 0 ohne sensible Angaben). Gemessen mit `npm run messung -- --datei testset/vorlagen.json`, mit der Vorlage `config/vorlagen/musterhotel-buchungsbestaetigung.json`. Zum Vergleich ohne Vorlage: 84,9 % Trefferquote (62/73), 46,6 % Genauigkeit (55/118); ohne Vorlage werden Vornamen und Firmen ohne Rechtsform übersehen und der Briefkopf des Hotels jedes Mal mitgeschwärzt.

**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen. Erwartete Werte zählen nur als ganze Wörter.

| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |
|---|---|---|---|---|---|---|---|
| Person | 24 | 24 | 100 % | 19 | 19 | 100 % | erreicht |
| Adresse | 20 | 20 | 100 % | 20 | 20 | 100 % | erreicht |
| E-Mail | 10 | 10 | 100 % | 10 | 10 | 100 % | erreicht |
| Telefon | 9 | 9 | 100 % | 9 | 9 | 100 % | erreicht |
| Geburtsdatum | 3 | 3 | 100 % | 3 | 3 | 100 % | – |
| Firma | 3 | 3 | 100 % | 3 | 3 | 100 % | – |
| Kfz-Kennzeichen | 2 | 2 | 100 % | 2 | 2 | 100 % | – |
| Gesundheitsangabe | 2 | 2 | 100 % | 2 | 2 | 100 % | erreicht |
| **Gesamt** | 73 | 73 | 100 % | 68 | 68 | 100 % | |

**Ziele: alle erreicht.**

## Übersehen (0)

Nichts übersehen.

## Fehlalarme (0)

Keine Fehlalarme.

## Geschützt, aber mit falschem Typ (0)

Keine.
