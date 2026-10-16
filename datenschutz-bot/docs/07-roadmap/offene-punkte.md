# Offene Punkte

Bekannte Grenzen und Aufgaben. Neue Punkte unten ergänzen, erledigte mit Datum und Commit abhaken.

| # | Punkt | Priorität | Quelle | Status |
|---|---|---|---|---|
| 1 | Erkennung messen (Testset mit Lösungsblatt, Messskript) | hoch | Testkonzept | erledigt 2026-10-16 (`e0437a0`, Typvergleich und Prüfset `d79b5cc` ff.) |
| 2 | Namen ohne Anrede, die nicht in der Namensliste stehen, können durchrutschen: zweite Erkennungsstufe mit lokalem Modell | hoch | ADR-004, ADR-006 | offen; nach der Messung am blinden Prüfset 2 (82,0 %) der wichtigste nächste Schritt. Vorschlag mit Möglichkeiten in ADR-006, braucht Peters OK für neue Abhängigkeiten |
| 3 | PDF und Scans einlesen | hoch | Prototyp-Grenze | offen |
| 4 | Login, Rollen, mehrere Benutzer | hoch (vor Serverbetrieb) | Prototyp-Grenze | offen |
| 5 | Schlüssel in KMS/HSM bzw. Schlüsselbund statt neben den Daten | mittel | Datenschutzkonzept, Review Claude #6, Claude 2 #13 | teilweise: `DSB_KEY_FILE`, Schlüsselkennung je Dokument (`d79b5cc`), Warnung beim Start, wenn der Schlüssel im Datenordner liegt (`4eb0486`); Schlüsselbund/KMS offen |
| 6 | Datensicherung mit Löschkonzept | mittel | Datenschutzkonzept | offen |
| 7 | Automatische Löschfrist für abgeschlossene Vorgänge und Protokoll | mittel | Datenschutzkonzept | offen |
| 8 | Zentrale Rechnungsnummern bei mehreren Arbeitsplätzen | mittel | ADR-003 | offen |
| 9 | Export im BMD-, RZL- oder DATEV-Format | mittel | README | offen |
| 10 | Rechnungsvorlage und Kontenplan mit Steuerberatung abstimmen | mittel | README | offen |
| 11 | Reviews von Codex und Gemini | hoch | G8 | Codex Runde 1 (4,2), 2 (5,2), 3 (5,5) und 4 (6,0), Befunde behoben (`d79b5cc`, `937e572`, `9b94227` bis `2934b0a`, `1f9acd7`); Gemini nicht dabei (#21, #22) |
| 12 | Projekt in eigenes Repository verschieben | niedrig | Roadmap | offen |
| 13 | Bot unter eigenem Benutzer oder in einem Container betreiben, damit lokale KI-Agenten weder Daten noch Schlüssel lesen können (die Sperre in `.claude/settings.json` gilt nur für Datei-Werkzeuge, nicht für die Shell); MCP-Server über einen Wrapper (`sudo -u dsb …` oder Container) starten und so dokumentieren | hoch (vor Echtdaten) | Review Claude #6, Claude 2 #2/#13, Claude 3 #17 | teilweise: Oberfläche nur mit Start-Link, seit `2934b0a` per Kopfzeile statt Cookie; eigener Benutzer/Container offen |
| 14 | Storno bzw. Gutschrift für freigegebene Rechnungen (heute: nicht löschbar, Archiv beim Abschluss) | mittel | Review Claude #18 | offen |
| 15 | Erkennung zusätzlich in einem Worker mit Zeitlimit (heute linear; lange Ziffernfolgen seit `2674063` 0,1 s statt 12,6 s) | niedrig | Review Claude #16, Claude 3 #14 | offen |
| 16 | Weitere Review-Runden auf dem korrigierten Stand | hoch | G8 | Runde 2: Codex 5,2, Claude 4,6, alle Befunde bearbeitet (`937e572` bis `4eb0486`). Runde 3: Codex 5,5, alle 14 Befunde behoben (`9b94227` bis `2934b0a`); Claude 5,2, 19 behoben, 1 teilweise, 2 offen (#24, #25). Runde 4 auf `0db88aa`: Codex 6,0, alle 9 Befunde behoben (`1f9acd7`); Claude läuft |
| 17 | Gemini-Anmeldung: API-Schlüssel als Netzwerk-Secret der Cloud-Umgebung oder Prüfung lokal mit Abo | hoch | G8 | entschieden (Peter, 2026-10-16): kein API-Schlüssel; Gemini nur, wenn es automatisch über das Abo läuft, siehe #21 |
| 18 | Ablage älterer Testdaten (Format 0.1) wird nicht übernommen; vor dem ersten Echtbetrieb `data/` leeren | niedrig | Umbau Ablage | dokumentiert |
| 19 | Erkennung auf neuen Dokumenten: Prüfset 71,9 % bzw. 72,8 % Trefferquote (Ziel Personen 95 %); Ausweisnummern, Gesundheit, Adressen schwach | hoch | Messung Prüfset | Prüfset 1 freigegeben und daran entwickelt (Peter, 2026-10-16); blindes Prüfset 2: 82,0 % / 90,7 %, Ziele weiter verfehlt (Firmen ohne Rechtsform, Gesundheit, Religion, Adressen, freie Kennungen). Nächster Schritt: #2 |
| 20 | Unbekannte Namen ohne Anrede, Feld oder Vornamensliste („Zorwin Xylander reist mit …“) | hoch | Codex 2 (Grenze), Claude 2 | offen, siehe #2 |
| 21 | Gemini-Review lokal mit Abo nach `docs/04-reviews/gemini-anleitung.md`, Bericht in `docs/04-reviews/` | hoch | G8 | zurückgestellt (Peter, 2026-10-16): Gemini kommt dazu, sobald es automatisch über das Abo läuft; die Anleitung bleibt als Möglichkeit |
| 22 | G8 ohne Gemini: Prüfung durch Codex und Claude, bis Gemini automatisch über das Abo läuft | hoch | G8, Entscheidung Peter | Abweichung im Phase-0-Gate vermerkt |
| 23 | Löschen auch in Kopien wirksam machen: Schlüssel je Dokument, beim Abschluss vernichtet; Datenordner standardmäßig außerhalb des Projektordners (der oft synchronisiert wird); Schutz gegen das Zurückspielen einer ganzen älteren Dokumentdatei (Zähler außerhalb der Datei) | mittel (vor Echtdaten) | Review Claude 3 #18, #19 | offen; Prüfsumme gegen Änderungen einzelner Felder umgesetzt (`335ac0d`) |
| 24 | Erkennung in Module je Datenart mit eigener Testdatei aufteilen, `JobStore` in Ablage und Ergebnisverarbeitung trennen | niedrig | Review Claude 3 #22 | offen; doppelte Listeneinträge entfernt und per Test verhindert (`42137b5`) |
| 25 | Testsets um echte Ablagewege ergänzen (Mails, HTML, PDF- und Word-Kopien, CSV-Exporte) | mittel | Review Claude 3 #21 | teilweise: Messung über `prepareDocument`, Entwicklungsset T48–T50 (Base64-HTML-Mail, Quoted-Printable, PDF-Kopie); Word-Kopien und CSV-Exporte offen |
| 26 | Dokumente aus Versionen vor 0.6.0 (ohne Prüfsumme) lassen sich nur ansehen und verwerfen. Eine freigegebene, nicht abgeschlossene Rechnung mit Nummer lässt sich so nicht abschließen (herunterladen geht). Bei Bedarf: Umstellung mit neuer Fassung und erneuter Prüfung | niedrig | Review Codex 4 #1 | offen, kein solcher Fall bekannt |
