import { detectAll, normalizeValue } from "./detectors.js";
import type {
  DetectOptions,
  EntityType,
  Finding,
  MappingEntry,
  PlaceholderInfo,
  PseudonymizeResult,
} from "./types.js";

export function formatPlaceholder(entry: { id: string; description?: string }): string {
  return entry.description ? `[${entry.id}: ${entry.description}]` : `[${entry.id}]`;
}

/** Was die KI über die Platzhalter wissen darf: Typ und Kategorie, nie das Original. */
export function placeholderLegend(mapping: MappingEntry[]): PlaceholderInfo[] {
  return mapping.map(({ id, type, description }) => (description ? { id, type, description } : { id, type }));
}

function personTokens(name: string): string[] {
  return name.split(/[ \t]+/).filter((t) => t.length >= 3 && /^\p{Lu}/u.test(t));
}

/**
 * Personen sollen überall denselben Platzhalter bekommen: "Anna Huber", später "Frau Huber"
 * und "Anna" werden alle zu [PERSON_1]. Dazu werden einzelne Namensteile der vollen Namen
 * zugeordnet und weitere Vorkommen im Text nachgezogen.
 */
function propagatePersons(text: string, findings: Finding[]): Finding[] {
  const persons = findings.filter((f) => f.type === "PERSON");
  const fullNames: string[] = [];
  for (const p of persons) {
    const name = p.value.trim();
    if (name.includes(" ") && !fullNames.some((n) => n.toLowerCase() === name.toLowerCase())) fullNames.push(name);
  }

  const tokenOwner = new Map<string, string>();
  for (const full of fullNames) {
    for (const token of personTokens(full)) if (!tokenOwner.has(token)) tokenOwner.set(token, full);
  }

  const withCanonical = findings.map((f) => {
    if (f.type !== "PERSON") return f;
    const value = f.value.trim();
    if (value.includes(" ")) return f;
    const owner = tokenOwner.get(value);
    return owner ? { ...f, canonical: owner } : f;
  });

  // Weitere Vorkommen der Namensteile, die noch nicht erfasst sind.
  const extra: Finding[] = [];
  for (const [token, owner] of tokenOwner) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "gu");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const covered = [...withCanonical, ...extra].some((f) => start < f.end && f.start < end);
      if (!covered) {
        extra.push({ start, end, type: "PERSON", value: m[0], source: "person:wiederholung", canonical: owner });
      }
    }
  }
  return [...withCanonical, ...extra].sort((a, b) => a.start - b.start);
}

function keyFor(f: Finding): string {
  return `${f.type}:${normalizeValue(f.type, f.canonical ?? f.value)}`;
}

export function pseudonymize(text: string, options: DetectOptions = {}): PseudonymizeResult {
  const findings = propagatePersons(text, detectAll(text, options));

  const byKey = new Map<string, MappingEntry>();
  const counters = new Map<EntityType, number>();
  const mapping: MappingEntry[] = [];

  const withIds = findings.map((f) => {
    const key = keyFor(f);
    let entry = byKey.get(key);
    if (!entry) {
      const n = (counters.get(f.type) ?? 0) + 1;
      counters.set(f.type, n);
      entry = { id: `${f.type}_${n}`, type: f.type, original: (f.canonical ?? f.value).trim(), variants: [] };
      if (f.description) entry.description = f.description;
      byKey.set(key, entry);
      mapping.push(entry);
    }
    if (!entry.variants.includes(f.value)) entry.variants.push(f.value);
    return { ...f, id: entry.id };
  });

  const byId = new Map(mapping.map((e) => [e.id, e]));
  let out = text;
  for (const f of [...withIds].sort((a, b) => b.start - a.start)) {
    const entry = byId.get(f.id);
    if (!entry) continue;
    out = out.slice(0, f.start) + formatPlaceholder(entry) + out.slice(f.end);
  }

  return { text: out, mapping, findings: withIds };
}
