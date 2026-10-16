# Auftragsprotokoll: Erkennung auf neuen Dokumenten verbessern

| | |
|---|---|
| Datum | 2026-10-16 |
| Auftraggeber | Peter |
| Ausführung | Claude |
| Branch | `ccr-80b4aca8-cfz53v` |
| Status | geliefert, Ziele nicht erreicht |

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
- [x] Prüfset 2 liegt vor; niemand hat bei der Entwicklung hineingeschaut (Bericht nur mit Zahlen)
- [x] Prüfset 1 deutlich besser (72,8 % → 99,1 %), Entwicklungsset weiter 100 %, Gegenproben grün
- [x] Messung an Prüfset 2 abgelegt: 82,0 % / 90,7 %, Ziele verfehlt
- [x] Tests grün, Nachweis erzeugt (`npm run nachweis`, nicht bestanden wegen der Ziele)
- [ ] Reviews nach `docs/04-reviews/README.md` (vierte Runde: Codex 6,0, alle 9 Befunde behoben in `1f9acd7`; Claude 5,4, 10 behoben, 2 teilweise, 4 offen; Hürde 7,5/8,0 nicht erreicht)

## Risiken und offene Fragen
- Regeln, die auf Prüfset 1 zugeschnitten sind, übertragen sich schlecht. Prüfset 2 zeigt das; bleibt der Abstand groß, ist das lokale Modell (#2) der nächste Schritt.
- Mehr Treffer bedeuten oft mehr Fehlalarme. Die Genauigkeit wird mitgemessen.

## Ergebnis
Commits `5c685d4` bis `2eff816`. Auf neuen Dokumenten (blindes Prüfset 2) steigt die Trefferquote von 72,8 % auf 82,0 % bei gleicher Genauigkeit (90,7 %). Am Prüfset 1, an dem entwickelt wurde, stehen 99,1 %: Der Abstand zeigt, wie stark Regeln an bekannten Fällen hängen. Für die Ziele braucht es die zweite Erkennungsstufe (offene Punkte #2). Messberichte in `docs/03-qualitaet/`. Nach der vierten Prüfrunde (0.6.1): 82,1 % / 90,9 % am blinden Prüfset 2.
