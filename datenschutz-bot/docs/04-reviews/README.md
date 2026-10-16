# Reviews (Gesetzbuch G8: Triple-Review)

Jeder Stand, der gemergt werden soll, wird von drei unabhängigen Prüfern bewertet: **Codex**, **Gemini** und **Claude**. Alle bekommen denselben [Prüfauftrag](pruefauftrag.md) und liefern im Format der [Vorlage](vorlage.md).

**Abweichung (Entscheidung Peter, 2026-10-16):** Gemini ist vorerst nicht dabei. Es kommt erst dazu, wenn es wie Codex automatisch über das Abo in der Sitzung läuft (siehe unten). Bis dahin prüfen Codex und Claude; die Hürde gilt für beide.

**Hürde:** Jede Einzelnote mindestens 7,5, der Schnitt mindestens 8,0. Offene Blocker verhindern den Merge, egal wie gut die Noten sind.

## Übersicht

| Datum | Reviewer | Modell | Geprüfter Stand | Gesamtnote | Offene Blocker | Bericht |
|---|---|---|---|---|---|---|
| 2026-10-16 | Claude (unabhängiger Prüf-Agent) | Claude | `ff0aeb0` | **4** | 1 → 0 | [`2026-10-16-claude.md`](2026-10-16-claude.md), Blocker behoben in `d79b5cc`, Stand je Befund im Bericht |
| 2026-10-16 | Codex (ChatGPT-Abo) | GPT-6-Astra, Denkstufe „ultra“ (Peters „Codex Astra 6.0 Ultra“) | `e0437a0` | **4,2** | 2 → 0 | [`2026-10-16-codex.md`](2026-10-16-codex.md), Blocker behoben in `d79b5cc`, Stand je Befund im Bericht |
| 2026-10-16 | Codex, zweite Runde | GPT-6-Astra, Denkstufe „ultra“ | `d79b5cc` | **5,2** | 2 → 0 | [`2026-10-16-codex-2.md`](2026-10-16-codex-2.md), 13 Befunde behoben in `937e572` |
| 2026-10-16 | Claude, zweite Runde (unabhängiger Prüf-Agent) | Claude | `d79b5cc` | **4,6** | 2 → 0 | [`2026-10-16-claude-2.md`](2026-10-16-claude-2.md), 22 Befunde behoben, 1 teilweise (`937e572` bis `4eb0486`) |
| 2026-10-16 | Codex, dritte Runde | GPT-6-Astra, Denkstufe „ultra“ | `1fdd842` | **5,5** | 1 → 0 | [`2026-10-16-codex-3.md`](2026-10-16-codex-3.md), 14 Befunde behoben (`9b94227` bis `2934b0a`) |
| 2026-10-16 | Claude, dritte Runde (unabhängiger Prüf-Agent) | Claude | `1fdd842` | läuft | | |
| – | Gemini | | | | | nicht dabei (Entscheidung Peter, 2026-10-16), siehe unten |

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

**In einer Cloud-Sitzung von Claude Code, über das ChatGPT-Abo statt API-Schlüssel** (so lief das Review am 2026-10-16):

1. ChatGPT → Einstellungen → Sicherheit und Anmeldung: „Anmeldung per Gerätecode für Codex“ einschalten.
2. Claude Code → Titel der Sitzung → Pfeil ⌄ → „Cloud-Umgebung bearbeiten“ → Netzwerkzugriff „Benutzerdefiniert“, erlaubte Domains `chatgpt.com`, `auth.openai.com`, `api.openai.com`, Häkchen bei der Standardliste der Paketmanager lassen, speichern. Wirkt nach etwa einer Minute.
3. In der Sitzung: `npm i -g @openai/codex`, dann `codex login --device-auth`. Link und Code öffnet Peter selbst bei OpenAI; der Code gilt 15 Minuten, die Anmeldung danach bleibt bestehen, solange die Cloud-Umgebung lebt. Die Anmeldedaten (`~/.codex/auth.json`) kommen nie ins Repo.
4. Verfügbare Modelle prüfen: `codex debug models`. „Codex Astra 6.0 Ultra“ ist `gpt-6-astra` mit `model_reasoning_effort = "ultra"`.
5. Codex prüft eine abgetrennte Kopie (eigener `git clone` des geprüften Commits, `node_modules` hineinkopiert), damit Build und Tests laufen können, ohne das echte Projekt zu berühren:
   ```bash
   codex exec -m gpt-6-astra -c model_reasoning_effort='"ultra"' -c approval_policy='"never"' \
     --sandbox workspace-write -c 'sandbox_workspace_write.network_access=true' \
     -o bericht.md "$(cat prompt.md)" < /dev/null
   ```
   `network_access=true` ist nötig, weil die Sandbox sonst die Pipes zu Kindprozessen sperrt und der MCP-Test fälschlich scheitert. Schreibzugriff auf das echte Projekt bleibt gesperrt (geprüft). `prompt.md` = kurzer technischer Hinweis zur Kopie + unveränderter Text aus `pruefauftrag.md`.

Den Lauf sieht man nicht in der Codex-App, weil er weder auf dem eigenen Rechner noch in Codex Cloud läuft.

**Ohne Claude, direkt mit der Codex-CLI** (Optionen je nach Version, siehe `codex exec --help`):

```bash
cd datenschutz-bot
codex exec --sandbox read-only "$(cat docs/04-reviews/pruefauftrag.md)"
```

## So läuft ein Gemini-Review

**Stand 2026-10-16: nicht dabei.** Peter möchte Gemini nur, wenn es automatisch über das Abo läuft, so wie Codex in der Sitzung. Das geht derzeit nicht: Die Gemini-CLI hat keine Anmeldung per Gerätecode, und ein API-Schlüssel wäre nicht das Abo. Sobald sich das ändert, kommt Gemini als dritter Prüfer dazu.

Als Möglichkeit von Hand bleibt beschrieben: Über Peters Google-Pro-Abo in **Antigravity** mit **Gemini 4 Argon (High)** auf dem eigenen Rechner. Schritt für Schritt: [`gemini-anleitung.md`](gemini-anleitung.md).

In einer Cloud-Sitzung von Claude Code geht die Anmeldung mit dem Google-Konto nicht sauber: Die Gemini-CLI kennt keine Anmeldung per Gerätecode, sie verlangt einen Code von der Google-Seite zurück in die Kommandozeile, und der liefe über den Chat. Alternative wäre ein API-Schlüssel aus Google AI Studio als Netzwerk-Secret der Cloud-Umgebung.

## Ablage

1. Ergebnis als `JJJJ-MM-TT-<reviewer>.md` nach der Vorlage speichern.
2. Zeile in der Übersicht oben ergänzen.
3. Befunde abarbeiten: In der Spalte „Status“ eintragen, ob behoben (mit Commit), offen oder abgelehnt (mit Grund).
4. Neue Befunde, die nicht sofort behoben werden, in `docs/07-roadmap/offene-punkte.md` übernehmen.
