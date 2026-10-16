# Datenschutzkonzept (Entwurf)

> Arbeitsstand für Gespräche mit Kunden und einem Datenschutzjuristen. Keine Rechtsberatung.

## Zweck
Der Bot ermöglicht es einem Betrieb (Hotel, Buchhaltungsbüro), KI für Antworten, Rechnungen und Buchungsvorschläge zu nutzen, ohne dass personenbezogene Daten an den KI-Anbieter gehen.

## Rollen

| Rolle | Wer | Bemerkung |
|---|---|---|
| Verantwortlicher | der Betrieb | entscheidet über Zweck und Mittel |
| Auftragsverarbeiter | Cortex Forge, wenn wir den Bot betreiben, hosten oder mit Datenzugriff warten | AVV nötig, siehe `avv-checkliste.md` |
| Empfänger | KI-Anbieter (z. B. Anthropic, OpenAI) | bekommt nur die Platzhalter-Version |

Ob der KI-Anbieter überhaupt personenbezogene Daten erhält, ist nach EuGH C-413/23 P (4. 9. 2025) eine Frage des Einzelfalls: Pseudonymisierte Daten können für einen Empfänger ohne Zuordnung anonym sein. Der Betrieb muss die Empfänger trotzdem in seinen Datenschutzinformationen nennen. Vor dem Verkauf mit einem Juristen klären.

## Welche Daten

| Kategorie | Beispiele | Geht an die KI? |
|---|---|---|
| Identität und Kontakt | Name, Adresse, E-Mail, Telefon | nein, Platzhalter |
| Kennnummern | UID, Steuernummer, Kundennummer, Kennzeichen, Ausweis, SV-Nummer, Geburtsdatum | nein, Platzhalter |
| Zahlungsdaten | IBAN, Kreditkarte | nein, Platzhalter |
| Besondere Kategorien (Art. 9 DSGVO) | Allergien, Behinderung, religiös begründete Essenswünsche | nein, Platzhalter mit Typ (`[GESUNDHEIT_1]`) |
| Geschäftsinhalt | Reisedaten, Zimmerwunsch, Beträge, Leistungen | ja, die KI braucht sie zum Arbeiten |

## Technische und organisatorische Maßnahmen (Art. 32 DSGVO)

| Maßnahme | Stand Prototyp | Für den Pilot |
|---|---|---|
| Pseudonymisierung vor der KI | umgesetzt | zweite Erkennungsstufe mit lokalem Modell |
| Menschliche Prüfung vor Freigabe an die KI | umgesetzt | |
| Menschliche Prüfung vor Versand oder Buchung | umgesetzt | |
| Verschlüsselung aller gespeicherten Inhalte (AES-256-GCM, an Dokument und Feld gebunden), auch der Platzhalter-Fassung | umgesetzt | Schlüssel in KMS/HSM bzw. Schlüsselbund des Betriebssystems |
| Schlüssel getrennt von den Daten (`DSB_KEY`/`DSB_KEY_FILE`), Schlüsselkennung je Dokument | umgesetzt (optional) | Pflicht im Echtbetrieb |
| Kein Zugriff lokaler KI-Agenten auf Daten und Schlüssel | dokumentiert, Sperre für Claude Code | Bot unter eigenem Benutzer oder in einem Container |
| Datenschutz-Probe gegen Lösungsblatt vor jedem Merge | umgesetzt (`npm run probe`, Nachweis) | Probe mit echten, anonymisierten Dokumenten vor Ort |
| Zugriff nur lokal (localhost) mit Host- und Origin-Prüfung; andere Adressen verweigert | umgesetzt | Login, Rollen, TLS bei Serverbetrieb |
| Protokoll ohne Inhalte | umgesetzt | Aufbewahrungsfrist festlegen |
| Löschen nach Abschluss | umgesetzt (manuell) | automatische Löschfrist |
| Datensicherung | keine | Konzept nötig (verschlüsselt, mit Löschung) |
| Vertrag mit KI-Anbieter | – | Business-/API-Bedingungen ohne Training, möglichst EU-Datenhaltung |

## Speicherdauer
Original, Zuordnung, Platzhalter-Fassung und Ergebnis bleiben nur bis zum Abschluss eines Vorgangs. „Abschließen“ löscht sie. Übrig bleiben Verwaltungsdaten (Status, Zeiten, Anzahl der Platzhalter, verschlüsselter Titel der Platzhalter-Fassung) und das Protokoll ohne Inhalte. Ausnahme: Rechnungen mit vergebener Nummer kommen verschlüsselt ins Rechnungsarchiv, weil sie aufbewahrt werden müssen (§ 132 BAO, 7 Jahre), und lassen sich nicht löschen.

## Betroffenenrechte
Auskunft und Löschung laufen über die führenden Systeme des Betriebs (Hotelsoftware, Buchhaltung). Der Bot hält Daten nur vorübergehend und kann einen Vorgang jederzeit löschen („Verwerfen“).

## KI-Verordnung
- Antworten gehen nur nach menschlicher Prüfung hinaus. Sollen später Antworten automatisch verschickt werden, müssen Empfänger erkennen können, dass eine KI beteiligt ist.
- Mitarbeiter, die mit dem Bot arbeiten, werden eingeschult (Kurzanleitung: nichts in den Chat ziehen, KI-Sicht prüfen, Ergebnis prüfen).

## Offene Punkte
- Datenschutz-Folgenabschätzung: Entwurf in `dsfa-entwurf.md`, mit Jurist finalisieren.
- Muster-AVV für Kunden: Checkliste in `avv-checkliste.md`.
