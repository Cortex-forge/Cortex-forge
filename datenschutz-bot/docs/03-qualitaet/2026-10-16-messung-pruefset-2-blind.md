# Messung der Erkennung · 2026-10-16 · pruefset-2-blind

Testset: `testset/pruefset-2.json` (50 erfundene Fälle, davon 8 ohne sensible Angaben). Gemessen mit `npm run messung`.

**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen. Erwartete Werte zählen nur als ganze Wörter.

| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |
|---|---|---|---|---|---|---|---|
| Person | 348 | 315 | 90,5 % | 286 | 266 | 93 % | nicht erreicht |
| Adresse | 82 | 65 | 79,3 % | 45 | 36 | 80 % | nicht erreicht |
| Firma | 79 | 41 | 51,9 % | 38 | 35 | 92,1 % | – |
| Gesundheitsangabe | 66 | 44 | 66,7 % | 63 | 50 | 79,4 % | nicht erreicht |
| Telefon | 48 | 47 | 97,9 % | 50 | 45 | 90 % | nicht erreicht |
| E-Mail | 32 | 32 | 100 % | 32 | 32 | 100 % | erreicht |
| IBAN | 21 | 21 | 100 % | 21 | 21 | 100 % | erreicht |
| Sonstiges | 20 | 15 | 75 % | 12 | 12 | 100 % | – |
| Geburtsdatum | 16 | 14 | 87,5 % | 14 | 14 | 100 % | – |
| UID-Nummer | 15 | 11 | 73,3 % | 10 | 10 | 100 % | nicht erreicht |
| Religionsangabe | 10 | 6 | 60 % | 7 | 6 | 85,7 % | nicht erreicht |
| Kunden-/Vertragsnr. | 10 | 4 | 40 % | 4 | 4 | 100 % | – |
| Steuernummer | 7 | 7 | 100 % | 6 | 6 | 100 % | – |
| Ausweisnummer | 5 | 2 | 40 % | 6 | 2 | 33,3 % | – |
| Kfz-Kennzeichen | 5 | 1 | 20 % | 1 | 1 | 100 % | – |
| Sozialversicherungsnr. | 5 | 5 | 100 % | 4 | 4 | 100 % | – |
| Kreditkarte | 4 | 4 | 100 % | 5 | 4 | 80 % | nicht erreicht |
| **Gesamt** | 773 | 634 | 82 % | 604 | 548 | 90,7 % | |

**Ziele nicht erreicht: Person (Trefferquote 90,5 %, Ziel 95 %; Genauigkeit 93 %, Ziel 90 %); Adresse (Trefferquote 79,3 %, Ziel 98 %; Genauigkeit 80 %, Ziel 95 %); Gesundheitsangabe (Trefferquote 66,7 %, Ziel 95 %; Genauigkeit 79,4 %, Ziel 85 %); Telefon (Trefferquote 97,9 %, Ziel 98 %; Genauigkeit 90 %, Ziel 95 %); UID-Nummer (Trefferquote 73,3 %, Ziel 100 %; Genauigkeit 100 %, Ziel 98 %); Religionsangabe (Trefferquote 60 %, Ziel 95 %; Genauigkeit 85,7 %, Ziel 85 %); Kreditkarte (Trefferquote 100 %, Ziel 100 %; Genauigkeit 80 %, Ziel 98 %).**

Übersehen: 139, Fehlalarme: 41, mit falschem Typ: 15.

Blindes Prüfset: Werte aus dem Testset stehen bewusst nicht in diesem Bericht.
