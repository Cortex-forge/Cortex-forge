# Projektordner Datenschutz-Bot

Hier liegt alles außer dem Code: warum wir etwas bauen, wie es aufgebaut ist, wie wir prüfen und was noch offen ist. Die Ordner sind nummeriert und folgen dem Ablauf eines Vorhabens.

| Ordner | Inhalt | Gesetzbuch |
|---|---|---|
| [`00-auftrag/`](00-auftrag/) | Auftragsprotokolle: Ziel, Umfang, Abnahmekriterien je Aufgabe | G1 |
| [`01-architektur/`](01-architektur/) | Aufbau, Datenfluss, Statusablauf, Architektur-Entscheidungen (ADR) | |
| [`02-datenschutz/`](02-datenschutz/) | Datenschutzkonzept, Entwurf der Datenschutz-Folgenabschätzung, AVV-Checkliste | |
| [`03-qualitaet/`](03-qualitaet/) | Umsetzung des Gesetzbuchs, Phase-0-Gate, Testkonzept, Definition of Done | G11 |
| [`04-reviews/`](04-reviews/) | Ablauf und Ergebnisse der Triple-Reviews (Codex, Gemini, Claude) | G8 |
| [`05-nachweise/`](05-nachweise/) | Echte Ausgaben von Typprüfung, Tests und Datenschutz-Probe je Merge | G12 |
| [`06-berichte/`](06-berichte/) | Phasenberichte als HTML (A4, druckfähig) | G9 |
| [`07-roadmap/`](07-roadmap/) | Roadmap bis zum Pilot und Liste der offenen Punkte | |
| [`assets/`](assets/) | Bildschirmfotos der Oberfläche | |

## Wo stehen wir?

- **Phase 0 (Prototyp):** gebaut, Version 0.7.0, 135 Tests grün (auch im Browser), Datenschutz-Probe ohne Leck.
- **Feste Dokumente mit Vorlage (neu):** Für Dokumente, die immer gleich aufgebaut sind, ersetzt der Bot die Felder der Vorlage sicher: am Vorlagen-Testset 100 % (ohne Vorlage 84,9 %). Musterdokument für Vorführungen; Anleitung in `config/vorlagen/README.md` (ADR-007).
- **Erkennung:** **blindes Prüfset 2: 82,1 % Trefferquote, 90,9 % Genauigkeit** (Stand 0.6.1; erste Messung 82,0 % / 90,7 %, vorher am damals blinden Prüfset 1: 72,8 % / 91,7 %). Auf neuen Dokumenten rutscht noch knapp jede fünfte Angabe durch, vor allem Firmen ohne Rechtsform, Gesundheit, Religion und Adressen. Ziele nicht erreicht ([`03-qualitaet/testkonzept.md`](03-qualitaet/testkonzept.md)).
- **Reviews:** vier Runden. Runde 1: Claude 4, Codex 4,2. Runde 2: Codex 5,2, Claude 4,6. Runde 3: Codex 5,5 (alle 14 Befunde behoben), Claude 5,2 (19 behoben, 1 teilweise, 2 offen). Runde 4: Codex 6,0 (alle 9 Befunde behoben), Claude 5,4 (10 behoben, 2 teilweise, 4 offen). Gemini ist vorerst nicht dabei: Peter möchte es nur, wenn es automatisch über das Abo läuft. Übersicht: [`04-reviews/README.md`](04-reviews/README.md).
- **Phase-0-Gate:** offen (siehe [`03-qualitaet/phase-0-gate.md`](03-qualitaet/phase-0-gate.md)).
- **Nächster Schritt:** Vorlagen für die Dokumente der ersten Firma; PDF einlesen (offene Punkte #3). Für Dokumente ohne Vorlage: Entscheidung über die zweite Erkennungsstufe mit einem lokalen Modell (ADR-006, offene Punkte #2).

## Regeln für diesen Ordner

- Neue Dateien nach dem Muster `JJJJ-MM-TT-thema.md` benennen, damit die Reihenfolge stimmt.
- Nichts löschen, was entschieden oder geprüft wurde. Überholtes als „ersetzt durch …“ markieren.
- Keine echten Personendaten in diesen Ordner, auch nicht in Bildschirmfotos.
