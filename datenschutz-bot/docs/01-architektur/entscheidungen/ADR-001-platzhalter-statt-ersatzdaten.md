# ADR-001: Platzhalter mit Typ statt erfundener Ersatzdaten

Status: angenommen · 2026-10-16

## Kontext
Sensible Angaben können durch erfundene, echt wirkende Daten ersetzt werden („Anna Huber“ → „Maria Berger“) oder durch erkennbare Platzhalter (`[PERSON_1]`).

## Entscheidung
Wir nutzen Platzhalter mit Typ und laufender Nummer, bei Bedarf mit Kategorie: `[PERSON_1]`, `[FIRMA_1: Elektroinstallateur]`.

## Gründe
- Ein erfundener Name kann zufällig einer echten Person gehören.
- Die KI verändert echt wirkende Namen gern („Frau Berger“, „Maria“). Dann klappt das Zurücktauschen nicht mehr zuverlässig.
- Platzhalter lassen sich prüfen: Fehlt einer oder hat die KI einen erfunden, merkt der Bot es.
- Die Kategorie gibt der KI genug Zusammenhang (z. B. für die Kontenwahl), ohne die Identität preiszugeben.

## Folgen
- Antworten der KI lesen sich vor der Rückübersetzung etwas technischer. Das sieht nur der Prüfer.
- Nach einer Anrede setzt der Bot nur den Nachnamen ein („Sehr geehrte Frau Huber“).
