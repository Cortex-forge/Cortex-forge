import {
  detectCreditCards,
  detectEmails,
  detectIbans,
  detectPhones,
  detectVatIds,
} from "./detectors.js";
import { formatPlaceholder, isLeftover, leftoverRegex, placeholderId, placeholderRegex } from "./placeholders.js";
import { PARTICLE_WORDS, SALUTATION_BEFORE } from "./salutations.js";
import { ENTITY_LABELS, type EntityType, type MappingEntry } from "./types.js";

export interface InventedData {
  type: EntityType;
  label: string;
  value: string;
}

export interface ReidentifyResult {
  text: string;
  /** Platzhalter, die ersetzt wurden. */
  used: string[];
  /** Platzhalter, die es in diesem Dokument nicht gibt (KI hat sie erfunden). */
  unknown: string[];
  /** Platzhalter, die die KI verändert geschrieben hat und die trotzdem erkannt wurden. */
  repaired: string[];
  /** Platzhalter aus dem Dokument, die im Ergebnis nicht vorkommen. */
  unused: string[];
  /** Kontaktdaten, die die KI selbst geschrieben hat (stammen nicht aus dem Dokument). */
  invented: InventedData[];
  /** Stellen, die wie ein Platzhalter aussehen, aber keiner sind ("[NAME_1]", "PERSON 1"). */
  leftovers: string[];
}


/** Nachname für "Sehr geehrte Frau …": gespeichert bei der Erkennung, sonst der letzte Teil samt Zusatz. */
function surnameOf(entry: MappingEntry): string {
  if (entry.nachname) return entry.nachname;
  const parts = entry.original.trim().split(/[ \t]+/);
  let i = parts.length - 1;
  while (i > 0 && PARTICLE_WORDS.has((parts[i - 1] ?? "").toLowerCase())) i--;
  return parts.slice(i).join(" ") || entry.original;
}

/** Sucht in einem KI-Text nach Kontaktdaten, die nicht als Platzhalter kamen. */
export function findInventedData(aiText: string): InventedData[] {
  const withoutPlaceholders = aiText.replace(placeholderRegex(), " ");
  const found = [
    ...detectEmails(withoutPlaceholders),
    ...detectPhones(withoutPlaceholders),
    ...detectIbans(withoutPlaceholders),
    ...detectCreditCards(withoutPlaceholders),
    ...detectVatIds(withoutPlaceholders),
  ];
  const seen = new Set<string>();
  const out: InventedData[] = [];
  for (const f of found) {
    const key = `${f.type}:${f.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: f.type, label: ENTITY_LABELS[f.type], value: f.value });
  }
  return out;
}

/**
 * Setzt die Originale für die Platzhalter ein. Alles geschieht in einem Durchgang über den Text der KI: Eingesetzte
 * Originale werden nie noch einmal ausgewertet. So kann ein Original, das selbst wie ein Platzhalter aussieht
 * ("PERSON_987654"), weder ersetzt noch als Prüfhinweis an die KI zurückgemeldet werden.
 */
export function reidentify(
  aiText: string,
  mapping: MappingEntry[],
  options: { literal?: Iterable<string> } = {},
): ReidentifyResult {
  const byId = new Map(mapping.map((e) => [e.id, e]));
  const literal = new Set(options.literal ?? []);
  const used = new Set<string>();
  const unknown = new Set<string>();
  const repaired = new Set<string>();

  const pieces: string[] = [];
  const spans: Array<[number, number]> = [];
  let pos = 0;
  for (const m of aiText.matchAll(placeholderRegex())) {
    const start = m.index;
    const end = start + m[0].length;
    spans.push([start, end]);
    pieces.push(aiText.slice(pos, start));
    pos = end;
    const id = placeholderId(m[1] ?? m[3] ?? "", m[2] ?? m[4] ?? "");
    const entry = byId.get(id);
    if (!entry) {
      // Stand der Platzhalter schon so im Original (z. B. in einer Vorlage), bleibt er einfach stehen.
      if (!literal.has(id)) unknown.add(m[0]);
      pieces.push(m[0]);
      continue;
    }
    used.add(id);
    if (m[0] !== formatPlaceholder(entry) && m[0] !== `[${id}]`) repaired.add(m[0]);
    const before = aiText.slice(Math.max(0, start - 40), start);
    pieces.push(entry.type === "PERSON" && SALUTATION_BEFORE.test(before) ? surnameOf(entry) : entry.original);
  }
  pieces.push(aiText.slice(pos));

  const leftovers = new Set<string>();
  for (const m of aiText.matchAll(leftoverRegex())) {
    const s = m.index;
    const e = s + m[0].length;
    if (spans.some(([a, b]) => s < b && a < e) || !isLeftover(m)) continue;
    leftovers.add(m[0]);
  }

  return {
    text: pieces.join(""),
    used: [...used],
    unknown: [...unknown],
    repaired: [...repaired],
    unused: mapping.map((e) => e.id).filter((id) => !used.has(id)),
    invented: findInventedData(aiText),
    leftovers: [...leftovers],
  };
}
