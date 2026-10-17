// Vorlagen für feste Dokumente (ADR-007): erkennen, welche Vorlage passt, ihre Felder lesen und Abweichungen melden.
// Reine Logik ohne Ein-/Ausgabe. Was in einem Feld steht, wird als Ganzes ersetzt, ohne Raten.
import type { DocumentTemplate, Finding, TemplateField } from "./types.js";

export interface TemplateMatch {
  template: DocumentTemplate;
  /** Ein Fund je Feldwert (je Zeile), Quelle "vorlage". */
  findings: Finding[];
  /** Pflichtfelder, die fehlen oder leer sind (Bezeichnungen, ohne Werte). */
  fehlend: string[];
  /** Stellen mit festem Text der Firma (Briefkopf, Fußzeile): Darin wird nichts ersetzt. */
  fest: Array<[number, number]>;
}

const lower = (s: string) => s.toLocaleLowerCase("de");
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Ein Wert braucht mindestens einen Buchstaben oder eine Ziffer ("–" heißt: nichts angegeben). */
const HAS_CONTENT = /[\p{L}\p{N}]/u;

/** Die passende Vorlage: Alle Erkennungsmerkmale stehen im Text; passen mehrere, gilt die mit den meisten Merkmalen. */
export function matchTemplate(text: string, templates: DocumentTemplate[]): DocumentTemplate | undefined {
  const haystack = lower(text);
  let best: DocumentTemplate | undefined;
  for (const t of templates) {
    if (t.erkennen.length === 0 || !t.erkennen.every((m) => haystack.includes(lower(m)))) continue;
    if (!best || t.erkennen.length > best.erkennen.length) best = t;
  }
  return best;
}

/** Bezeichnung am Zeilenanfang, danach Doppelpunkt, Tabulator, mindestens zwei Leerzeichen oder das Zeilenende. */
function labelRegex(field: TemplateField): RegExp {
  const label = field.bezeichnung.trim().replace(/[:：]$/u, "").trim();
  return new RegExp(String.raw`^[ \t]{0,40}${escapeRegExp(label)}(?:[ \t]{0,10}[:：][ \t]*|\t[ \t]*|[ \t]{2,}|[ \t]*$)`, "iu");
}

interface Line {
  start: number;
  text: string;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const end = text.indexOf("\n", start);
    lines.push({ start, text: text.slice(start, end === -1 ? text.length : end) });
    if (end === -1) return lines;
    start = end + 1;
  }
}

/** Ausschnitt einer Zeile ohne Leerraum am Rand. */
function trimmed(line: Line, from = 0): [number, number] | null {
  const part = line.text.slice(from);
  const lead = part.length - part.trimStart().length;
  const value = part.trim();
  if (!value) return null;
  const start = line.start + from + lead;
  return [start, start + value.length];
}

/** Nachname eines Werts: vor dem Komma ("Xylander, Zorwin"), sonst das letzte Wort. */
function surnameOf(value: string): string | undefined {
  const parts = (value.includes(",") ? (value.split(",")[0] ?? "") : value).trim().split(/\s+/).filter(Boolean);
  const last = value.includes(",") ? parts.join(" ") : parts[parts.length - 1];
  return last && last.length >= 2 ? last : undefined;
}

/** Felder einer Vorlage lesen. Gibt jede Fundstelle, fehlende Pflichtfelder und die festen Texte zurück. */
export function applyTemplate(text: string, template: DocumentTemplate): TemplateMatch {
  const lines = linesOf(text);
  const fields = template.felder.map((field) => ({ field, re: labelRegex(field) }));
  const startsField = (line: Line) => fields.some(({ re }) => re.test(line.text));
  const findings: Finding[] = [];
  const present = new Set<TemplateField>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as Line;
    for (const { field, re } of fields) {
      const m = re.exec(line.text);
      if (!m) continue;
      const spans: Array<[number, number]> = [];
      let next = i + 1;
      const first = trimmed(line, m[0].length);
      if (first) {
        spans.push(first);
      } else {
        // Wert in der nächsten Zeile (Bezeichnung und Wert getrennt, typisch für Kopien aus PDF)
        while (next < lines.length && !(lines[next] as Line).text.trim()) next++;
        const candidate = lines[next];
        if (candidate && !startsField(candidate)) {
          const span = trimmed(candidate);
          if (span) spans.push(span);
          next++;
        }
      }
      // Weitere Zeilen des Werts (Adresse: Straße und Ort), solange sie nicht leer sind und kein neues Feld beginnt
      for (let extra = 1; extra < (field.zeilen ?? 1) && spans.length > 0 && next < lines.length; extra++, next++) {
        const candidate = lines[next] as Line;
        if (!candidate.text.trim() || startsField(candidate)) break;
        const span = trimmed(candidate);
        if (span) spans.push(span);
      }
      const real = spans.filter(([s, e]) => HAS_CONTENT.test(text.slice(s, e)));
      if (real.length > 0) present.add(field);
      // Freitext wird nicht als Ganzes ersetzt; die normale Erkennung liest ihn wie jeden anderen Text.
      if (field.typ === "FREITEXT") break;
      for (const [s, e] of real) {
        const value = text.slice(s, e);
        const nachname = field.typ === "PERSON" ? surnameOf(value) : undefined;
        findings.push({ start: s, end: e, type: field.typ, value, source: "vorlage", ...(nachname ? { nachname } : {}) });
      }
      break;
    }
  }

  const fehlend = template.felder.filter((f) => (f.pflicht ?? true) && !present.has(f)).map((f) => f.bezeichnung);
  const fest: Array<[number, number]> = [];
  for (const snippet of template.unveraendert ?? []) {
    if (!snippet.trim()) continue;
    for (let at = text.indexOf(snippet); at !== -1; at = text.indexOf(snippet, at + snippet.length)) {
      fest.push([at, at + snippet.length]);
    }
  }
  return { template, findings, fehlend, fest };
}

/** Vorlage erkennen und anwenden; ohne passende Vorlage undefined. */
export function applyMatchingTemplate(text: string, templates: DocumentTemplate[] = []): TemplateMatch | undefined {
  const template = matchTemplate(text, templates);
  return template ? applyTemplate(text, template) : undefined;
}
