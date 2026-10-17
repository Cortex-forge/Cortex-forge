# ADR-007: Vorlagen für feste Dokumente

Status: angenommen · 2026-10-17 (Auftrag Peter)

## Kontext
Die freie Erkennung (Regeln, ADR-004) findet auf unbekannten Dokumenten rund 82 % der persönlichen Angaben (blindes Prüfset 2). Viele Dokumente einer Firma sind aber immer gleich aufgebaut: Buchungsbestätigung, Meldeblatt, Rechnung eines Stammlieferanten. Bei ihnen steht fest, wo der Name, die Adresse oder die Telefonnummer steht. Raten ist dort unnötig.

## Entscheidung
Je Firma und Dokumentart gibt es eine Vorlage als Datei in `config/vorlagen/`. Eine Vorlage nennt:
- **Erkennungsmerkmale:** Texte, die alle im Dokument stehen müssen (z. B. Firmenname und Dokumenttitel). Passen mehrere Vorlagen, gilt die mit den meisten Merkmalen.
- **Felder:** Bezeichnung am Zeilenanfang (z. B. „Gast:“), Art der Angabe, Anzahl Zeilen, Pflichtfeld ja/nein. Der Wert steht hinter der Bezeichnung oder, wenn die Zeile dort endet, in der nächsten Zeile (Kopien aus PDF).
- **Feste Texte:** Briefkopf und Fußzeile der Firma; darin wird nichts ersetzt.

Der Bot erkennt die Vorlage beim Ablegen selbst. Jeder Feldwert wird als Ganzes ersetzt, vor allen anderen Regeln (nur eine manuelle Markierung ist stärker). Felder der Art „Freitext“ (Wünsche, Bemerkungen) laufen wie jeder andere Text durch die normale Erkennung. Der Prüfschritt vor der Freigabe bleibt Pflicht. Fehlt ein Pflichtfeld oder ist es leer, zeigt die Oberfläche das als Abweichung an.

## Gründe
- Für Felder ist der Schutz vollständig, unabhängig davon, ob ein Name in einer Liste steht („Zorwin Xylander“, „Sommer Freitag“).
- Eine neue Firma braucht keine Codeänderung, nur Vorlagen. Das passt zum Ablauf: Wir passen den Bot an die Dokumente der Firma an.
- Nachvollziehbar und testbar: Jede Vorlage lässt sich mit einem Testset aus erfundenen Varianten messen.

## Folgen
- Ändert eine Firma ihr Dokument, greift ein Feld nicht mehr. Pflichtfelder machen das sichtbar; der Prüfschritt fängt den Rest ab.
- Freier Text bleibt so gut wie die Erkennung (ADR-004, ADR-006).
- PDF müssen bis auf Weiteres als Text kopiert werden (offene Punkte #3).
- Vorlagen enthalten keine Personendaten, nur Bezeichnungen und die festen Texte der Firma; sie dürfen ins Repo (Beispiele) bzw. in die Konfiguration der Firma.
