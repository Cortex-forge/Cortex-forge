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
npm test          # alle Tests: Erkennung, Rechnen, Ablage, MCP-Server, Web-Server, Oberfläche im Browser, Laufzeit
npm run demo      # ganzer Ablauf ohne KI-Konto: ein Skript spielt die KI
npm run probe     # Datenschutz-Probe mit Lösungsblatt über den echten MCP-Server
npm run messung   # Trefferquote und Genauigkeit am Testset (Bericht nach messungen/)
npm start         # Oberfläche: den Start-Link aus dem Konsolenfenster öffnen
npm run nachweis  # Nachweis für den Merge: Build, Typprüfung, Tests, Proben, beide Messungen mit Zielen
```

**Oberfläche öffnen:** `npm start` gibt im Konsolenfenster einen Start-Link aus (`http://127.0.0.1:4317/start?zugang=…`). Nur dieser Link öffnet die Oberfläche; er setzt ein Zugangs-Cookie und gilt bis zum nächsten Start. Ohne ihn kommt kein anderes Programm auf dem Rechner an die Daten, auch nicht über 127.0.0.1.

`npm run demo` legt drei Beispiele ab (Hotel-Anfrage, Eingangsrechnung, Rechnungsauftrag), bearbeitet sie über den MCP-Server und prüft am Ende mit dem Lösungsblatt `examples/loesungen.json`, dass keine sensible Angabe in einer Antwort an die KI vorkommt. Danach liegen die drei Ergebnisse in der Oberfläche zur Prüfung.

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
| `dokument_lesen` | Gibt ein Dokument mit Platzhaltern, Legende, Fassung und bei Buchhaltung den geprüften Kontenplan (ebenfalls mit Platzhaltern) zurück |
| `ergebnis_speichern` | Speichert einen Text (Antwort-Mail, Bericht) mit Platzhaltern |
| `buchungen_vorschlagen` | Speichert Buchungsvorschläge; der Bot rechnet USt und Brutto selbst und vergleicht mit dem Beleg |
| `rechnung_erstellen` | Erstellt einen Rechnungsentwurf; der Bot rechnet, setzt eure Firmendaten ein und vergibt die Nummer erst bei der Freigabe |

Die Probe sucht jede Angabe auch in Teilen (Nachname ohne Vorname, sieben Ziffern einer Telefonnummer oder IBAN, Name vor dem @) und ruft alle Werkzeuge auf, auch `buchungen_vorschlagen` und `rechnung_erstellen`.

Jedes Speicherwerkzeug nennt die `fassung`, die `dokument_lesen` ausgegeben hat. Wurde das Dokument inzwischen geändert (zurück zur Prüfung, neu markiert, neu freigegeben), lehnt der Bot das Ergebnis ab: Die Platzhalter könnten dann andere Personen bezeichnen.

Die Antworten der Werkzeuge enthalten nur die Platzhalter-Fassung. Ob dabei etwas durchrutscht, prüft die **Datenschutz-Probe gegen Lösungsblätter**: `examples/loesungen.json` und `testset/faelle.json` listen unabhängig von der Erkennung jede sensible Angabe; `npm run probe` schickt alle Dokumente durch den echten MCP-Server und sucht diese Angaben in jeder Antwort und in jeder Datei im Datenordner. Die Probe findet also auch, was die Erkennung übersieht. Sie läuft in den Tests (Beispiele) und im Nachweis (Beispiele und Testset). Was weder Erkennung noch Lösungsblatt kennen, kann trotzdem durchrutschen; dafür gibt es den Prüfschritt vor der Freigabe.

## Was erkannt wird

| Art | Beispiele |
|---|---|
| Personen | Anrede („Frau Huber“, „Frau von der Leyen“), Vorstellung („mein Name ist …“, „er hieß …“), bekannte Vornamen (auch „Huber, Anna“, „HUBER Anna“, kleingeschrieben in lockeren Texten), Felder („Gast:“, „Fahrer:“, „Anwesend: A, B, C“), Tabellen mit Spaltenköpfen (CSV auch mit Anführungszeichen und mehrzeiligen Zellen), Signatur, E-Mail-Kopf, Geburtsname („geb. Gruber“); ein erkannter Name wird überall nachgezogen, auch in anderer Schreibweise („ANNA HUBER“, später „Huber“) |
| Firmen | Rechtsform (GmbH, KG, OG, e.U., AG, Ltd, S.r.l. …) und das Firmenverzeichnis `config/firmen.json` mit Kategorie für die KI, z. B. `[FIRMA_1: Elektroinstallateur]` |
| Kontakt | E-Mail (auch mit Umlaut-Domain), Telefon (AT/DE/IT/US/international, auch nach „Telefonnummer:“ oder „unter der Nummer“), Social-Media-Konten |
| Finanzen | IBAN (mit Prüfziffer), Kreditkarte inkl. Amex und Kartenprüfnummer (Luhn-Prüfung), UID-Nummer, Steuernummer |
| Adressen | Straße + Hausnummer, PLZ + Ort (DE/AT/IT/NL/US/EN), auch kleingeschrieben und in Tabellenzeilen |
| Kennnummern | Geburtsdatum, Ausweis/Reisepass, Kfz-Kennzeichen, Kunden-/Vertragsnummer, SV-Nummer |
| Besondere Kategorien (Art. 9 DSGVO) | Gesundheit (Allergien, Krankheiten, Operationen, Hilfsmittel, Behinderung, Schwangerschaft …), Religion (Konfessionen, Gotteshäuser, Speiseregeln, Feiertage) |

**Vor der Erkennung** wird jedes Dokument lesbar und einheitlich gemacht: E-Mails im MIME-Format (`.eml`) werden entschlüsselt (Base64, Quoted-Printable, Zeichensätze, Betreff mit Sonderzeichen, HTML als Text), Anhänge weggelassen; HTML wird zu Text; geschützte Leerzeichen, zerlegte Umlaute, weiche Trennzeichen und Nullbreitenzeichen werden vereinheitlicht. Dateien liest die Oberfläche mit Zeichensatz-Erkennung (UTF-8, UTF-16, Windows-1252); Text mit Ersatzzeichen (�) wird abgelehnt. Was trotzdem codiert im Text steht und lesbaren Inhalt hat, wird als Ganzes geschwärzt.

Beträge, Daten, Mengen und Zimmerwünsche bleiben stehen, weil die KI sie zum Arbeiten braucht. Was fehlt, markiert der Mitarbeiter in der Oberfläche („Schwärzen“); die markierte Stelle wird immer geschwärzt, weitere Vorkommen als ganzes Wort ebenfalls. Was zu viel ersetzt wurde, nimmt er heraus („Nicht sensibel“).

## Sicherheit

- Die KI sieht ein Dokument erst, nachdem ein Mitarbeiter die Platzhalter-Fassung geprüft und freigegeben hat, und zwar genau die angezeigte Fassung: Hat sie sich inzwischen geändert (z. B. in einem zweiten Fenster), lehnt der Bot die Freigabe ab. Fällt später noch etwas auf: „Zurück zur Prüfung“ nimmt der KI den Zugriff.
- Bei Buchhaltung geht der Kontenplan mit an die KI. Er läuft durch dieselbe Erkennung („Lieferant Anna Huber“ wird „Lieferant [PERSON_1]“), steht in der Vorschau und geht nur so an die KI, wie er geprüft wurde.
- Alle Inhalte liegen nur AES-256-GCM-verschlüsselt auf der Platte: Original, Zuordnung, Platzhalter-Fassung, Ergebnis und Prüfhinweise. Jeder Block ist an Dokument und Feld gebunden (kein Austausch zwischen Dateien). Im Klartext stehen nur Verwaltungsdaten (Status, Zeiten, Anzahl).
- Schlüssel: `DSB_KEY` (Base64, 32 Byte), sonst `DSB_KEY_FILE` (empfohlen: außerhalb des Datenordners, nur für den Bot-Benutzer lesbar), sonst `data/.schluessel`. Jedes Dokument trägt die Kennung seines Schlüssels; ein falscher Schlüssel fällt sofort auf, und neben vorhandenen Dokumenten legt der Bot nie still einen zweiten Schlüssel an.
- „Abschließen“ löscht Original, Zuordnung, Platzhalter-Fassung und Ergebnis. Rechnungen mit Nummer kommen vorher verschlüsselt ins Archiv (`data/rechnungen/`) und lassen sich nicht löschen.
- Die Freigabe gilt genau für die geprüfte Fassung. Ersetzt die KI ihr Ergebnis, muss neu geprüft werden.
- Oberfläche und MCP-Server laufen als getrennte Prozesse. Jede Änderung eines Dokuments läuft unter einer Dateisperre; es geht nichts verloren und Gelöschtes kehrt nicht zurück. Die Sperre entsteht in einem Schritt mit ihrem Besitzer, nur der Besitzer gibt sie frei, und aufgeräumt wird sie nur, wenn der Besitzer-Prozess nicht mehr läuft (nie nur wegen ihres Alters).
- Nach einer Anrede setzt der Bot nur den Nachnamen ein („Frau Huber“, „Frau von Trapp“). Erfundene, falsch geschriebene oder nicht verwendete Platzhalter und von der KI selbst geschriebene Kontaktdaten werden als Prüfhinweis gemeldet. Prüfhinweise an die KI enthalten nur, was die KI selbst geschrieben hat.
- Steuern und Summen rechnet der Bot in ganzen Cent (kaufmännisch gerundet), nicht die KI. Rechnungsnummern werden erst bei der Freigabe vergeben und erst gezählt, wenn das Dokument gespeichert ist; ein Fehler verbraucht keine Nummer, und keine Nummer wird doppelt vergeben. Eine Rechnung ist einheitlich netto oder brutto und zeigt Mengen und Preise so genau, wie gerechnet wurde (Menge bis 3, Einzelpreis bis 4 Nachkommastellen). Der CSV-Export entschärft Tabellenformeln.
- Die Oberfläche läuft nur auf localhost (andere Adressen verweigert sie, weil es kein Login gibt). Jede Anfrage an die Daten braucht das Zugangs-Cookie aus dem Start-Link; Änderungen nur mit passendem Origin-Header. So kommen weder fremde Webseiten noch andere Programme oder Benutzer auf dem Rechner an Originale oder Freigaben. Sie setzt eine Content-Security-Policy, die Rechnung wird in einem Sandbox-iframe angezeigt.
- **KI-Agenten auf demselben Rechner** (Claude Code, Codex): nie im Projekt- oder Datenordner starten. Die Sperre in `.claude/settings.json` gilt nur für die Datei-Werkzeuge von Claude Code, nicht für Shell-Befehle. Ein Agent mit Shell unter demselben Benutzer kann Schlüssel und Daten lesen. Für echte Daten deshalb: `DSB_KEY_FILE` außerhalb des Datenordners und den Bot unter eigenem Benutzer oder in einem Container betreiben (siehe offene Punkte). Liegt der Schlüssel im Datenordner, warnen Oberfläche und MCP-Server beim Start.

## Grenzen des Prototyps

- **Erkennung:** Sie arbeitet mit Regeln (Muster, Namenslisten, Kontext). Ein Name, der nicht in der Liste steht und ohne Anrede, Feld oder Signatur vorkommt, kann durchrutschen. Deshalb gibt es den Prüfschritt vor der Freigabe. Gemessen wird an zwei Testsets: dem Entwicklungsset `testset/faelle.json` (100 %) und dem unabhängig erstellten Prüfset `testset/pruefset.json` (rund 73 % Trefferquote, 92 % Genauigkeit; Ergebnisse in `docs/03-qualitaet/`). Das Prüfset zeigt ehrlich: Auf neuen Dokumenten rutscht noch gut ein Viertel der Angaben durch. Für den Pilot kommt ein lokales Modell (z. B. über Ollama oder Presidio) als zweite Stufe dazu.
- **Dateiformate:** Text (.txt, .md, .csv) und E-Mails (.eml, auch mehrteilig mit HTML). PDF, Word und Scans (OCR) fehlen noch; Anhänge von Mails werden weggelassen.
- **Betrieb:** Kein Login mit Benutzern und Rollen (nur der Start-Link), Einzelplatz, nur localhost. Ohne `DSB_KEY`/`DSB_KEY_FILE` liegt der Schlüssel neben den Daten; im Echtbetrieb gehört er in einen Schlüsselspeicher (KMS/HSM). Ältere Testdaten aus Version 0.1 lassen sich nicht mehr öffnen (neues Ablageformat); bitte `data/` leeren.
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
├── AGENTS.md        Regeln für alle (Codex liest sie automatisch)
├── CLAUDE.md        Ergänzungen für Claude
├── CHANGELOG.md     Änderungen je Version
├── src/core/        Erkennung, Platzhalter, Rückübersetzung, Verschlüsselung, Rechnungen, Buchungen
├── src/store/       Ablage mit Status, Protokoll, Rechnungsnummern, Konfiguration
├── src/mcp/         MCP-Server für Claude, Codex & Co.
├── src/web/         Oberfläche (HTTP-Server, nur localhost)
├── src/scripts/     Demo, Datenschutz-Probe mit Lösungsblatt, Messung
├── src/test/        Tests (node:test)
├── public/          HTML, CSS, JavaScript der Oberfläche
├── scripts/         Nachweis-Skript für Merges
├── config/          eigene Firmendaten, Firmenverzeichnis, Kontenplan (Beispieldaten)
├── examples/        Beispiel-Dokumente und ihr Lösungsblatt
├── testset/         Testset und unabhängiges Prüfset mit Lösungsblatt
└── docs/            Projektordner: Auftrag, Architektur, Datenschutz, Qualität, Reviews, Nachweise, Berichte, Roadmap
```

## Projektordner und Zusammenarbeit

Wir bauen mit Menschen, Claude und Codex gemeinsam. Damit sich alle auskennen:

- **Regeln:** [`AGENTS.md`](AGENTS.md) gilt für alle. Codex liest die Datei automatisch, Claude über [`CLAUDE.md`](CLAUDE.md).
- **Projektordner:** [`docs/README.md`](docs/README.md) zeigt, was wo liegt: Auftrag (G1), Architektur und Entscheidungen, Datenschutz, Qualität mit Phase-0-Gate (G11), Reviews (G8), Nachweise (G12), Berichte (G9) und Roadmap.
- **Reviews mit Codex:** Ablauf und Prüfauftrag in [`docs/04-reviews/README.md`](docs/04-reviews/README.md).
- **Vor jedem Merge:** `npm run nachweis`, Reviews ablegen, OK von Peter.

Umgebungsvariablen: `DSB_DATA_DIR` (Datenordner, Standard `./data`), `DSB_CONFIG_DIR`, `DSB_PORT` (Standard 4317), `DSB_HOST` (nur `127.0.0.1`, `localhost` oder `::1`), `DSB_KEY` (32-Byte-Schlüssel, Base64) oder `DSB_KEY_FILE` (Pfad zur Schlüsseldatei). Oberfläche und MCP-Server müssen dieselbe Schlüsselquelle nutzen; für Claude Desktop und Codex die Variable in der MCP-Konfiguration unter `env` mitgeben. Nur für Tests: `DSB_CHROMIUM` (Pfad zu Chrome/Chromium für den Browser-Test; ohne Browser wird er übersprungen), `DSB_SPERRE_MS` (Wartezeit auf eine Sperre).
