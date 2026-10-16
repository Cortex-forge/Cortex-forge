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
- **Prüfset** `testset/pruefset.json`: blind von einem eigenen Agenten erstellt, der weder Code noch Entwicklungsset kannte. Nur messen, nie daran entwickeln. Werden Regeln anhand des Prüfsets geändert, braucht es danach ein neues Prüfset.

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

Danach: Test mit echten Dokumenten vor Ort beim Kunden, nur lokal, nur Zahlen notieren.

## Regeln
- Jeder neue Erkenner bekommt einen Positiv- und einen Negativ-Test.
- Jede Änderung an MCP-Werkzeugen muss die Datenschutz-Probe bestehen.
- Testdaten sind erfunden. Keine echten Dokumente im Repo.
