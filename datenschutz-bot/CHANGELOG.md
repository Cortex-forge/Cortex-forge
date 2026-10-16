# Änderungen

## [0.1.0] – 2026-10-16 – Prototyp

### Neu
- Erkennung und Ersetzung personenbezogener Daten (Personen, Firmen, E-Mail, Telefon, IBAN, Kreditkarte, UID, Steuernummer, Adressen, Kennnummern, Gesundheit, Religion) in Deutsch, Englisch, Italienisch und Niederländisch
- Einheitliche Platzhalter je Person, Firmenverzeichnis mit Kategorie für die KI
- Rückübersetzung mit Anrede-Regel und Prüfhinweisen (unbekannte Platzhalter, erfundene Kontaktdaten)
- Verschlüsselte Ablage (AES-256-GCM) mit Statusablauf und Protokoll
- MCP-Server: `dokumente_auflisten`, `dokument_lesen`, `ergebnis_speichern`, `buchungen_vorschlagen`, `rechnung_erstellen`
- Rechnungen mit USt je Steuersatz, Brutto- und Nettorechnung, Nummer erst bei Freigabe
- Oberfläche: ablegen, prüfen, schwärzen, freigeben, Ergebnis prüfen, abschließen und löschen
- 25 Tests, Demo-Skript mit Datenschutz-Probe

### Projektordner
- `AGENTS.md` und `CLAUDE.md` für die Zusammenarbeit von Codex und Claude
- `docs/` mit Auftrag, Architektur und Entscheidungen, Datenschutz, Qualität, Reviews, Nachweisen, Berichten und Roadmap
- `npm run nachweis` für den Merge-Nachweis (G12)
