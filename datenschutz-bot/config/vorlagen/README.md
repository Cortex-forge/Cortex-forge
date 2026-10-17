# Vorlagen für feste Dokumente

Eine Vorlage beschreibt ein Dokument einer Firma, das immer gleich aufgebaut ist: Buchungsbestätigung, Meldeblatt, Rechnung eines Stammlieferanten. Der Bot erkennt beim Ablegen selbst, welche Vorlage passt, und ersetzt jedes Feld sicher, ohne Raten (siehe `docs/01-architektur/entscheidungen/ADR-007-vorlagen-fuer-feste-dokumente.md`).

Je Firma und Dokumentart eine Datei `<firma>-<dokument>.json` in diesem Ordner. Beispiel: [`musterhotel-buchungsbestaetigung.json`](musterhotel-buchungsbestaetigung.json) zum Musterdokument `examples/musterhotel-buchungsbestaetigung.txt`.

## Aufbau

```json
{
  "id": "musterhotel-buchungsbestaetigung",
  "name": "Buchungsbestätigung Musterhotel Alpenblick",
  "erkennen": ["Musterhotel Alpenblick", "Buchungsbestätigung"],
  "felder": [
    { "bezeichnung": "Gast", "typ": "PERSON" },
    { "bezeichnung": "Anschrift", "typ": "ADRESSE", "zeilen": 2 },
    { "bezeichnung": "Begleitperson", "typ": "PERSON", "pflicht": false },
    { "bezeichnung": "Besondere Wünsche", "typ": "FREITEXT", "zeilen": 5, "pflicht": false }
  ],
  "unveraendert": ["Dorfstraße 1 · 6100 Seefeld in Tirol · Tel. +43 5212 0000"]
}
```

| Eintrag | Bedeutung |
|---|---|
| `id` | Kennung aus Kleinbuchstaben, Ziffern und Bindestrichen, einmalig |
| `name` | So heißt die Vorlage in der Oberfläche und im Protokoll |
| `erkennen` | Texte, die alle im Dokument stehen müssen. Am besten Firmenname und Dokumenttitel. Passen mehrere Vorlagen, gilt die mit den meisten Texten |
| `felder` | Je Feld: `bezeichnung` wie im Dokument am Zeilenanfang (Doppelpunkt, Tabulator oder zwei Leerzeichen dahinter). Der Wert steht dahinter oder in der nächsten Zeile |
| `typ` | `PERSON`, `FIRMA`, `ADRESSE`, `TELEFON`, `EMAIL`, `GEBURTSDATUM`, `IBAN`, `UID`, `STEUERNR`, `SVNR`, `AUSWEIS`, `KENNZEICHEN`, `KUNDENNR`, `KREDITKARTE`, `GESUNDHEIT`, `RELIGION`, `SONSTIGES` oder `FREITEXT` (wird nicht als Ganzes ersetzt, sondern von der normalen Erkennung gelesen) |
| `zeilen` | Wie viele Zeilen der Wert hat (Adresse: 2). Standard 1 |
| `pflicht` | `false`, wenn das Feld fehlen darf. Fehlt ein Pflichtfeld, zeigt die Oberfläche eine Abweichung |
| `unveraendert` | Feste Texte der Firma (Briefkopf, Fußzeile). Darin wird nichts ersetzt |

## So legen wir eine Vorlage für eine Firma an

1. Ein Beispiel des Dokuments besorgen und **alle echten Angaben durch erfundene ersetzen**. Echte Kundendaten kommen nie ins Repo und nie in einen Chat.
2. Vorlage schreiben: Erkennungsmerkmale, jedes Feld mit Personenbezug, Briefkopf und Fußzeile als `unveraendert`.
3. Testfälle in einem eigenen Testset anlegen (wie `testset/vorlagen.json`): das Beispiel und Varianten mit ungewöhnlichen Namen, fehlenden Feldern und Werten in der nächsten Zeile.
4. Messen: `npm run messung -- --datei testset/<firma>.json`. Erwartet: 100 %.
5. Beim Start prüft der Bot jede Vorlage; ein Fehler in der Datei bricht mit einer Meldung ab.

Ändert die Firma ihr Dokument (neue Bezeichnung, neues Feld), muss die Vorlage nachgezogen werden. Bis dahin meldet die Oberfläche die Abweichung, und der Prüfschritt fängt fehlende Felder ab.
