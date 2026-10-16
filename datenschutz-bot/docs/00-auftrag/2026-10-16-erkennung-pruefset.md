# Auftragsprotokoll: Erkennung auf neuen Dokumenten verbessern

| | |
|---|---|
| Datum | 2026-10-16 |
| Auftraggeber | Peter |
| Ausführung | Claude |
| Branch | `ccr-80b4aca8-cfz53v` |
| Status | in Arbeit |

## Auftrag
Auf unbekannten Dokumenten erkennt der Bot nur rund 73 % der personenbezogenen Angaben (Prüfset 1). Peter hat entschieden, Prüfset 1 zum Entwickeln freizugeben: Die Erkennung wird anhand seiner Fehler verbessert. Damit die Messung ehrlich bleibt, erstellt ein eigener Agent ein neues Prüfset 2, ohne Code und Testsets zu kennen. Daran wird danach nur gemessen.

## Ziel
Weniger übersehene Angaben auf echten Dokumenten, belegt durch eine Messung an Dokumenten, die bei der Entwicklung niemand gesehen hat.

## Umfang
- Prüfset 2 blind erstellen lassen (`testset/pruefset-2.json`, 50 Fälle), nur messen
- Fehler aus Prüfset 1 nach Datenart auswerten und Regeln verbessern: Personen, Adressen, Gesundheit, Telefon, Ausweisnummern, Religion, UID
- Jede Regel mit Positiv- und Gegenprobe (`src/test/detectors.test.ts`), lineare Laufzeit
- Messung an Entwicklungsset, Prüfset 1 und Prüfset 2; Nachweis

## Nicht im Umfang
- Zweite Erkennungsstufe mit lokalem Modell (offene Punkte #2), neue Abhängigkeiten
- Änderungen an Prüfset 2 nach seiner Erstellung

## Abnahmekriterien
- [ ] Prüfset 2 liegt vor; niemand hat bei der Entwicklung hineingeschaut
- [ ] Prüfset 1 deutlich besser, Entwicklungsset weiter 100 %, keine neuen Fehlalarme in den Gegenproben
- [ ] Messung an Prüfset 2 abgelegt, auch wenn die Ziele verfehlt werden
- [ ] Tests grün, Nachweis erzeugt (`npm run nachweis`)
- [ ] Reviews nach `docs/04-reviews/README.md`

## Risiken und offene Fragen
- Regeln, die auf Prüfset 1 zugeschnitten sind, übertragen sich schlecht. Prüfset 2 zeigt das; bleibt der Abstand groß, ist das lokale Modell (#2) der nächste Schritt.
- Mehr Treffer bedeuten oft mehr Fehlalarme. Die Genauigkeit wird mitgemessen.

## Ergebnis
_Wird nach Abschluss ergänzt._
