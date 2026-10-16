# Testkonzept

## Testebenen

| Ebene | Datei | Was geprüft wird |
|---|---|---|
| Erkennung | `src/test/detectors.test.ts` | Jede Datenart wird erkannt, typische Fehlalarme bleiben aus, alle Formate aus den Reviews, Laufzeit bei 200.000 Zeichen |
| Rundweg | `src/test/roundtrip.test.ts` | Beispiele vollständig ersetzt, Rückübersetzung in einem Durchgang (inkl. Anrede-Regel), unbekannte, falsch geschriebene und erfundene Angaben, Verschlüsselung mit Bindung an Dokument und Feld |
| Rechnen | `src/test/money.test.ts` | USt und Summen in ganzen Cent, Halbcent-Fälle, Abgleich mit exakter Rechnung, Belegvergleich, CSV-Formeln, HTML-Maskierung |
| Ablage | `src/test/store.test.ts` | Statusablauf, Freigabe nur der geprüften Fassung, Wettlauf echter Prozesse, Sperren, IDs, Rechnungsarchiv, Export, Konfigurations- und Schlüsselfehler, nichts im Klartext auf der Platte |
| MCP | `src/test/mcp.test.ts` | Werkzeuge, nur freigegebene Dokumente lesbar, **Datenschutz-Probe mit Lösungsblatt**, keine Originale in Prüfhinweisen |
| Oberfläche | `src/test/web.test.ts` | Host- und Ursprungsprüfung, Start nur auf Loopback, Freigabe mit Version, Export erst nach Freigabe |
| Demo | `npm run demo` | ganzer Ablauf, Probe mit Lösungsblatt der Beispiele |
| Probe | `npm run probe` | alle Beispiele und das Testset durch den echten MCP-Server, Lösungsblatt gegen alle Antworten und alle Dateien |
| Oberfläche (Bedienung) | manuell, Bildschirmfotos in `docs/assets/` | Ablegen, Schwärzen per Markieren, Freigeben, Handyansicht |

## Messung der Erkennung

Zwei Testsets mit Lösungsblatt, beide aus erfundenen, realistischen Dokumenten (Deutsch, Englisch, Italienisch, Niederländisch):

- **Entwicklungsset** `testset/faelle.json`: Daran wird entwickelt; es enthält auch die Formate aus den Reviews. Gute Werte hier sagen wenig über neue Dokumente.
- **Prüfset** `testset/pruefset-2.json` (Prüfset 2): blind von einem eigenen Agenten erstellt, der weder Code noch Testsets kannte. Nur messen, nie hineinschauen, nie daran entwickeln. Werden Regeln anhand des Prüfsets geändert, braucht es danach ein neues Prüfset.
- **Prüfset 1** `testset/pruefset.json`: ebenso blind erstellt. Am 2026-10-16 hat Peter entschieden, es zum Entwickeln freizugeben, weil die Erkennung nur mit Einblick in ihre Fehler besser wird. Seitdem ist es ein zweites Entwicklungsset, und an seine Stelle tritt Prüfset 2.

`npm run messung` misst je Datenart:

- **Trefferquote:** Anteil der sensiblen Stellen, die ersetzt wurden
- **Genauigkeit:** Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen (erwartete Werte zählen nur als ganze Wörter)

Vorgeschlagene Ziele für den Pilot (mit Peter festlegen):

| Datenart | Trefferquote | Genauigkeit |
|---|---|---|
| E-Mail, IBAN, Kreditkarte, UID | 100 % | ≥ 98 % |
| Telefon, Adresse | ≥ 98 % | ≥ 95 % |
| Personennamen | ≥ 95 % | ≥ 90 % |
| Gesundheit, Religion | ≥ 95 % | ≥ 85 % |

### Stand 2026-10-16

| Messung | Trefferquote | Genauigkeit | Bericht |
|---|---|---|---|
| Entwicklungsset vor den Korrekturen | 75,5 % | 98,4 % | [`2026-10-16-messung-ausgangslage.md`](2026-10-16-messung-ausgangslage.md) |
| Entwicklungsset nach den Korrekturen | 100 % (211/211) | 100 % (200/200) | [`2026-10-16-messung-nach-korrektur.md`](2026-10-16-messung-nach-korrektur.md) |
| **Prüfset (blind, erste Messung)** | **71,9 % (312/434)** | **91,9 % (284/309)** | [`2026-10-16-messung-pruefset.md`](2026-10-16-messung-pruefset.md) |
| Entwicklungsset nach der zweiten Prüfrunde | 100 % (211/211) | 100 % (200/200) | [`2026-10-16-messung-entwicklungsset-runde-2.md`](2026-10-16-messung-entwicklungsset-runde-2.md) |
| **Prüfset nach der zweiten Prüfrunde** | **72,8 % (316/434)** | **91,7 % (286/312)** | [`2026-10-16-messung-pruefset-runde-2.md`](2026-10-16-messung-pruefset-runde-2.md) |
| Entwicklungsset nach der dritten Prüfrunde | 100 % (211/211) | 100 % (200/200) | [`2026-10-16-messung-entwicklungsset-runde-3.md`](2026-10-16-messung-entwicklungsset-runde-3.md) |
| **Prüfset 1 nach der dritten Prüfrunde (letzte blinde Messung)** | **72,8 % (316/434)** | **91,7 % (286/312)** | [`2026-10-16-messung-pruefset-runde-3.md`](2026-10-16-messung-pruefset-runde-3.md) |

Die Änderungen der zweiten Runde kamen aus den Szenarien der Reviews, nicht aus dem Prüfset; das Prüfset wurde danach nur gemessen.

Einordnung: Am Entwicklungsset sind die Regeln auf die bekannten Fälle zugeschnitten. Das Prüfset zeigt, wie gut sie auf neue Dokumente übertragen: deutlich schlechter. Gut sind E-Mail, IBAN und Kreditkarte (je 100 %). Personen kommen auf 84 %, Telefon auf 81 %, Adressen auf 65 %, Gesundheit auf 48 %, Ausweisnummern auf 6 %. Die Ziele sind damit nicht erreicht. Das Prüfset wurde nur gemessen; an den Regeln wurde danach nichts geändert. Werden sie anhand dieser Ergebnisse verbessert, wird das Prüfset zum Entwicklungsset und es braucht ein neues, ebenfalls blind erstelltes Prüfset.

Danach: Test mit echten Dokumenten vor Ort beim Kunden, nur lokal, nur Zahlen notieren.

## Regeln
- Jeder neue Erkenner bekommt einen Positiv- und einen Negativ-Test.
- Jede Änderung an MCP-Werkzeugen muss die Datenschutz-Probe bestehen.
- Testdaten sind erfunden. Keine echten Dokumente im Repo.
