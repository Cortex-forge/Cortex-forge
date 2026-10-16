# ADR-006: Zweite Erkennungsstufe mit einem lokalen Modell

Status: **Vorschlag, Entscheidung von Peter offen** · 2026-10-16

## Kontext
Die Erkennung arbeitet bisher nur mit Regeln (ADR-004). Am blind erstellten Prüfset 2 erkennt sie 82,0 % der sensiblen Angaben bei 90,7 % Genauigkeit. Vor der Arbeit an Prüfset 1 waren es 72,8 %. Am Prüfset, an dem entwickelt wurde, stehen 99 %: Neue Regeln helfen vor allem bei den Fällen, aus denen sie entstanden sind. Schwach bleiben Firmen ohne Rechtsform, Gesundheitsangaben in eigenen Worten, Religion, Adressen und freie Kennungen. Die Ziele für den Pilot (Personen 95 %, Telefon und Adressen 98 %, Gesundheit 95 %) erreichen Regeln allein kaum.

Eine Cloud-KI scheidet für die Erkennung aus, weil sie dafür die Originale sehen müsste (ADR-002). Ein zweites Verfahren muss deshalb auf dem eigenen Rechner laufen.

## Möglichkeiten

| | A: Erkennungsmodell im Bot (ONNX in Node) | B: Presidio als lokaler Dienst (Python) | C: Lokales Sprachmodell (z. B. über Ollama) |
|---|---|---|---|
| Was es ist | Ein kleines Modell, das Namen, Orte, Firmen und je nach Modell weitere Angaben in Texten markiert (z. B. ein mehrsprachiges NER-Modell oder ein GLiNER-Modell für personenbezogene Daten) | Microsofts Werkzeug für personenbezogene Daten mit eigenen Erkennern und spaCy-Sprachmodellen | Ein allgemeines Sprachmodell mit 7–8 Milliarden Parametern, das per Anweisung sensible Stellen nennt |
| Läuft wo | im Bot selbst, ohne Internet | als zweiter Prozess auf dem Rechner | als zweiter Prozess auf dem Rechner |
| Neue Abhängigkeiten | ONNX-Laufzeit für Node und eine Modelldatei (einige hundert MB) | Python, Presidio, spaCy-Modelle je Sprache | Ollama und ein Modell (4–8 GB) |
| Tempo je Seite | etwa 0,1–1 s auf einem normalen Rechner | etwa 0,1–1 s | Sekunden bis Minuten ohne Grafikkarte |
| Stärken | Namen und Firmen ohne Anrede oder Liste, mehrere Sprachen, gleiches Ergebnis bei gleicher Eingabe | ausgereift, viele Erkenner, gut erweiterbar | versteht Umschreibungen („er hot's mitn rücken“), Gesundheit, Religion |
| Schwächen | Dialekt, Kleinschreibung und Umschreibungen begrenzt; Lizenz des Modells prüfen | Einrichtung unter Windows aufwendiger; zweite Programmiersprache | langsam, braucht viel Speicher, kann Stellen erfinden oder auslassen, Ergebnis schwankt |

## Vorschlag
1. **A zuerst:** Ein Erkennungsmodell als zusätzliche Stufe neben den Regeln. Was eine der beiden Stufen findet, wird geschützt (Vereinigung der Funde). Der Prüfschritt vor der Freigabe bleibt Pflicht.
2. **Messen statt raten:** Jede Möglichkeit wird am blinden Prüfset 2 gemessen, nur mit Zahlen. Werden danach Schwellenwerte oder Regeln an diesen Zahlen eingestellt, braucht es ein neues, blindes Prüfset 3.
3. **C nur, wenn A nicht reicht:** etwa für Gesundheit und Religion in eigenen Worten, und nur mit einem Rechner, der das in vertretbarer Zeit schafft.

Vor der Entscheidung zu prüfen: Lizenz und Größe der Modelldatei, Tempo auf Peters Rechner, Verhalten bei Dialekt und Kleinschreibung.

## Folgen
- Neue Abhängigkeiten (laut AGENTS.md nur nach Rücksprache), größerer Download beim Einrichten.
- Die Erkennung ist nicht mehr nur über Regeln nachvollziehbar. Die Oberfläche zeigt weiter jede Fundstelle mit ihrer Quelle („Modell“ oder Regel).
- Die Laufzeitgrenze (200.000 Zeichen) braucht für das Modell eigene Messungen und eventuell ein Zeitlimit (offene Punkte #15).
