# Reviews (Gesetzbuch G8: Triple-Review)

Jeder Stand, der gemergt werden soll, wird von drei unabhängigen Prüfern bewertet: **Codex**, **Gemini** und **Claude**. Alle bekommen denselben [Prüfauftrag](pruefauftrag.md) und liefern im Format der [Vorlage](vorlage.md).

**Hürde:** Jede Einzelnote mindestens 7,5, der Schnitt mindestens 8,0. Offene Blocker verhindern den Merge, egal wie gut die Noten sind.

## Übersicht

| Datum | Reviewer | Modell | Geprüfter Stand | Gesamtnote | Offene Blocker | Bericht |
|---|---|---|---|---|---|---|
| 2026-10-16 | Claude (unabhängiger Prüf-Agent) | Claude | `ff0aeb0` | läuft | | folgt: `2026-10-16-claude.md` |
| offen | Codex | von Peter gewünscht: „Codex Astra 6.0 Ultra“ | | | | |
| offen | Gemini | | | | | |

## So läuft ein Codex-Review

**Empfohlen: offizielles Codex-Plugin für Claude Code** ([openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)). Voraussetzung: Codex ist auf dem Rechner installiert und angemeldet (ChatGPT-Konto oder OpenAI-API-Schlüssel). In Claude Code im Projektordner:

```
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

Dann prüfen lassen:

- `/codex:review --base main` – Standard-Review aller Änderungen gegenüber `main`, nur lesend
- `/codex:adversarial-review` mit dem Text aus [`pruefauftrag.md`](pruefauftrag.md) als Fokus – kritische Prüfung nach unserem Auftrag

Das Modell stellt ihr in der Codex-Konfiguration ein (`~/.codex/config.toml`, Eintrag `model = "…"`). Details und aktuelle Optionen: README des Plugins.

**Hinweis:** Der früher oft beschriebene Befehl `codex mcp-server` (Codex als MCP-Server) ist laut OpenAI-Dokumentation entfernt worden (Codex 0.154.0, September 2026). Für Claude Code ist das Plugin der vorgesehene Weg.

**Ohne Claude, direkt mit der Codex-CLI** (Optionen je nach Version, siehe `codex exec --help`):

```bash
cd datenschutz-bot
codex exec --sandbox read-only "$(cat docs/04-reviews/pruefauftrag.md)"
```

## So läuft ein Gemini-Review

Mit der Gemini-CLI im Projektordner den Inhalt von `pruefauftrag.md` als Auftrag übergeben, nur lesend.

## Ablage

1. Ergebnis als `JJJJ-MM-TT-<reviewer>.md` nach der Vorlage speichern.
2. Zeile in der Übersicht oben ergänzen.
3. Befunde abarbeiten: In der Spalte „Status“ eintragen, ob behoben (mit Commit), offen oder abgelehnt (mit Grund).
4. Neue Befunde, die nicht sofort behoben werden, in `docs/07-roadmap/offene-punkte.md` übernehmen.
