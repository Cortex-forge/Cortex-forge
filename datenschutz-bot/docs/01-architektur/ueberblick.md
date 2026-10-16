# Architektur-Überblick

## Bausteine

```
┌──────────────────────────── Rechner des Betriebs (bzw. EU-Server) ────────────────────────────┐
│                                                                                                │
│  Oberfläche (src/web, public)      Ablage (src/store)            MCP-Server (src/mcp)          │
│  ─ ablegen, prüfen, schwärzen ──►  ─ Status, Protokoll     ◄──── ─ liest nur KI-Sicht ─────────┼──► KI (Claude, Codex)
│  ─ Ergebnis prüfen, freigeben      ─ verschlüsselte Geheimnisse   ─ speichert Ergebnisse       │     sieht nur Platzhalter
│                                    ─ Rechnungsnummern                                          │
│                     └──────────── Kern (src/core): Erkennung, Platzhalter, ────────────┘       │
│                                   Rückübersetzung, Verschlüsselung, Rechnen                    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Oberfläche und MCP-Server sind zwei getrennte Prozesse. Sie teilen sich den Datenordner (`DSB_DATA_DIR`, Standard `./data`) und damit den Schlüssel.

## Datenfluss

1. **Ablegen:** Der Mitarbeiter fügt Text ein. Der Kern erkennt sensible Stellen und erzeugt die KI-Sicht mit Platzhaltern. Original, Zuordnung und Fundstellen werden verschlüsselt gespeichert, die KI-Sicht im Klartext.
2. **Prüfen:** Die Oberfläche zeigt Original und KI-Sicht nebeneinander. Der Mitarbeiter schwärzt Fehlendes oder nimmt Fehlalarme heraus, dann gibt er frei.
3. **KI arbeitet:** Über den MCP-Server sieht die KI nur freigegebene Dokumente, und zwar nur die KI-Sicht. Sie speichert Text, Buchungen oder eine Rechnung, jeweils mit Platzhaltern.
4. **Zurückübersetzen:** Der Bot setzt die Originale ein, rechnet Steuern und Summen nach und erzeugt Prüfhinweise. Das fertige Ergebnis liegt verschlüsselt. Die KI bekommt als Antwort nur Hinweise und Beträge.
5. **Freigeben und abschließen:** Der Mitarbeiter prüft und gibt frei. Rechnungen erhalten erst jetzt ihre Nummer. „Abschließen“ löscht Original, Zuordnung und Ergebnis.

## Statusablauf

```
neu ──(für KI freigeben)──► bereit ──(KI speichert)──► zur_pruefung ──(freigeben)──► freigegeben ──(abschließen)──► abgeschlossen
                              ▲                             │
                              └──────(zurück an die KI)─────┘
```

| Status | Darf die KI lesen? | Darf die KI speichern? | Originale vorhanden? |
|---|---|---|---|
| neu | nein | nein | ja (verschlüsselt) |
| bereit | ja | ja | ja |
| zur_pruefung | ja | ja (Korrektur) | ja |
| freigegeben | nein | nein | ja |
| abgeschlossen | nein | nein | nein, gelöscht |

## Ablage auf der Platte

```
data/
├── .schluessel                 AES-256-Schlüssel (0600), alternativ Umgebungsvariable DSB_KEY
├── dokumente/D-xxxxxx.json     ein Dokument: KI-Sicht im Klartext, Rest im Feld "geheim" verschlüsselt
├── protokoll.jsonl             Ereignisse ohne Inhalte
└── rechnungsnummern.json       Zähler je Jahr
```

## MCP-Werkzeuge

| Werkzeug | Liest/Schreibt | Antwort an die KI |
|---|---|---|
| `dokumente_auflisten` | liest | IDs, Art, Betreff (KI-Sicht) |
| `dokument_lesen` | liest | KI-Sicht, Platzhalter-Legende, ggf. Kontenplan |
| `ergebnis_speichern` | schreibt | Prüfhinweise |
| `buchungen_vorschlagen` | schreibt | Prüfhinweise, vom Bot berechnete Summen |
| `rechnung_erstellen` | schreibt | Prüfhinweise, vom Bot berechnete Summen |

## Entscheidungen

Die wichtigsten Entscheidungen mit Begründung stehen in [`entscheidungen/`](entscheidungen/).
