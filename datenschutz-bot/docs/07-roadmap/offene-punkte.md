# Offene Punkte

Bekannte Grenzen und Aufgaben. Neue Punkte unten ergänzen, erledigte mit Datum und Commit abhaken.

| # | Punkt | Priorität | Quelle | Status |
|---|---|---|---|---|
| 1 | Erkennung messen (Testset mit Lösungsblatt, Messskript) | hoch | Testkonzept | erledigt 2026-10-16 (`e0437a0`, Typvergleich und Prüfset `d79b5cc` ff.) |
| 2 | Namen ohne Anrede, die nicht in der Namensliste stehen, können durchrutschen: zweite Erkennungsstufe mit lokalem Modell | hoch | ADR-004 | offen |
| 3 | PDF und Scans einlesen | hoch | Prototyp-Grenze | offen |
| 4 | Login, Rollen, mehrere Benutzer | hoch (vor Serverbetrieb) | Prototyp-Grenze | offen |
| 5 | Schlüssel in KMS/HSM bzw. Schlüsselbund statt neben den Daten | mittel | Datenschutzkonzept, Review Claude #6 | teilweise: `DSB_KEY_FILE` und Schlüsselkennung je Dokument (`d79b5cc`); KMS offen |
| 6 | Datensicherung mit Löschkonzept | mittel | Datenschutzkonzept | offen |
| 7 | Automatische Löschfrist für abgeschlossene Vorgänge und Protokoll | mittel | Datenschutzkonzept | offen |
| 8 | Zentrale Rechnungsnummern bei mehreren Arbeitsplätzen | mittel | ADR-003 | offen |
| 9 | Export im BMD-, RZL- oder DATEV-Format | mittel | README | offen |
| 10 | Rechnungsvorlage und Kontenplan mit Steuerberatung abstimmen | mittel | README | offen |
| 11 | Reviews von Codex und Gemini | hoch | G8 | Codex erledigt (4,2/10, Befunde behoben `d79b5cc`); Gemini offen |
| 12 | Projekt in eigenes Repository verschieben | niedrig | Roadmap | offen |
| 13 | Bot unter eigenem Benutzer oder in einem Container betreiben, damit lokale KI-Agenten weder Daten noch Schlüssel lesen können (für Claude Code ist `data/` per `.claude/settings.json` gesperrt) | hoch (vor Echtdaten) | Review Claude #6 | offen |
| 14 | Storno bzw. Gutschrift für freigegebene Rechnungen (heute: nicht löschbar, Archiv beim Abschluss) | mittel | Review Claude #18 | offen |
| 15 | Erkennung zusätzlich in einem Worker mit Zeitlimit (heute linear, 200.000 Zeichen < 0,3 s) | niedrig | Review Claude #16 | offen |
| 16 | Zweite Review-Runde (Claude, Codex, Gemini) auf dem korrigierten Stand | hoch | G8 | offen |
| 17 | Gemini-Anmeldung: API-Schlüssel als Netzwerk-Secret der Cloud-Umgebung oder Prüfung lokal mit Abo | hoch | G8 | wartet auf Peter |
| 18 | Ablage älterer Testdaten (Format 0.1) wird nicht übernommen; vor dem ersten Echtbetrieb `data/` leeren | niedrig | Umbau Ablage | dokumentiert |
