import { detectAll, escapeRegExp, normalizeValue } from "./detectors.js";
import { DETERMINERS, LOWERCASE_STOPWORDS, NOT_SURNAME, NOUN_SURNAMES } from "./names.js";
import { formatPlaceholder, placeholderId, placeholderRegex } from "./placeholders.js";
import type {
  DetectOptions,
  EntityType,
  Finding,
  MappingEntry,
  PlaceholderInfo,
  PseudonymizeResult,
} from "./types.js";

export { formatPlaceholder } from "./placeholders.js";

/** Was die KI über die Platzhalter wissen darf: Typ und Kategorie, nie das Original. */
export function placeholderLegend(mapping: MappingEntry[]): PlaceholderInfo[] {
  return mapping.map(({ id, type, description }) => (description ? { id, type, description } : { id, type }));
}

const PARTICLES = new Set(["von", "van", "vom", "der", "den", "dem", "de", "la", "di", "da", "del", "della", "degli", "dos", "du", "ten", "ter", "zu", "und"]);

/** Teile eines Namens, die auch allein auf die Person verweisen ("Huber" aus "Anna Huber"). */
function nameParts(name: string): string[] {
  return name.split(/[\s,]+/).filter((t) => {
    if (t.length < 3 || PARTICLES.has(t.toLowerCase())) return false;
    if (/^\p{Lu}/u.test(t)) return !NOT_SURNAME.has(t);
    // Kleingeschriebene Namen aus lockeren Texten ("steffi", "lechner")
    return t.length >= 4 && /^\p{Ll}+$/u.test(t) && !LOWERCASE_STOPWORDS.has(t);
  });
}

interface Owner {
  full: string;
  nachname?: string;
  ambiguous?: boolean;
}

/**
 * Personen sollen überall denselben Platzhalter bekommen: "Anna Huber", später "Frau Huber" und "Anna" werden alle
 * zu [PERSON_1]. Dazu werden einzelne Namensteile den vollen Namen zugeordnet und weitere Vorkommen im Text
 * nachgezogen. Ausnahmen ("nicht sensibel") gelten auch hier. Nach einem Artikel bleiben Namen, die auch
 * Hauptwörter sind, stehen ("an euren Koch", "auf den Berg").
 */
function propagatePersons(text: string, findings: Finding[], options: DetectOptions): Finding[] {
  const excluded = new Set((options.excluded ?? []).map((v) => v.trim().toLowerCase()));
  const owners = new Map<string, Owner>();
  for (const p of findings) {
    if (p.type !== "PERSON") continue;
    const full = (p.canonical ?? p.value).trim().replace(/\s+/g, " ");
    for (const part of nameParts(full)) {
      if (excluded.has(part.toLowerCase())) continue;
      const prev = owners.get(part);
      if (!prev) {
        owners.set(part, p.nachname ? { full, nachname: p.nachname } : { full });
        continue;
      }
      const a = prev.full.toLowerCase();
      const b = full.toLowerCase();
      if (a === b) continue;
      // "Huber" und später "Anna Huber": der längere Name gewinnt. Zwei verschiedene Namen: nicht eindeutig.
      if (b.includes(a)) owners.set(part, { full, ...(p.nachname || prev.nachname ? { nachname: p.nachname ?? prev.nachname } : {}) });
      else if (!a.includes(b)) prev.ambiguous = true;
    }
  }

  const canonicalFor = (value: string): Owner | undefined => {
    const owner = owners.get(value);
    return owner && !owner.ambiguous && owner.full.toLowerCase() !== value.toLowerCase() ? owner : undefined;
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

  const variants = new Map<string, string>();
  for (const part of owners.keys()) {
    variants.set(part, part);
    if (/^\p{Lu}/u.test(part)) variants.set(part.toUpperCase(), part);
  }
  const alt = [...variants.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  const re = new RegExp(String.raw`(?<![\p{L}\p{N}_'’-])(?:${alt})(?![\p{L}\p{N}_'’-])`, "gu");

  const extra: Finding[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index;
    const end = start + m[0].length;
    if (covered.subarray(start, end).some((c) => c === 1)) continue;
    const part = variants.get(m[0]) ?? m[0];
    if (NOUN_SURNAMES.has(part)) {
      const prevWord = /(\p{L}+)[ \t]+$/u.exec(text.slice(Math.max(0, start - 30), start))?.[1]?.toLowerCase();
      if (prevWord && DETERMINERS.has(prevWord)) continue;
    }
    const owner = owners.get(part);
    const f: Finding = { start, end, type: "PERSON", value: m[0], source: "person:wiederholung" };
    const canon = canonicalFor(part);
    if (canon) f.canonical = canon.full;
    const nachname = canon?.nachname ?? owner?.nachname;
    if (nachname) f.nachname = nachname;
    extra.push(f);
  }
  return [...withCanonical, ...extra].sort((a, b) => a.start - b.start);
}

function keyFor(f: Finding): string {
  return `${f.type}:${normalizeValue(f.type, f.canonical ?? f.value)}`;
}

export function pseudonymize(text: string, options: DetectOptions = {}): PseudonymizeResult {
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
  const nextId = (type: EntityType): string => {
    let n = counters.get(type) ?? 0;
    do n++;
    while (literal.has(`${type}_${n}`));
    counters.set(type, n);
    return `${type}_${n}`;
  };
  const mapping: MappingEntry[] = [];

  const withIds = findings.map((f) => {
    const key = keyFor(f);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { id: nextId(f.type), type: f.type, original: (f.canonical ?? f.value).trim(), variants: [] };
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

  return { text: pieces.join(""), mapping, findings: withIds, literal: [...literal] };
}
