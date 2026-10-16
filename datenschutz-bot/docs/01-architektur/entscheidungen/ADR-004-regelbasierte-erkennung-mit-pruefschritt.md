# ADR-004: Regelbasierte Erkennung mit menschlichem Prüfschritt (Prototyp)

Status: angenommen für Phase 0 · 2026-10-16

## Kontext
Für die Erkennung gibt es Regeln (Muster, Namenslisten, Kontext), NER-Bibliotheken (z. B. Presidio) und lokale Sprachmodelle. Eine Cloud-KI zur Erkennung scheidet aus, weil sie dafür die Originale sehen müsste.

## Entscheidung
Im Prototyp nutzen wir Regeln ohne zusätzliche Abhängigkeiten. Vor der Freigabe prüft ein Mensch die KI-Sicht und kann nachschwärzen.

## Gründe
- Schnell, nachvollziehbar, testbar, läuft überall.
- Harte Kennungen (E-Mail, IBAN mit Prüfziffer, Telefon, UID) erkennen Regeln sehr zuverlässig.

## Folgen
- Namen ohne Anrede, die nicht in der Namensliste stehen, können durchrutschen. Der Prüfschritt fängt das ab.
- Für den Pilot kommt ein lokales Modell als zweite Stufe dazu (siehe Roadmap). Vorher messen wir die Erkennung mit einem Testset mit Lösungsblatt.
