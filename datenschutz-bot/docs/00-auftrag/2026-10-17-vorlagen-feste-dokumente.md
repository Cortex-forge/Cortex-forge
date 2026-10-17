# Auftragsprotokoll: Vorlagen für feste Dokumente

| | |
|---|---|
| Datum | 2026-10-17 |
| Auftraggeber | Peter |
| Ausführung | Claude |
| Branch | `ccr-80b4aca8-cfz53v` |
| Status | geliefert, Reviews offen |

## Auftrag
Jede Firma hat feste Dokumente, die immer gleich aufgebaut sind (Buchungsbestätigung, Meldeblatt, Rechnung). Der Bot soll solche Dokumente an einer Vorlage wiedererkennen und die Felder der Vorlage sicher ersetzen, ohne manuelle Eingabe. Für Vorführungen braucht es ein festes Musterdokument mit Vorlage. Will eine Firma den Bot, passen wir ihn mit Vorlagen für ihre Dokumente an, ohne Code zu ändern.

## Ziel
Bei bekannten Dokumenten hängt der Schutz nicht mehr an der freien Erkennung (am blinden Prüfset 82 %), sondern an der Vorlage: Was in einem Feld steht, wird immer ersetzt, auch ungewöhnliche Namen. Weicht ein Dokument von seiner Vorlage ab, sieht der Mitarbeiter das bei der Prüfung.

## Umfang
- Vorlagen als Dateien in `config/vorlagen/` (je Firma und Dokumentart eine Datei), geprüft beim Laden
- Vorlage automatisch erkennen (Erkennungsmerkmale im Text), Felder nach Bezeichnung lesen (auch mehrzeilig und mit Wert in der nächsten Zeile)
- Feste Texte der Firma (Briefkopf, Fußzeile) bleiben stehen
- Abweichung melden: fehlende Pflichtfelder in der Oberfläche
- Freitext-Felder laufen weiter durch die normale Erkennung und die Prüfung
- Musterdokument „Buchungsbestätigung Musterhotel Alpenblick“ mit Vorlage, Lösungsblatt und eigenem Testset
- Tests (Positiv- und Gegenproben, Laufzeit), Messung, Doku (ADR-007, Anleitung für neue Vorlagen)

## Nicht im Umfang
- PDF direkt einlesen (offene Punkte #3); Vorlagen arbeiten mit dem Text des Dokuments
- Vorlagen in der Oberfläche anlegen (zunächst legen wir sie als Datei an)
- Tabellen-Felder (Positionen); Tabellen mit Spaltenköpfen erkennt der Bot schon

## Abnahmekriterien
- [x] Musterdokument und alle Varianten im Vorlagen-Testset: 100 % der Felder ersetzt, auch ungewöhnliche Namen (ohne Vorlage 84,9 %)
- [x] Fehlt ein Pflichtfeld, meldet die Oberfläche die Abweichung (im Browser geprüft)
- [x] Dokumente ohne passende Vorlage laufen unverändert durch die normale Erkennung (Messungen unverändert)
- [x] Tests grün (135), Nachweis erzeugt (`npm run nachweis`, nicht bestanden nur wegen der Ziele am blinden Prüfset 2)
- [ ] Reviews nach `docs/04-reviews/README.md`

## Risiken und offene Fragen
- Ändert eine Firma ihr Dokument (neue Bezeichnung), greift das Feld nicht mehr. Gegenmaßnahme: Pflichtfelder, Hinweis in der Oberfläche, Prüfschritt bleibt.
- Echte Firmendokumente kommen oft als PDF. Bis PDF eingelesen werden kann, braucht es den kopierten Text.

## Ergebnis
Vorlagen in `config/vorlagen/` mit Anleitung, Erkennung der Vorlage und der Felder in `src/core/templates.ts`, Hinweis in der Prüfansicht, Musterdokument `examples/musterhotel-buchungsbestaetigung.txt` (auch als Beispiel in der Oberfläche), Vorlagen-Testset `testset/vorlagen.json`, Messbericht `docs/03-qualitaet/2026-10-17-messung-vorlagen.md`, ADR-007. Commits und Nachweis: siehe Git-Verlauf und `docs/05-nachweise/`.
