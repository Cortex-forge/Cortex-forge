# Roadmap

## Phase 0: Prototyp (Stand 2026-10-16)
Gebaut: Erkennung, Platzhalter, Rückübersetzung, verschlüsselte Ablage, MCP-Server, Oberfläche, Rechnungen, Buchungen, Tests, Demo. Offen bis zum Gate: Erkennung messen, Reviews von Codex und Gemini, Peters OK.

## Phase 1: Pilot mit einem Kunden

| Schritt | Aufwand (grob) | Abhängig von |
|---|---|---|
| Erkennung messen: Testset mit Lösungsblatt, Messskript | 2–3 Tage | – |
| Erkennung verbessern: lokales Modell als zweite Stufe | 1–2 Wochen | Messung |
| Test mit echten Dokumenten vor Ort (lokal, nur Zahlen notieren) | 1–2 Tage | Pilotkunde |
| PDF und Scans (Text-Extraktion, OCR) | 1–2 Wochen | – |
| Login, Rollen, mehrere Benutzer, Hosting in der EU, Datensicherung | 1–2 Wochen | Entscheidung Hosting |
| Datenschutz: AVV-Muster, DSFA, Datenschutzinformationen | parallel | Jurist |
| Schulungsunterlage für Mitarbeiter (1 Seite) | 1 Tag | – |

Etwa 4–7 Wochen bis zum Pilot, ohne Anbindungen.

## Phase 2: Produkt
- Export für BMD, RZL, DATEV; Anbindung an Hotelsoftware (je System 1–3 Wochen plus Wartezeit auf den Partnerzugang)
- Zentrale Rechnungsnummern-Vergabe für mehrere Arbeitsplätze
- Bot als Sicherheitsschicht vor fremden MCP-Servern (z. B. offizieller Server einer Hotelsoftware)

## Offene Entscheidungen
- Eigenes Repository für das Projekt (derzeit Ordner im Profil-Repo `Cortex-forge/Cortex-forge`)
- Erster Zielmarkt: Hotels in Tirol oder Buchhaltungsbüros
- Betrieb: beim Kunden lokal oder bei uns in der EU
