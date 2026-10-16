# Testkonzept

## Testebenen

| Ebene | Datei | Was geprüft wird |
|---|---|---|
| Erkennung | `src/test/detectors.test.ts` | Jede Datenart wird erkannt, typische Fehlalarme bleiben aus |
| Rundweg | `src/test/roundtrip.test.ts` | Beispiele vollständig ersetzt, Rückübersetzung (inkl. Anrede-Regel), Meldung unbekannter und erfundener Daten, Verschlüsselung |
| Rechnen | `src/test/money.test.ts` | USt und Summen, Abweichung zum Beleg, Brutto-/Netto-Rechnung, HTML-Maskierung |
| Ablage | `src/test/store.test.ts` | Statusablauf, Rechnungsnummern, Markieren/Ausnehmen, Originale nur verschlüsselt, Löschen beim Abschluss |
| MCP | `src/test/mcp.test.ts` | Werkzeuge, nur freigegebene Dokumente lesbar, **Datenschutz-Probe** über alle Antworten |
| Demo | `npm run demo` | ganzer Ablauf mit Datenschutz-Probe |
| Oberfläche | manuell, Bildschirmfotos in `docs/assets/` | Ablegen, Schwärzen per Markieren, Freigeben, Handyansicht |

## Messung der Erkennung (nächster Schritt)

Ein Testset aus ca. 100 erfundenen, realistischen Dokumenten (Deutsch, Englisch, Italienisch, Niederländisch; Anfragen, Rechnungen, weitergeleitete Mails, Tippfehler) mit Lösungsblatt. Ein Skript misst je Datenart:

- **Trefferquote:** Anteil der sensiblen Stellen, die ersetzt wurden
- **Genauigkeit:** Anteil der Ersetzungen, die wirklich sensibel waren

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
