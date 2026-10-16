// Platzhalter an einer Stelle: Format, Erkennen (auch leicht verändert) und Reste, die nur so aussehen.
import { ENTITY_TYPES } from "./types.js";

const TYPE_ALT = ENTITY_TYPES.join("|");

/**
 * Ein Platzhalter in einem Text: [PERSON_1], [PERSON_1: Beschreibung], auch leicht verändert ([person 1], [PERSON-1],
 * [PERSON1]) oder ohne Klammern (PERSON_1, person_1). Gruppen: 1/2 = Typ/Nummer mit Klammern, 3/4 = ohne Klammern.
 */
export const PLACEHOLDER_SOURCE = String.raw`\[\s*(${TYPE_ALT})\s*[ _-]?\s*(\d{1,6})\s*(?::[^\]\n]{0,200})?\]|(?<![\p{L}\p{N}_\[])(${TYPE_ALT})_(\d{1,6})(?![\p{L}\p{N}_])`;

export function placeholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, "giu");
}

/** Stellen, die wie ein Platzhalter aussehen, aber keiner sind: [NAME_1], PERSON 1, [PERSON_1 ohne Klammer. */
const LEFTOVER_SOURCE = [
  String.raw`\[(?=[^\]\n]{0,40}\d)\p{Lu}[\p{Lu}\p{N}_ -]{1,40}\]`,
  String.raw`\[?(?<![\p{L}\p{N}])\p{Lu}{3,}[ _-]?\d{1,6}(?![\p{L}\p{N}])\]?`,
  String.raw`(?<![\p{L}\p{N}])\p{L}{3,}_\d{1,6}(?![\p{L}\p{N}])`,
].join("|");

export function leftoverRegex(): RegExp {
  return new RegExp(LEFTOVER_SOURCE, "gu");
}

export function placeholderId(type: string, n: string | number): string {
  return `${type.toUpperCase()}_${Number(n)}`;
}

export function formatPlaceholder(entry: { id: string; description?: string }): string {
  return entry.description ? `[${entry.id}: ${entry.description}]` : `[${entry.id}]`;
}
