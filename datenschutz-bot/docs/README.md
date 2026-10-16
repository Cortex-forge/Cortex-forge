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

- **Phase 0 (Prototyp):** gebaut, Version 0.4.0, 85 Tests grün (auch im Browser), Datenschutz-Probe ohne Leck.
- **Erkennung:** Entwicklungsset 100 %, **unabhängiges Prüfset 72,8 % Trefferquote, 91,7 % Genauigkeit**: Auf neuen Dokumenten rutscht noch gut ein Viertel der Angaben durch. Ziele nicht erreicht ([`03-qualitaet/testkonzept.md`](03-qualitaet/testkonzept.md)).
- **Reviews:** zwei Runden. Runde 1: Claude 4, Codex 4,2. Runde 2: Codex 5,2, Claude 4,6. Alle Blocker und Befunde bearbeitet (ein Punkt teilweise, Schlüssel unter eigenem Benutzer). Gemini prüft über Peters Abo in Antigravity ([`04-reviews/gemini-anleitung.md`](04-reviews/gemini-anleitung.md)). Übersicht: [`04-reviews/README.md`](04-reviews/README.md).
- **Phase-0-Gate:** offen (siehe [`03-qualitaet/phase-0-gate.md`](03-qualitaet/phase-0-gate.md)).
- **Nächster Schritt:** dritte Prüfrunde (Codex, Claude, Gemini) auf dem neuen Stand; Entscheidung, wie die Erkennung besser wird (offene Punkte #19).

## Regeln für diesen Ordner

- Neue Dateien nach dem Muster `JJJJ-MM-TT-thema.md` benennen, damit die Reihenfolge stimmt.
- Nichts löschen, was entschieden oder geprüft wurde. Überholtes als „ersetzt durch …“ markieren.
- Keine echten Personendaten in diesen Ordner, auch nicht in Bildschirmfotos.
