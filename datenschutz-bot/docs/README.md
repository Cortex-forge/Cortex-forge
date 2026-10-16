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

- **Phase 0 (Prototyp):** gebaut, Tests grün. Erste Messung der Erkennung: 75,5 % Trefferquote, 98,4 % Genauigkeit (`03-qualitaet/2026-10-16-messung-ausgangslage.md`).
- **Reviews:** Claude 4 von 10 mit 1 Blocker und 5 hohen Befunden ([`04-reviews/2026-10-16-claude.md`](04-reviews/2026-10-16-claude.md)), die Befunde werden behoben. Codex (GPT-6-Astra, „ultra“) 4,2 von 10 mit 2 Blockern ([`04-reviews/2026-10-16-codex.md`](04-reviews/2026-10-16-codex.md)). Gemini ist offen.
- **Phase-0-Gate:** offen (siehe [`03-qualitaet/phase-0-gate.md`](03-qualitaet/phase-0-gate.md)).
- **Nächster Schritt:** Befunde beheben und neu messen, danach Test mit echten Dokumenten vor Ort (siehe [`07-roadmap/roadmap.md`](07-roadmap/roadmap.md)).

## Regeln für diesen Ordner

- Neue Dateien nach dem Muster `JJJJ-MM-TT-thema.md` benennen, damit die Reihenfolge stimmt.
- Nichts löschen, was entschieden oder geprüft wurde. Überholtes als „ersetzt durch …“ markieren.
- Keine echten Personendaten in diesen Ordner, auch nicht in Bildschirmfotos.
