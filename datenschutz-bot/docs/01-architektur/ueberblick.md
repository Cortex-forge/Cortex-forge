# Architektur-Überblick

## Bausteine

```
┌──────────────────────────── Rechner des Betriebs (bzw. EU-Server) ────────────────────────────┐
│                                                                                                │
│  Oberfläche (src/web, public)      Ablage (src/store)            MCP-Server (src/mcp)          │
│  ─ ablegen, prüfen, schwärzen ──►  ─ Status, Protokoll     ◄──── ─ liest nur KI-Sicht ─────────┼──► KI (Claude, Codex)
│  ─ Ergebnis prüfen, freigeben      ─ alles verschlüsselt          ─ speichert Ergebnisse       │     sieht nur Platzhalter
│                                    ─ Sperren, Rechnungsnummern                                 │
│                     └──────────── Kern (src/core): Erkennung, Platzhalter, ────────────┘       │
│                                   Rückübersetzung, Verschlüsselung, Rechnen                    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Oberfläche und MCP-Server sind zwei getrennte Prozesse. Sie teilen sich den Datenordner (`DSB_DATA_DIR`, Standard `./data`) und damit den Schlüssel. Jede Änderung an einem Dokument läuft unter einer prozessübergreifenden Sperre (siehe unten).

## Datenfluss

1. **Ablegen:** Der Mitarbeiter fügt Text ein oder lädt eine Datei (Zeichensatz wird erkannt). Zuerst wird der Text lesbar und einheitlich gemacht (`src/core/normalize.ts`, `src/core/mail.ts`): MIME-Mails entschlüsselt, HTML zu Text, Sonder-Leerzeichen, zerlegte Umlaute und unsichtbare Zeichen vereinheitlicht. Genau dieser Text ist das Original, das gespeichert, erkannt und geprüft wird. Dann erkennt der Kern sensible Stellen und erzeugt die KI-Sicht mit Platzhaltern. Bei Buchhaltung laufen die Bezeichnungen aus dem Kontenplan durch dieselbe Erkennung (dieselbe Person bekommt dort denselben Platzhalter). Original, Zuordnung, Fundstellen **und die KI-Sicht** werden verschlüsselt gespeichert: Auch die KI-Sicht kann übersehene Angaben enthalten.
2. **Prüfen:** Die Oberfläche zeigt Original und KI-Sicht nebeneinander, bei Buchhaltung auch den Kontenplan. Der Mitarbeiter schwärzt Fehlendes (die markierte Stelle geht mit) oder nimmt Fehlalarme heraus, dann gibt er frei. Die Freigabe nennt die angezeigte Fassung (`rev`); hat sich das Dokument inzwischen geändert, etwa in einem zweiten Fenster, lehnt der Bot ab.
3. **KI arbeitet:** Über den MCP-Server sieht die KI nur freigegebene Dokumente, und zwar nur die geprüfte KI-Sicht samt geprüftem Kontenplan. `dokument_lesen` nennt die **Fassung**; jedes Speicherwerkzeug muss sie angeben. Nach „Zurück zur Prüfung“ und neuer Freigabe steigt die Fassung, Ergebnisse zur alten Fassung werden abgelehnt, weil Platzhalter dann andere Personen bezeichnen können.
4. **Zurückübersetzen:** Der Bot setzt die Originale ein, rechnet Steuern und Summen nach und erzeugt Prüfhinweise. Das fertige Ergebnis liegt verschlüsselt. Die KI bekommt als Antwort nur Hinweise und Beträge.
5. **Freigeben und abschließen:** Der Mitarbeiter prüft und gibt frei; auch hier nennt die Freigabe die geprüfte Version des Ergebnisses (`ergebnisRev`). Rechnungen erhalten erst jetzt ihre Nummer. „Abschließen“ löscht Original, Zuordnung und Ergebnis; Rechnungen mit Nummer kommen vorher verschlüsselt ins Archiv.

## Statusablauf

```
neu ──(für KI freigeben, mit rev)──► bereit ──(KI speichert, mit Fassung)──► zur_pruefung ──(freigeben, mit ergebnisRev)──► freigegeben ──(abschließen)──► abgeschlossen
                                       ▲                                         │
                                       └────────────(zurück an die KI)───────────┘

bereit oder zur_pruefung ──(zurück zur Prüfung)──► neu   (Ergebnis verworfen, KI hat keinen Zugriff mehr)
```

| Status | Darf die KI lesen? | Darf die KI speichern? | Originale vorhanden? |
|---|---|---|---|
| neu | nein | nein | ja (verschlüsselt) |
| bereit | ja | ja, mit aktueller Fassung | ja |
| zur_pruefung | ja | ja (Korrektur, neue Prüfung nötig) | ja |
| freigegeben | nein | nein | ja |
| abgeschlossen | nein | nein | nein, gelöscht (Rechnung im Archiv) |

## Ablage auf der Platte

```
data/
├── .schluessel                 AES-256-Schlüssel (0600), alternativ DSB_KEY oder DSB_KEY_FILE
├── dokumente/D-xxxxxxxxxxxx.json
│                               Verwaltungsdaten im Klartext (Status, Zeiten, Versionen, Rechnungsnummer),
│                               Inhalte in drei verschlüsselten Teilen: "kopf" (Titel), "ki" (KI-Sicht,
│                               Kontenplan der KI, Ergebnis der KI, Prüfhinweise), "geheim" (Original,
│                               Zuordnung, Markierungen, fertiges Ergebnis). AES-256-GCM, jeder Teil an
│                               Dokument und Feld gebunden. "pruefsumme": HMAC über den ganzen Datensatz.
├── rechnungen/JJJJ-NNNN.json   archivierte Rechnungen, verschlüsselt
├── sperren/                    Sperrdateien (kurzlebig)
├── protokoll.jsonl             Ereignisse ohne Inhalte
└── rechnungsnummern.json       Zähler je Jahr
```

## Zugang zur Oberfläche

Die Oberfläche läuft nur auf Loopback. Weil 127.0.0.1 jedes Programm und jeder Benutzer auf dem Rechner erreicht, braucht jede Anfrage an die Daten den Zugangsschlüssel in der Kopfzeile `X-DSB-Zugang`. Er steht im Start-Link, den der Bot beim Start im Konsolenfenster ausgibt, hinter `#zugang=` (dieser Teil der Adresse geht nie an einen Server), ist zufällig und gilt bis zum nächsten Start. Die Seite hält ihn nur für ihren Tab (`sessionStorage`, an Adresse und Port gebunden) und lädt auch Dateien über `fetch` mit Schlüssel. Ein Cookie wäre bequemer, ginge aber auch an andere Programme auf demselben Rechner, denn Cookies gelten für alle Ports (Review Codex 3 #2). Änderungen verlangen zusätzlich den passenden Origin-Header, der Host-Header muss eine lokale Adresse sein (DNS-Rebinding).

## Platzhalter-Nummern

Jedes Dokument merkt sich verschlüsselt, welche Angabe welche Nummer bekommen hat. Nach Nachschwärzen, „Nicht sensibel“ oder „Zurück zur Prüfung“ behält jede Angabe ihre Nummer, und eine einmal vergebene Nummer bezeichnet nie eine andere Angabe. Zusammen mit der Fassung beim Speichern kann ein Platzhalter so nie still eine andere Person meinen.

## Sperren

Oberfläche und MCP-Server können gleichzeitig auf dasselbe Dokument zugreifen. Laden, Prüfen und Speichern geschehen deshalb immer unter einer Sperre je Dokument (`sperren/dokument-<id>.lock`), Rechnungsnummern unter einer eigenen Sperre (Umsetzung: `src/store/dateien.ts`). Beim Speichern prüft der Bot zusätzlich, dass die Datei noch genau den geladenen Stand hat.

- Die Sperrdatei entsteht in einem Schritt mit vollständigem Inhalt (Prozessnummer, Systemstart, Startzeit des Prozesses, Zufallskennung): erst in eine eigene Datei geschrieben, dann per Hardlink veröffentlicht. Dateisysteme ohne Hardlinks (FAT, manche Netzlaufwerke) legen exklusiv an und schreiben danach; eine kurz leere Sperrdatei gilt dann als belegt.
- Freigeben darf nur der Besitzer (Vergleich der Kennung).
- Eine Sperre gilt nur als verwaist, wenn ihr Besitzer sicher nicht mehr da ist: anderer Systemstart, Prozess beendet oder (Linux) Prozessnummer inzwischen an einen anderen Prozess vergeben. Nie nur wegen ihres Alters. Aufräumen darf immer nur ein Vorgang zugleich, und nur, wenn die Sperre noch dieselbe ist.

## Rechnungsnummern

Die Nummer wird bei der Freigabe unter der Nummern-Sperre vergeben: Firmendaten werden vorher gelesen, dann wird das Dokument mit der Nummer gespeichert und erst danach der Zähler erhöht. Scheitert das Speichern, ist keine Nummer verbraucht. Die nächste Nummer richtet sich nach dem Zähler und nach den Nummern, die tatsächlich in Dokumenten und im Archiv stehen; so gibt es auch nach einem Absturz zwischen Speichern und Zählen keine Nummer doppelt. Ein unterbrochener Abschluss lässt sich wiederholen: Liegt genau diese Rechnung (gleiches Dokument, gleicher Inhalt) schon im Archiv, gilt der Schritt als erledigt.

## MCP-Werkzeuge

| Werkzeug | Liest/Schreibt | Antwort an die KI |
|---|---|---|
| `dokumente_auflisten` | liest | IDs, Art, Betreff (KI-Sicht) |
| `dokument_lesen` | liest | KI-Sicht, Fassung, Platzhalter-Legende, bei Buchhaltung der geprüfte Kontenplan (mit Platzhaltern) |
| `ergebnis_speichern` | schreibt (mit `fassung`) | Prüfhinweise |
| `buchungen_vorschlagen` | schreibt (mit `fassung`) | Prüfhinweise, vom Bot berechnete Summen |
| `rechnung_erstellen` | schreibt (mit `fassung`) | Prüfhinweise, vom Bot berechnete Summen |

## Entscheidungen

Die wichtigsten Entscheidungen mit Begründung stehen in [`entscheidungen/`](entscheidungen/).
