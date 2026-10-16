# AGENTS.md – Regeln für alle, die an diesem Projekt arbeiten

Gilt für Menschen und KI-Agenten (Codex, Claude & Co.). Codex liest diese Datei automatisch, Claude über `CLAUDE.md`.

## Das Projekt in einem Satz

Der Datenschutz-Bot ersetzt personenbezogene Daten durch Platzhalter, bevor eine KI ein Dokument sieht, und setzt sie danach wieder ein. Ein Mensch prüft vorher und nachher.

## Die wichtigste Regel

**Originaldaten verlassen den Bot nie.** Keine Antwort des MCP-Servers, kein Log, keine Datei außerhalb des verschlüsselten Bereichs darf Originalwerte enthalten. Jede Änderung, die das berühren könnte, braucht einen Test (siehe `src/test/mcp.test.ts`, „Datenschutz-Probe mit Lösungsblatt“). Die Probe vergleicht immer mit einem unabhängigen Lösungsblatt, nie mit den Funden der Erkennung selbst.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren |
| `npm run build` | TypeScript nach `dist/` übersetzen |
| `npm run typecheck` | Typprüfung ohne Ausgabe |
| `npm test` | Build und alle Tests |
| `npm run demo` | ganzer Ablauf, ein Skript spielt die KI, mit Datenschutz-Probe |
| `npm run probe` | Datenschutz-Probe mit Lösungsblatt (Beispiele und Testset) über den echten MCP-Server |
| `npm run messung` | Trefferquote und Genauigkeit am Testset; `-- --datei testset/pruefset.json` für das Prüfset |
| `npm start` | Oberfläche auf http://127.0.0.1:4317 |
| `npm run nachweis` | Nachweis für den Merge erzeugen (Gesetzbuch G12) |

## Wo liegt was

| Ordner | Inhalt |
|---|---|
| `src/core/` | Erkennung, Platzhalter, Rückübersetzung, Verschlüsselung, Rechnungen, Buchungen (reine Logik, keine Ein-/Ausgabe) |
| `src/store/` | Ablage, Status, Protokoll, Rechnungsnummern, Konfiguration |
| `src/mcp/` | MCP-Server für die KI |
| `src/web/` + `public/` | Oberfläche (nur localhost) |
| `src/test/` | Tests (`node:test`) |
| `config/` | Firmendaten, Firmenverzeichnis, Kontenplan (Beispieldaten) |
| `examples/` | erfundene Beispiel-Dokumente |
| `docs/` | Projektordner: Auftrag, Architektur, Datenschutz, Qualität, Reviews, Nachweise, Berichte, Roadmap (Übersicht: `docs/README.md`) |

## Arbeitsweise (Cortex Forge Gesetzbuch v2.4)

1. **G1 – Auftragsprotokoll:** Vor jeder Aufgabe eine Datei in `docs/00-auftrag/` nach der Vorlage anlegen.
2. **Kleine Commits** mit deutscher, beschreibender Nachricht. Nie auf `main` arbeiten.
3. **G12 – Nachweis:** Vor jedem Merge `npm run nachweis` ausführen. Die erzeugte Datei in `docs/05-nachweise/` mit committen.
4. **G8 – Triple-Review:** Codex, Gemini und Claude prüfen nach `docs/04-reviews/README.md`. Jede Einzelnote mindestens 7,5, der Schnitt mindestens 8,0.
5. **G9 – Phasenbericht:** Am Ende jeder Phase ein HTML-Bericht (A4, druckfähig) in `docs/06-berichte/`.
6. **Auto-Hold:** Kein Merge ohne ausdrückliches OK von Peter.

## Regeln für Code und Daten

- Keine echten Kundendaten ins Repo, in Tests, in Beispiele oder in Prompts. Beispiele sind erfunden (Domains `example.com`/`.example`).
- `data/` nie committen. Dort liegen Schlüssel und verschlüsselte Dokumente.
- Neuer oder geänderter Erkenner: immer ein Test, dass er greift, und ein Test, dass er keinen Fehlalarm auslöst (`src/test/detectors.test.ts`). Muster mit begrenzten Wiederholungen und Wortanfang-Prüfung schreiben (lineare Laufzeit, siehe Laufzeittest).
- `testset/pruefset.json` ist das unabhängige Prüfset: nur messen, nie daran entwickeln. Wer Regeln anhand des Prüfsets ändert, braucht danach ein neues Prüfset.
- KI-Agenten nie im Datenordner arbeiten lassen; `data/` ist für Claude Code in `.claude/settings.json` gesperrt.
- Beträge, Steuern und Rechnungsnummern berechnet der Bot, nie die KI.
- Die Oberfläche baut HTML nur mit `textContent`, nie mit `innerHTML` aus Daten.
- Neue Abhängigkeiten nur nach Rücksprache.
- Texte für Nutzer auf Deutsch, einfach und ohne Fachjargon.

## Bekannte Grenzen

Siehe `docs/07-roadmap/offene-punkte.md`. Bitte dort ergänzen statt TODO-Kommentare im Code zu verstreuen.
