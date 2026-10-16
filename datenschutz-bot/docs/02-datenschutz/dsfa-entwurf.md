# Datenschutz-Folgenabschätzung (Entwurf)

> Gerüst nach Art. 35 DSGVO. Weil Gesundheitsangaben (z. B. Allergien) vorkommen können, sollte geprüft werden, ob eine DSFA verpflichtend ist. Mit einem Datenschutzjuristen finalisieren. Keine Rechtsberatung.

## Beschreibung der Verarbeitung
Siehe `datenschutzkonzept.md` und `../01-architektur/ueberblick.md`.

## Notwendigkeit und Verhältnismäßigkeit
- Zweck: schnellere Bearbeitung von Anfragen, Rechnungen und Belegen mit KI.
- Datenminimierung: Die KI bekommt nur Platzhalter, die Originale bleiben beim Betrieb.
- Speicherbegrenzung: Löschen beim Abschluss.

## Risiken und Maßnahmen

| # | Risiko | Wahrscheinlichkeit | Schwere | Maßnahme | Restrisiko |
|---|---|---|---|---|---|
| R1 | Erkennung übersieht einen Namen oder eine Kennung, die dann an die KI geht | mittel | mittel | Prüfschritt vor Freigabe, Schwärzen, Testset-Messung, zweite Erkennungsstufe (Pilot) | niedrig bis mittel |
| R2 | Identifizierung über Zusammenhang ohne Namen („der Bürgermeister von …“) | niedrig | mittel | Prüfschritt, Schulung, manuelles Schwärzen | niedrig |
| R3 | Schlüssel oder Datenordner wird entwendet | niedrig | hoch | Verschlüsselung, Dateirechte 0600/0700; Pilot: KMS, Festplattenverschlüsselung | niedrig |
| R4 | Falsche Rückübersetzung (Daten einer anderen Person eingesetzt) | niedrig | hoch | Zuordnung je Dokument, Prüfhinweise bei unbekannten Platzhaltern, Prüfung vor Versand | niedrig |
| R5 | KI erfindet Kontaktdaten, die versendet werden | mittel | mittel | Bot meldet erfundene Kontaktdaten, Prüfung vor Versand | niedrig |
| R6 | Mitarbeiter zieht Dokument direkt in den Chat | mittel | hoch | Schulung, Hinweis in Oberfläche, Richtlinie im Betrieb | mittel |
| R7 | Unbefugter Zugriff auf die Oberfläche | niedrig | hoch | nur localhost, Host-/Origin-Prüfung; Pilot: Login und Rollen | niedrig |

## Ergebnis
Offen. Freigabe durch Verantwortlichen (Betrieb) nach Beratung.
