import {
  detectCreditCards,
  detectEmails,
  detectIbans,
  detectPhones,
  detectVatIds,
} from "./detectors.js";
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType, type MappingEntry } from "./types.js";

const TYPE_ALT = ENTITY_TYPES.join("|");
// [PERSON_1], [PERSON_1: Beschreibung], auch leicht verändert: [person 1], [PERSON-1]
const BRACKETED = new RegExp(`\\[\\s*(${TYPE_ALT})[ _-](\\d+)\\s*(?::[^\\]\\n]*)?\\]`, "gi");
// PERSON_1 ohne Klammern (nur in Großbuchstaben, damit normaler Text nicht getroffen wird)
const BARE = new RegExp(`(?<![\\w\\[])(${TYPE_ALT})_(\\d+)(?![\\w])`, "g");
// Anrede direkt vor einem Personen-Platzhalter: dann nur den Nachnamen einsetzen ("Frau Huber").
const SALUTATION_BEFORE =
  /\b(?:Herrn?|Frau|Hr\.|Fr\.|Familie|Fam\.|Mr\.?|Mrs\.?|Ms\.?|Signora|Signor|Dhr\.|Mevr\.)(?:[ \t]+(?:Dr\.(?:in)?|Mag\.(?:a)?|Ing\.|DI|Prof\.))*[ \t]+$/;

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
}

function surnameOf(name: string): string {
  const parts = name.trim().split(/[ \t]+/);
  return parts[parts.length - 1] ?? name;
}

/** Sucht in einem KI-Text nach Kontaktdaten, die nicht als Platzhalter kamen. */
export function findInventedData(aiText: string): InventedData[] {
  const withoutPlaceholders = aiText.replace(BRACKETED, " ").replace(BARE, " ");
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

export function reidentify(aiText: string, mapping: MappingEntry[]): ReidentifyResult {
  const byId = new Map(mapping.map((e) => [e.id, e]));
  const used = new Set<string>();
  const unknown = new Set<string>();
  const repaired = new Set<string>();

  const substitute = (match: string, rawType: string, n: string, offset: number, whole: string): string => {
    const id = `${rawType.toUpperCase()}_${n}`;
    const entry = byId.get(id);
    if (!entry) {
      unknown.add(match);
      return match;
    }
    used.add(id);
    const canonical = entry.description ? `[${id}: ${entry.description}]` : `[${id}]`;
    if (match !== canonical && match !== `[${id}]`) repaired.add(match);
    if (entry.type === "PERSON" && SALUTATION_BEFORE.test(whole.slice(Math.max(0, offset - 40), offset))) {
      return surnameOf(entry.original);
    }
    return entry.original;
  };

  let text = aiText.replace(BRACKETED, (m, t: string, n: string, offset: number, whole: string) =>
    substitute(m, t, n, offset, whole),
  );
  text = text.replace(BARE, (m, t: string, n: string, offset: number, whole: string) => {
    const replacement = substitute(m, t, n, offset, whole);
    if (replacement !== m) repaired.add(m);
    return replacement;
  });

  return {
    text,
    used: [...used],
    unknown: [...unknown],
    repaired: [...repaired],
    unused: mapping.map((e) => e.id).filter((id) => !used.has(id)),
    invented: findInventedData(aiText),
  };
}
