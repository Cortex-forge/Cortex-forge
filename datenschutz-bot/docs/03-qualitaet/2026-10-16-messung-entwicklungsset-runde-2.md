# Messung der Erkennung · 2026-10-16 · entwicklungsset-runde-2

Testset: `testset/faelle.json` (47 erfundene Fälle, davon 6 ohne sensible Angaben). Gemessen mit `npm run messung`.

**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen. Erwartete Werte zählen nur als ganze Wörter.

| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |
|---|---|---|---|---|---|---|---|
| Person | 91 | 91 | 100 % | 84 | 84 | 100 % | erreicht |
| Telefon | 23 | 23 | 100 % | 23 | 23 | 100 % | erreicht |
| Adresse | 23 | 23 | 100 % | 20 | 20 | 100 % | erreicht |
| E-Mail | 16 | 16 | 100 % | 16 | 16 | 100 % | erreicht |
| Gesundheitsangabe | 15 | 15 | 100 % | 15 | 15 | 100 % | erreicht |
| Firma | 9 | 9 | 100 % | 9 | 9 | 100 % | – |
| IBAN | 7 | 7 | 100 % | 7 | 7 | 100 % | erreicht |
| Kreditkarte | 5 | 5 | 100 % | 4 | 4 | 100 % | erreicht |
| UID-Nummer | 4 | 4 | 100 % | 4 | 4 | 100 % | erreicht |
| Geburtsdatum | 4 | 4 | 100 % | 4 | 4 | 100 % | – |
| Religionsangabe | 4 | 4 | 100 % | 4 | 4 | 100 % | erreicht |
| Kunden-/Vertragsnr. | 3 | 3 | 100 % | 3 | 3 | 100 % | – |
| Ausweisnummer | 2 | 2 | 100 % | 2 | 2 | 100 % | – |
| Steuernummer | 2 | 2 | 100 % | 2 | 2 | 100 % | – |
| Sozialversicherungsnr. | 1 | 1 | 100 % | 1 | 1 | 100 % | – |
| Sonstiges | 1 | 1 | 100 % | 1 | 1 | 100 % | – |
| Kfz-Kennzeichen | 1 | 1 | 100 % | 1 | 1 | 100 % | – |
| **Gesamt** | 211 | 211 | 100 % | 200 | 200 | 100 % | |

**Ziele: alle erreicht.**

## Übersehen (0)

Nichts übersehen.

## Fehlalarme (0)

Keine Fehlalarme.

## Geschützt, aber mit falschem Typ (0)

Keine.
