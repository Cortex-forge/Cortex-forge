# ADR-005: Geheime Inhalte (z. B. Rezepturen) nicht über Platzhalter schützen

Status: angenommen · 2026-10-16

## Kontext
In der Produktion ist oft nicht ein Name das Geheimnis, sondern der Inhalt selbst: Rezepturen, Zeichnungen, Maschinenwerte. Die KI braucht genau diese Inhalte, um zu helfen.

## Entscheidung
- Platzhalter schützen Identitäten (Personen, Firmen, Kontakte), nicht Inhalte, die die KI verstehen muss.
- Wo nötig, geben Platzhalter eine Beschreibung mit, die nur die Art verrät: `[MASCHINE_1: Spritzgussmaschine, 200 t]`.
- Für echte Geschäftsgeheimnisse empfehlen wir ein lokales Modell auf einem Server mit Grafikkarte oder Claude über eine EU-Cloud mit vertraglich zugesicherter Datenhaltung in der EU und ohne Training.

## Folgen
- Produktion ist nicht Teil des ersten Pilots. Start mit Hotel und Buchhaltung, wo die sensiblen Daten Nebensache sind.
