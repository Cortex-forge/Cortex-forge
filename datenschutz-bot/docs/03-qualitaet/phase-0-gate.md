# Phase-0-Gate: vom Prototyp zum Pilot

Vor dem Start von Phase 1 (Pilot) müssen alle Prüfungen erfüllt sein.

> Diese sieben Punkte sind ein Vorschlag für dieses Projekt. Bitte mit der Liste im Gesetzbuch v2.4 (G11) abgleichen.

| # | Prüfung | Nachweis | Status |
|---|---|---|---|
| 1 | Auftrag, Ziel und Abnahmekriterien schriftlich festgehalten | `docs/00-auftrag/2026-10-16-prototyp.md` | erfüllt |
| 2 | Architektur, Datenfluss und Entscheidungen dokumentiert | `docs/01-architektur/` | erfüllt |
| 3 | Datenschutzkonzept und DSFA-Entwurf vorhanden | `docs/02-datenschutz/` | erfüllt (Entwurf, Jurist offen) |
| 4 | Alle Tests grün inkl. Datenschutz-Probe, Nachweis bestanden | `docs/05-nachweise/` | nicht erfüllt: 117 Tests grün, Probe ohne Leck und mit geprüftem Erfolg jedes Aufrufs, aber der Nachweis scheitert an den Zielen am blinden Prüfset 2 (siehe #5) |
| 5 | Erkennung gemessen: Entwicklungs- und unabhängiges Prüfset mit Lösungsblatt, Ziele erreicht (siehe Testkonzept) | `docs/03-qualitaet/testkonzept.md` | nicht erfüllt: blindes Prüfset 2 82,0 % / 90,7 % (vorher Prüfset 1 blind 72,8 % / 91,7 %); Entwicklungsset 100 %, Prüfset 1 nach der Arbeit daran 99,1 % |
| 6 | Triple-Review mit Einzelnote ≥ 7,5 und Schnitt ≥ 8,0 | `docs/04-reviews/README.md` | nicht erfüllt: Runde 4 Codex 6,0 (vorher 5,5), alle 9 Befunde behoben; Claude Runde 3 5,2 (19 behoben, 1 teilweise, 2 offen), Runde 4 läuft. **Abweichung:** Gemini nicht dabei, bis es automatisch über das Abo läuft (Peter, 2026-10-16); die Hürde gilt für Codex und Claude |
| 7 | Go von Peter | Eintrag hier mit Datum | offen |

## Go-Entscheidung
- Datum:
- Entscheidung:
- Bemerkungen:
