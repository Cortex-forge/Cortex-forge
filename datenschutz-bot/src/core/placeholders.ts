// Platzhalter an einer Stelle: Format, Erkennen (auch leicht verändert) und Reste, die nur so aussehen.
import { ENTITY_TYPES } from "./types.js";

const TYPE_ALT = ENTITY_TYPES.join("|");

/**
 * Ein Platzhalter in einem Text: [PERSON_1], [PERSON_1: Beschreibung], auch leicht verändert ([person 1], [PERSON-1],
 * [PERSON1]) oder ohne Klammern (PERSON_1, person_1). Gruppen: 1/2 = Typ/Nummer mit Klammern, 3/4 = ohne Klammern.
 * Leerraum nur in festen, kleinen Mengen: So bleibt die Laufzeit linear, auch bei "[PERSON" und vielen Leerzeichen.
 */
export const PLACEHOLDER_SOURCE = String.raw`\[[ \t]{0,3}(${TYPE_ALT})[ \t]{0,3}[_-]?[ \t]{0,3}(\d{1,6})[ \t]{0,3}(?::[^\]\n]{0,200})?\]|(?<![\p{L}\p{N}_\[])(${TYPE_ALT})_(\d{1,6})(?![\p{L}\p{N}_])`;

export function placeholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, "giu");
}

/**
 * Stellen, die wie ein Platzhalter aussehen, aber keiner sind: [NAME_1], [KUNDE 2], PERSON 1, PERSN_1. In eckigen
 * Klammern zählt jedes Wort in Großbuchstaben mit Zahl, ohne Klammern nur Typnamen, ähnliche Schreibweisen und
 * übliche Ersatzwörter ("EUR 450", "ISO 9001", "COVID-19" sind keine Reste).
 */
const LEFTOVER_SOURCE = [
  String.raw`\[(?=[^\]\n]{0,40}\d)\p{Lu}[\p{Lu}\p{N}_ -]{1,40}\]`,
  String.raw`\[?(?<![\p{L}\p{N}])(?<w>\p{L}{3,20})[ _-]?\d{1,6}(?![\p{L}\p{N}])\]?`,
].join("|");

/** Übliche Ersatzwörter, die eine KI statt eines Platzhalters schreibt. */
const SUBSTITUTES = new Set(["NAME", "NAMEN", "VORNAME", "NACHNAME", "KUNDE", "KUNDIN", "GAST", "EMPFAENGER", "EMPFÄNGER", "ANSCHRIFT", "TELEFONNUMMER", "TEL", "MAIL", "KONTO", "FIRMENNAME", "PERSONA", "PERSONE", "CUSTOMER", "GUEST", "ADDRESS", "PHONE"]);

/** Höchstens ein Buchstabe anders, zu viel oder zu wenig. */
function nearlyEqual(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const [ra, rb] = [a.slice(i), b.slice(i)];
  return ra.slice(1) === rb.slice(1) || ra.slice(1) === rb || ra === rb.slice(1);
}

function looksLikeType(word: string): boolean {
  const w = word.toUpperCase();
  if (SUBSTITUTES.has(w)) return true;
  return ENTITY_TYPES.some((t) => t === w || (w.length >= 5 && nearlyEqual(w, t)));
}

export function leftoverRegex(): RegExp {
  return new RegExp(LEFTOVER_SOURCE, "gu");
}

/** Ist ein Treffer von leftoverRegex() ein Rest (und keine gewöhnliche Abkürzung mit Zahl)? */
export function isLeftover(m: RegExpMatchArray): boolean {
  const word = m.groups?.w;
  if (word === undefined) return true;
  // ohne Klammern: nur Großbuchstaben oder Typ_Nummer, und nur Typnamen und ähnliche Wörter
  if (word !== word.toUpperCase() && !m[0].includes("_")) return false;
  return looksLikeType(word);
}

export function placeholderId(type: string, n: string | number): string {
  return `${type.toUpperCase()}_${Number(n)}`;
}

export function formatPlaceholder(entry: { id: string; description?: string }): string {
  return entry.description ? `[${entry.id}: ${entry.description}]` : `[${entry.id}]`;
}
