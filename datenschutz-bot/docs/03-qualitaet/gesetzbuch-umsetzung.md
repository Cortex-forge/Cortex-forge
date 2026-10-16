# Umsetzung des Cortex Forge Gesetzbuchs (v2.4) in diesem Projekt

| Regel | Was sie verlangt | Wie wir sie hier umsetzen |
|---|---|---|
| G1 | Auftragsprotokoll vor jeder Aufgabe | `docs/00-auftrag/` mit Vorlage `vorlage.md` |
| G8 | Triple-Review (Codex, Gemini, Claude) | Ablauf, Prüfaufträge und Ergebnisse in `docs/04-reviews/` |
| G9 | Phasenbericht als HTML, A4, druckfähig | `docs/06-berichte/` |
| G11 | Phase-0-Gate mit Pflichtprüfungen vor Phase 1 | `docs/03-qualitaet/phase-0-gate.md` |
| G12 | Echte Tool-Ausgaben bei jedem Merge | `npm run nachweis` schreibt nach `docs/05-nachweise/` |
| Auto-Hold | Kein Merge ohne Peters OK | Arbeit nur auf Branches; Merge erst nach Peters ausdrücklicher Freigabe |
| Mindestnoten | Einzelnote ≥ 7,5, Schnitt ≥ 8,0 | Übersichtstabelle in `docs/04-reviews/README.md` |

Die genaue Formulierung der Regeln steht im Gesetzbuch. Weicht etwas ab, gilt das Gesetzbuch. Diese Datei dann anpassen.
