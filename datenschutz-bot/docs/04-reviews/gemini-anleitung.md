# Gemini-Review mit Antigravity (über das Google-Abo)

Gemini prüft auf Peters eigenem Rechner, in Google Antigravity mit dem Modell **Gemini 4 Argon** aus dem Pro-Abo. Kein API-Schlüssel, und nichts Geheimes läuft über einen Chat.

## 1. Projekt holen

Eine der beiden Möglichkeiten:

- **Mit Git:** Im Terminal:
  ```
  git clone https://github.com/Cortex-forge/Cortex-forge.git
  cd Cortex-forge
  git checkout ccr-80b4aca8-cfz53v
  ```
- **Ohne Git:** Im Browser (bei GitHub angemeldet) öffnen und das ZIP entpacken:
  `https://github.com/Cortex-forge/Cortex-forge/archive/refs/heads/ccr-80b4aca8-cfz53v.zip`

Für die Tests braucht der Rechner Node.js 22 (nodejs.org). Fehlt es, kann Gemini trotzdem prüfen und schreibt das in den Bericht.

## 2. In Antigravity öffnen

1. Antigravity → **File → Open Folder** → den Ordner `Cortex-forge` (bzw. den entpackten Ordner) wählen.
2. **New Conversation**, unten als Modell **Gemini 4 Argon High** wählen.
3. Den Text aus Abschnitt 3 einfügen und abschicken.
4. Fragt Gemini, ob es `npm install` und `npm test` ausführen darf: erlauben. Andere Änderungen am Projekt ablehnen.

## 3. Auftrag (so einfügen)

```
Arbeite im Ordner datenschutz-bot. Führe den Prüfauftrag aus der Datei docs/04-reviews/pruefauftrag.md genau so aus, wie er dort steht. Halte dich beim Bericht an docs/04-reviews/vorlage.md.

Trage im Kopf des Berichts ein: Reviewer „Gemini (Antigravity, Pro-Abo)“, Modell „Gemini 4 Argon (High)“, Datum, und als geprüften Stand den Commit aus `git rev-parse --short HEAD` (ohne Git: „ZIP vom Branch ccr-80b4aca8-cfz53v“).

Schreibe den Bericht als neue Datei docs/04-reviews/2026-10-16-gemini.md. Ändere sonst keine Dateien.
```

## 4. Bericht zurück ins Projekt

- **Mit Git:** `git add datenschutz-bot/docs/04-reviews/2026-10-16-gemini.md`, `git commit -m "Gemini-Review"`, `git push`.
- **Ohne Git:** Den Inhalt der Datei in den Chat mit Claude kopieren. Der Bericht enthält nur erfundene Testdaten.

Danach legt Claude den Bericht ab, trägt ihn in die Übersicht ein und arbeitet die Befunde ein.
