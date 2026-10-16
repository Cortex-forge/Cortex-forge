# ADR-002: Die KI bekommt Dokumente nur über den MCP-Server, nie über den Chat

Status: angenommen · 2026-10-16

## Kontext
Wird ein Dokument direkt in den Chat gezogen, sieht der KI-Anbieter das Original, bevor der Bot etwas tun kann. Ebenso würde ein Werkzeug, das das fertige Ergebnis an die KI zurückgibt, die Originale preisgeben.

## Entscheidung
- Dokumente werden ausschließlich in der Oberfläche abgelegt und erst nach menschlicher Prüfung freigegeben.
- Die KI liest sie über `dokument_lesen` und bekommt nur die Platzhalter-Version.
- Speicher-Werkzeuge antworten nur mit Prüfhinweisen und vom Bot berechneten Beträgen. Das zurückübersetzte Ergebnis sieht nur der Mitarbeiter in der Oberfläche.

## Folgen
- Mitarbeiter müssen geschult werden, Dokumente nicht in den Chat zu ziehen (Hinweis in Oberfläche und README).
- Die Datenschutz-Probe in `src/test/mcp.test.ts` und im Demo-Skript prüft bei jedem Lauf, dass keine Antwort einen Originalwert enthält.
