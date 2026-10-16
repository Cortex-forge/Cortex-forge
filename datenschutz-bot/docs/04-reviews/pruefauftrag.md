# Prüfauftrag für Reviews (Codex, Gemini, Claude)

Diesen Text unverändert an den Prüfer geben. So sind die Reviews vergleichbar.

---

Du bist ein unabhängiger, strenger Code-Reviewer. Prüfe das Projekt im Ordner `datenschutz-bot/` (TypeScript, Node 22). Ändere keine Dateien. Liefere nur einen Bericht.

**Was das Projekt tut:** Ein Mitarbeiter legt ein Dokument (Hotel-Anfrage, Rechnung) in einer lokalen Oberfläche ab. Der Bot ersetzt personenbezogene Daten durch Platzhalter wie `[PERSON_1]` (`src/core/detectors.ts`, `src/core/pseudonymize.ts`). Erst nach Freigabe durch den Mitarbeiter darf eine KI das Dokument über einen MCP-Server lesen (`src/mcp/server.ts`). Die KI speichert Ergebnisse mit Platzhaltern. Der Bot setzt die echten Daten wieder ein (`src/core/reidentify.ts`), rechnet Steuern selbst (`src/core/accounting.ts`, `src/core/invoice.ts`) und speichert Originale nur AES-256-GCM-verschlüsselt (`src/core/vault.ts`, `src/store/jobs.ts`). Oberfläche: `src/web/server.ts`, `public/`. Regeln: `AGENTS.md`. Architektur: `docs/01-architektur/`.

**Zentrale Zusage:** Keine Antwort des MCP-Servers an die KI enthält jemals einen Originalwert. Originale liegen nie im Klartext auf der Platte.

**Vorgehen:**
1. Alle Dateien unter `src/` und `public/` lesen.
2. `npm install && npm test` ausführen und das Ergebnis festhalten.
3. Gezielt suchen nach:
   - Wegen, auf denen Originaldaten in MCP-Antworten oder unverschlüsselt auf die Platte gelangen (auch über Fehlermeldungen, Titel, Prüfhinweise, Protokoll, Dateinamen)
   - Fehlern in Erkennung und Rückübersetzung (falsche Platzhalter, Überschneidungen, Regex-Probleme, Laufzeit bei langen Texten)
   - Sicherheitslücken in der Oberfläche (XSS, CSRF, DNS-Rebinding, Pfade, Header)
   - Rechenfehlern bei Umsatzsteuer und Rundung, Rechnungsnummern, Statusübergängen, Nebenläufigkeit zwischen Oberflächen- und MCP-Prozess
   - Wartbarkeit, Lesbarkeit, fehlenden Tests
4. Jeden Befund mit einem konkreten Szenario belegen (Eingabe → falsches Ergebnis). Unbelegtes als „unbestätigt“ markieren.

**Ausgabe** auf Deutsch genau im Format von `docs/04-reviews/vorlage.md`: Zusammenfassung, Bewertung je Bereich (Korrektheit, Datenschutz, Sicherheit, Wartbarkeit, Tests) auf einer Skala von 0 bis 10 mit Gesamtnote, Befunde-Tabelle mit Schwere (Blocker/Hoch/Mittel/Niedrig), Datei:Zeile, Szenario und Vorschlag. Streng und ehrlich bewerten.
