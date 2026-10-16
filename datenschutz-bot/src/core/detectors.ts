import {
  BUSINESS_WORDS,
  CHINESE_SURNAMES,
  COMMON_LOWERCASE_WORDS,
  FIRST_NAMES,
  KIN_WORDS,
  NOUN_SURNAMES,
  LOWERCASE_STOPWORDS,
  LOWERCASE_UNSAFE_NAMES,
  MONTHS,
  NOT_NAME_AFTER_SALUTATION,
  NOT_SURNAME,
  PLACE_PREFIXES,
  ROLE_WORDS,
} from "./names.js";
import { htmlToText, looksLikeHtml } from "./mail.js";
import { PARTICLE, SALUTATION, TITLES } from "./salutations.js";
import type { CompanyEntry, DetectOptions, EntityType, Finding, ManualMark } from "./types.js";

// Alle Muster laufen mit dem Flag "u" (Unicode). Wichtig: \p{Lu} nie zusammen mit dem Flag "i" verwenden,
// sonst passt es auch auf Kleinbuchstaben.
//
// Laufzeit: Jedes Muster beginnt mit einem Lookbehind, der nur Wortanfänge zulässt, und hat nach oben begrenzte
// Wiederholungen. So bleibt die Erkennung auch bei langen Wörtern (Tracking-Links, eingebettete Bilder) linear.

const UP = String.raw`\p{Lu}`;
const LO = String.raw`\p{Ll}`;

/**
 * Trennt unabhängige Teile eines Dokuments (Betreff, Text, Kontenplan). Ein Zeichen aus dem privaten Bereich von
 * Unicode, das beim Ablegen aus Dokumenten entfernt wird. Kein Fund reicht über diese Grenze.
 */
export const SEGMENT_BREAK = "\uE000";

/** Priorität bei Überschneidungen: höher gewinnt. */
function priorityOf(f: Finding): number {
  if (f.source === "manuell") return 100;
  if (f.source.startsWith("kontext")) return 75;
  if (f.source === "firma:verzeichnis") return 62;
  switch (f.type) {
    case "EMAIL":
      return 90;
    case "IBAN":
    case "KREDITKARTE":
      return 85;
    case "UID":
      return 80;
    case "TELEFON":
      return 70;
    case "FIRMA":
      return 60;
    case "ADRESSE":
      return 55;
    case "PERSON":
      return 50;
    case "GESUNDHEIT":
    case "RELIGION":
      return 45;
    default:
      return 40;
  }
}

function finding(
  text: string,
  start: number,
  end: number,
  type: EntityType,
  source: string,
  extra: Partial<Finding> = {},
): Finding {
  return { start, end, type, value: text.slice(start, end), source, ...extra };
}

/** Alle Treffer eines globalen Musters. Das Muster darf währenddessen nicht anderweitig benutzt werden. */
function* matchAll(text: string, rx: RegExp): Generator<RegExpExecArray> {
  rx.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (m[0].length === 0) {
      rx.lastIndex++;
      continue;
    }
    yield m;
  }
}

/** Start und Ende einer benannten Gruppe innerhalb eines Treffers (Muster mit Flag "d"). */
function groupSpan(m: RegExpExecArray, group: string): [number, number] | null {
  const indices = (m as RegExpExecArray & { indices?: { groups?: Record<string, [number, number] | undefined> } })
    .indices;
  return indices?.groups?.[group] ?? null;
}

/** Zeilenanfang, aber höchstens max Zeichen zurück (so bleibt die Laufzeit auch bei sehr langen Zeilen linear). */
function lineStartWithin(text: string, index: number, max: number): number {
  const from = Math.max(0, index - max);
  for (let i = index - 1; i >= from; i--) if (text.charCodeAt(i) === 10) return i + 1;
  return from;
}

/** Zeilenende, aber höchstens max Zeichen weit. */
function lineEndWithin(text: string, index: number, max: number): number {
  const to = Math.min(text.length, index + max);
  for (let i = index; i < to; i++) if (text.charCodeAt(i) === 10) return i;
  return to;
}

/** Steht vor index auf derselben Zeile nur Leerraum? */
function atLineStart(text: string, index: number): boolean {
  for (let i = index - 1, n = 0; n < 200; i--, n++) {
    if (i < 0) return true;
    const c = text[i];
    if (c === "\n") return true;
    if (c !== " " && c !== "\t" && c !== "\r") return false;
  }
  return false;
}

function lineEndOf(text: string, index: number): number {
  const i = text.indexOf("\n", index);
  return i === -1 ? text.length : i;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function isCaps(word: string): boolean {
  return /^\p{Lu}[\p{Lu}-]+$/u.test(word);
}

function isSingleFirstName(word: string): boolean {
  return FIRST_NAMES.has(word) || ((isCaps(word) || /^\p{Ll}/u.test(word)) && FIRST_NAMES.has(capitalize(word)));
}

/** Bekannter Vorname, auch als Doppelvorname mit Bindestrich ("Karl-Heinz", "Lisa-Marie"; nicht "Baden-Baden"). */
function isFirstName(word: string): boolean {
  if (isSingleFirstName(word)) return true;
  const parts = word.split("-");
  return parts.length >= 2 && parts.length <= 3 && parts.every((p) => p.length >= 2 && isSingleFirstName(p));
}

function isNotSurname(word: string): boolean {
  return NOT_SURNAME.has(word) || NOT_SURNAME.has(capitalize(word));
}

/** Hauptwort, das auch ein häufiger Nachname ist ("Berg", "Sommer", "Koch"). */
const POSSESSIVE_BEFORE_RE =
  /(?<![\p{L}])(?:mein|meine|meiner|meinem|meinen|dein|deine|deiner|deinem|sein|seine|seiner|seinem|ihre|ihrer|ihrem|unsere|unserer|unserem|eure|eurer|eurem)[ \t]{1,3}$/iu;
/** Nach einem Vornamen kein Nachname, auch wenn es einer sein kann; nach einer Anrede schon ("Frau Freitag"). */
const NOT_AFTER_FIRST_NAME = new Set([
  "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag", "Mai", "Morgen", "Abend", "Ende",
  "Anfang", "Mitte", "Recht", "Glück",
]);
/** Wörter, mit denen ein Satz oder Nebensatz beginnt: nie ein Nachname ("Ob Anna mitkommt", "Lena M. Danach"). */
const SENTENCE_WORDS = new Set([
  "ob", "wenn", "weil", "falls", "sobald", "sofern", "als", "dass", "damit", "obwohl", "nachdem", "bevor", "während",
  "seit", "bis", "und", "oder", "aber", "denn", "doch", "sondern", "da", "wie", "wo", "so", "dann", "danach", "davor",
  "darauf", "also", "auch", "nur", "noch", "schon", "jetzt", "heute", "gestern", "morgen", "bitte", "danke", "leider",
  "außerdem", "ansonsten", "anschließend", "trotzdem", "deshalb", "daher", "zudem", "übrigens", "inzwischen",
  "allerdings", "natürlich", "vielleicht", "hoffentlich", "gerne", "gern",
]);
function isSentenceWord(word: string): boolean {
  return SENTENCE_WORDS.has(word.toLowerCase());
}

function isNounSurname(word: string): boolean {
  return NOUN_SURNAMES.has(word) || NOUN_SURNAMES.has(capitalize(word));
}

// Abkürzungen in Großbuchstaben, die kein Name sind.
const ACRONYMS = new Set(
  `GMBH AG KG OG UG SE GESMBH OHG EU USA UK UID IBAN BIC SWIFT PLZ TEL FAX MWST UST CEO CFO CTO GF HR PDF CSV MBH
   NR NO REF ZH ZHD WC TV OK ATU AT DE CH IT NL FR ES HRB FN AZ KW KM EUR USD CHF`
    .split(/\s+/)
    .filter(Boolean),
);

// ---------------------------------------------------------------------------
// E-Mail

const EMAIL_RE =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}(?:@|[ \t]?(?:\(at\)|\[at\]|\{at\}|\(ät\))[ \t]?)[\p{L}\p{N}-]{1,63}(?:(?:\.|[ \t]?(?:\(dot\)|\[dot\]|\(punkt\))[ \t]?)[\p{L}\p{N}-]{1,63}){0,8}(?:\.|[ \t]?(?:\(dot\)|\[dot\]|\(punkt\))[ \t]?)\p{L}{2,24}(?![\p{L}\p{N}-])/gu;

export function detectEmails(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, EMAIL_RE)) {
    out.push(finding(text, m.index, m.index + m[0].length, "EMAIL", "email"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// IBAN (mit Prüfziffer nach ISO 13616)

export function ibanIsValid(raw: string): boolean {
  const iban = raw.replace(/[\s–-]+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

// Gruppen getrennt durch Leerzeichen, Bindestrich oder einen Zeilenumbruch; Groß- oder Kleinschreibung.
// Ob es wirklich eine IBAN ist, entscheidet die Prüfziffer.
const IBAN_SEP = String.raw`(?:[ \t]{0,2}[-–]?[ \t]{0,2}|[ \t]{0,2}\n[ \t]{0,2})`;
const IBAN_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])[A-Za-z]{2}\d{2}(?:${IBAN_SEP}[A-Za-z0-9]{4}){2,7}(?:${IBAN_SEP}[A-Za-z0-9]{1,4})?(?![\p{L}\p{N}])`,
  "gu",
);

/** Länge der IBAN je Land (ISO 13616; Europa und Nachbarländer). */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AL: 28, AT: 20, BA: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18,
  FO: 18, FR: 27, GB: 22, GI: 23, GL: 18, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20,
  LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, RS: 22, SE: 24, SI: 19,
  SK: 24, SM: 27, TR: 26, UA: 29, VA: 22, XK: 20,
};
const IBAN_START_RE = /[A-Z]{2}(?=\d{2})/g;

/**
 * IBAN ohne Wortgrenze ("IBANAT61…", "…3201BIC", typisch für Kopien aus PDF): ab jedem Ländercode genau so viele
 * Zeichen, wie eine IBAN dieses Landes hat, dazwischen höchstens kurze Trennzeichen; dann entscheidet die Prüfziffer.
 */
function gluedIbans(text: string, found: Finding[]): Finding[] {
  const out: Finding[] = [];
  const covered = new Uint8Array(text.length);
  for (const f of found) covered.fill(1, f.start, f.end);
  for (const m of matchAll(text, IBAN_START_RE)) {
    const length = IBAN_LENGTHS[m[0]];
    if (!length || covered[m.index]) continue;
    let chars = "";
    let end = m.index;
    let gap = 0;
    for (let i = m.index; i < text.length && chars.length < length; i++) {
      const ch = text[i] ?? "";
      if (/[A-Za-z0-9]/.test(ch)) {
        chars += ch;
        end = i + 1;
        gap = 0;
      } else if (/[ \t–-]/.test(ch) && chars.length >= 4 && gap < 3) {
        gap++;
      } else break;
    }
    if (chars.length === length && ibanIsValid(chars)) {
      out.push(finding(text, m.index, end, "IBAN", "iban"));
      covered.fill(1, m.index, end);
    }
  }
  return out;
}

export function detectIbans(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, IBAN_RE)) {
    // Am Ende können zusätzliche Zeichen mitgefangen werden: kürzen, bis die Prüfziffer stimmt. Weitergesucht wird
    // am echten Ende, denn dort kann gleich die nächste IBAN beginnen (Review Codex 4 #3).
    let candidate = m[0];
    let resume = m.index + 1;
    while (candidate.replace(/[\s–-]/g, "").length >= 15) {
      if (ibanIsValid(candidate)) {
        out.push(finding(text, m.index, m.index + candidate.length, "IBAN", "iban"));
        resume = m.index + candidate.length;
        break;
      }
      const cut = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("-"), candidate.lastIndexOf("–"), candidate.lastIndexOf("\n"));
      if (cut <= 4) break;
      candidate = candidate.slice(0, cut).replace(/[\s–-]+$/u, "");
    }
    IBAN_RE.lastIndex = resume;
  }
  return [...out, ...gluedIbans(text, out)];
}

// ---------------------------------------------------------------------------
// Kreditkarte (Luhn-Prüfung). Visa/Mastercard 4-4-4-4, Amex 4-6-5, Diners 4-6-4.

function luhnIsValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const CARD_RE = /(?<![\p{N}])(?:\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -]?)\d{6}\2\d{4,5})(?![\p{N}])/gu;

export function detectCreditCards(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, CARD_RE)) {
    const digits = digitsOnly(m[0]);
    if (digits.length >= 13 && digits.length <= 19 && luhnIsValid(digits)) {
      out.push(finding(text, m.index, m.index + m[0].length, "KREDITKARTE", "kreditkarte"));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Telefon
//
// Ob eine Ziffernfolge eine Telefonnummer ist, entscheidet vor allem das nächste aussagekräftige Wort davor:
// "Telefonnummer:", "Handy", "unter der Nummer" sprechen dafür, "Rechnungsnummer", "Buchung" dagegen.
// Bei zusammengesetzten Wörtern zählt der hintere Teil ("Telefonrechnung" ist eine Rechnung).

const PHONE_STEMS = [
  "telefon", "telephone", "phone", "mobil", "handy", "fax", "cellular", "cellulare", "telefono", "telefoon", "mobiel",
  "portable", "téléphone", "chiamarmi", "chiamatemi", "whatsapp", "signal",
  "whatsapp", "rufnummer", "durchwahl", "festnetz", "rückruf", "anruf", "hotline", "kundenservice", "kundendienst",
  "notruf", "zentrale",
];
const PHONE_WORDS = new Set(["tel", "tlf", "fon", "ph", "cell", "mob", "fax", "tél", "cel", "privat"]);
const DOC_STEMS = [
  "rechnung", "beleg", "auftrag", "bestell", "order", "invoice", "buchung", "booking", "reservier", "reservation",
  "ticket", "vorgang", "referenz", "reference", "aktenzeichen", "kundennr", "kundennummer", "kdnr", "vertrag",
  "contract", "konto", "account", "iban", "artikel", "serien", "transaktion", "polizz", "police", "mitglied", "member",
  "lieferschein", "gutschrift", "fattura", "factuur", "bestelling", "rekening", "zimmer", "room",
];
const DOC_WORDS = new Set(["ref", "az", "bic", "blz", "plz", "zip", "art", "kd", "kw"]);
const WEAK_PHONE_WORDS = new Set([
  "unter", "erreichbar", "erreichen", "erreichst", "anrufen", "rufen", "ruf", "call", "calling", "reach", "contact",
  "kontakt", "kontaktieren", "melden", "chiamare", "chiamami", "chiama", "bellen", "bel",
]);

function classifyWord(word: string): "telefon" | "beleg" | null {
  if (PHONE_WORDS.has(word) || WEAK_PHONE_WORDS.has(word)) return "telefon";
  if (DOC_WORDS.has(word)) return "beleg";
  let best = -1;
  let kind: "telefon" | "beleg" | null = null;
  for (const stem of PHONE_STEMS) {
    const i = word.lastIndexOf(stem);
    if (i > best) [best, kind] = [i, "telefon"];
  }
  for (const stem of DOC_STEMS) {
    const i = word.lastIndexOf(stem);
    if (i > best) [best, kind] = [i, "beleg"];
  }
  return kind;
}

/** "Nummer", "numero" allein meinen meist die Telefonnummer ("meine Nummer ist …"), außer davor steht ein Beleg. */
const NUMBER_WORDS = new Set(["nummer", "number", "numero", "número"]);
/** "Nr.", "No." nennen jede Art Nummer ("St.-Nr.", "Zimmer Nr."): entscheidet das Wort davor. */
const NUMBER_ABBREVIATIONS = new Set(["nr", "no", "num"]);

function phoneVerdict(text: string, start: number): "telefon" | "beleg" | null {
  const from = lineStartWithin(text, start, 48);
  // Wörter aus E-Mail-Adressen und Links zählen nicht ("accounts@…" ist kein Konto), reine Zahlen auch nicht.
  const before = text.slice(from, start).toLowerCase().replace(/\S+@\S+|https?:\/\/\S+|www\.\S+/gu, " ");
  const words = (before.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !/^\d+$/u.test(w));
  for (let i = words.length - 1, n = 0; i >= 0 && n < 4; i--, n++) {
    const word = words[i] ?? "";
    const before = classifyWord(words[i - 1] ?? "");
    if (NUMBER_WORDS.has(word)) return before === "beleg" ? "beleg" : "telefon";
    if (NUMBER_ABBREVIATIONS.has(word)) {
      if (before) return before;
      continue;
    }
    const kind = classifyWord(word);
    if (kind) return kind;
  }
  return null;
}

/** Festnetz in üblicher Schreibweise: Vorwahl, Trennzeichen, Rufnummer ("0512 123456", "089/12345678"). */
const LANDLINE_SHAPE = /^0[1-9]\d{0,4}[ \t/-]{1,2}\d{3,9}(?:[ \t-]\d{1,6})?$/;

// Zwischen Zifferngruppen steht immer ein Trennzeichen (oder es gibt gar keines): So hat jede Ziffernfolge genau eine
// Aufteilung, und lange Ziffernfolgen kosten keine Zeit (Review Claude 3 #14).
const PHONE_INTL_RE =
  /(?<![\p{L}\p{N}+])(?:\+|00)(?:\d{7,15}|\d{1,7}(?:[ \t/.–-]{1,3}(?:\(\d{1,4}\)[ \t/.–-]{0,3})?\d{1,10}|[ \t]?\(\d{1,4}\)[ \t/.–-]{0,3}\d{1,10}){1,7})(?![\p{L}\p{N}])/gu;
const PHONE_NATIONAL_RE =
  /(?<![\p{L}\p{N}.,+/-])(?:0[1-9]\d{5,13}|(?:\(0\d{1,5}\)[ \t]?|0[1-9]\d{0,4}[ \t/.–-]{1,3})\d{1,8}(?:[ \t/.–-]{1,3}\d{1,8}){0,4})(?![\p{L}\p{N}]|[.,]\d)/gu;
// Ohne führende 0 (italienische Handys "347 1234567", USA "(555) 123-4567"): nur mit Telefon-Wort davor.
const PHONE_CONTEXT_RE =
  /(?<![\p{L}\p{N}.,+/-])(?:\(\d{2,4}\)[ \t]?|[1-9]\d{1,3}[ \t/.-]?)\d{2,4}(?:[ \t/.-]?\d{2,5}){1,2}(?![\p{L}\p{N}]|[.,]\d)/gu;
// Italienische Handynummern haben eine feste Form: 3xx xxx xxxx (auch ohne Signalwort).
const ITALIAN_MOBILE_RE = /(?<![\p{L}\p{N}.,+/-])3[1-9]\d(?:[ \t.]\d{3}[ \t.]\d{3,4}|[ \t.]\d{6,7})(?![\p{L}\p{N}]|[.,]\d)/gu;
// Messenger-Links mit Rufnummer: "wa.me/436641234567"
const MESSENGER_LINK_RE = /(?<![\p{L}\p{N}])(?:wa\.me|api\.whatsapp\.com\/send\?phone=|t\.me\/\+?)\/?(?<v>\+?\d{7,15})(?![\p{N}])/gud;
// Ein Datum ("01.09.1953", "03/05/2027", "03-05-2027", "2027-05-03") ist keine Telefonnummer (Review Claude 4 #7).
const DATE_SHAPE = /^(?:\d{1,2}([./-])\d{1,2}\1(?:\d{2}|\d{4})|\d{4}([/-])\d{2}\2\d{2})$/;

/**
 * Mehrere Nummern in einem Treffer ("0512 123456 / 0512 654321"): Teile ab jeder Zifferngruppe, die mit 0 beginnt.
 * Die Teile werden einzeln geprüft (Review Codex 4 #4).
 */
function phoneParts(value: string): Array<[number, string]> {
  const parts: Array<[number, string]> = [];
  let from = 0;
  for (const m of value.matchAll(/[ \t/.–-]{1,3}(?=0)/gu)) {
    if (m.index > from) parts.push([from, value.slice(from, m.index)]);
    from = m.index + m[0].length;
  }
  parts.push([from, value.slice(from)]);
  return parts;
}

/** Ein Muster ohne seine Prüfung davor, verankert an einer Stelle (lastIndex). */
function anchored(rx: RegExp, lookbehind: string): RegExp {
  if (!rx.source.startsWith(lookbehind)) throw new Error(`Muster beginnt nicht mit ${lookbehind}`);
  return new RegExp(rx.source.slice(lookbehind.length), "uy");
}
// Bezeichnung direkt vor der Nummer ("Telefon0664 1234567", "Tel.0512/123456"), typisch für Kopien aus PDF. Die
// Muster oben schließen einen Buchstaben oder Punkt davor aus, damit keine Zahl mitten in einem Wort oder Datum zählt.
const PHONE_LABEL_GLUED_RE = /(?<![\p{L}])(?:Telefon|Telefono|Telefoon|Tel|Mobil|Mobile|Handy|Fax|Phone|Cell|Mob)\.?(?=\+|0)/giu;
const PHONE_INTL_AT = anchored(PHONE_INTL_RE, String.raw`(?<![\p{L}\p{N}+])`);
const PHONE_NATIONAL_AT = anchored(PHONE_NATIONAL_RE, String.raw`(?<![\p{L}\p{N}.,+/-])`);

export function detectPhones(text: string): Finding[] {
  const out: Finding[] = [];
  const consider = (start: number, value: string, kind: "intl" | "national" | "context" | "fest") => {
    const digits = digitsOnly(value);
    if (digits.length > 15 && kind !== "context") {
      const parts = phoneParts(value);
      if (parts.length > 1) {
        for (const [offset, part] of parts) consider(start + offset, part, /^(?:\+|00)/.test(part) ? "intl" : "national");
      }
      return;
    }
    if (digits.length < 7 || digits.length > 15) return;
    if (DATE_SHAPE.test(value)) return;
    if (kind === "intl" && (value.startsWith("00") ? digits.length < 11 : digits.length < 8)) return;
    const verdict = phoneVerdict(text, start);
    if (verdict === "beleg") return;
    if (verdict !== "telefon" && kind !== "fest") {
      if (kind === "context") return;
      if (kind === "national") {
        const mobile = /^0(?:6[5-9]\d|1[5-7]\d|7[5-9])/.test(digits);
        const landline = digits.length >= 9 && LANDLINE_SHAPE.test(value);
        // Am Zeilenanfang (Signatur, Kontaktblock) genügen 9 Ziffern; kürzere sind dort oft Artikelnummern
        // ("0815-2201 Duschgel", Review Claude 4 #7).
        if (!mobile && !landline && !(atLineStart(text, start) && digits.length >= 9)) return;
      }
    }
    out.push(finding(text, start, start + value.length, "TELEFON", "telefon"));
  };
  for (const m of matchAll(text, PHONE_INTL_RE)) consider(m.index, m[0], "intl");
  for (const m of matchAll(text, PHONE_NATIONAL_RE)) consider(m.index, m[0], "national");
  for (const m of matchAll(text, PHONE_CONTEXT_RE)) consider(m.index, m[0], "context");
  for (const m of matchAll(text, ITALIAN_MOBILE_RE)) consider(m.index, m[0], "fest");
  for (const m of matchAll(text, PHONE_LABEL_GLUED_RE)) {
    const at = m.index + m[0].length;
    for (const rx of [PHONE_INTL_AT, PHONE_NATIONAL_AT]) {
      rx.lastIndex = at;
      const v = rx.exec(text);
      if (v) {
        consider(at, v[0], "fest");
        break;
      }
    }
  }
  for (const m of matchAll(text, MESSENGER_LINK_RE)) {
    const span = groupSpan(m, "v");
    if (span) out.push(finding(text, span[0], span[1], "TELEFON", "telefon"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// UID-Nummern (Umsatzsteuer-Identifikationsnummern)

const VAT_BODY = String.raw`ATU ?\d{8}|ATU ?\d{4} ?\d{4}|DE ?\d{9}|DE ?\d{3} ?\d{3} ?\d{3}|GB ?\d{3} ?\d{4} ?\d{2}(?: ?\d{3})?|GB ?\d{9}(?:\d{3})?|CHE[- ]?\d{3}\.?\d{3}\.?\d{3}(?: ?(?:MWST|TVA|IVA))?|IT ?\d{11}|NL ?\d{9}B\d{2}|FR ?[A-Z0-9]{2}\d{9}|BE ?0?\d{9}|LU ?\d{8}|CZ ?\d{8,10}|PL ?\d{10}|HU ?\d{8}|SI ?\d{8}|SK ?\d{10}|DK ?\d{8}`;
const VAT_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${VAT_BODY})(?![\p{L}\p{N}])`, "gu");

export function detectVatIds(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, VAT_RE)) {
    out.push(finding(text, m.index, m.index + m[0].length, "UID", "uid"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Steuernummern (AT: "12 345/6789", DE: "123/456/78901")

const TAX_BODY = String.raw`\d{2}[ -]?\d{3}\/\d{4}|\d{2,3}\/\d{3}\/\d{4,5}|[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]`;
const TAX_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${TAX_BODY})(?![\p{L}\p{N}])`, "gu");

export function detectTaxNumbers(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, TAX_RE)) {
    out.push(finding(text, m.index, m.index + m[0].length, "STEUERNR", "steuernummer"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Werte nach Schlüsselwörtern (Geburtsdatum, Ausweis, Kennzeichen, Kundennummer, SV-Nummer, Kartenprüfnummer)

const MONTH_ALT = [
  "Januar", "Jänner", "Februar", "Feber", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober",
  "November", "Dezember", "January", "February", "March", "May", "June", "July", "October", "December", "gennaio",
  "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre",
  "dicembre", "januari", "februari", "maart", "mei", "augustus", String.raw`Jan\.?`, String.raw`Feb\.?`,
  String.raw`Apr\.?`, String.raw`Jun\.?`, String.raw`Jul\.?`, String.raw`Aug\.?`, String.raw`Sept?\.?`,
  String.raw`Okt\.?`, String.raw`Oct\.?`, String.raw`Nov\.?`, String.raw`Dez\.?`, String.raw`Dec\.?`,
].join("|");
const DATE = String.raw`\d{1,2}\.[ \t]?\d{1,2}\.[ \t]?\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\.?[ \t]?(?:${MONTH_ALT})[ \t]\d{4}|(?:${MONTH_ALT})[ \t]\d{1,2},?[ \t]\d{4}`;

interface ContextRule {
  type: EntityType;
  re: RegExp;
  description?: string;
}

const CONTEXT_RULES: ContextRule[] = [
  {
    type: "GEBURTSDATUM",
    re: new RegExp(
      String.raw`(?<![\p{L}])(?:geb\.|geboren|Geburtsdatum(?:[ \t]{1,3}laut[ \t]{1,3}\p{L}{2,20})?|Geburtstag(?=[ \t]{0,20}:)|Geb\.-Datum|Geb\.-Tag|DOB|D\.O\.B\.|date of birth|birthday(?=[ \t]{0,20}:)|born(?: on)?|(?:nato|nata)(?:[ \t]{1,3}a[ \t]{1,3}\p{Lu}[\p{L}'-]{1,30}(?:[ \t]\p{Lu}[\p{L}'-]{1,30})?)?[ \t]{1,3}il|data di nascita|geboortedatum|geboren op|\*)(?:[ \t]{1,20}(?:am|on|il|op))?[ \t]{0,20}:?[ \t]{0,20}(?<v>${DATE})(?![\p{N}])`,
      "giud",
    ),
  },
  {
    // "bin am 7. Juli 1997 in Tuzla geboren"
    type: "GEBURTSDATUM",
    re: new RegExp(
      String.raw`(?<![\p{L}])(?:am|on)[ \t]{1,3}(?<v>${DATE})[ \t]{1,3}(?:in[ \t]{1,3}\p{Lu}[\p{L}-]{1,30}[ \t]{1,3})?(?:geboren|born)(?![\p{L}])`,
      "giud",
    ),
  },
  {
    type: "AUSWEIS",
    re: /(?<![\p{L}])(?:Reisepass|Pass|Personalausweis|Ausweis|Passport|passport|Passaporto|passaporto|Paspoort|paspoort|ID|Reisedokument|Aufenthaltstitel|Aufenthaltskarte|Karten-Nr\.|Führerschein|Führerscheinnummer|[Dd]riving licen[cs]e|[Pp]atente|[Rr]ijbewijs|[Ii]dentiteitskaart|[Cc]arta d'identità|[Cc]arta di identità|[Dd]ocumento|Dokument)(?:[ \t]{1,3}\([^)\n]{1,30}\))?(?:[ \t-]?(?:nummer|Nummer|nr\.?|Nr\.?|number|no\.?|No\.?|n\.|n°|nº))?(?:[ \t]{1,3}(?:is|ist|lautet|è))?[ \t]{0,20}[:#]?[ \t]{0,20}(?<v>(?=[A-Z0-9 -]{0,15}\d)[A-Z0-9][A-Z0-9 -]{4,14}[A-Z0-9])(?![\p{L}\p{N}])/gud,
  },
  {
    type: "KENNZEICHEN",
    re: /(?<![\p{L}])(?:[Kk]ennzeichen|[Kk]fz-[Kk]ennzeichen|[Aa]utokennzeichen|[Nn]ummernschild|[Nn]ummerntafel|[Ll]icen[cs]e plate|[Tt]arga|[Kk]enteken)(?:[ \t]{1,3}(?:des|der|vom|von|unseres|unserer|meines|meiner|seines|ihres)[ \t]{1,3}\p{L}{2,20})?[ \t]{0,20}[:#]?[ \t]{0,20}(?<v>[A-ZÄÖÜ]{1,3}[ -]?[A-Z0-9]{1,6}(?:[ -][A-Z0-9]{1,4})?)(?![\p{L}\p{N}])/gud,
  },
  {
    type: "KUNDENNR",
    re: /(?<![\p{L}])(?:Kundennummer|Kunden-Nr\.?|Kundennr\.?|Kd\.?-?Nr\.?|KdNr\.?|Vertragsnummer|Vertrags-Nr\.?|Mitgliedsnummer|Mitglieds-Nr\.?|Polizzennummer|Policennummer|Polizze|Police|Polizza|Versicherungsschein(?:nummer)?|Patientennummer|Stammgast-?Nr\.?|Stammgastnummer|customer (?:no\.?|number|id)|Kundenkonto)[ \t]{0,20}[:#]?[ \t]{0,20}(?<v>(?=[A-Z0-9/.-]{0,21}\d)[A-Z0-9][A-Z0-9/.-]{1,20}[A-Z0-9])/giud,
  },
  {
    type: "SVNR",
    re: /(?<![\p{L}])(?:SV-?Nr\.?|SVNR|SV-Nummer|Sozialversicherungsnummer|Versicherungsnummer|Versicherungsnr\.?|Versicherungs-Nr\.?|Sozialversicherungs-Nr\.?|Rentenversicherungsnummer|RV-?Nr\.?|RV-Nummer)[ \t]{0,20}[:#]?[ \t]{0,20}(?<v>\d{4} ?\d{6}|\d{2} ?\d{6} ?[A-Z] ?\d{3})(?![\p{N}])/giud,
  },
  {
    type: "KREDITKARTE",
    re: /(?<![\p{L}])(?:CVC2?|CVV2?|CID|CSC|Kartenprüfnummer|Sicherheitscode|security code|codice di sicurezza)[ \t]{0,20}[:#]?[ \t]{0,20}(?<v>\d{3,4})(?![\p{N}])/giud,
  },
  {
    // Ablaufdatum einer Karte ("gültig bis 08/28")
    type: "SONSTIGES",
    description: "Ablaufdatum",
    re: /(?<![\p{L}])(?:gültig bis|Ablaufdatum|Ablauf|valid (?:thru|through|until)|exp(?:iry|\.)?(?: date)?|expires|scadenza|geldig tot)[ \t]{0,20}[:#]?[ \t]{0,20}(?<v>\d{2}[/-]\d{2})(?![\p{N}/])/giud,
  },
  {
    // Register- und Kontonummern: Firmenbuch, Handelsregister, KvK, Company No., Kontonummer
    type: "SONSTIGES",
    description: "Registernummer",
    re: /(?<![\p{L}\p{N}])(?<v>FN[ \t]?\d{1,6}[ \t]?[a-z]|HR[AB][ \t]?\d{1,6}(?:[ \t]?[A-Z]{1,2}(?![\p{L}]))?)(?![\p{L}\p{N}])/gud,
  },
  {
    type: "SONSTIGES",
    description: "Register- oder Kontonummer",
    re: /(?<![\p{L}])(?:KvK(?:-nummer|-nr\.?)?|Company (?:No\.?|Number|Reg(?:istration)?\.?(?: No\.?)?)|account (?:no\.?|number)|Kontonummer|Konto-Nr\.?|Kto\.?-?Nr\.?|BLZ|Bankleitzahl|rekeningnummer)[ \t]{0,20}[:#]?[ \t]{0,20}(?<v>\d{5,12})(?![\p{N}])/giud,
  },
  {
    // Bezeichnung direkt vor der Nummer, ohne Leerzeichen ("UID-NummerATU12345678"), typisch für Kopien aus PDF
    type: "UID",
    re: new RegExp(
      String.raw`(?<![\p{L}])(?:UID|UID-Nummer|UID-Nr\.?|USt-?Id(?:Nr|-Nr)?\.?|VAT(?:-?(?:No|ID|Nr)\.?)?|MwSt-?Nr\.?|P\.?IVA|BTW(?:-?nummer|-?nr\.?)?)[:#]?(?<v>${VAT_BODY})(?![\p{L}\p{N}])`,
      "giud",
    ),
  },
  {
    type: "STEUERNR",
    re: new RegExp(
      String.raw`(?<![\p{L}])(?:Steuernummer|Steuer-?Nr\.?|StNr\.?|Codice[ \t]fiscale|CF)[:#]?(?<v>${TAX_BODY})(?![\p{L}\p{N}])`,
      "giud",
    ),
  },
  {
    // Konten in Messengern: "WeChat: wanglei_sh88"
    type: "SONSTIGES",
    description: "Messenger-Konto",
    re: /(?<![\p{L}])(?:WeChat|Wechat|WhatsApp|Telegram|Signal|Skype|Instagram|Insta|Facebook|TikTok|Snapchat|Threema|Line)(?:[ \t]?-?(?:ID|Name|Account|Konto))?[ \t]{0,3}[:：][ \t]{0,3}(?<v>@?[A-Za-z][A-Za-z0-9_.-]{2,39})(?![\p{L}\p{N}])/gud,
  },
];

export function detectByContext(text: string): Finding[] {
  const out: Finding[] = [];
  for (const rule of CONTEXT_RULES) {
    for (const m of matchAll(text, rule.re)) {
      const span = groupSpan(m, "v");
      if (!span) continue;
      const extra = rule.description ? { description: rule.description } : {};
      out.push(finding(text, span[0], span[1], rule.type, `kontext:${rule.type.toLowerCase()}`, extra));
    }
  }
  return out;
}

// Konten in sozialen Netzwerken: "@bergliebe_tirol"
const HANDLE_RE = /(?<![\p{L}\p{N}._@-])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{1,28}[A-Za-z0-9_])?(?![\p{L}\p{N}_@])/gu;

// Profil-Links mit Namen: "linkedin.com/in/anna-moosbrugger-4711", "instagram.com/anna.moosbrugger"
const PROFILE_LINK_RE =
  /(?<![\p{L}\p{N}.])(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in|instagram\.com|facebook\.com|fb\.com|x\.com|twitter\.com|tiktok\.com|xing\.com\/profile|youtube\.com|threads\.net)\/@?[A-Za-z0-9_.%-]{2,80}\/?/gu;

export function detectHandles(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, PROFILE_LINK_RE)) {
    out.push(finding(text, m.index, m.index + m[0].length, "SONSTIGES", "kontext:konto", { description: "Profil-Link" }));
  }
  for (const m of matchAll(text, HANDLE_RE)) {
    out.push(
      finding(text, m.index, m.index + m[0].length, "SONSTIGES", "kontext:konto", { description: "Social-Media-Konto" }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adressen

// Straßen-Endungen; der erste Buchstabe darf groß oder klein sein ("Museumstraße", "Maria-Theresien-Straße").
const STREET_SUFFIXES = [
  "straße", "strasse", "str.", "gasse", "weg", "platz", "allee", "ring", "damm", "ufer", "steig", "zeile", "kai",
  "promenade", "graben", "gürtel", "lände", "park", "siedlung", "winkel", "stiege", "anger", "chaussee", "straat",
  "laan", "plein", "gracht", "kade", "dijk", "singel", "steeg", "markt",
];
const SUFFIX_ALT = STREET_SUFFIXES.map((s) => `[${s[0]?.toUpperCase()}${s[0]}]${escapeRegExp(s.slice(1))}`).join("|");
// Wörter mit Straßen-Endung, die fast nie eine Adresse sind ("Parkplatz 3", "Fußweg 5 Minuten").
const NOT_A_STREET = new Set(
  `parkplatz stellplatz spielplatz arbeitsplatz sitzplatz campingplatz golfplatz tennisplatz sportplatz abstellplatz
   liegeplatz garagenplatz rückweg hinweg heimweg wanderweg radweg umweg ausweg fußweg gehweg klettersteig seeufer
   flussufer zahlungsweg lieferweg postweg rechtsweg anfahrtsweg schulweg freizeitpark nationalpark ehering
   supermarkt weihnachtsmarkt flohmarkt adventmarkt christkindlmarkt christkindlesmarkt arbeitsmarkt immobilienmarkt
   wohnungsmarkt biomarkt getränkemarkt baumarkt drogeriemarkt elektromarkt großmarkt markt`
    .split(/\s+/)
    .filter(Boolean),
);
const STREET_ADJ = String.raw`(?:Alte|Neue|Obere|Untere|Lange|Kurze|Große|Kleine|Hohe|Innere|Äußere|Hintere|Vordere|Mittlere|Sankt|St\.|Kromme|Oude|Nieuwe|Korte|Hoge|Lage|Grote|Kleine|Achter|Binnen|Buiten|Eerste|Tweede|Derde)`;
const HOUSE_NO = String.raw`\d{1,4}(?:[ \t]?[a-zA-Z](?![\p{L}]))?(?:[ \t]?[/-][ \t]?\d{1,4}(?:[a-zA-Z](?![\p{L}]))?){0,3}(?:-(?:I{1,3}|IV|hs|bis|huis)(?![\p{L}]))?`;
// Nach einer Hausnummer folgt keine Einheit ("Fußweg 5 Minuten", "Im Jahr 2027").
const AFTER_NUMBER_UNIT =
  /^[ \t]{0,20}(?:Minuten|Min\.|Stunden|Std\.|km|m|Meter|Personen|Pers\.|Euro|EUR|€|Tage|Nächte|Uhr|%|Prozent|Jahre|Zimmer)(?![\p{L}])/u;

const STREET_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}-])(?:${STREET_ADJ}[ \t]{1,20})?(?<w>\p{L}{1,40}(?:-\p{L}{1,40}){0,4}-?(?:${SUFFIX_ALT}))(?:[ \t]{1,3}(?:Nord|Süd|Ost|West|Mitte))?[ \t]{1,20}${HOUSE_NO}(?![\p{L}\p{N}])`,
  "gud",
);
const STREET_TWO_WORDS_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${STREET_ADJ}[ \t]{1,20})?${UP}${LO}{1,40}[ \t]{1,20}(?:Straße|Strasse|Str\.|Gasse|Weg|Platz|Allee|Ring|Damm|Ufer|Chaussee|Landstraße)[ \t]{1,20}${HOUSE_NO}(?![\p{L}\p{N}])`,
  "gu",
);
const STREET_PREPOSITION_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:Am|An der|An den|Auf der|Auf dem|Im|In der|In den|Zum|Zur|Unter der|Unter den|Hinter der|Hinter dem|Bei der|Beim|Vor dem)[ \t]{1,20}(?<w>${UP}${LO}{1,40}(?:[- ]${UP}${LO}{1,40})?)[ \t]{1,20}${HOUSE_NO}(?![\p{L}\p{N}])`,
  "gud",
);
const STREET_ITALIAN_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:Via|Viale|Piazza|Piazzale|Corso|Vicolo|Largo|Strada|Contrada|Borgo|Località|Loc\.)[ \t]{1,20}(?:(?:dei|del|della|delle|degli|di|da|de|d'|San|Santa|Santo)[ \t]{0,20})?${UP}[\p{L}']{1,40}(?:[ \t]{1,20}(?:(?:dei|del|della|delle|degli|di|da|de|e)[ \t]{1,20})?${UP}[\p{L}']{1,40}){0,4},?[ \t]{0,20}\d{1,4}(?:[ \t]?/?[ \t]?[a-zA-Z](?![\p{L}]))?(?![\p{L}\p{N}])`,
  "gu",
);
const STREET_ENGLISH_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:(?:Flat|Unit|Apartment|Apt\.?|Suite|Studio)[ \t]{1,3}[A-Za-z0-9]{1,5},[ \t]{1,3}(?:${UP}${LO}{1,30}(?:[ \t]${UP}${LO}{1,30}){0,3},[ \t]{1,3})?)?\d{1,5}[A-Za-z]?[ \t]{1,20}(?:[NSEW]\.?[ \t]{1,20})?${UP}${LO}{1,30}(?:[ \t]${UP}${LO}{1,30}){0,3}[ \t](?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Lane|Ln\.|Drive|Way|Court|Ct\.|Place|Pl\.|Boulevard|Blvd\.|Terrace|Close|Crescent|Square|Gardens|Grove|Row|Mews|Hill|Park)(?:[ \t](?:West|East|North|South))?(?:,[ \t]{0,3}(?:Apt\.?|Apartment|Suite|Ste\.?|Unit|Flat|Fl\.)[ \t]{0,3}[A-Za-z0-9-]{1,6})?(?![\p{L}])`,
  "gu",
);
// Britische und irische Postleitzahlen ("Leeds LS12 2PL", "Harrow HA1 4LP", "Dublin 6, D06 K2P7"), mit Ort davor.
const UK_POSTCODE_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${UP}${LO}{2,30}(?:[ \t]${UP}${LO}{2,30})?(?:[ \t]\d{1,2}[Ww]?)?,?[ \t]{1,3})?(?:[A-Z]{1,2}\d[A-Z\d]?[ \t]\d[ABD-HJLNP-UW-Z]{2}|(?:[AC-FHKNPRTV-Y]\d{2}|D6W)[ \t](?=[0-9]{0,3}[AC-FHKNPRTV-Y])[0-9AC-FHKNPRTV-Y]{4})(?![\p{L}\p{N}])`,
  "gu",
);
// Polnische Adressen: "ul. Długa 17 m. 4"
const STREET_POLISH_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:ul\.|al\.|pl\.|os\.)[ \t]{1,3}${UP}[\p{L}-]{1,40}(?:[ \t]${UP}[\p{L}-]{1,40}){0,3}[ \t]{1,3}\d{1,4}[A-Za-z]?(?:[ \t]?(?:m\.|lok\.|\/)[ \t]?\d{1,4})?(?![\p{L}\p{N}])`,
  "gu",
);
// Gewerbegebiete als Adresse: "Gewerbezone 12", "Handwerkerzone Nord 4"
const ZONE_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:Gewerbezone|Industriezone|Handwerkerzone|Gewerbegebiet|Industriegebiet|Gewerbepark|Industriepark)(?:[ \t](?:Nord|Süd|Ost|West|Mitte))?[ \t]{1,3}${HOUSE_NO}(?![\p{L}\p{N}])`,
  "gu",
);
// "Zona artigianale Nord 4", "Zona industriale 12"
const ZONE_ITALIAN_RE = /(?<![\p{L}\p{N}])Zona[ \t](?:artigianale|industriale|commerciale|produttiva)(?:[ \t]\p{Lu}\p{Ll}{1,20})?[ \t]{1,3}\d{1,4}(?![\p{L}\p{N}])/gu;
const US_CITY_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])${UP}${LO}{1,30}(?:[ \t]${UP}${LO}{1,30}){0,2},[ \t]{0,20}(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)[ \t]{1,20}\d{5}(?:-\d{4})?(?![\p{L}\p{N}])`,
  "gu",
);

// Postleitzahl + Ort. Der Ort ist ein oder mehrere großgeschriebene Wörter ("Hall in Tirol", "Steinach am Brenner").
const PLACE_WORD = String.raw`${UP}${LO}{1,30}(?:-${UP}?${LO}{1,30}){0,3}`;
const PLACE_JOIN = String.raw`(?:[ \t]{1,20}(?:am|an der|an den|im|in|bei|ob der|an|sur|sul|sulla|del|de|di|aan|den)[ \t]{1,20}|[ \t]{0,20}-[ \t]{0,20}|[ \t]{0,2}\/[ \t]{0,2}|[ \t]{1,20})`;
const POSTCODE_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:(?:A|AT|D|DE|CH|I|IT|NL|F|FR|B|BE|L|LU)-[ \t]?)?(?<plz>\d{4,5}|\d{4}[ \t]?[A-Z]{2}(?![\p{L}])|\d{2}-\d{3}|\d{4}-\d{3})[ \t]{1,20}(?<ort>${PLACE_WORD}(?:${PLACE_JOIN}${PLACE_WORD}){0,4}(?:[ \t]{0,3}\([A-Z]{2}\))?|${LO}{3,30}(?:[ \t]{1,20}${LO}{2,30})?)`,
  "gud",
);
const AFTER_POSTCODE_STOP = new Set(
  `Euro EUR Stück Personen Erwachsene Kinder Kind Zimmer Doppelzimmer Einzelzimmer Familienzimmer Suite Nächte Nacht
   Tage Tag Stunden Minuten Kilometer Meter Gramm Liter Punkte Mitarbeiter Gäste Betten Seiten Jahre Monate Wochen
   Uhr Prozent Mal Stk Exemplare Flyer Anreise Abreise`
    .split(/\s+/)
    .filter(Boolean),
);

function isPostcodeStop(word: string): boolean {
  if (PLACE_PREFIXES.has(word)) return false;
  return AFTER_POSTCODE_STOP.has(word) || MONTHS.has(word) || NOT_SURNAME.has(word);
}

const STREET_BEFORE_POSTCODE_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?<w>${UP}${LO}{2,30})[ \t]{1,3}${HOUSE_NO}[ \t]{0,20}[,·|][ \t]{0,20}$`,
  "u",
);

export function detectAddresses(text: string): Finding[] {
  const out: Finding[] = [];
  const addStreet = (start: number, end: number) => {
    if (AFTER_NUMBER_UNIT.test(text.slice(end, end + 12))) return;
    out.push(finding(text, start, end, "ADRESSE", "adresse:strasse"));
  };

  for (const m of matchAll(text, STREET_RE)) {
    const word = (m.groups?.w ?? "").toLowerCase();
    if (NOT_A_STREET.has(word)) continue;
    addStreet(m.index, m.index + m[0].length);
  }
  for (const m of matchAll(text, STREET_TWO_WORDS_RE)) addStreet(m.index, m.index + m[0].length);
  for (const m of matchAll(text, STREET_PREPOSITION_RE)) {
    if (isNotSurname(m.groups?.w?.split(/[- ]/)[0] ?? "")) continue;
    addStreet(m.index, m.index + m[0].length);
  }
  for (const m of matchAll(text, STREET_ITALIAN_RE)) addStreet(m.index, m.index + m[0].length);
  for (const m of matchAll(text, STREET_ENGLISH_RE)) addStreet(m.index, m.index + m[0].length);
  for (const m of matchAll(text, STREET_POLISH_RE)) addStreet(m.index, m.index + m[0].length);
  for (const m of matchAll(text, ZONE_ITALIAN_RE)) addStreet(m.index, m.index + m[0].length);
  for (const m of matchAll(text, ZONE_RE)) addStreet(m.index, m.index + m[0].length);
  for (const m of matchAll(text, UK_POSTCODE_RE)) out.push(finding(text, m.index, m.index + m[0].length, "ADRESSE", "adresse:ort"));
  for (const m of matchAll(text, US_CITY_RE)) out.push(finding(text, m.index, m.index + m[0].length, "ADRESSE", "adresse:ort"));

  for (const m of matchAll(text, POSTCODE_RE)) {
    const start = m.index;
    const ort = m.groups?.ort ?? "";
    const firstWord = ort.split(/[ \t-]/)[0] ?? "";
    if (isPostcodeStop(firstWord)) continue;
    const before = text.slice(lineStartWithin(text, start, 80), start);
    const afterStreet = /(?:\d[a-zA-Z]?|\))[ \t]{0,20}[,·|]?[ \t]{0,20}$/u.test(before);
    const okContext =
      before.trim() === "" ||
      /[,;|·•–(][ \t]{0,20}$/u.test(before) ||
      afterStreet ||
      /(?:^|[ \t])(?:in|aus|nach|from|to)[ \t]{1,20}$/u.test(before) ||
      /(?:PLZ|Ort|Wohnort|Postleitzahl|Stadt|City|Anschrift|Adresse|Address)[ \t]{0,20}:?[ \t]{0,20}$/iu.test(before);
    if (!okContext) continue;
    // Davor "Wort Hausnummer," ohne Straßen-Endung (Ortsteile, Weiler: "Mühlau 12, 6020 Innsbruck").
    const plain = STREET_BEFORE_POSTCODE_RE.exec(before);
    if (plain?.groups?.w && !isNotSurname(plain.groups.w) && !BUSINESS_WORDS.has(plain.groups.w)) {
      const s0 = start - before.length + plain.index;
      const e0 = s0 + plain[0].replace(/[ \t]{0,20}[,·|]?[ \t]{0,20}$/u, "").length;
      // Nur, wenn dort nicht schon eine Straße erkannt ist ("Anna Huber Bergweg 12, …" bleibt Person + Straße).
      if (!out.some((f) => f.start < e0 && s0 < f.end)) out.push(finding(text, s0, e0, "ADRESSE", "adresse:strasse"));
    }
    // Kleingeschriebene Orte nur direkt nach einer Straße ("sportplatzweg 3, 6370 kitzbühel").
    if (/^\p{Ll}/u.test(ort) && !/\d[a-zA-Z]?[ \t]{0,20},[ \t]{0,20}$/u.test(before)) continue;
    // Großgeschriebene Folgewörter, die keine Ortsteile sind, abschneiden ("6020 Innsbruck Telefon").
    let value = m[0];
    const words = value.split(/([ \t]+)/);
    for (let i = 2; i < words.length; i += 2) {
      const w = words[i] ?? "";
      if (i > 2 && /^\p{Lu}/u.test(w) && !PLACE_PREFIXES.has(w) && (isPostcodeStop(w) || isNotSurname(w))) {
        value = words.slice(0, i - 1).join("");
        break;
      }
    }
    out.push(finding(text, start, start + value.length, "ADRESSE", "adresse:ort"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Firmen

const LEGAL_FORM = String.raw`(?:GmbH(?:[ \t]*&[ \t]*Co\.?[ \t]*KG)?|GMBH|GesmbH|Ges\.m\.b\.H\.|gGmbH|mbH|AG|KG|OG|OHG|e\.[ \t]?U\.|e\.[ \t]?K\.|e\.[ \t]?V\.|GesbR|GbR|UG(?:[ \t]*\(haftungsbeschränkt\))?|SE|Ltd\.?|LTD\.?|Limited|LIMITED|Inc\.?|INC\.?|LLC|LLP|PLC|Plc|Corp\.?|S\.r\.l\.|S\.R\.L\.|s\.r\.l\.|Srl|S\.p\.A\.|s\.p\.a\.|S\.n\.c\.|s\.n\.c\.|S\.a\.s\.|s\.a\.s\.|B\.V\.|BV|N\.V\.|S\.A\.|S\.L\.|SAS|Sarl|SARL|s\.r\.o\.|Kft\.|d\.o\.o\.|Sp\.[ \t]?z[ \t]?o\.o\.|A/S|Oy)`;
const LEGAL_FORM_ONLY = new RegExp(`^${LEGAL_FORM}$`, "u");
const LEGAL_FORM_ANY = new RegExp(LEGAL_FORM, "u");
// Kurze Rechtsformen, die auch etwas anderes heißen ("im 2. OG", "AG" als Abkürzung).
const SHORT_LEGAL_FORMS = new Set(["AG", "KG", "OG", "UG", "SE", "BV", "SAS"]);
const COMPANY_STOP = new Set(
  `Rechnung Lieferant Lieferantin Kunde Kundin Firma An Von Betreff Angebot Auftrag Bestellung Lieferschein Gutschrift
   Mahnung Absender Empfänger Empfängerin Herr Frau Bitte Sehr Liebe Lieber Hallo Die Der Das Den Dem Wir Ich Sie
   Ansprechpartner Ansprechpartnerin Kontakt Lieferung Zahlung Auftraggeber Auftraggeberin Rechnungsempfänger
   Rechnungsempfängerin Zahlbar Bankverbindung Danke Dank Grüße Gruß Mit Und Für Bei Laut Gemäß Durch Über Unsere Ihre`
    .split(/\s+/)
    .filter(Boolean),
);
const COMPANY_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}&.'’-])(?:[\p{Lu}\p{N}][\p{L}\p{N}&.'’-]{0,40}[ \t]{1,20})(?:(?:[\p{Lu}\p{N}][\p{L}\p{N}&.'’-]{0,40}|&|\+|und|and|e|di|de|del|della|van|von|der)[ \t]{1,20}){0,6}${LEGAL_FORM}(?![\p{L}\p{N}])`,
  "gu",
);
const CUSTOMER_LABEL_RE = new RegExp(
  String.raw`(?<![\p{L}])(?:Kunde|Kundin|Rechnungsempfänger|Rechnungsempfängerin|Auftraggeber|Auftraggeberin|Cliente|Customer|Client|Klant|An|To|Von|From|Cc|Absender)[ \t]{0,20}:[ \t]{0,20}(?<v>(?:${[...BUSINESS_WORDS].join("|")})[ \t]{1,20}${UP}[\p{L}'’-]{1,40}(?:[ \t]{1,20}${UP}[\p{L}'’-]{1,40}){0,3})`,
  "gud",
);

// Betriebe ohne Rechtsform: Branchenwort und Name ("Tischlerei Moosbrugger", "Elektro Valdessa", "Malerei Huber").
const TRADE_WORDS =
  "Tischlerei|Schreinerei|Zimmerei|Spenglerei|Malerei|Malerbetrieb|Elektro|Elektrotechnik|Installationen|Installateur|Sanitär|Heizungsbau|Dachdeckerei|Baufirma|Bauunternehmen|Baumeister|Transporte|Gärtnerei|Gartenbau|Fliesenleger|Bodenleger|Glaserei|Schlosserei|Metallbau|Steuerberatung|Steuerkanzlei|Kanzlei|Ordination|Praxis|Bäckerei|Konditorei|Metzgerei|Fleischerei|Druckerei|Autohaus|Werkstatt|Reinigung|Wäscherei|Weinhandel|Weingut|Hofladen|Käserei|Brennerei|Friseur|Friseursalon";
const TRADE_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${TRADE_WORDS})[ \t]{1,3}(?<n>${UP}[\p{L}'’-]{2,40}(?:[ \t]{1,3}(?:&|und)[ \t]{1,3}${UP}[\p{L}'’-]{2,40})?)(?![\p{L}\p{N}])`,
  "gud",
);

const COMMON_NOUN_END =
  /(?:ung|ungen|heit|keit|schaft|tion|tionen|sion|tät|nis|ment|ismus|zeiten|wäsche|abschluss|arbeiten|kosten|gebühr|gebühren|pauschale|material|leistung|leistungen|reparatur|bericht|vertrag|auftrag|rechnung|angebot)$/u;
const TITLE_ABBREVIATIONS = new Set(["Mag", "MMag", "Dr", "DDr", "DI", "Dipl", "Ing", "Prof", "Dkfm", "Prim"]);

export function detectCompanies(text: string, companies: CompanyEntry[] = []): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, TRADE_RE)) {
    const name = m.groups?.n ?? "";
    const first = name.split(/[ \t]/)[0] ?? "";
    // "Elektro Installationen", "Praxis Montag": nach dem Branchenwort ein Allerweltswort, kein Name
    if (isNotSurname(first) || ROLE_WORDS.has(first) || BUSINESS_WORDS.has(first) || MONTHS.has(first) || PLACE_PREFIXES.has(first)) continue;
    if (new RegExp(`^(?:${TRADE_WORDS})$`, "u").test(first)) continue;
    // Ein gewöhnliches Hauptwort ("Steuerberatung Jahresabschluss", "Elektro Überprüfung", "Reinigung Bettwäsche") oder
    // ein Titel ("Steuerberatung Mag. Leitgeb": gemeint ist die Person) ist kein Firmenname (Review Claude 4 #6).
    if ((first.length >= 7 && COMMON_NOUN_END.test(first.toLowerCase())) || (TITLE_ABBREVIATIONS.has(first) && text[m.index + m[0].length] === ".")) continue;
    out.push(finding(text, m.index, m.index + m[0].length, "FIRMA", "firma:branche"));
  }

  // 1) Bekannte Firmen aus dem Firmenverzeichnis, mit Kategorie für die KI. Groß-/Kleinschreibung egal.
  const known: Array<[number, number]> = [];
  for (const company of companies) {
    for (const alias of [company.name, ...(company.aliases ?? [])]) {
      if (!alias.trim()) continue;
      const pattern = alias.trim().split(/\s+/).map(escapeRegExp).join(String.raw`\s+`);
      const re = new RegExp(String.raw`(?<![\p{L}\p{N}])${pattern}(?![\p{L}\p{N}])`, "giu");
      for (const m of matchAll(text, re)) {
        known.push([m.index, m.index + m[0].length]);
        out.push(
          finding(text, m.index, m.index + m[0].length, "FIRMA", "firma:verzeichnis", {
            ...(company.kategorie ? { description: company.kategorie } : {}),
            canonical: company.name,
          }),
        );
      }
    }
  }

  // 2) Unbekannte Firmen an der Rechtsform erkennen.
  for (const m of matchAll(text, COMPANY_RE)) {
    let start = m.index;
    let value = m[0];
    // Führende Allerweltswörter ("Rechnung Muster GmbH") abschneiden.
    for (;;) {
      const first = /^\S+/.exec(value)?.[0] ?? "";
      if (!COMPANY_STOP.has(first) && first !== "&" && first !== "+" && first !== "und" && first !== "and") break;
      const rest = value.slice(first.length).replace(/^[ \t]+/, "");
      start += value.length - rest.length;
      value = rest;
    }
    if (LEGAL_FORM_ONLY.test(value)) continue;
    const end = start + value.length;
    // Ein Treffer aus dem Verzeichnis ist genauer: Was davor steht, gehört nicht zur Firma.
    if (known.some(([s, e]) => start < e && s < end)) continue;
    // "im 2. OG", "Zimmer 3 AG": vor kurzen Rechtsformen muss ein Wort stehen, keine Zahl.
    const parts = value.split(/[ \t]+/);
    const form = parts[parts.length - 1] ?? "";
    const lastWord = parts[parts.length - 2] ?? "";
    if (SHORT_LEGAL_FORMS.has(form) && !/\p{L}{2}/u.test(lastWord)) continue;
    out.push(finding(text, start, end, "FIRMA", "firma:rechtsform"));
  }

  // 3) Betriebe nach "Kunde:" oder "Rechnungsempfänger:" ("Gasthof Sonnhof", "Pension Alpenblick").
  const knownStarts = companies.flatMap((c) => [c.name, ...(c.aliases ?? [])]).map((n) => n.toLowerCase());
  for (const m of matchAll(text, CUSTOMER_LABEL_RE)) {
    const span = groupSpan(m, "v");
    if (!span) continue;
    const value = text.slice(span[0], span[1]).replace(/\s+/g, " ").toLowerCase();
    // Bekannte Firmen (z. B. der eigene Betrieb) regelt das Verzeichnis.
    if (knownStarts.some((n) => n.startsWith(value) || value.startsWith(n))) continue;
    out.push(finding(text, span[0], span[1], "FIRMA", "firma:kunde"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Personen

// Ein Teil eines Namens: "Huber", "McDonald", "O'Neill", "D'Angelo", "Petrović", "Yılmaz", "Ömer".
const NAME_PART = String.raw`${UP}(?:${LO}+|['’](?=${UP}))(?:${UP}${LO}+|['’]${UP}${LO}+)*`;
// Mit Bindestrich: "Müller-Berger", "Oberhofer-de Vries".
const NAME_WORD = String.raw`${NAME_PART}(?:-(?:${NAME_PART}|${LO}{1,3}(?=[ \t]${UP})))*`;
// Ganz in Großbuchstaben: "HUBER", "MÜLLER-BERGER".
const CAPS_WORD = String.raw`${UP}{2,}(?:-${UP}{2,})*`;
const TOKEN_END = String.raw`(?![\p{L}\p{N}'’])`;

const NAME_WORD_Y = new RegExp(`(?:${NAME_WORD})${TOKEN_END}`, "uy");
const CAPS_WORD_Y = new RegExp(`(?:${CAPS_WORD})${TOKEN_END}`, "uy");
const PARTICLE_Y = new RegExp(String.raw`${PARTICLE}[ \t]{1,20}(?=${UP})`, "uy");
// Initiale vor einem Nachnamen: "M. Leitgeb", "K. Dijkstra", "S. van Dijk" (nie am Ende eines Namens).
const INITIAL_Y = new RegExp(String.raw`${UP}\.(?=[ \t]{1,3}(?:${PARTICLE}[ \t]{1,3})?${UP}${LO})`, "uy");
// Zwischen Namensteilen höchstens drei Leerzeichen (sonst eher Tabellenspalten).
const GAP_Y = /[ \t]{1,3}/y;

interface NameSpan {
  start: number;
  end: number;
  tokens: string[];
  /** Anfang des letzten Namensteils inklusive Zusatz ("van der Berg"). */
  lastStart: number;
  /** Steht vor dem ersten Namensteil ein Zusatz wie "von" oder "van der"? */
  firstParticle: boolean;
}

/** Liest bis zu maxTokens Namensteile ab start. */
const ORGANISATION_ENDINGS = /(?:club|klub|verein|verband|team|amt|büro|buero|hotel|gasthof|schule|gemeinde|firma|abteilung|rezeption|empfang|service|bank|kasse|versicherung|praxis|klinik|spital|krankenhaus|polizei|feuerwehr|kirche|pfarre|gruppe|zentrale|agentur|portal|verwaltung|direktion|leitung|vorstand)$/iu;

/** Ist das Wort nach einem Namenszusatz ein Nachname (und keine Organisation oder Domain)? */
function particleLeadsToName(text: string, token: string, end: number): boolean {
  if (ROLE_WORDS.has(token) || BUSINESS_WORDS.has(token) || ORGANISATION_ENDINGS.test(token)) return false;
  if (/^\.[a-z]{2,6}(?![\p{L}])/u.test(text.slice(end, end + 8))) return false;
  return !isNotSurname(token) || NOUN_SURNAMES.has(token);
}

function nameAt(
  text: string,
  start: number,
  maxTokens: number,
  opts: { caps?: boolean; particleFirst?: boolean } = {},
): NameSpan | null {
  const tokens: string[] = [];
  let pos = start;
  let end = start;
  let lastStart = start;
  let firstParticle = false;
  while (tokens.length < maxTokens) {
    const partStart = pos;
    let p = pos;
    let particle = false;
    if (tokens.length > 0 || opts.particleFirst) {
      PARTICLE_Y.lastIndex = p;
      const pm = PARTICLE_Y.exec(text);
      if (pm) {
        p += pm[0].length;
        particle = true;
      }
    }
    if (!particle) {
      INITIAL_Y.lastIndex = p;
      const initial = INITIAL_Y.exec(text);
      if (initial) {
        if (tokens.length === 0) firstParticle = false;
        tokens.push(initial[0]);
        lastStart = partStart;
        end = p + initial[0].length;
        GAP_Y.lastIndex = end;
        const g = GAP_Y.exec(text);
        if (!g) break;
        pos = end + g[0].length;
        continue;
      }
    }
    NAME_WORD_Y.lastIndex = p;
    let m = NAME_WORD_Y.exec(text);
    if (!m && opts.caps) {
      CAPS_WORD_Y.lastIndex = p;
      m = CAPS_WORD_Y.exec(text);
      if (m && ACRONYMS.has(m[0])) m = null;
    }
    if (!m) break;
    const token = m[0];
    // Nach einer Initiale muss ein Nachname folgen, kein Allerweltswort ("S. Bitte", "Lena M. Danach").
    if (/^\p{Lu}\.$/u.test(tokens[tokens.length - 1] ?? "") && !particle && (isNotSurname(token) || isSentenceWord(token))) break;
    // Nach einem Zusatz ist auch ein Allerweltswort ein Nachname ("van der Berg"), aber keine Abteilung, kein
    // Betrieb, kein Verein und keine Domain ("Ferdinand vom Skiclub", "Thomas von der Rezeption", "von Booking.com").
    if (particle && !particleLeadsToName(text, token, p + token.length)) break;
    // Nach einem Vornamen ist ein Hauptwort, das auch ein häufiger Nachname ist, der Nachname ("Maria Sommer"), aber kein
    // Zeitwort und keine Redewendung ("Lena Freitag Abend", "Lukas Ende Mai", "Maria Recht geben", Review Claude 4 #5).
    const afterFirstName =
      tokens.length > 0 && isFirstName(tokens[tokens.length - 1] ?? "") && isNounSurname(token) && !NOT_AFTER_FIRST_NAME.has(token);
    if (tokens.length > 0 && !particle && isNotSurname(token) && !afterFirstName) break;
    if (tokens.length === 0) firstParticle = particle;
    tokens.push(token);
    lastStart = partStart;
    end = p + token.length;
    GAP_Y.lastIndex = end;
    const g = GAP_Y.exec(text);
    if (!g) break;
    pos = end + g[0].length;
  }
  // Eine Initiale allein oder am Ende ist kein Name.
  while (tokens.length && /^\p{Lu}\.$/u.test(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
    if (!tokens.length) return null;
    // Ende des letzten verbliebenen Teils neu bestimmen
    const last = tokens[tokens.length - 1] ?? "";
    const idx = text.lastIndexOf(last, end);
    end = idx + last.length;
    lastStart = idx;
  }
  return tokens.length ? { start, end, tokens, lastStart, firstParticle } : null;
}

/** Nachname eines Namens mit mehreren Teilen ("Anna Huber" → "Huber", "Huber Anna" → "Huber"). */
function surnameOf(text: string, span: NameSpan): string | undefined {
  if (span.tokens.length < 2) return undefined;
  const first = span.tokens[0] ?? "";
  const last = span.tokens[span.tokens.length - 1] ?? "";
  if (isFirstName(last) && !isFirstName(first)) return first;
  return text.slice(span.lastStart, span.end);
}

const SALUTATION_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?<sal>${SALUTATION})[ \t]{1,20}${TITLES}(?=(?:${PARTICLE}[ \t]{1,20})?${UP})`,
  "gu",
);
const INTRO_STRICT_RE =
  /(?<![\p{L}])(?:[Mm]ein Name ist|[Mm]ein Name lautet|[Ii]ch heiße|[Ii]ch heisse|[Mm]y name is|[Mm]i chiamo|[Ii]l mio nome è|[Mm]ijn naam is|[Ii]k heet|[Jj]e m'appelle|(?:[Ee]r|[Ss]ie|[Ii]ch)[ \t]{1,20}(?:hieß|hiess|heißt|heisst|heiße)|(?:hieß|heißt)[ \t]{1,20}(?:er|sie)|(?:[Hh]is|[Hh]er|[Tt]heir)[ \t]{1,20}name[ \t]{1,20}(?:is|was))[ \t]{1,20}/gu;
const INTRO_LOOSE_RE =
  /(?<![\p{L}])(?:[Ii]ch bin|[Hh]ier ist|[Hh]ier spricht|I am|I'm|[Tt]his is|[Ii]t's|[Ss]ono|[Ii]k ben)[ \t]{1,20}(?:(?:die|der)[ \t]{1,20})?/gu;
const CAP_WORD_RE = new RegExp(String.raw`(?<![\p{L}\p{N}'’-])(?:${NAME_WORD}|${CAPS_WORD})${TOKEN_END}`, "gu");
const LOWER_WORD_RE = /(?<![\p{L}\p{N}'’-])\p{Ll}[\p{Ll}'’-]{1,20}(?![\p{L}\p{N}])/gu;
const CLOSING_RE =
  /^[ \t]{0,20}(?:(?:liebe|viele|beste|herzliche|freundliche|schöne|sonnige|sportliche|liebste)[ \t]{1,20}grüße|mit freundlichen grüßen|freundliche grüße|grüß gott|grüße|gruß|mfg|lg|glg|vg|servus|ciao|tschüss|best regards|kind regards|warm regards|regards|best|cheers|thanks|thank you|cordiali saluti|distinti saluti|saluti|grazie mille|grazie|met vriendelijke groet(?:en)?|groetjes|groeten|danke und liebe grüße|danke)(?=[\s,.!]|$)/gimu;
const HEADER_RE = /^[ \t>]*(?:Von|From|An|To|Cc|Absender|Da|Van|Aan)[ \t]{0,20}:[ \t]{0,20}(?<name>[^<\n\s][^<\n]{0,119}?)[ \t]{0,20}</gmud;
const LABEL_RE =
  /(?<![\p{L}])(?<label>Name|Vorname|Nachname|Familienname|Gast|Gastname|Gäste|Guest|Guest name|Name of guest|Teilnehmer|Teilnehmerin|Teilnehmende|Anwesend|Anwesende|Fahrer|Fahrerin|Dienstnehmer|Dienstnehmerin|Mitarbeiter|Mitarbeiterin|Karteninhaber|Karteninhaberin|Kontoinhaber|Kontoinhaberin|Inhaber|Inhaberin|Ansprechpartner|Ansprechpartnerin|Ansprechperson|Kontaktperson|Surname|Last name|Family name|Achternaam|Referente|Referent|Sachbearbeiter|Sachbearbeiterin|Geschäftsführer|Geschäftsführerin|Obmann|Obfrau|Brautpaar|Bewerber|Bewerberin|Patient|Patientin|Mieter|Mieterin|Antragsteller|Antragstellerin|Besteller|Bestellerin|Gebucht von|Booked by|Contact person|Nome|Cognome|Naam|Organisator|Organisatorin|Verantwortlich|Trainer|Trainerin|Notfallkontakt|Kunde|Kundin|Empfänger|Empfängerin|Reservierung|Reserviert auf|Reserviert für|Buchung|Gebucht auf|Reservation|Booking|Prenotazione|Reservering)[ \t]{0,20}:[ \t]{0,20}/gu;
const LIST_LABELS = new Set(["Gäste", "Teilnehmer", "Teilnehmerin", "Teilnehmende", "Anwesend", "Anwesende", "Brautpaar"]);
const WEAK_LABELS = new Set(["Kunde", "Kundin", "Empfänger", "Empfängerin", "Verantwortlich"]);
// In diesen Feldern steht nur ein Nachname, auch wenn er wie ein Hauptwort aussieht ("Nachname: Berg").
const SURNAME_LABELS = new Set(["Nachname", "Familienname", "Cognome", "Surname", "Last name", "Family name", "Achternaam"]);
// Nach "Reservierung:" steht oft etwas anderes ("Reservierung: Doppelzimmer"): nur Vornamen oder GROSS geschriebene Namen.
const BOOKING_LABELS = new Set(["Reservierung", "Reserviert auf", "Reserviert für", "Buchung", "Gebucht auf", "Reservation", "Booking", "Prenotazione", "Reservering"]);
const FAMILY_AFTER_RE = new RegExp(String.raw`(?<![\p{L}])[Tt]he[ \t]{1,20}(?<n>${NAME_WORD})[ \t]{1,20}family(?![\p{L}])`, "gud");
const FAMILY_BEFORE_RE = /(?<![\p{L}])(?:familie|famiglia|famille|family)[ \t]{1,20}/gu;
const BIRTH_NAME_RE = /(?<![\p{L}])(?:geb\.|geborene|geborener|née|nee|nata|nato)[ \t]{1,20}(?=\p{Lu})/gu;
const LOWER_CONTEXT_RE =
  /(?:^|[\s,.;:!?(])(?:die|der|den|dem|an|von|mit|für|bei|und|hier ist|ich bin|obmann|obfrau|chef|chefin|kollege|kollegin|frau|herr|lg|vg|glg|grüße|gruß|liebe|lieber|dank|danke|hallo|hi|hey|servus|ciao|cheers|thanks|grazie|saluti|groetjes|griaß[ \t]{1,3}di|griass[ \t]{1,3}di|grüß[ \t]{1,3}di|grüß[ \t]{1,3}dich|pfiat[ \t]{1,3}di|servas|moin|hoi)[ \t]{1,20}$/iu;

function lowercaseSurname(text: string, pos: number): number | null {
  GAP_Y.lastIndex = pos;
  const g = GAP_Y.exec(text);
  if (!g) return null;
  const start = pos + g[0].length;
  const m = /^\p{Ll}{3,25}(?![\p{L}\p{N}'’-])/u.exec(text.slice(start, start + 30));
  if (!m) return null;
  const word = m[0];
  if (LOWERCASE_STOPWORDS.has(word)) return null;
  // Verbformen ("kommt", "schicken") sind kein Nachname; "schmidt", "brandt" schon.
  if (/(?:en|ern|eln|st|te|ten|test|tet|t)$/u.test(word) && !/(?:dt|tt)$/u.test(word)) return null;
  return start + word.length;
}

// Vor einem Namen wie eine Anrede, aber mit vollem Namen danach: "t.n.v. S. van Dijk", "z. Hd. M. Leitgeb", "Attn. …"
const NAME_PREFIX_RE = new RegExp(
  String.raw`(?<![\p{L}])(?:t\.[ \t]?n\.[ \t]?v\.|t\.[ \t]?a\.[ \t]?v\.|z\.[ \t]?Hd\.?|z\.[ \t]?H\.|c\/o|Attn\.?|attn\.?|Attention|a\.[ \t]?c\.[ \t]?a\.)[ \t:]{1,20}(?:${SALUTATION}[ \t]{1,20})?${TITLES}(?=(?:${PARTICLE}[ \t]{1,20})?${UP})`,
  "gu",
);
// Verwandte: "unser Sohn Lukas", "My wife Noura", "Onze dochter Fenna", "mia moglie Giulia"
const KIN_RE = new RegExp(
  String.raw`(?<![\p{L}])(?:mein|meine|meinem|meinen|meiner|mei|unser|unsere|unserem|unseren|unserer|sein|seine|seinem|seinen|seiner|ihr|ihre|ihrem|ihren|ihrer|my|our|his|her|their|mia|mio|la[ \t]mia|il[ \t]mio|nostra|nostro|onze|ons|mijn|zijn|haar)[ \t]{1,3}(?<kin>\p{L}{2,20})[ \t,]{1,3}${TITLES}(?=${UP}${LO})`,
  "giud",
);
// Chat-Verläufe: "[16.10.26, 08:12] Wang Lei: …", "16.10.26, 08:12 - Wang Lei: …", "[Mo 06:47] Sepp (Unterwegerhof): …"
const CHAT_SENDER_RE =
  /^[ \t]{0,3}(?:\[(?=[^\]\n]{0,20}\d{1,2}:\d{2})(?=[^\]\n]{0,20}(?:\d{1,2}[./]\d{1,2}|Mo|Di|Mi|Do|Fr|Sa|So|Mon|Tue|Wed|Thu|Fri|Sat|Sun))[^\]\n]{3,30}\]|\d{1,2}[./]\d{1,2}[./]\d{2,4},?[ \t]{1,3}\d{1,2}:\d{2}(?::\d{2})?[ \t]{0,3}[-–])[ \t]{1,3}(?<name>[^:\n[\]]{2,60}?)[ \t]{0,3}:[ \t]/gmud;
// Ablaufpläne sehen aus wie Chats ("14:30 - Ankunft Innsbruck: Abholung"): Solche Wörter sind kein Absender.
const ITINERARY_WORDS = new Set([
  "Ankunft", "Abfahrt", "Anreise", "Abreise", "Treffpunkt", "Abholung", "Transfer", "Frühstück", "Mittagessen",
  "Abendessen", "Termin", "Pause", "Start", "Beginn", "Ende", "Führung", "Ausflug", "Hinfahrt", "Rückfahrt", "Flug",
  "Zug", "Bus", "Check-in", "Check-out", "Wichtig", "Hinweis", "Info",
]);
// Chinesische Namen, Familienname zuerst: "Wang Lei", "Chen Xiaoyu" (Vorname aus Pinyin-Silben).
const PINYIN_SYLLABLE = "(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ueng|ang|eng|ing|ong|ian|iao|uai|uan|ai|ei|ao|ou|an|en|in|un|ia|ie|iu|ua|uo|ui|ue|er|a|o|e|i|u)";
const PINYIN_NAME_RE = new RegExp(`^(?:${PINYIN_SYLLABLE}){1,3}$`, "u");
const CHINESE_NAME_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(?<s>${UP}${LO}{1,5})[ \t](?<g>${UP}${LO}{2,9})(?![\p{L}\p{N}])`, "gud");
// Kleingeschriebene Anrede mit kleingeschriebenem Nachnamen im Chat-Stil: "hallo frau moosbrugger"
const LOWER_SALUTATION_RE = /(?<![\p{L}])(?:frau|herr|herrn)[ \t]{1,3}(?<n>\p{Ll}{3,25})(?![\p{L}\p{N}'’-])/gud;
// Italienisches "Mia" vor Verwandten ist "meine" ("Mia moglie Giulia"), kein Name.
const ITALIAN_POSSESSIVE_AFTER =
  /^[ \t]{1,3}(?:moglie|figlia|madre|mamma|sorella|nonna|zia|cugina|amica|nipote|suocera|compagna|fidanzata|collega|famiglia|cara|carissima|bambina|piccola)(?![\p{L}])/u;

const PRECEDING_SURNAME_RE = new RegExp(
  String.raw`(?:^|[:;|(•–-][ \t]{0,20})(?<t>${NAME_WORD}|${CAPS_WORD})(?<comma>[ \t]{0,20},)?[ \t]{1,20}$`,
  "ud",
);

/** "Huber, Anna" oder "HUBER Anna" oder "Huber Anna" an einer Feld- oder Listenposition: Nachname davor. */
function precedingSurname(text: string, index: number): { start: number; token: string; comma: boolean } | null {
  const from = lineStartWithin(text, index, 60);
  const before = text.slice(from, index);
  const m = PRECEDING_SURNAME_RE.exec(before);
  const span = m ? groupSpan(m, "t") : null;
  if (!m?.groups || !span) return null;
  const token = m.groups.t ?? "";
  if (!token || isNotSurname(token) || ACRONYMS.has(token) || isFirstName(token) || isSentenceWord(token)) return null;
  if (BUSINESS_WORDS.has(token) || ROLE_WORDS.has(token)) return null;
  return { start: from + span[0], token, comma: Boolean(m.groups.comma) };
}

export function detectPersons(text: string): Finding[] {
  const out: Finding[] = [];
  const add = (start: number, end: number, source: string, extra: Partial<Finding> = {}) => {
    if (end > start) out.push(finding(text, start, end, "PERSON", source, extra));
  };
  const withSurname = (span: NameSpan, single?: boolean): Partial<Finding> => {
    const nachname = single && span.tokens.length === 1 ? text.slice(span.start, span.end) : surnameOf(text, span);
    return nachname ? { nachname } : {};
  };

  // a) Anrede: "Frau Huber", "Herrn Dr. Max Müller", "Familie Gruber", "Frau von der Leyen"
  for (const m of matchAll(text, SALUTATION_RE)) {
    const start = m.index + m[0].length;
    const span = nameAt(text, start, 3, { caps: true, particleFirst: true });
    if (!span) continue;
    const first = span.tokens[0] ?? "";
    if (NOT_NAME_AFTER_SALUTATION.has(first) || BUSINESS_WORDS.has(first)) continue;
    // "Fr. Anreise" (Freitag): bei abgekürzten Anreden keine Allerweltswörter.
    if (/^(?:Fr|Hr)\.$/.test(m.groups?.sal ?? "") && !span.firstParticle && isNotSurname(first)) continue;
    // Abkürzung statt Name: "Hr. Nr. 5", "Fr. Tel. 0512 …"
    if (span.tokens.length === 1 && first.length <= 3 && /^\.[ \t]{0,2}(?:\d|\p{Ll})/u.test(text.slice(span.end, span.end + 4))) continue;
    // Nach einem Possessiv ist "Frau" die Ehefrau und "Mann" kein Herr: Das regeln die Verwandten ("meiner Frau Blumen
    // aufs Zimmer", Review Claude 4 #5).
    if (POSSESSIVE_BEFORE_RE.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    add(start, span.end, "person:anrede", withSurname(span, true));
  }

  // b) Vorstellung: "mein Name ist …", "er hieß Novak", "ich bin Anna Huber"
  for (const m of matchAll(text, INTRO_STRICT_RE)) {
    const start = m.index + m[0].length;
    const span = nameAt(text, start, 3, { caps: true, particleFirst: true });
    if (span && (span.firstParticle || !isNotSurname(span.tokens[0] ?? ""))) {
      add(start, span.end, "person:vorstellung", withSurname(span, true));
    }
  }
  for (const m of matchAll(text, INTRO_LOOSE_RE)) {
    const start = m.index + m[0].length;
    const span = nameAt(text, start, 3, { caps: true });
    if (span && isFirstName(span.tokens[0] ?? "")) add(start, span.end, "person:vorstellung", withSurname(span));
  }

  // c) Bekannte Vornamen, optional mit Nachnamen davor oder danach
  for (const m of matchAll(text, CAP_WORD_RE)) {
    const word = m[0];
    const caps = isCaps(word);
    if (caps && (word.length < 3 || ACRONYMS.has(word))) continue;
    if (!isFirstName(word)) continue;
    const lineBefore = text.slice(lineStartWithin(text, m.index, 12), m.index);
    // "12. Jan." ist ein Datum, kein Name.
    if (/^Jan$/i.test(word) && /(?:^|[^\d])\d{1,2}\.[ \t]?$/.test(lineBefore)) continue;
    const span = nameAt(text, m.index, 3, { caps });
    if (!span) continue;
    // "Jan." und "Max." als Abkürzung (Januar, Maximum) überspringen.
    if (span.tokens.length === 1 && /^(?:Jan|Max)$/i.test(word) && text[span.end] === ".") continue;
    if (word === "Mia" && ITALIAN_POSSESSIVE_AFTER.test(text.slice(span.end, span.end + 20))) continue;
    let start = m.index;
    const extra: Partial<Finding> = withSurname(span);
    // Vorname mit Initiale des Nachnamens: "Jelena M."
    const initial = /^[ \t]\p{Lu}\.(?![\p{L}\p{N}])/u.exec(text.slice(span.end, span.end + 4));
    if (span.tokens.length === 1 && initial) {
      add(start, span.end + initial[0].length, "person:vorname", extra);
      continue;
    }
    if (span.tokens.length === 1) {
      const pre = precedingSurname(text, m.index);
      if (pre) {
        start = pre.start;
        extra.nachname = pre.token;
        // "Huber, Anna" und "Huber Anna" (Nachname zuerst) sind dieselbe Person wie "Anna Huber" (Review Claude 3 #20).
        // Großgeschriebene Nachnamen ("HUBER Anna") in üblicher Schreibweise: "Anna Huber".
        const surname = isCaps(pre.token) ? pre.token.toLowerCase().replace(/(^|-)(\p{Ll})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase()) : pre.token;
        extra.canonical = `${text.slice(m.index, span.end)} ${surname}`;
      }
    }
    add(start, span.end, "person:vorname", extra);
  }

  // d) Signatur: Name auf derselben Zeile wie die Grußformel ("lg steffi", "Cheers, James") oder in den Zeilen danach
  for (const m of matchAll(text, CLOSING_RE)) {
    const closingEnd = m.index + m[0].length;
    const sameLine = text.slice(closingEnd, lineEndOf(text, closingEnd));
    const lead = /^[ \t,!.]*/.exec(sameLine)?.[0].length ?? 0;
    if (sameLine.slice(lead).trim()) signatureName(text, closingEnd + lead, lineEndOf(text, closingEnd), add);
    let pos = lineEndOf(text, closingEnd);
    let checked = 0;
    while (checked < 2 && pos < text.length) {
      const lineStart = pos + 1;
      const lineEnd = lineEndOf(text, lineStart);
      pos = lineEnd;
      const line = text.slice(lineStart, lineEnd);
      if (line.trim() === "") continue;
      checked++;
      const lineLead = /^[ \t]*/.exec(line)?.[0].length ?? 0;
      const titles = new RegExp(`^${TITLES}`, "u").exec(line.slice(lineLead))?.[0].length ?? 0;
      signatureName(text, lineStart + lineLead + titles, lineEnd, add);
    }
  }

  // e) E-Mail-Kopf: "Von: Anna Huber <anna@...>"
  for (const m of matchAll(text, HEADER_RE)) {
    const span = groupSpan(m, "name");
    if (!span) continue;
    const value = text.slice(span[0], span[1]).replace(/^["']|["']$/g, "");
    if (/@/.test(value) || LEGAL_FORM_ANY.test(value)) continue;
    if (value.split(/\s+/).some((w) => ROLE_WORDS.has(w) || ROLE_WORDS.has(capitalize(w)))) continue;
    if (!/\p{Lu}/u.test(value)) continue;
    // "An: Kanzlei Kreuzer-Eberharter" ist ein Betrieb.
    if (BUSINESS_WORDS.has(value.split(/\s+/)[0] ?? "")) {
      out.push(finding(text, span[0], span[1], "FIRMA", "firma:kopfzeile"));
      continue;
    }
    add(span[0], span[1], "person:kopfzeile");
  }

  // f) Feldbezeichnungen: "Name: Petra Lindner", "Fahrer: Ömer Yılmaz", "Anwesend: Gstrein, Kathrein, Auer"
  for (const m of matchAll(text, LABEL_RE)) {
    const label = m.groups?.label ?? "";
    let pos = m.index + m[0].length;
    const lineEnd = lineEndWithin(text, pos, 300);
    const list = LIST_LABELS.has(label);
    for (let item = 0; item < (list ? 12 : 1) && pos < lineEnd; item++) {
      // Anrede und Titel überspringen; die Anrede-Regel erfasst den Namen ohnehin.
      const sal = new RegExp(String.raw`^(?:${SALUTATION}[ \t]{1,20})?${TITLES}`, "u").exec(text.slice(pos, lineEnd));
      const start = pos + (sal?.[0].length ?? 0);
      const span = nameAt(text, start, 3, { caps: true, particleFirst: true });
      if (span && labelValueIsName(span, label)) add(start, span.end, "person:feld", withSurname(span, true));
      if (!list) break;
      // Zum nächsten Listeneintrag: hinter ",", ";", "und", "&", "/"; Klammern ("(Architekt)") überspringen.
      const rest = text.slice(span ? span.end : start, lineEnd);
      const next = /^(?:[ \t]{0,20}\([^)\n]{0,40}\))?[ \t]{0,20}(?:,|;|\/|&|\+|und|and|e)[ \t]{0,20}/u.exec(rest);
      if (!next) break;
      pos = (span ? span.end : start) + next[0].length;
    }
  }

  // g) Kleingeschriebene Vornamen in lockeren Texten: "die steffi", "an obmann gerhard lechner", "lg steffi"
  for (const m of matchAll(text, LOWER_WORD_RE)) {
    const word = m[0];
    if (LOWERCASE_UNSAFE_NAMES.has(word) || !FIRST_NAMES.has(capitalize(word))) continue;
    const lineBefore = text.slice(lineStartWithin(text, m.index, 40), m.index);
    const lineAfter = text.slice(m.index + word.length, lineEndWithin(text, m.index, 100));
    const signatureLine = atLineStart(text, m.index) && lineAfter.trim().split(/\s+/).filter(Boolean).length <= 2;
    if (!LOWER_CONTEXT_RE.test(lineBefore) && !signatureLine) continue;
    const surnameEnd = lowercaseSurname(text, m.index + word.length);
    const end = surnameEnd ?? m.index + word.length;
    add(m.index, end, "person:klein", surnameEnd ? { nachname: text.slice(m.index + word.length, end).trim() } : {});
  }

  // h) Familie: "the Johnson family", "de familie van der Berg", "la famiglia Rossi"
  for (const m of matchAll(text, FAMILY_AFTER_RE)) {
    const span = groupSpan(m, "n");
    if (span) add(span[0], span[1], "person:familie", { nachname: text.slice(span[0], span[1]) });
  }
  for (const m of matchAll(text, FAMILY_BEFORE_RE)) {
    const start = m.index + m[0].length;
    const span = nameAt(text, start, 2, { caps: true, particleFirst: true });
    if (span && (span.firstParticle || !isNotSurname(span.tokens[0] ?? ""))) {
      add(start, span.end, "person:familie", withSurname(span, true));
    }
  }

  // j) "t.n.v. S. van Dijk", "z. Hd. M. Leitgeb"
  for (const m of matchAll(text, NAME_PREFIX_RE)) {
    const start = m.index + m[0].length;
    const span = nameAt(text, start, 3, { caps: true, particleFirst: true });
    if (!span) continue;
    const first = span.tokens[0] ?? "";
    if (BUSINESS_WORDS.has(first) || ROLE_WORDS.has(first) || (isNotSurname(first) && !span.firstParticle)) continue;
    add(start, span.end, "person:zuhanden", withSurname(span, true));
  }

  // k) Verwandte: "unser Sohn Lukas", "My wife Noura"
  for (const m of matchAll(text, KIN_RE)) {
    const kin = m.groups?.kin ?? "";
    if (!KIN_WORDS.has(kin) && !KIN_WORDS.has(kin.toLowerCase()) && !KIN_WORDS.has(capitalize(kin))) continue;
    const start = m.index + m[0].length;
    const span = nameAt(text, start, 3, { caps: false });
    if (!span) continue;
    const first = span.tokens[0] ?? "";
    if (isNotSurname(first) || BUSINESS_WORDS.has(first) || ROLE_WORDS.has(first) || MONTHS.has(first) || PLACE_PREFIXES.has(first)) continue;
    // Im Dativ folgt oft ein Gegenstand ("meiner Frau Blumen aufs Zimmer", "meinem Mann Champagner"): dann nur ein
    // bekannter Vorname (Review Claude 4 #5).
    if (/^(?:meinem|meiner|unserem|unserer|seinem|seiner|ihrem|ihrer|deinem|deiner|eurem|eurer)[ \t]/iu.test(m[0]) && !isFirstName(first)) continue;
    add(start, span.end, "person:verwandt", withSurname(span));
  }

  // l) Absender in Chat-Verläufen
  for (const m of matchAll(text, CHAT_SENDER_RE)) {
    const span = groupSpan(m, "name");
    if (!span) continue;
    const raw = text.slice(span[0], span[1]);
    const paren = /^(?<base>[^()]{2,60}?)[ \t]{0,3}\((?<extra>[^()\n]{2,40})\)$/u.exec(raw);
    const base = (paren?.groups?.base ?? raw).trim();
    const baseStart = span[0] + raw.indexOf(base);
    if (/@|\d{3}/u.test(base) || LEGAL_FORM_ANY.test(base)) continue;
    const words = base.split(/[ \t]+/);
    if (ITINERARY_WORDS.has(words[0] ?? "")) continue;
    if (words.some((w) => ROLE_WORDS.has(w) || BUSINESS_WORDS.has(w) || ROLE_WORDS.has(capitalize(w)) || BUSINESS_WORDS.has(capitalize(w)))) continue;
    if (words.length > 4 || !words.every((w) => /^[\p{L}'’.-]+$/u.test(w))) continue;
    add(baseStart, baseStart + base.length, "person:chat", words.length > 1 ? { nachname: words[words.length - 1] } : {});
    // Zusatz in Klammern ("Sepp (Unterwegerhof)"): Hof, Betrieb oder Familie, ebenfalls schützen.
    const extra = paren?.groups?.extra?.trim();
    if (extra && /^\p{Lu}[\p{L}'’-]{2,40}$/u.test(extra) && !ROLE_WORDS.has(extra) && !isNotSurname(extra)) {
      const at = span[0] + raw.lastIndexOf(extra);
      out.push(finding(text, at, at + extra.length, "FIRMA", "firma:chat"));
    }
  }

  // m) Chinesische Namen mit Familienname zuerst
  for (const m of matchAll(text, CHINESE_NAME_RE)) {
    const surname = m.groups?.s ?? "";
    const given = m.groups?.g ?? "";
    if (!CHINESE_SURNAMES.has(surname) || !PINYIN_NAME_RE.test(given.toLowerCase())) continue;
    if (`${surname} ${given}` === "Hong Kong" || isNotSurname(given)) continue;
    add(m.index, m.index + m[0].length, "person:chinesisch", { nachname: surname });
  }

  // n) Kleingeschriebene Anrede mit Nachnamen: "hallo frau moosbrugger"
  for (const m of matchAll(text, LOWER_SALUTATION_RE)) {
    const span = groupSpan(m, "n");
    if (!span) continue;
    const word = text.slice(span[0], span[1]);
    if (LOWERCASE_STOPWORDS.has(word) || COMMON_LOWERCASE_WORDS.has(word) || isNotSurname(word)) continue;
    if (NOT_NAME_AFTER_SALUTATION.has(capitalize(word)) || NOT_NAME_AFTER_SALUTATION.has(word)) continue;
    if (/(?:en|ern|eln|st|te|ten|test|tet|t)$/u.test(word) && !/(?:dt|tt)$/u.test(word)) continue;
    add(span[0], span[1], "person:anrede", { nachname: word });
  }

  // i) Geburtsname: "Maria Huber, geb. Gruber", "née Dupont"
  for (const m of matchAll(text, BIRTH_NAME_RE)) {
    const start = m.index + m[0].length;
    const span = nameAt(text, start, 2, { caps: true, particleFirst: true });
    if (span && !MONTHS.has(span.tokens[0] ?? "") && (span.firstParticle || !isNotSurname(span.tokens[0] ?? ""))) {
      add(start, span.end, "person:geburtsname", withSurname(span, true));
    }
  }

  return out;
}

function labelValueIsName(span: NameSpan, label: string): boolean {
  const first = span.tokens[0] ?? "";
  if (span.firstParticle || SURNAME_LABELS.has(label)) return true;
  // Nach eindeutigen Namensfeldern ("Gast:", "Fahrer:") gilt ein häufiger Nachname, der auch ein Hauptwort ist, als Name.
  const nounSurname = isNounSurname(first) && !WEAK_LABELS.has(label) && !BOOKING_LABELS.has(label);
  if ((isNotSurname(first) && !nounSurname) || BUSINESS_WORDS.has(first) || ROLE_WORDS.has(first) || MONTHS.has(first)) return false;
  if (isFirstName(first)) return true;
  if (BOOKING_LABELS.has(label)) return span.tokens.every((t) => isCaps(t) && t.length >= 2 && !ACRONYMS.has(t));
  // Nach "Kunde:" oder "Empfänger:" steht oft eine Firma: dort nur mit bekanntem Vornamen.
  // Nach eindeutigen Feldern ("Fahrer: Novak", "Anwesend: Gstrein") reicht auch ein einzelnes Wort.
  return !WEAK_LABELS.has(label);
}

function signatureName(
  text: string,
  nameStart: number,
  lineEnd: number,
  add: (start: number, end: number, source: string, extra?: Partial<Finding>) => void,
): void {
  const span = nameAt(text, nameStart, 4, { caps: true, particleFirst: false });
  if (span) {
    // Eine einzelne Zeile wie "Doppelzimmer" ist kein Name: zwei Wörter oder bekannter Vorname nötig.
    if (span.tokens.length < 2 && !isFirstName(span.tokens[0] ?? "")) return;
    if (isNotSurname(span.tokens[0] ?? "") || ROLE_WORDS.has(span.tokens[0] ?? "")) return;
    const restOfLine = text.slice(span.end, lineEnd).trim();
    if (restOfLine === "" || /^[,|–(-]/u.test(restOfLine)) {
      const nachname = surnameOf(text, span);
      add(nameStart, span.end, "person:signatur", nachname ? { nachname } : {});
    }
  }
}

// ---------------------------------------------------------------------------
// Gesundheit und Religion (besondere Kategorien nach Art. 9 DSGVO)

// Wortteile, die überall im Wort stehen dürfen ("Nussallergie", "Zöliakie-Patient", "Hirntumor").
const HEALTH_ANYWHERE = [
  "allergi", "allergy", "allergic", "unverträglich", "intoleranz", "intolerant", "intolerance", "zöliakie", "coeliac",
  "celiac", "celiachia", "celiaco", "diabet", "epilep", "asthma", "grippe", "erkältet", "krebs-", "krebserkr",
  "krebspatient", "krebsbehandl", "tumor", "tumour", "tumore", "onkolog", "bestrahlung", "cancro", "kanker", "demenz",
  "dementia", "alzheimer", "parkinson", "multiple sklerose", "schlaganfall", "herzinfarkt", "herzkrank",
  "herzschrittmacher", "pacemaker", "bypass", "bluthochdruck", "migräne", "depression", "depressiv", "burnout",
  "psychisch", "psychiatr", "psychotherap", "autismus", "autistisch", "autism", "autistic", "asperger",
  "down-syndrom", "trisomie", "hepatitis", "schlafapnoe", "inkontinen", "katheter", "dialyse", "dialysis", "malattia",
  "ziekte", "rehabilitation", "pflegegrad", "pflegestufe", "pflegebedürftig", "gehbehinder", "sehbehinder",
  "hörbehinder", "schwerbehinder", "körperbehinder", "mehrfachbehinder", "disabilit", "disabled", "disabil",
  "gehandicapt", "rollstuhl", "wheelchair", "rolstoel", "sedia a rotelle", "rollator", "gehhilfe", "krücke",
  "crutches", "prothese", "visually impaired", "gehörlos", "schwerhörig", "hörgerät", "hearing aid",
  "querschnittsgelähm", "querschnittslähm", "gelähmt", "lähmung", "amputi", "schwanger", "pregnan", "incinta",
  "zwanger", "medikament", "medication", "tabletten", "arzneimittel", "insulin", "intolleran", "notfall-pen",
  "notfallpen", "epipen", "epi-pen", "adrenalin-pen", "adrenalinpen", "injur", "kardiolo", "cardiolo", "gynäko",
  "gynaeco", "gyneco", "ginecolo", "neurolo", "urolog", "nephrolog", "rheumatolog", "orthopäd", "lumbago",
  "hexenschuss", "bandscheib", "ischias", "rheuma", "arthrose", "arthritis", "osteopor", "thrombose", "embolie",
  "infarkt", "infarto", "hörminderung", "hörverlust", "hörsturz", "tinnitus", "hearing loss", "blindenhund",
  "assistenzhund", "guide dog", "service dog", "partially sighted", "sight impaired", "mobility scooter", "gehstock",
  "walking stick", "arbeitsunfähig", "dienstunfähig", "berufsunfähig", "erwerbsunfähig", "unfit for work",
  "sick leave", "sick note", "arbeitsunfall", "skiunfall", "sportunfall", "verkehrsunfall", "autounfall",
  "fahrradunfall", "sportverletzung", "skiverletzung", "schnittverletzung", "ricoverat", "riabilitaz", "migraine",
  "emicrania", "gravidanza", "carrozzina", "dialisi", "ictus", "back pain", "heart condition", "heart attack",
  "heart surgery", "limited mobility", "reduced mobility", "mobility issues", "difficulty walking", "hospitalis",
  "hospitaliz", "intervento chirurgico", "lungenkrebs", "brustkrebs", "darmkrebs", "hautkrebs", "prostatakrebs",
  "blutkrebs", "magenkrebs", "leberkrebs", "bauchspeicheldrüsenkrebs", "gebärmutterhalskrebs", "eierstockkrebs",
  "leukämie", "leukemia", "lymphom", "metasta", "rheumatoid",
  // Review Claude 4 #4: Diagnosen, Süchte, Störungen
  "neurodermitis", "psoriasis", "schuppenflechte", "colitis", "magersucht", "bulimi", "anorexi", "alkoholsucht",
  "drogensucht", "spielsucht", "nikotinsucht", "alkoholkrank", "drogenabhängig", "angststörung", "essstörung",
  "schlafstörung", "zwangsstörung", "panikstörung", "persönlichkeitsstörung", "belastungsstörung",
  "durchblutungsstörung", "rhythmusstörung", "sprachstörung", "sehstörung", "hörstörung", "gleichgewichtsstörung",
  "entwicklungsstörung", "stoffwechselstörung", "aufmerksamkeitsstörung", "lernbehinder", "behindertenausweis",
  "behindertenpass", "behinderungsgrad", "grad der behinderung",
  "long-covid", "post-covid",
];
// "Krebs" allein nur nach "hat", "an" oder einem Possessiv ("Meine Mutter hat Krebs"), nicht "Flusskrebs" auf der Karte
// und nicht "Risotto mit Krebs" (Review Claude 4 #6).
const CANCER_RE = /(?<![\p{L}])(?:hat|habe|hatte|haben|an|wegen|seinem|seinen|ihrem|ihren|meinem|meinen|unserem)[ \t]{1,3}(?:(?:einen|einem|den|dem|schweren?|bösartigen?)[ \t]{1,3})?(?<v>Krebs)(?![\p{L}])/gud;
// Ernährung ("glutenfrei") verrät nur zusammen mit einer Person etwas über die Gesundheit: in einem Satz mit einer
// Gesundheitsangabe oder einem Bedarf ("wir bräuchten glutenfreies Frühstück"), nicht auf der Speisekarte.
const DIET_RE =
  /(?<![\p{L}])(?:gluten|laktose|lactose|lattosio)(?:-|[ \t]{1,3})?(?:frei|freie|freies|freien|freier|free|vrij)(?![\p{L}])|(?<![\p{L}])(?:glutenfrei|laktosefrei|glutenvrij|lactosevrij)\p{Ll}{0,3}(?![\p{L}])|(?<![\p{L}])senza[ \t]{1,3}(?:glutine|lattosio)(?![\p{L}])/giu;
const NEED_RE =
  /br[aä]uch|benötig|muss|müssen|darf nur|dürfen nur|isst nur|essen nur|verträgt|vertragen|\bneed|\bmust\b|can only|only eat|bisogno|deve |devono|può mangiare|moet|mag alleen/iu;

/** Grenzen des Satzes um eine Stelle (Satzzeichen oder Zeilenumbruch). */
function sentenceAround(text: string, start: number, end: number): [number, number] {
  let s = start;
  while (s > 0 && start - s < 300 && !/[.!?\n]/u.test(text[s - 1] ?? "")) s--;
  let e = end;
  while (e < text.length && e - end < 300 && !/[.!?\n]/u.test(text[e] ?? "")) e++;
  return [s, e];
}

// Körperteil und Beschwerde in einem Wort oder mit Leerzeichen ("Knieverletzung", "Rückenschmerzen", "hüft op").
const BODY_PARTS =
  "knie|hüft|hüfte|rücken|schulter|herz|bandscheiben|kopf|hand|fuß|fuss|bein|arm|hals|nacken|ellbogen|sprunggelenk|knöchel|finger|zehen|augen|auge|ohren|ohr|lunge|lungen|nieren|niere|leber|magen|darm|blasen|wirbel|wirbelsäulen|gelenk|sehnen|muskel|zahn|kiefer|haut|brust|prostata|gallen|becken|hirn|gehirn|schilddrüsen|meniskus|kreuzband|achilles";
const BODY_CONDITION_RE = new RegExp(
  `^(?:${BODY_PARTS})(?:en|n|e|s)?-?(?:verletzung|verletzungen|bruch|brüche|schmerz|schmerzen|op|operation|entzündung|leiden|probleme|problem|beschwerden|erkrankung|schaden|prellung|zerrung|riss|verstauchung|vorfall|schwäche|insuffizienz|transplantation|tumor|krebs|infekt|infektion|implantat|prothese)$`,
  "u",
);
const BODY_OP_RE = new RegExp(String.raw`(?<![\p{L}])(?:${BODY_PARTS})[ \t]{1,3}(?:op|operation)(?![\p{L}])`, "giu");
// Umschreibungen ("unsicher auf den Beinen", "nicht gut stiegen steigen kann", "er hot's mitn rücken").
const HEALTH_PARAPHRASE_RES = [
  /(?<![\p{L}])(?:unsicher|wackelig|schwach)[ \t]{1,3}auf[ \t]{1,3}den[ \t]{1,3}Beinen(?![\p{L}])/giu,
  // "nicht gehen können" allein kann auch am Zug liegen; nach "nicht" braucht es "mehr", "gut", "weit", "lange" oder
  // Treppen (Review Claude 4 #6).
  /(?<![\p{L}])(?:(?:kaum|schlecht)[ \t]{1,3}(?:mehr[ \t]{1,3})?(?:gut[ \t]{1,3})?|nicht[ \t]{1,3}(?:(?:mehr|gut|weit|lange|stiegen|treppen|stufen)[ \t]{1,3}){1,3})(?:(?:stiegen|treppen|stufen|weit)[ \t]{1,3})?(?:steigen|gehen|laufen|stehen)[ \t]{1,3}(?:kann|können|konnte|könnte)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:schlecht|nicht[ \t]{1,3}gut|kaum)[ \t]{1,3}zu[ \t]{1,3}Fu(?:ß|ss)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:can(?:no|')t|cannot)[ \t]{1,3}(?:walk[ \t]{1,3}far|climb[ \t]{1,3}stairs|use[ \t]{1,3}stairs)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:intervento|operazione|operata|operato)[ \t]{1,3}(?:al|alla|allo|all'|ai|agli|alle)[ \t]?(?:cuore|ginocchio|anca|schiena|spalla|piede|mano|braccio|gamba|occhio|occhi|polmone|rene|fegato|testa)(?![\p{L}])/giu,
];
const MIT_BODY_RE = new RegExp(
  String.raw`(?<![\p{L}])(?:hat|hot|hab|habe|hats|hots|hat's|hot's|hab's|hat’s|hot’s)(?:[ \t]{1,3}es)?[ \t]{1,3}(?<v>(?:mitn|mitm|mit'm|mit[ \t]{1,3}dem|mit[ \t]{1,3}der|mit[ \t]{1,3}den|mit)[ \t]{1,3}(?:rücken|knie|hüfte|hüft|herz|bandscheibe|kreuz|magen|galle|nieren|lunge|schulter|füßen|fuß|augen|ohren|beinen|bein))(?![\p{L}])`,
  "giud",
);
// Wortteile nur am Wortanfang: sonst "Kooperation", "Archiv", "Verkehrsbehinderung", "dementsprechend".
// "behindert" und "Behinderung" nur in Wortbildungen ("gehbehindert", oben) oder mit Personenbezug (HEALTH_PHRASES):
// "Verkehrsbehinderung", "die Baustelle behindert die Zufahrt" sind keine Gesundheitsangaben (Review Claude 4 #6).
const HEALTH_WORD_START = [
  "krank", "erkrank", "fieber", "infekt", "verletz", "chemo", "patient", "patiënt", "operiert", "operation",
  "surgery", "reha", "invalide", "deaf", "stoma", "cancer", "malat", "fracture", "sprain", "seizure",
  "autist", "alkoholiker", "hiv-", "aids-", "morbus",
];
// Ganze Wörter: Abkürzungen, die sonst in anderen Wörtern stecken ("Archiv").
const HEALTH_WHOLE = ["hiv", "copd", "adhs", "adhd", "ms-patient", "aids", "crohn", "blindheit", "taubheit"];
// Mehrere Wörter: Behinderung und Sinne nur mit Personenbezug ("ist blind", "mit einer Behinderung").
const HEALTH_PHRASES = [
  "ist blind", "bin blind", "sind blind", "fast blind", "ist taub", "bin taub", "sind taub", "fast taub", "is blind",
  "is deaf", "ist behindert", "bin behindert", "sind behindert", "geistig behindert", "körperlich behindert",
  "mit behinderung", "mit einer behinderung", "eine behinderung", "meine behinderung", "seine behinderung",
  "ihre behinderung", "long covid", "positiv getestet", "tested positive",
];
// Wörter, die wie Gesundheitswörter beginnen oder enden, aber keine sind ("Head of Operations", "Spülmaschinentabletten").
const HEALTH_NOT =
  /^(?:operations|operational|operationally)$|(?:spülmaschinen|geschirrspül|spül|reinigungs|chlor|entkalker|entkalkungs|wc|toiletten|desinfektions|wasch)tabletten?$/u;
// Redewendung: "Hals- und Beinbruch" heißt "viel Glück".
const HEALTH_IDIOM_RE = /(?<![\p{L}])Hals-[ \t]?und[ \t]{1,3}Beinbruch(?![\p{L}])/giu;
const RELIGION_ANYWHERE = [
  "erstkommunion", "kommunion", "firmung", "konfirmation", "bar mitzwa", "bat mitzwa", "bar mitzvah", "bat mitzvah",
  "zuckerfest", "opferfest", "kurban", "kindstaufe", "kindertaufe", "taufpate", "taufpatin", "baptism", "christening", "comunione",
  "cresima", "battesimo", "halal", "koscher", "kosher", "gebetsraum", "gebetszeit", "gebetsteppich", "gebetsrichtung", "prayer", "qibla",
  "kibla", "nach mekka", "richtung mekka", "to mecca", "towards mecca", "ramadan", "yom kippur", "rosh hashanah", "rosch haschana", "religiöser feiertag",
  "fastenbrechen", "iftar", "schabbat", "shabbat", "muslim", "moslem", "islam", "moschee", "mosque",
  "moschea", "moskee", "jüdisch", "jüdin", "jewish", "synagoge", "synagogue", "sinagoga", "christlich", "katholisch",
  "catholic", "cattolic", "evangelisch", "protestant", "buddhist", "zeugen jehovas", "jehovas", "konfession",
  "religiös", "religious", "gottesdienst", "pessach", "chanukka", "hanukkah",
];
// Review Claude 4 #6: "hindurch", "Sabbatical", "Taufers", "Staufen", "ein Mekka für Mountainbiker" und "Eid" (Schwur)
// sind keine Religionsangaben; "Eid" nur als Fest.
const RELIGION_WORD_START = ["orthodox", "hinduis", "jainis", "tauffeier", "taufessen", "taufgottesdienst", "taufkerze"];
const RELIGION_WHOLE = [
  "sikh", "sikhs", "jain", "jains", "jaina", "losar", "vesak", "diwali", "holi", "purim", "sukkot", "navratri", "bayram",
  "hindu", "hindus", "sabbat", "sabbath", "taufe", "hadsch", "hajj", "umrah", "eid al-fitr", "eid al-adha", "eid mubarak",
  // Review Claude 4 #4: Zugehörigkeit
  "jude", "juden", "christ", "christen", "christin", "christinnen", "atheist", "atheistin", "atheisten", "agnostiker",
  "muslime", "muslima", "buddhisten",
];
// Gebete ("Freitagsgebet", "Abendgebet"), aber nicht "gebeten".
const PRAYER_RE = /(?:^|\p{Ll})gebete?$/u;

interface KeywordSet {
  anywhere: RegExp | null;
  wordStart: RegExp | null;
  whole: RegExp | null;
  phrases: RegExp | null;
}

function keywordSet(anywhere: string[], wordStart: string[], whole: string[]): KeywordSet {
  const single = (list: string[]) => list.filter((k) => !k.includes(" "));
  const alt = (list: string[]) => list.map(escapeRegExp).join("|");
  const make = (list: string[], wrap: (a: string) => string) =>
    single(list).length ? new RegExp(wrap(alt(single(list))), "u") : null;
  const multi = [...anywhere, ...wordStart, ...whole].filter((k) => k.includes(" "));
  return {
    anywhere: make(anywhere, (a) => `(?:${a})`),
    wordStart: make(wordStart, (a) => `^(?:${a})`),
    whole: make(whole, (a) => `^(?:${a})$`),
    phrases: multi.length
      ? new RegExp(
          String.raw`(?<![\p{L}\p{N}-])(?:${multi.map((k) => escapeRegExp(k).replace(/ /g, String.raw`[ \t]{1,3}`)).join("|")})(?![\p{L}\p{N}])`,
          "giu",
        )
      : null,
  };
}

const HEALTH = keywordSet(HEALTH_ANYWHERE, HEALTH_WORD_START, [...HEALTH_WHOLE, ...HEALTH_PHRASES]);
const RELIGION = keywordSet(RELIGION_ANYWHERE, RELIGION_WORD_START, RELIGION_WHOLE);
// Ein Wort, auch mit Bindestrich ("Zöliakie-Patient", "Krebs-OP").
const WORD_RE = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
// Adjektive ("eine schwere …") nur nach einem Artikel, sonst würde "essen halal" mitgenommen.
const ARTICLE_BEFORE_RE =
  /(?<![\p{L}])(?:(?:eine|einen|ein|einer|keine|une|un|una)[ \t]{1,3}(?:\p{Ll}{2,20}(?:e|er|en|em|es)[ \t]{1,3})?|(?:a|an)[ \t]{1,3}(?:\p{Ll}{3,20}[ \t]{1,3})?)$/iu;
// "allergisch gegen Nüsse", "allergic to cats", "allergisch voor katten", "intollerante al lattosio"
const OBJECT_AFTER_RE = /^[ \t]{1,3}(?:gegen|auf|to|voor|al|alla|allo|ai|agli|alle|a)[ \t]{1,3}[\p{L}\p{N}-]{1,30}/iu;
// "buddhistischer Feiertag", "Jain festival"
const RELIGION_AFTER_RE = /^[ \t]{1,3}(?:Feiertag|Feiertage|Fest|Feste|Fastenzeit|Gebet|Gebete|Neujahr|holiday|holidays|festival|festa|festività)(?![\p{L}])/iu;
const OP_BEFORE_RE = /(?:nach|vor|wegen)[ \t]{1,3}(?:der|einer|seiner|ihrer|meiner)[ \t]{1,3}$/iu;

/**
 * Sucht Wort für Wort (lineare Laufzeit) nach Schlüsselwörtern und nimmt einen Artikel mit Adjektiv davor
 * ("eine schwere Nussallergie") und ein Objekt danach ("allergisch gegen Nüsse") mit.
 */
function detectKeywords(
  text: string,
  set: KeywordSet,
  type: EntityType,
  source: string,
  options: {
    extraWord?: (word: string, start: number) => boolean;
    extraSpans?: Array<[number, number]>;
    after?: RegExp;
    not?: RegExp;
  } = {},
): Finding[] {
  const spans: Array<[number, number]> = [...(options.extraSpans ?? [])];
  const hit = (w: string) => set.anywhere?.test(w) || set.wordStart?.test(w) || set.whole?.test(w);
  for (const m of matchAll(text, WORD_RE)) {
    const w = m[0].toLowerCase();
    if (options.not?.test(w)) continue;
    // Auch ohne Akzente: "diabétique" wie "diabet" (Review Claude 4 #4).
    const plain = w.normalize("NFD").replace(/\p{M}/gu, "");
    if (hit(w) || (plain !== w && hit(plain)) || options.extraWord?.(m[0], m.index)) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  if (set.phrases) for (const m of matchAll(text, set.phrases)) spans.push([m.index, m.index + m[0].length]);
  const after = options.after ?? OBJECT_AFTER_RE;
  return spans.map(([s, e]) => {
    const article = ARTICLE_BEFORE_RE.exec(text.slice(Math.max(0, s - 40), s));
    const object = after.exec(text.slice(e, e + 40));
    return finding(text, article ? s - article[0].length : s, object ? e + object[0].length : e, type, source);
  });
}

export function detectHealth(text: string): Finding[] {
  // "Knie-OP", "Krebs-OP", "nach einer OP", "Knieverletzung", "Rückenschmerzen"
  const extraWord = (word: string, start: number) =>
    /-OP$/.test(word) ||
    (word === "OP" && OP_BEFORE_RE.test(text.slice(Math.max(0, start - 30), start))) ||
    BODY_CONDITION_RE.test(word.toLowerCase());
  const extraSpans: Array<[number, number]> = [];
  for (const re of [BODY_OP_RE, ...HEALTH_PARAPHRASE_RES]) for (const m of matchAll(text, re)) extraSpans.push([m.index, m.index + m[0].length]);
  for (const re of [MIT_BODY_RE, CANCER_RE]) {
    for (const m of matchAll(text, re)) {
      const span = groupSpan(m, "v");
      if (span) extraSpans.push(span);
    }
  }
  const idioms = [...matchAll(text, HEALTH_IDIOM_RE)].map((m): [number, number] => [m.index, m.index + m[0].length]);
  const found = detectKeywords(text, HEALTH, "GESUNDHEIT", "gesundheit", { extraWord, extraSpans, not: HEALTH_NOT }).filter(
    (f) => !idioms.some(([s, e]) => f.start < e && s < f.end),
  );
  for (const m of matchAll(text, DIET_RE)) {
    const [s, e] = sentenceAround(text, m.index, m.index + m[0].length);
    if (found.some((f) => f.start < e && s < f.end) || NEED_RE.test(text.slice(s, e))) {
      found.push(finding(text, m.index, m.index + m[0].length, "GESUNDHEIT", "gesundheit:ernaehrung"));
    }
  }
  return found;
}

export function detectReligion(text: string): Finding[] {
  return detectKeywords(text, RELIGION, "RELIGION", "religion", {
    extraWord: (word) => PRAYER_RE.test(word.toLowerCase()) || /^gebets/u.test(word.toLowerCase()),
    after: RELIGION_AFTER_RE,
  });
}

// ---------------------------------------------------------------------------
// Tabellen (CSV, Tabulator): Spaltenköpfe wie "Name;Vorname;Telefon" bestimmen den Typ jeder Zelle.

const CSV_COLUMNS: Array<{ re: RegExp; type: EntityType }> = [
  {
    re: /^(?:(?:vor|nach|familien|gast|kunden|ruf|geburts|voll)?name|vorname|nachname|first ?name|last ?name|surname|given ?name|full ?name|gast|guest|kunde|kundin|ansprechpartner(?:in)?|teilnehmer(?:in)?|nome|cognome|naam|achternaam|voornaam|person)$/iu,
    type: "PERSON",
  },
  { re: /^(?:e-?mail|mail|email-adresse|e-mail-adresse)$/iu, type: "EMAIL" },
  {
    re: /^(?:telefon|tel\.?|handy|mobil|mobile|phone|telefonnummer|handynummer|mobilnummer|telefono|cellulare|telefoon)$/iu,
    type: "TELEFON",
  },
  {
    re: /^(?:stra(?:ß|ss)e|adresse|anschrift|address|street|indirizzo|via|adres|plz|postleitzahl|zip|postcode|cap|ort|stadt|wohnort|city|città|plaats|plz ?\/? ?ort)$/iu,
    type: "ADRESSE",
  },
  {
    re: /^(?:geburtsdatum|geb\.?|geboren|dob|date of birth|data di nascita|geboortedatum)$/iu,
    type: "GEBURTSDATUM",
  },
  { re: /^iban$/iu, type: "IBAN" },
  { re: /^(?:firma|unternehmen|company|ditta|bedrijf)$/iu, type: "FIRMA" },
  {
    re: /^(?:pass(?:nummer|-?nr\.?)?|ausweis(?:nummer|-?nr\.?)?|passport(?: ?no\.?| number)?|reisepass(?:nummer|-?nr\.?)?|id(?:-?nr\.?)?|dokument(?:nummer|-?nr\.?)?|document(?: no\.?)?|n\. documento|documento)$/iu,
    type: "AUSWEIS",
  },
  { re: /^(?:kennzeichen|kfz-kennzeichen|license plate)$/iu, type: "KENNZEICHEN" },
];

/** Inhalt eines CSV-Feldes (ohne umschließende Anführungszeichen) als Position im Text. */
interface CsvField {
  start: number;
  end: number;
}

/** So weit darf ein Feld in Anführungszeichen höchstens reichen (auch über mehrere Zeilen). */
const MAX_QUOTED = 2000;

/**
 * Schließendes Anführungszeichen ab from. Verdoppelte Anführungszeichen ("") gehören zum Inhalt. Vor einer
 * Leerzeile, einer Teilgrenze, nach MAX_QUOTED Zeichen oder hinter limit gibt es keinen Abschluss mehr: -1.
 */
function closingQuote(text: string, from: number, limit: number): number {
  const to = Math.min(limit, from + MAX_QUOTED);
  let blank = false; // seit dem letzten Zeilenumbruch nur Leerraum
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === '"') {
      if (text[i + 1] === '"') {
        i++;
        blank = false;
        continue;
      }
      return i;
    }
    if (c === SEGMENT_BREAK) return -1;
    if (c === "\n") {
      if (blank) return -1;
      blank = true;
    } else if (c !== " " && c !== "\t" && c !== "\r") {
      blank = false;
    }
  }
  return -1;
}

/**
 * Liest einen CSV-Datensatz ab pos: Felder in Anführungszeichen dürfen Trennzeichen, verdoppelte Anführungszeichen
 * und Zeilenumbrüche enthalten. next zeigt auf den Anfang der nächsten Zeile. limit begrenzt Felder in
 * Anführungszeichen (für Kopfzeilen: Zeilenende).
 */
function readCsvRecord(text: string, pos: number, delimiter: string, limit = text.length): { fields: CsvField[]; next: number } {
  const fields: CsvField[] = [];
  const isSpace = (c: string | undefined) => c !== delimiter && (c === " " || c === "\t" || c === "\r");
  let i = pos;
  for (;;) {
    let j = i;
    while (j < text.length && isSpace(text[j])) j++;
    if (text[j] === '"') {
      const close = closingQuote(text, j + 1, limit);
      if (close !== -1) {
        let k = close + 1;
        while (k < text.length && isSpace(text[k])) k++;
        const after = text[k];
        if (after === undefined || after === delimiter || after === "\n") {
          fields.push({ start: j + 1, end: close });
          if (after === delimiter) {
            i = k + 1;
            continue;
          }
          return { fields, next: after === undefined ? k : k + 1 };
        }
      }
    }
    // Feld ohne (gültige) Anführungszeichen: bis zum nächsten Trennzeichen oder Zeilenende.
    let k = i;
    while (k < text.length && text[k] !== delimiter && text[k] !== "\n" && text[k] !== SEGMENT_BREAK) k++;
    let s = i;
    let e = k;
    while (s < e && /\s/u.test(text[s] ?? "")) s++;
    while (e > s && /\s/u.test(text[e - 1] ?? "")) e--;
    if (text[s] === '"') s++;
    if (e > s && text[e - 1] === '"') e--;
    fields.push({ start: s, end: e });
    if (text[k] === delimiter) {
      i = k + 1;
      continue;
    }
    return { fields, next: k < text.length ? k + 1 : k };
  }
}

function trimmedSpan(text: string, f: CsvField): CsvField {
  let { start, end } = f;
  while (start < end && /\s/u.test(text[start] ?? "")) start++;
  while (end > start && /\s/u.test(text[end - 1] ?? "")) end--;
  return { start, end };
}

/**
 * Typ einer Zelle. Hat eine Zeile mehr Felder als die Kopfzeile (z. B. ein Komma ohne Anführungszeichen in
 * "Huber, Anna"), ist die Zuordnung unsicher: Dann gilt jeder Spaltentyp, der durch die Verschiebung in Frage
 * kommt. Lieber zu viel schützen als eine verrutschte Telefonnummer stehen lassen.
 */
function cellType(types: Array<EntityType | undefined>, index: number, extra: number): EntityType | undefined {
  for (let c = Math.max(0, index - extra); c <= index && c < types.length; c++) {
    const type = types[c];
    if (type) return type;
  }
  return undefined;
}

export function detectTables(text: string): Finding[] {
  const out: Finding[] = [];
  let pos = 0;
  while (pos < text.length) {
    const lineEnd = lineEndOf(text, pos);
    const headerLine = text.slice(pos, lineEnd);
    // Auch Tabellen mit senkrechten Strichen ("Name | Mo | Di"), wie sie aus Tabellenprogrammen und Chats kommen.
    const delimiter = [";", "\t", "|", ","].find((d) => headerLine.includes(d));
    let next = lineEnd + 1;
    if (delimiter) {
      const header = readCsvRecord(text, pos, delimiter, lineEnd).fields.map((f) => text.slice(f.start, f.end).trim());
      // Spaltenköpfe mit Nummer ("Tel. 1", "Name 2") zählen wie ohne Nummer.
      const types = header.map((c) => CSV_COLUMNS.find((col) => col.re.test(c) || col.re.test(c.replace(/[ \t]*\d{1,2}$/u, "")))?.type);
      const plausible =
        header.length >= 2 && !header.some((c, i) => c.length > 30 || (/\d/.test(c) && !types[i])) && types.some(Boolean);
      if (plausible) {
        let row = next;
        while (row < text.length) {
          const rowEnd = lineEndOf(text, row);
          if (!text.slice(row, rowEnd).trim()) {
            // Eine Leerzeile beendet die Tabelle nur, wenn danach keine Zeile mit gleich vielen Spalten folgt.
            const nextStart = rowEnd + 1;
            const nextLine = text.slice(nextStart, lineEndOf(text, nextStart));
            if (nextStart < text.length && nextLine.trim() && readCsvRecord(text, nextStart, delimiter, lineEndOf(text, nextStart)).fields.length === header.length) {
              row = nextStart;
              continue;
            }
            break;
          }
          const record = readCsvRecord(text, row, delimiter);
          // Eine Zeile ohne Trennzeichen ist keine Tabellenzeile mehr (z. B. "Danke!" nach der Tabelle).
          if (record.fields.length < 2) break;
          const fields = record.fields.map((f) => trimmedSpan(text, f));
          // Leere Felder am Ende zählen nur, soweit die Kopfzeile keine Spalten dafür hat: "Zorwin;5551234567;;" ist
          // eine vollständige Zeile mit zwei leeren Spalten, ein Trennzeichen am Zeilenende keine zusätzliche Spalte.
          while (fields.length > header.length && fields[fields.length - 1]?.start === fields[fields.length - 1]?.end) fields.pop();
          // Kürzere Zeilen (fehlende Spalten am Ende) werden nach Position zugeordnet. Eine Zeile mit viel mehr Feldern
          // gehört nicht zur Tabelle; sie wird übersprungen, die Zeilen danach werden weiter geprüft.
          if (fields.length <= header.length + 3) {
            const extra = Math.max(0, fields.length - header.length);
            fields.forEach(({ start, end }, c) => {
              const type = cellType(types, c, extra);
              if (!type || end <= start) return;
              // In Namensspalten keine Platzhalter für Striche, Rollen und Allerweltswörter ("–", "Aushilfe", "frei").
              const value = text.slice(start, end);
              if (type === "PERSON" && (!/\p{L}/u.test(value) || value.split(/[ \t]+/).every((w) => ROLE_WORDS.has(w) || isNotSurname(w) || LOWERCASE_STOPWORDS.has(w)))) return;
              out.push(finding(text, start, end, type, `tabelle:${type.toLowerCase()}`));
            });
          }
          row = record.next;
        }
        next = Math.max(next, row);
      }
    }
    pos = next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Codierte Blöcke: In Base64 oder Quoted-Printable kann die Erkennung nicht hineinsehen, die KI schon. Mails werden
// beim Ablegen entschlüsselt (core/mail.ts); was trotzdem codiert im Text steht und lesbaren Text enthält, wird
// als Ganzes geschwärzt.

const BASE64_RUN_RE = /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{24,}={0,2}(?![A-Za-z0-9+/=_-])/g;
const QP_WORD_RE = /(?<![\p{L}\p{N}_=.-])(?:[\p{L}\p{N}_.-]{0,60}=[0-9A-F]{2}){2,40}[\p{L}\p{N}_.-]{0,60}/gu;
const TEXT_CHAR_RE = /[\p{L}\p{N}\s.,;:!?@'"()+/-]/u;

/** Ist das überwiegend lesbarer Text (und kein Zufall wie ein Schlüssel oder ein Bild)? */
function mostlyText(text: string): boolean {
  let good = 0;
  let total = 0;
  for (const ch of text) {
    total++;
    if (TEXT_CHAR_RE.test(ch)) good++;
  }
  return total >= 16 && good / total >= 0.9;
}

/** Ist ein dekodierter Block lesbarer Text oder HTML mit lesbarem Text? */
function readableDecoded(bytes: Buffer): boolean {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  if (!/[\p{L}\p{N}]{3}/u.test(decoded)) return false;
  return mostlyText(decoded) || (looksLikeHtml(decoded) && mostlyText(htmlToText(decoded)));
}

/**
 * Base64 über mehrere Zeilen (wie in Mails): Die Zeilen werden zusammengefasst und dekodiert. Lesbarer Text oder HTML
 * wird als Ganzes geschwärzt, lange Blöcke ohne erkennbaren Inhalt immer (der Prüfer kann sie nicht lesen).
 */
function detectBase64Blocks(text: string, out: Finding[]): void {
  let blockStart = -1;
  let blockEnd = -1;
  let joined = "";
  const flush = () => {
    if (blockStart >= 0 && joined.length >= 48) {
      const clean = joined.replace(/=+$/, "");
      if (joined.length >= 200 || (clean.length % 4 !== 1 && readableDecoded(Buffer.from(clean, "base64")))) {
        out.push(finding(text, blockStart, blockEnd, "SONSTIGES", "codiert:base64", { description: "codierter Text" }));
      }
    }
    blockStart = -1;
    joined = "";
  };
  let pos = 0;
  while (pos <= text.length) {
    const end = lineEndOf(text, pos);
    const line = text.slice(pos, end).trim();
    // Die letzte Zeile eines Blocks ist oft kürzer ("…bD4="): als Fortsetzung zählt sie, wenn sie wie Base64 aussieht.
    const continued = blockStart >= 0 && /^[A-Za-z0-9+/]{2,}={0,2}$/.test(line) && /[\d+/=]/.test(line);
    if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(line) || continued) {
      if (blockStart < 0) blockStart = pos + text.slice(pos, end).indexOf(line);
      blockEnd = pos + text.slice(pos, end).indexOf(line) + line.length;
      joined += line;
    } else {
      flush();
    }
    if (end >= text.length) break;
    pos = end + 1;
  }
  flush();
}

export function detectEncoded(text: string): Finding[] {
  const out: Finding[] = [];
  detectBase64Blocks(text, out);
  for (const m of matchAll(text, BASE64_RUN_RE)) {
    const clean = m[0].replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    if (clean.length % 4 === 1) continue;
    const decoded = new TextDecoder("utf-8").decode(Buffer.from(clean, "base64"));
    if (/[\p{L}\p{N}]{3}/u.test(decoded) && mostlyText(decoded)) {
      out.push(finding(text, m.index, m.index + m[0].length, "SONSTIGES", "codiert:base64", { description: "codierter Text" }));
    }
  }
  for (const m of matchAll(text, QP_WORD_RE)) {
    const bytes = Buffer.from(m[0].replace(/=([0-9A-F]{2})/g, (_x, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (/[^\x00-\x7F]/.test(decoded) && !decoded.includes("\uFFFD")) {
      out.push(finding(text, m.index, m.index + m[0].length, "SONSTIGES", "codiert:qp", { description: "codierter Text" }));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Manuelle Markierungen aus der Oberfläche

/** Auf ganze Wörter erweitern: Wer "Hubert" in "Hubertus" schwärzt, schwärzt das ganze Wort. */
function expandToWords(text: string, start: number, end: number): [number, number] {
  let s = start;
  let e = end;
  while (s > 0 && /[\p{L}\p{N}]/u.test(text[s - 1] ?? "")) s--;
  while (e < text.length && /[\p{L}\p{N}]/u.test(text[e] ?? "")) e++;
  return [s, e];
}

/**
 * Fundstellen eines markierten Textes: ohne Groß-/Kleinschreibung, als ganzes Wort. Steht der Text nur als Teil
 * eines Wortes im Dokument ("Hubert" in "Hubertus"), wird das ganze Wort genommen. Lineare Laufzeit: Ein schon
 * erfasstes Wort wird nicht noch einmal abgesucht.
 */
export function manualMatches(text: string, value: string): Array<[number, number]> {
  const v = value.trim();
  if (!v) return [];
  const whole = new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(v)}(?![\p{L}\p{N}])`, "giu");
  const out: Array<[number, number]> = [];
  for (const m of matchAll(text, whole)) out.push([m.index, m.index + m[0].length]);
  if (out.length) return out;
  const part = new RegExp(escapeRegExp(v), "giu");
  let m: RegExpExecArray | null;
  while ((m = part.exec(text)) !== null) {
    const [s, e] = expandToWords(text, m.index, m.index + m[0].length);
    out.push([s, e]);
    part.lastIndex = Math.max(e, m.index + 1);
  }
  return out;
}

/**
 * Alle Stellen einer manuellen Markierung: die Stellen, die der Mitarbeiter ausgewählt hat (immer, auch mitten in
 * einem Wort), und weitere Vorkommen des Textes.
 */
export function manualSpans(text: string, mark: ManualMark): Array<[number, number]> {
  const spans = manualMatches(text, mark.value);
  for (const [s, e] of mark.stellen ?? []) {
    if (Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e <= text.length && s < e) spans.push(expandToWords(text, s, e));
  }
  const seen = new Set<string>();
  return spans.filter(([s, e]) => !seen.has(`${s}:${e}`) && !!seen.add(`${s}:${e}`)).sort((a, b) => a[0] - b[0]);
}

export function detectManual(text: string, marks: DetectOptions["manual"] = []): Finding[] {
  const out: Finding[] = [];
  for (const mark of marks) {
    for (const [s, e] of manualSpans(text, mark)) out.push(finding(text, s, e, mark.type, "manuell"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zusammenführen

export function normalizeValue(type: EntityType, value: string): string {
  const v = value.trim().replace(/\s+/g, " ");
  switch (type) {
    case "TELEFON":
    case "KREDITKARTE":
      return digitsOnly(v);
    case "IBAN":
    case "UID":
    case "SVNR":
    case "STEUERNR":
    case "AUSWEIS":
      return v.replace(/[\s.-]/g, "").toUpperCase();
    case "KENNZEICHEN":
      // Bindestrich und Leerzeichen trennen Bezirk und Buchstaben: "B-AB 123" und "BA-B 123" sind zwei Autos
      // (Review Codex 4 #5). Nur die Groß-/Kleinschreibung zählt nicht.
      return v.toUpperCase();
    case "KUNDENNR":
      // Freie Kennungen: Bindestriche, Punkte und Groß-/Kleinschreibung können unterscheiden ("A-123" und "A123"
      // sind zwei Kunden). Lieber zwei Platzhalter für dieselbe Nummer als eine falsch eingesetzte.
      return v;
    case "SONSTIGES":
      // Wörter meinen in jeder Schreibweise dasselbe ("Edelweiss", "EDELWEISS"); in Codes mit Ziffern kann sie
      // unterscheiden ("AB12" und "ab12", Review Codex 4 #5).
      return /\p{N}/u.test(v) ? v : v.toLowerCase();
    default:
      return v.toLowerCase();
  }
}

const TRIM_CHARS = /[\s,;:.|–\-·•()]/u;

/**
 * Überschneidungen auflösen, ohne Zeichen freizugeben: Der stärkere Fund bleibt, vom schwächeren bleiben die Teile,
 * die nicht überdeckt sind. Gleichartige Funde, die aneinanderstoßen, werden verbunden
 * ("Frau [Anna] Huber" mit manueller Markierung "Anna" ergibt eine Person "Anna Huber").
 */
function resolveOverlaps(text: string, findings: Finding[]): Finding[] {
  const sorted = [...findings].sort(
    (a, b) => priorityOf(b) - priorityOf(a) || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const owner = new Int32Array(text.length).fill(-1);
  const accepted: Array<Finding | null> = [];
  const assign = (idx: number, s: number, e: number) => owner.fill(idx, s, e);

  for (const f of sorted) {
    let free = true;
    for (let i = f.start; i < f.end; i++) {
      if (owner[i] !== -1) {
        free = false;
        break;
      }
    }
    if (free) {
      accepted.push(f);
      assign(accepted.length - 1, f.start, f.end);
      continue;
    }
    // Nicht überdeckte Teile einzeln behandeln.
    let i = f.start;
    while (i < f.end) {
      if (owner[i] !== -1) {
        i++;
        continue;
      }
      let j = i;
      while (j < f.end && owner[j] === -1) j++;
      let s = i;
      let e = j;
      while (s < e && TRIM_CHARS.test(text[s] ?? "")) s++;
      while (e > s && TRIM_CHARS.test(text[e - 1] ?? "")) e--;
      if (e > s && /[\p{L}\p{N}]/u.test(text.slice(s, e))) {
        const leftIdx = i > f.start ? (owner[i - 1] ?? -1) : -1;
        const rightIdx = j < f.end ? (owner[j] ?? -1) : -1;
        const left = leftIdx >= 0 ? accepted[leftIdx] : null;
        const right = rightIdx >= 0 ? accepted[rightIdx] : null;
        const mergeable = (a: Finding | null | undefined): a is Finding => !!a && a.type === f.type && !a.canonical;
        if (mergeable(left)) {
          left.end = e;
          assign(leftIdx, i, e);
          if (mergeable(right) && rightIdx !== leftIdx) {
            left.end = right.end;
            assign(leftIdx, right.start, right.end);
            accepted[rightIdx] = null;
            assign(leftIdx, e, right.start);
          }
          left.value = text.slice(left.start, left.end);
        } else if (mergeable(right)) {
          right.start = s;
          assign(rightIdx, s, j);
          right.value = text.slice(right.start, right.end);
        } else {
          const part: Finding = { ...f, start: s, end: e, value: text.slice(s, e), source: `${f.source}:rest` };
          delete part.canonical;
          delete part.nachname;
          accepted.push(part);
          assign(accepted.length - 1, s, e);
        }
      }
      i = j;
    }
  }
  return accepted.filter((f): f is Finding => f !== null).sort((a, b) => a.start - b.start);
}

/** Straße und "PLZ Ort" direkt dahinter werden eine Adresse (nicht aber Ort und nächste Straße). */
function mergeAdjacentAddresses(text: string, findings: Finding[]): Finding[] {
  const out: Finding[] = [];
  for (const f of findings) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "ADRESSE" && f.type === "ADRESSE" && prev.source === "adresse:strasse" && f.source === "adresse:ort") {
      const gap = text.slice(prev.end, f.start);
      if (/^[ \t]{0,20}(?:[,·|][ \t]{0,20}|\r?\n[ \t]{0,20})?$/u.test(gap)) {
        out[out.length - 1] = { ...prev, end: f.end, value: text.slice(prev.start, f.end), source: "adresse" };
        continue;
      }
    }
    out.push(f);
  }
  return out;
}

/** Kein Fund reicht über eine Teilgrenze (SEGMENT_BREAK): Solche Funde werden an der Grenze geteilt. */
function splitAtSegments(text: string, findings: Finding[]): Finding[] {
  const out: Finding[] = [];
  for (const f of findings) {
    if (!f.value.includes(SEGMENT_BREAK)) {
      out.push(f);
      continue;
    }
    let from = f.start;
    for (let i = f.start; i <= f.end; i++) {
      if (i < f.end && text[i] !== SEGMENT_BREAK) continue;
      let s = from;
      let e = i;
      while (s < e && /\s/u.test(text[s] ?? "")) s++;
      while (e > s && /\s/u.test(text[e - 1] ?? "")) e--;
      if (e > s) {
        const part: Finding = { ...f, start: s, end: e, value: text.slice(s, e) };
        delete part.canonical;
        delete part.nachname;
        out.push(part);
      }
      from = i + 1;
    }
  }
  return out;
}

/**
 * Zeilenumbrüche mitten in einer Angabe ("Frau⏎Huber", "0664⏎1234567", "Kundennummer⏎K-4711"), typisch für Kopien aus
 * PDF und schmale Spalten: Die Erkennung läuft zusätzlich über eine Fassung, in der ein einzelner Zeilenumbruch als
 * Leerzeichen zählt. Sie ist gleich lang, alle Stellen bleiben gleich; die Funde beider Fassungen werden
 * zusammengeführt. Nur für Personen, Kontaktdaten und Kennungen: Firmen und Adressen stehen meist für sich in einer
 * Zeile (über Zeilen hinweg gab es Fehlalarme), Tabellen und codierte Blöcke brauchen die Zeilen.
 */
function detectAcrossLines(text: string, options: DetectOptions): Finding[] {
  // Beginnt die nächste Zeile mit einer Bezeichnung ("Betreff:", "Tel.:"), ist es ein neues Feld: nicht verbinden.
  const view = text.replace(/(?<![\n\uE000])\n(?!\n|[ \t]{0,8}\p{L}[\p{L}\p{N} .\/-]{0,30}:)/gu, " ");
  if (view === text) return [];
  return [
    ...detectManual(view, options.manual),
    ...detectEmails(view),
    ...detectCreditCards(view),
    ...detectVatIds(view),
    ...detectTaxNumbers(view),
    ...detectByContext(view),
    ...detectPhones(view),
    ...detectPersons(view),
  ];
}

export function detectAll(text: string, options: DetectOptions = {}): Finding[] {
  const excluded = new Set((options.excluded ?? []).map((v) => v.trim().toLowerCase()));
  const raw = [
    ...detectAcrossLines(text, options),
    ...detectManual(text, options.manual),
    ...detectEmails(text),
    ...detectIbans(text),
    ...detectCreditCards(text),
    ...detectVatIds(text),
    ...detectTaxNumbers(text),
    ...detectByContext(text),
    ...detectHandles(text),
    ...detectEncoded(text),
    ...detectPhones(text),
    ...detectTables(text),
    ...detectCompanies(text, options.companies),
    ...detectAddresses(text),
    ...detectPersons(text),
    ...detectHealth(text),
    ...detectReligion(text),
  ].filter((f) => f.value.trim() !== "" && !excluded.has(f.value.trim().toLowerCase()));
  return splitAtSegments(text, mergeAdjacentAddresses(text, resolveOverlaps(text, raw)));
}
