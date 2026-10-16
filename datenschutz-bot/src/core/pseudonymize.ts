import { detectAll, normalizeValue } from "./detectors.js";
import { COMMON_LOWERCASE_WORDS, DETERMINERS, LOWERCASE_STOPWORDS, NOT_SURNAME, NOUN_SURNAMES } from "./names.js";
import { formatPlaceholder, placeholderId, placeholderRegex } from "./placeholders.js";
import { PARTICLE_WORDS } from "./salutations.js";
import type {
  DetectOptions,
  EntityType,
  Finding,
  MappingEntry,
  PlaceholderInfo,
  PseudonymizeOptions,
  PseudonymizeResult,
} from "./types.js";

export { formatPlaceholder } from "./placeholders.js";

/** Was die KI über die Platzhalter wissen darf: Typ und Kategorie, nie das Original. */
export function placeholderLegend(mapping: MappingEntry[]): PlaceholderInfo[] {
  return mapping.map(({ id, type, description }) => (description ? { id, type, description } : { id, type }));
}


function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Teile eines Namens, die auch allein auf die Person verweisen ("Huber" aus "Anna Huber" oder "ANNA HUBER"). */
function nameParts(name: string): string[] {
  return name.split(/[\s,]+/).filter((t) => {
    if (t.length < 2 || PARTICLE_WORDS.has(t.toLowerCase())) return false;
    // Kurze Nachnamen ("Herr Wu"): nur in der Form "Wu", nie als Allerweltswort ("Am", "In", "So").
    if (t.length === 2) return /^\p{Lu}\p{Ll}$/u.test(t) && !NOT_SURNAME.has(t) && !LOWERCASE_STOPWORDS.has(t.toLowerCase());
    if (/^\p{Lu}/u.test(t)) return !NOT_SURNAME.has(t) && !NOT_SURNAME.has(titleCase(t));
    // Kleingeschriebene Namen aus lockeren Texten ("steffi", "lechner")
    return t.length >= 4 && /^\p{Ll}+$/u.test(t) && !LOWERCASE_STOPWORDS.has(t);
  });
}

interface Owner {
  full: string;
  nachname?: string;
  ambiguous?: boolean;
  /** Der Name stand selbst kleingeschrieben im Text ("steffi lechner"). */
  lowercase?: boolean;
}

/** Der Nachname eines vollen Namens: gespeichert bei der Erkennung, sonst der letzte Teil. */
function surnameKey(owner: Owner): string {
  return (owner.nachname ?? owner.full.split(/[\s,]+/).filter(Boolean).pop() ?? owner.full).toLowerCase();
}

/**
 * Personen sollen überall denselben Platzhalter bekommen: "Anna Huber", später "Frau Huber", "HUBER" und "Anna"
 * werden alle zu [PERSON_1]. Dazu werden einzelne Namensteile den vollen Namen zugeordnet und weitere Vorkommen im
 * Text nachgezogen, unabhängig von Groß- und Kleinschreibung. Ausnahmen ("nicht sensibel") gelten auch hier.
 * Stehen bleiben: Namen, die auch Hauptwörter sind, nach einem Artikel ("an euren Koch", "auf den Berg"), und
 * kleingeschriebene Alltagswörter ("Peter Klein" – "ein klein wenig").
 */
function propagatePersons(text: string, findings: Finding[], options: DetectOptions): Finding[] {
  const excluded = new Set((options.excluded ?? []).map((v) => v.trim().toLowerCase()));
  // Schlüssel: Namensteil in Kleinbuchstaben
  const owners = new Map<string, Owner>();
  for (const p of findings) {
    if (p.type !== "PERSON") continue;
    const full = (p.canonical ?? p.value).trim().replace(/\s+/g, " ");
    for (const part of nameParts(full)) {
      const key = part.toLowerCase();
      if (excluded.has(key)) continue;
      const lowercase = part === key;
      const prev = owners.get(key);
      if (!prev) {
        owners.set(key, { full, ...(p.nachname ? { nachname: p.nachname } : {}), ...(lowercase ? { lowercase } : {}) });
        continue;
      }
      if (lowercase) prev.lowercase = true;
      const a = prev.full.toLowerCase();
      const b = full.toLowerCase();
      if (a === b) continue;
      // "Huber" und später "Anna Huber": der längere Name gewinnt. Zwei verschiedene Namen: nicht eindeutig.
      if (b.includes(a)) {
        owners.set(key, {
          full,
          ...(p.nachname || prev.nachname ? { nachname: p.nachname ?? prev.nachname } : {}),
          ...(prev.lowercase ? { lowercase: true } : {}),
        });
      } else if (!a.includes(b)) prev.ambiguous = true;
    }
  }

  // Nur der Nachname verweist sicher auf den vollen Namen ("Frau Huber" = "Anna Huber"). Ein Vorname allein kann
  // eine andere Person sein ("unser Sohn Thomas" und "Thomas Müller" an der Rezeption): eigener Platzhalter.
  const canonicalFor = (value: string): Owner | undefined => {
    const key = value.toLowerCase();
    const owner = owners.get(key);
    if (!owner || owner.ambiguous || owner.full.toLowerCase() === key) return undefined;
    return surnameKey(owner).split(/[\s-]+/).includes(key) || surnameKey(owner) === key ? owner : undefined;
  };

  const withCanonical = findings.map((f) => {
    if (f.type !== "PERSON" || f.canonical) return f;
    const owner = canonicalFor(f.value.trim());
    if (!owner) return f;
    return { ...f, canonical: owner.full, ...(owner.nachname && !f.nachname ? { nachname: owner.nachname } : {}) };
  });

  if (owners.size === 0) return withCanonical;
  const covered = new Uint8Array(text.length);
  for (const f of withCanonical) covered.fill(1, f.start, f.end);

  // Ein Durchgang über alle Wörter, jedes wird nachgeschlagen (lineare Laufzeit, auch bei vielen Namen).
  const extra: Finding[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}_'’-]+/gu)) {
    const key = m[0].toLowerCase();
    const owner = owners.get(key);
    if (!owner) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (covered.subarray(start, end).some((c) => c === 1)) continue;
    // Kleingeschrieben: nur, wenn der Name auch so im Text stand oder kein Alltagswort ist.
    if (m[0] === key && !owner.lowercase && (key.length < 4 || LOWERCASE_STOPWORDS.has(key) || COMMON_LOWERCASE_WORDS.has(key))) continue;
    if (NOUN_SURNAMES.has(titleCase(key))) {
      const prevWord = /(\p{L}+)[ \t]+$/u.exec(text.slice(Math.max(0, start - 30), start))?.[1]?.toLowerCase();
      if (prevWord && DETERMINERS.has(prevWord)) continue;
    }
    const f: Finding = { start, end, type: "PERSON", value: m[0], source: "person:wiederholung" };
    const canon = canonicalFor(key);
    if (canon) f.canonical = canon.full;
    const nachname = canon?.nachname ?? owner.nachname;
    if (nachname) f.nachname = nachname;
    extra.push(f);
  }
  return [...withCanonical, ...extra].sort((a, b) => a.start - b.start);
}

function keyFor(f: Finding): string {
  return `${f.type}:${normalizeValue(f.type, f.canonical ?? f.value)}`;
}

export function pseudonymize(text: string, options: PseudonymizeOptions = {}): PseudonymizeResult {
  const findings = propagatePersons(text, detectAll(text, options), options);

  // Platzhalter, die schon im Original sichtbar stehen ("Vorlage [PERSON_1]"), werden nicht neu vergeben.
  const covered = new Uint8Array(text.length);
  for (const f of findings) covered.fill(1, f.start, f.end);
  const literal = new Set<string>();
  for (const m of text.matchAll(placeholderRegex())) {
    if (covered[m.index]) continue;
    literal.add(placeholderId(m[1] ?? m[3] ?? "", m[2] ?? m[4] ?? ""));
  }

  const byKey = new Map<string, MappingEntry>();
  const counters = new Map<EntityType, number>();
  // Stabile Nummern: Was schon eine Nummer hatte, behält sie. Neue Angaben bekommen eine Nummer, die in diesem
  // Dokument noch nie vergeben war (auch nicht an eine inzwischen verworfene Angabe).
  const assigned: Record<string, string> = { ...(options.assigned ?? {}) };
  const taken = new Set<string>([...literal, ...Object.values(assigned)]);
  const nextId = (type: EntityType): string => {
    let n = counters.get(type) ?? 0;
    do n++;
    while (taken.has(`${type}_${n}`));
    counters.set(type, n);
    taken.add(`${type}_${n}`);
    return `${type}_${n}`;
  };
  const idFor = (key: string, type: EntityType): string => {
    const known = assigned[key];
    if (known && known.startsWith(`${type}_`) && !literal.has(known)) return known;
    const id = nextId(type);
    assigned[key] = id;
    return id;
  };
  const mapping: MappingEntry[] = [];

  const withIds = findings.map((f) => {
    const key = keyFor(f);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { id: idFor(key, f.type), type: f.type, original: (f.canonical ?? f.value).trim(), variants: [] };
      if (f.description) entry.description = f.description;
      byKey.set(key, entry);
      mapping.push(entry);
    }
    if (f.nachname && !entry.nachname) entry.nachname = f.nachname.trim();
    if (!entry.variants.includes(f.value)) entry.variants.push(f.value);
    return { ...f, id: entry.id };
  });

  // Ausgabe in einem Durchgang zusammensetzen (die Funde überschneiden sich nicht).
  const byId = new Map(mapping.map((e) => [e.id, e]));
  const pieces: string[] = [];
  let pos = 0;
  for (const f of withIds) {
    const entry = byId.get(f.id);
    // Darf nicht vorkommen; lieber abbrechen als einen Teil im Klartext lassen.
    if (!entry || f.start < pos) throw new Error("Interner Fehler: überlappende Fundstellen.");
    pieces.push(text.slice(pos, f.start), formatPlaceholder(entry));
    pos = f.end;
  }
  pieces.push(text.slice(pos));

  return { text: pieces.join(""), mapping, findings: withIds, literal: [...literal], assigned };
}
