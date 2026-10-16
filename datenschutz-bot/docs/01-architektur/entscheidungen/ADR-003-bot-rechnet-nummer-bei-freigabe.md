# ADR-003: Der Bot rechnet, die Rechnungsnummer kommt erst bei der Freigabe

Status: angenommen · 2026-10-16

## Kontext
Sprachmodelle machen bei Arithmetik gelegentlich Fehler. Rechnungsnummern müssen fortlaufend sein. Verworfene Entwürfe dürfen keine Lücken erzeugen.

## Entscheidung
- Die KI liefert Mengen, Einzelpreise und Steuersätze. Netto, Steuer, Brutto und Summen berechnet der Bot.
- Bei Buchungen vergleicht der Bot sein Ergebnis mit dem Bruttobetrag laut Beleg und meldet Abweichungen.
- Die Umsatzsteuer wird je Steuersatz aus der Summe berechnet, nicht je Zeile. So entstehen keine Cent-Differenzen. Bei Bruttopreisen (Privatgäste) wird sie aus der Bruttosumme herausgerechnet.
- Die Rechnungsnummer (`JJJJ-NNNN`) vergibt der Bot erst bei der Freigabe durch einen Mitarbeiter.

## Folgen
- Ein Entwurf zeigt „Entwurf – Nummer bei Freigabe“.
- Die Zähler liegen in `data/rechnungsnummern.json`. Bei mehreren Arbeitsplätzen braucht es später eine zentrale Vergabe (siehe offene Punkte).
