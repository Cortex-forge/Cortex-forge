# Datenschutz-Bot (Prototyp)

Eine Schleuse zwischen euren Dokumenten und der KI. Der Bot ersetzt personenbezogene Daten durch Platzhalter. Die KI (Claude, Codex oder jeder andere MCP-Client) arbeitet nur mit diesen Platzhaltern. Danach setzt der Bot die echten Daten wieder ein, und ein Mitarbeiter prüft das Ergebnis, bevor es verschickt oder gebucht wird.

```
Dokument ──► Bot: Daten → Platzhalter ──► Mitarbeiter prüft KI-Sicht ──► KI arbeitet (MCP)
                                                                              │
Versand / Buchung ◄── Mitarbeiter gibt frei ◄── Bot: Platzhalter → echte Daten ◄┘
```

Beispiel: Aus „ich bin Anna Huber … Lena hat eine schwere Nussallergie … erreichbar unter 0664 1234567“ wird für die KI „ich bin [PERSON_1] … [PERSON_3] hat [GESUNDHEIT_1] … erreichbar unter [TELEFON_1]“. Die KI antwortet „Sehr geehrte Frau [PERSON_1] …“, der Bot macht daraus „Sehr geehrte Frau Huber …“.

## Schnellstart

Voraussetzung: Node.js 20 oder neuer.

```bash
cd datenschutz-bot
npm install
npm run build
npm test          # 25 Tests, inkl. MCP-Durchlauf mit Datenschutz-Probe
npm run demo      # ganzer Ablauf ohne KI-Konto: ein Skript spielt die KI
npm start         # Oberfläche: http://127.0.0.1:4317
```

`npm run demo` legt drei Beispiele ab (Hotel-Anfrage, Eingangsrechnung, Rechnungsauftrag), bearbeitet sie über den MCP-Server und prüft am Ende, dass kein einziger Originalwert in einer Antwort an die KI vorkommt. Danach liegen die drei Ergebnisse in der Oberfläche zur Prüfung.

## Mit Claude oder Codex verbinden

Der MCP-Server läuft über stdio. Pfad anpassen:

**Claude Code**
```bash
claude mcp add datenschutz-bot -- node /pfad/zu/datenschutz-bot/dist/mcp/server.js
```

**Claude Desktop** (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "datenschutz-bot": { "command": "node", "args": ["/pfad/zu/datenschutz-bot/dist/mcp/server.js"] }
  }
}
```

**Codex** (`~/.codex/config.toml`)
```toml
[mcp_servers.datenschutz-bot]
command = "node"
args = ["/pfad/zu/datenschutz-bot/dist/mcp/server.js"]
```

Dann in Claude oder Codex sagen: „Bearbeite die freigegebenen Dokumente im Datenschutz-Bot.“

**Wichtig:** Dokumente nie direkt in den Chat ziehen, sonst sieht die KI das Original. Immer in der Oberfläche ablegen, prüfen und freigeben.

## MCP-Werkzeuge

| Werkzeug | Was es tut |
|---|---|
| `dokumente_auflisten` | Listet die freigegebenen Dokumente (nur Platzhalter) |
| `dokument_lesen` | Gibt ein Dokument mit Platzhaltern, Legende und bei Buchhaltung den Kontenplan zurück |
| `ergebnis_speichern` | Speichert einen Text (Antwort-Mail, Bericht) mit Platzhaltern |
| `buchungen_vorschlagen` | Speichert Buchungsvorschläge; der Bot rechnet USt und Brutto selbst und vergleicht mit dem Beleg |
| `rechnung_erstellen` | Erstellt einen Rechnungsentwurf; der Bot rechnet, setzt eure Firmendaten ein und vergibt die Nummer erst bei der Freigabe |

Die Antworten der Werkzeuge enthalten nie Originaldaten. Das prüfen der MCP-Test und das Demo-Skript bei jedem Lauf.

## Was erkannt wird

| Art | Beispiele |
|---|---|
| Personen | Anrede („Frau Huber“), Vorstellung („mein Name ist …“), bekannte Vornamen, Signatur nach der Grußformel, E-Mail-Kopf |
| Firmen | Rechtsform (GmbH, KG, OG, e.U., AG, Ltd, S.r.l. …) und das Firmenverzeichnis `config/firmen.json` mit Kategorie für die KI, z. B. `[FIRMA_1: Elektroinstallateur]` |
| Kontakt | E-Mail, Telefon (AT/DE/international) |
| Finanzen | IBAN (mit Prüfziffer), Kreditkarte (Luhn-Prüfung), UID-Nummer, Steuernummer |
| Adressen | Straße + Hausnummer, PLZ + Ort (DE/AT/IT/NL/EN) |
| Kennnummern | Geburtsdatum, Ausweis/Reisepass, Kfz-Kennzeichen, Kunden-/Vertragsnummer, SV-Nummer |
| Besondere Kategorien (Art. 9 DSGVO) | Gesundheit (Allergien, Rollstuhl, Diabetes …), Religion (halal, koscher …) |

Beträge, Daten, Mengen und Zimmerwünsche bleiben stehen, weil die KI sie zum Arbeiten braucht. Was fehlt, markiert der Mitarbeiter in der Oberfläche („Schwärzen“). Was zu viel ersetzt wurde, nimmt er heraus („Nicht sensibel“).

## Sicherheit

- Die KI sieht ein Dokument erst, nachdem ein Mitarbeiter die Platzhalter-Version geprüft und freigegeben hat.
- Original, Zuordnung und fertiges Ergebnis liegen nur AES-256-GCM-verschlüsselt auf der Platte. Der Schlüssel liegt in `data/.schluessel` oder kommt aus `DSB_KEY`.
- „Abschließen“ löscht Original, Zuordnung und Ergebnis. Übrig bleibt die anonyme Platzhalter-Version und das Protokoll.
- Nach einer Anrede setzt der Bot nur den Nachnamen ein („Frau Huber“). Erfundene Platzhalter und von der KI selbst geschriebene Kontaktdaten werden als Prüfhinweis gemeldet.
- Steuern und Summen rechnet der Bot, nicht die KI. Rechnungsnummern werden erst bei der Freigabe vergeben, verworfene Entwürfe erzeugen keine Lücken.
- Die Oberfläche läuft nur auf localhost und prüft Host- und Origin-Header. Sie setzt eine Content-Security-Policy, die Rechnung wird in einem Sandbox-iframe angezeigt.

## Grenzen des Prototyps

- **Erkennung:** Sie arbeitet mit Regeln (Muster, Namenslisten, Kontext). Ein Name, der nicht in der Liste steht und ohne Anrede oder Signatur vorkommt, kann durchrutschen. Deshalb gibt es den Prüfschritt vor der Freigabe. Für den Pilot kommt ein lokales Modell (z. B. über Ollama oder Presidio) als zweite Stufe dazu.
- **Dateiformate:** Nur Text (.txt, .eml, .md, .csv). PDF und Scans (OCR) fehlen noch.
- **Betrieb:** Kein Login, keine Rollen, Einzelplatz. Der Schlüssel liegt neben den Daten; im Echtbetrieb gehört er in einen Schlüsselspeicher (KMS/HSM).
- **Buchhaltung:** Rechnungsvorlage und Kontenplan sind Beispiele. Pflichtangaben und Konten bitte mit der Steuerberatung prüfen. Der Export ist eine allgemeine CSV, noch kein BMD-, RZL- oder DATEV-Format.
- **Recht:** Pseudonymisierung ist keine Anonymisierung. Für das Hotel bzw. den Betrieb bleibt die DSGVO anwendbar (Auftragsverarbeitungsvertrag, Informationspflichten). Das ist keine Rechtsberatung.

## Weg zum Pilot

| Schritt | Aufwand (grob) |
|---|---|
| Erkennung verbessern: lokales Modell als zweite Stufe, Test mit 100+ echten, anonymisierten Dokumenten | 2–3 Wochen |
| PDF und Scans (Text-Extraktion, OCR) | 1–2 Wochen |
| Login, Rollen, mehrere Benutzer, Hosting in der EU | 1–2 Wochen |
| Export für BMD/RZL/DATEV bzw. Anbindung der Hotelsoftware | je Anbindung 1–3 Wochen, plus Wartezeit auf Partnerzugang |
| Auftragsverarbeitungsvertrag, Datenschutz-Folgenabschätzung, Sicherheitsprüfung | parallel, mit Jurist |

## Aufbau

```
datenschutz-bot/
├── src/core/        Erkennung, Platzhalter, Rückübersetzung, Verschlüsselung, Rechnungen, Buchungen
├── src/store/       Ablage mit Status, Protokoll, Rechnungsnummern, Konfiguration
├── src/mcp/         MCP-Server für Claude, Codex & Co.
├── src/web/         Oberfläche (HTTP-Server, nur localhost)
├── src/scripts/     Demo-Skript
├── src/test/        Tests (node:test)
├── public/          HTML, CSS, JavaScript der Oberfläche
├── config/          eigene Firmendaten, Firmenverzeichnis, Kontenplan (Beispieldaten)
└── examples/        Beispiel-Dokumente
```

Umgebungsvariablen: `DSB_DATA_DIR` (Datenordner, Standard `./data`), `DSB_CONFIG_DIR`, `DSB_PORT` (Standard 4317), `DSB_HOST` (Standard 127.0.0.1), `DSB_KEY` (32-Byte-Schlüssel, Base64).
