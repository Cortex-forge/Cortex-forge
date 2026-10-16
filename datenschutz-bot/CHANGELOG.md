# Änderungen

## [0.6.1] – 2026-10-16 – Befunde aus der vierten Codex-Prüfung

### Datenschutz
- Der Browser legt eingefügten Originaltext nicht mehr im Profil ab (Wiederherstellen des Formulars und Eingabevorschläge aus)
- Dokumente ohne Prüfsumme (vor 0.6.0) lassen sich nur noch ansehen und verwerfen; Freigeben und Ändern werden abgelehnt
- Kontenplan: Kontonummern nur aus Ziffern, sonst bricht die Ablage ab

### Erkennung
- Zwei IBANs oder zwei Telefonnummern direkt hintereinander werden beide ersetzt
- IBAN ohne Leerzeichen zum nächsten Wort („…3201BIC“, „IBANAT61…“, typisch für Kopien aus PDF): erkannt über die Länge je Land und die Prüfziffer
- Verschiedene Kennzeichen („B-AB 123“, „BA-B 123“) und Codes („AB12“, „ab12“) bekommen eigene Platzhalter
- Ein Nachname mehrerer Personen bleibt mehrdeutig, auch wenn danach ein längerer Name kommt
- HTML: Der sichtbare Kopfbereich (`<header>`) bleibt erhalten

### Ablage
- Die Wartezeit einer Sperre gilt auch, wenn ein anderer Vorgang gerade aufräumt

### Qualität
- 117 Tests; der Browser-Test durchsucht nach dem Schließen das ganze Profil nach dem eingefügten Text

## [0.6.0] – 2026-10-16 – Erkennung nach Prüfset 1, Befunde aus der dritten Claude-Prüfung

### Erkennung
- Namen: Doppelvornamen, Initialen („M. Leitgeb“, „S. van Dijk“), häufige Nachnamen, die auch Hauptwörter sind („Thomas Keller“), Titel wie „Professor“, Anreden klein und auf Italienisch und Niederländisch, Verwandte („unser Sohn Lukas“), Chat-Absender, chinesische Namen, „Huber Anna“ wie „Anna Huber“; 449 weitere Vornamen
- Ehepaare: „Frau Gruber“ wird nicht mehr automatisch dem Mann zugeordnet
- Gesundheit: Körperteil + Beschwerde als Wortbildung, Krebsarten, Fachrichtungen, Umschreibungen im Dialekt und in anderen Sprachen; Ernährung nur mit Personenbezug
- Religion: Sakramente, Feste, Gebete
- Kennungen: Ausweise nach mehr Signalwörtern und in Tabellen, Führerschein, Codice fiscale, UID mit Leerzeichen, Firmenbuch, Handelsregister, Konto- und Registernummern, Kartenablauf, Messenger-Konten, Profil-Links, verschleierte E-Mails
- Telefon: eindeutige Zifferngruppen (lange Ziffernfolgen 0,1 s statt 12,6 s), Schrägstrich, Punkte, Ziffernpaare, italienische Handys, wa.me-Links
- Adressen aus Großbritannien, Irland, Niederlanden, Polen und Italien, Gewerbegebiete; Firmen mit „LTD“, „s.n.c.“, Branchenwort + Name
- Tabellen mit senkrechten Strichen, Leerzeilen und nummerierten Spaltenköpfen

### Eingaben
- Ligaturen, volle Breite und Bindestrich-Varianten vereinheitlicht, unsichtbare Formatzeichen entfernt
- Mails mit mbox-Zeile und freien Kopfnamen; Base64 über mehrere Zeilen wird dekodiert und geschwärzt

### Ablage und Oberfläche
- Prüfsumme über jedes Dokument: ohne Schlüssel lässt sich kein Dokument von Hand für die KI freischalten
- Ändert sich ein Dokument vor der KI-Freigabe im Hintergrund, ist Freigeben gesperrt, bis die neue Fassung angezeigt ist

### Qualität
- Neues, blind erstelltes Prüfset 2 (50 Fälle, 640 Angaben): **82,0 % Trefferquote, 90,7 % Genauigkeit** (vorher Prüfset 1 blind: 72,8 % / 91,7 %); Ziele nicht erreicht. Prüfset 1 nach der Arbeit daran: 99,1 % / 95,6 % (kein unabhängiger Wert mehr)
- Messberichte für blinde Prüfsets nur mit Zahlen (`--nur-zahlen`)
- 112 Tests; Nachweis scheitert, wenn ein Test übersprungen wird; Wortlisten ohne doppelte Einträge
- Messung über den echten Ablageweg; Entwicklungsset mit Base64-HTML-Mail, Quoted-Printable-Mail und PDF-Kopie (T48–T50)
- Oberfläche nennt beim Prüfen, wie viel die Erkennung noch übersieht

## [0.5.0] – 2026-10-16 – Befunde aus der dritten Codex-Prüfung

### Datenschutz
- Kategorien aus dem Firmenverzeichnis gehen nur zur KI, wenn darin nichts Schützenswertes und kein Original aus dem Dokument steht
- Zugang zur Oberfläche über einen Schlüssel in der Kopfzeile statt über ein Cookie (Cookies gingen auch an andere Programme auf dem Rechner); Start-Link `/#zugang=…`, Downloads über die Seite
- Zwischendateien werden bei Fehlern, beim Löschen und beim Abschluss entfernt

### Erkennung
- CSV mit leeren Spalten am Zeilenende, kürzeren und ungewöhnlichen Zeilen
- Nachnamen, die auch Hauptwörter sind („Maria Sommer“, „Nachname: Berg“); Felder Surname, Last name, Family name, Achternaam
- Zwei Personen mit gleichem Nachnamen: kein Raten, wer gemeint ist; freie Kundennummern werden nicht zusammengelegt

### Ablage und Abläufe
- Dateien werden vollständig geschrieben oder gar nicht ersetzt
- Rechnungen: Firmendaten wie im geprüften Entwurf, Zahlbetrag mit Steuer je Steuersatz geprüft, beschädigter Zähler bricht ab
- Oberfläche: verspätete Fehler ersetzen keinen angefangenen Entwurf
- Rückübersetzung linear auch bei Zehntausenden Platzhaltern

### Qualität
- Datenschutz-Probe prüft jeden Werkzeugaufruf und verteilt lange Listen auf mehrere Felder
- 98 Tests; Browser-Test mit zweitem lokalen Dienst
- Prüfset 1 zum Entwickeln freigegeben (Entscheidung Peter), Nachweis misst zusätzlich das blinde Prüfset 2
- Gemini vorerst nicht im Review (Entscheidung Peter: nur automatisch über das Abo)

## [0.4.0] – 2026-10-16 – Befunde aus der zweiten Claude-Prüfung

### Datenschutz
- E-Mails im MIME-Format (.eml) werden vor der Erkennung entschlüsselt (Base64, Quoted-Printable, Zeichensätze, encoded words, HTML), Anhänge weggelassen; codierte Blöcke mit lesbarem Inhalt werden immer geschwärzt
- Eingaben vereinheitlicht (NFC, Sonder-Leerzeichen, unsichtbare Zeichen); Dateien mit Zeichensatz-Erkennung; Ersatzzeichen werden abgelehnt
- Oberfläche nur über den Start-Link (Zugangs-Cookie), auch gegenüber anderen Programmen auf dem Rechner; Origin bei Änderungen Pflicht
- Stabile Platzhalter-Nummern; ein Vorname allein bekommt einen eigenen Platzhalter
- Übernommene übersehene Angaben werden in der Oberfläche als Leck gemeldet; Schlüssel-Kennungen gehen nicht an die KI
- Nach dem Abschluss bleibt auch kein Titel mehr stehen

### Erkennung
- „Meine Nummer“, Festnetz in üblicher Form, IBAN klein/mit Bindestrich/umbrochen, „Geburtstag:“, „*12.03.1985“, „Versicherungsnr“, „Reservierung: HUBER“, kurze Nachnamen, Ortsteil mit Hausnummer vor der PLZ
- Nach Namenszusätzen keine Vereine, Abteilungen oder Domains
- Platzhalter-Muster mit linearer Laufzeit; Abkürzungen wie „ISO 9001“ sind keine Platzhalter-Reste

### Abläufe
- Ersetzt die KI ein Ergebnis, bleibt die gelesene Fassung stehen und Freigeben ist gesperrt, bis die neue geladen ist
- Speichern mit Gegenprobe des geladenen Stands; Gutschriften ohne Bezug abgelehnt; neuer Typ beim Nachschwärzen gilt
- Warnung beim Start, wenn der Schlüssel im Datenordner liegt

### Qualität
- Unabhängiges Prüfset (40 Fälle, blind erstellt): 72,8 % Trefferquote, 91,7 % Genauigkeit, Ziele nicht erreicht
- Nachweis misst beide Testsets mit Zielen und scheitert bei verfehlten Zielen
- Datenschutz-Probe sucht auch Teil-Lecks und prüft alle Werkzeuge
- 85 Tests; keine unsichtbaren Zeichen im Quelltext (eigener Test); Dateien und Sperren in `src/store/dateien.ts`

## [0.3.0] – 2026-10-16 – Befunde aus der zweiten Codex-Prüfung

### Datenschutz
- Kontenplan geht bei Buchhaltung nur pseudonymisiert und wie geprüft an die KI; er steht in der Vorschau und lässt sich schwärzen
- Freigabe für die KI nennt die geprüfte Fassung; ein veraltetes Fenster kann keine geänderte Fassung freigeben
- KI-Ergebnisse nennen die gelesene Fassung (`fassung`); Ergebnisse zu einer überholten Zuordnung werden abgelehnt
- CSV mit Anführungszeichen, verdoppelten Anführungszeichen und mehrzeiligen Zellen; bei verrutschten Spalten werden alle in Frage kommenden geschützt
- Namen werden in jeder Schreibweise nachgezogen („ANNA HUBER“, „Huber“, „huber“), kleingeschriebene Alltagswörter nicht
- Schwärzen trifft immer die markierte Stelle, auch mitten in einem Wort

### Ablage und Abläufe
- Sperre in einem Schritt mit Besitzer, Freigabe nur durch den Besitzer, Aufräumen nur bei beendetem Prozess oder anderem Systemstart; funktioniert auch ohne Hardlinks
- Rechnungsnummer erst nach dem Speichern gezählt, keine Lücken durch Fehler, keine doppelten Nummern; Abschluss wiederholbar
- Rechnungen zeigen Mengen und Preise in voller Genauigkeit, gemischte Brutto- und Nettopreise werden abgelehnt
- Oberfläche verwirft verspätete Antworten

### Tests
- 72 Tests, darunter ein Browser-Test der Oberfläche (Chromium über das DevTools-Protokoll, ohne neue Abhängigkeit), Sperren-Fälle, simulierte Schreibfehler, Laufzeit der manuellen Suche

## [0.2.0] – 2026-10-16 – Befunde aus den Reviews von Claude und Codex

### Datenschutz
- Alle Inhalte auf der Platte verschlüsselt, auch die Platzhalter-Fassung, das KI-Ergebnis und die Prüfhinweise; AES-GCM mit Dokument und Feld als zusätzlich geprüften Daten
- Rückübersetzung in einem Durchgang: eingesetzte Originale werden nie erneut ausgewertet und können nicht über Prüfhinweise zur KI gelangen
- Datenschutz-Probe gegen unabhängige Lösungsblätter durch den echten MCP-Server (`npm run probe`)
- Schlüsselkennung je Dokument, kein stiller zweiter Schlüssel, `DSB_KEY_FILE`

### Erkennung
- Telefonnummern nach „Telefonnummer:“, „Handy“, „unter der Nummer“; Rechnungs- und Buchungsnummern bleiben stehen
- Namen: Nachname zuerst, Großbuchstaben, Tabellen, Felder, Listen, Geburtsname, Zusätze wie „von der“, McDonald/O'Neill, kleingeschriebene Namen
- Überschneidungen werden gekürzt statt verworfen; Gesundheit und Religion deutlich erweitert; weitere Formate (Amex, Prüfnummer, Datum mit Schrägstrich, Umlaut-Domains, US-Telefon, Firmen in Großbuchstaben)
- Lineare Laufzeit: 200.000 Zeichen in unter 0,3 Sekunden

### Ablage und Abläufe
- Dateisperre zwischen Oberfläche und MCP-Server; Freigabe nur der geprüften Fassung
- Rechnungen mit Nummer: nicht löschbar, beim Abschluss verschlüsselt archiviert
- „Zurück zur Prüfung“, Export erst nach Freigabe, Markieren ohne Groß-/Kleinschreibung mit Trefferzahl
- Konfigurationsfehler brechen ab, defekte Dateien legen die Liste nicht lahm
- Beträge exakt in ganzen Cent, CSV-Formeln entschärft
- Oberfläche startet nur auf Loopback

### Tests
- 58 Tests statt 25, u. a. Wettlauf echter Prozesse, Web-Server, Laufzeit, Rundung gegen exakte Rechnung
- Testset um die Review-Formate erweitert (T37–T47), unabhängiges Prüfset


## [0.1.0] – 2026-10-16 – Prototyp

### Neu
- Erkennung und Ersetzung personenbezogener Daten (Personen, Firmen, E-Mail, Telefon, IBAN, Kreditkarte, UID, Steuernummer, Adressen, Kennnummern, Gesundheit, Religion) in Deutsch, Englisch, Italienisch und Niederländisch
- Einheitliche Platzhalter je Person, Firmenverzeichnis mit Kategorie für die KI
- Rückübersetzung mit Anrede-Regel und Prüfhinweisen (unbekannte Platzhalter, erfundene Kontaktdaten)
- Verschlüsselte Ablage (AES-256-GCM) mit Statusablauf und Protokoll
- MCP-Server: `dokumente_auflisten`, `dokument_lesen`, `ergebnis_speichern`, `buchungen_vorschlagen`, `rechnung_erstellen`
- Rechnungen mit USt je Steuersatz, Brutto- und Nettorechnung, Nummer erst bei Freigabe
- Oberfläche: ablegen, prüfen, schwärzen, freigeben, Ergebnis prüfen, abschließen und löschen
- 25 Tests, Demo-Skript mit Datenschutz-Probe

### Projektordner
- `AGENTS.md` und `CLAUDE.md` für die Zusammenarbeit von Codex und Claude
- `docs/` mit Auftrag, Architektur und Entscheidungen, Datenschutz, Qualität, Reviews, Nachweisen, Berichten und Roadmap
- `npm run nachweis` für den Merge-Nachweis (G12)
