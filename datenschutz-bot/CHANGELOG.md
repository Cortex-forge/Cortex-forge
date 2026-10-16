# Änderungen

## [0.2.0] – 2026-10-16 – Befunde aus den Reviews von Claude und Codex

### Datenschutz
- Alle Inhalte auf der Platte verschlüsselt, auch die Platzhalter-Fassung, das KI-Ergebnis und die Prüfhinweise; AES-GCM mit Dokument und Feld als zusätzlich geprüften Daten
- Rückübersetzung in einem Durchgang: eingesetzte Originale werden nie erneut ausgewertet und können nicht über Prüfhinweise zur KI gelangen
- Datenschutz-Probe gegen unabhängige Lösungsblätter durch den echten MCP-Server (`npm run probe`)
- Schlüsselkennung je Dokument, kein stiller zweiter Schlüssel, `DSB_KEY_FILE`

### Erkennung
- Telefonnummern nach „Telefonnummer:“, „Handy“, „unter der Nummer“; Rechnungs- und Buchungsnummern bleiben stehen
- Namen: Nachname zuerst, Großbuchstaben, Tabellen, Felder, Listen, Geburtsname, Zusätze wie „von der“, McDonald/O'Neill, kleingeschriebene Namen
- Überschneidungen werden gekürzt statt verworfen; Gesundheit und Religion deutlich erweitert; weitere Formate (Amex, Prüfnummer, Datum mit Schrägstrich, Umlaut-Domains, US-Telefon, Firmen in Großbuchstaben)
- Lineare Laufzeit: 200.000 Zeichen in unter 0,3 Sekunden

### Ablage und Abläufe
- Dateisperre zwischen Oberfläche und MCP-Server; Freigabe nur der geprüften Fassung
- Rechnungen mit Nummer: nicht löschbar, beim Abschluss verschlüsselt archiviert
- „Zurück zur Prüfung“, Export erst nach Freigabe, Markieren ohne Groß-/Kleinschreibung mit Trefferzahl
- Konfigurationsfehler brechen ab, defekte Dateien legen die Liste nicht lahm
- Beträge exakt in ganzen Cent, CSV-Formeln entschärft
- Oberfläche startet nur auf Loopback

### Tests
- 58 Tests statt 25, u. a. Wettlauf echter Prozesse, Web-Server, Laufzeit, Rundung gegen exakte Rechnung
- Testset um die Review-Formate erweitert (T37–T47), unabhängiges Prüfset


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
