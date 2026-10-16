// Misst die Erkennung am Testset mit Lösungsblatt (testset/faelle.json):
// Trefferquote = Anteil der sensiblen Angaben, die vollständig ersetzt wurden,
// Genauigkeit = Anteil der Ersetzungen, die wirklich sensibel waren.
// Schreibt einen Bericht nach docs/03-qualitaet/ und gibt eine Zusammenfassung aus.
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, PROJECT_ROOT } from "../config.js";
import { pseudonymize } from "../core/pseudonymize.js";
import { ENTITY_LABELS, isEntityType, type EntityType } from "../core/types.js";
import { loadCompanies } from "../store/settings.js";

interface Fall {
  id: string;
  art: string;
  sprache: string;
  beschreibung: string;
  text: string;
  sensibel: Array<{ wert: string; typ: string }>;
}

// Ziele aus docs/03-qualitaet/testkonzept.md
const ZIELE: Partial<Record<EntityType, { treffer: number; genau: number }>> = {
  EMAIL: { treffer: 1, genau: 0.98 },
  IBAN: { treffer: 1, genau: 0.98 },
  KREDITKARTE: { treffer: 1, genau: 0.98 },
  UID: { treffer: 1, genau: 0.98 },
  TELEFON: { treffer: 0.98, genau: 0.95 },
  ADRESSE: { treffer: 0.98, genau: 0.95 },
  PERSON: { treffer: 0.95, genau: 0.9 },
  GESUNDHEIT: { treffer: 0.95, genau: 0.85 },
  RELIGION: { treffer: 0.95, genau: 0.85 },
};

const file = path.join(PROJECT_ROOT, "testset", "faelle.json");
const { faelle } = JSON.parse(fs.readFileSync(file, "utf8")) as { faelle: Fall[] };
const companies = loadCompanies(CONFIG_DIR);

interface Zaehler {
  erwartet: number;
  gefunden: number;
  ersetzungen: number;
  richtig: number;
}
const proTyp = new Map<EntityType, Zaehler>();
const zaehler = (t: EntityType) => {
  let z = proTyp.get(t);
  if (!z) proTyp.set(t, (z = { erwartet: 0, gefunden: 0, ersetzungen: 0, richtig: 0 }));
  return z;
};
const verpasst: string[] = [];
const fehlalarme: string[] = [];

for (const fall of faelle) {
  const { findings } = pseudonymize(fall.text, { companies });
  const covered = new Uint8Array(fall.text.length);
  for (const f of findings) covered.fill(1, f.start, f.end);

  // Alle Vorkommen der erwarteten Angaben im Text.
  const expected: Array<{ start: number; end: number; typ: EntityType; wert: string }> = [];
  for (const s of fall.sensibel) {
    if (!isEntityType(s.typ)) throw new Error(`${fall.id}: unbekannter Typ ${s.typ}`);
    let from = 0;
    let found = false;
    for (;;) {
      const i = fall.text.indexOf(s.wert, from);
      if (i === -1) break;
      found = true;
      expected.push({ start: i, end: i + s.wert.length, typ: s.typ, wert: s.wert });
      from = i + s.wert.length;
    }
    if (!found) throw new Error(`${fall.id}: "${s.wert}" kommt im Text nicht vor`);
  }

  // Trefferquote: Jedes Vorkommen muss vollständig ersetzt sein (Leerzeichen und Satzzeichen zählen nicht).
  for (const e of expected) {
    const z = zaehler(e.typ);
    z.erwartet++;
    let ok = true;
    for (let i = e.start; i < e.end; i++) {
      if (!covered[i] && /[\p{L}\p{N}@]/u.test(fall.text[i] ?? "")) {
        ok = false;
        break;
      }
    }
    if (ok) z.gefunden++;
    else verpasst.push(`${fall.id} · ${ENTITY_LABELS[e.typ]} · „${e.wert}“ (${fall.beschreibung})`);
  }

  // Genauigkeit: Jede Ersetzung sollte eine erwartete Angabe treffen.
  for (const f of findings) {
    const z = zaehler(f.type);
    z.ersetzungen++;
    if (expected.some((e) => f.start < e.end && e.start < f.end)) z.richtig++;
    else fehlalarme.push(`${fall.id} · ${ENTITY_LABELS[f.type]} · „${f.value}“ (${f.source})`);
  }
}

const pct = (a: number, b: number) => (b === 0 ? "–" : `${Math.round((a / b) * 1000) / 10} %`);
const sum = (key: keyof Zaehler) => [...proTyp.values()].reduce((s, z) => s + z[key], 0);
const rows = [...proTyp.entries()].sort((a, b) => b[1].erwartet - a[1].erwartet);
const zielText = (t: EntityType, z: Zaehler) => {
  const ziel = ZIELE[t];
  if (!ziel) return "–";
  const ok = (z.erwartet === 0 || z.gefunden / z.erwartet >= ziel.treffer) && (z.ersetzungen === 0 || z.richtig / z.ersetzungen >= ziel.genau);
  return ok ? "erreicht" : "nicht erreicht";
};

const date = new Date().toISOString().slice(0, 10);
const report = [
  `# Messung der Erkennung · ${date}`,
  "",
  `Testset: \`testset/faelle.json\` (${faelle.length} erfundene Fälle, davon ${faelle.filter((f) => f.sensibel.length === 0).length} ohne sensible Angaben). Gemessen mit \`npm run messung\`.`,
  "",
  "**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die wirklich sensibel waren.",
  "",
  "| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map(
    ([t, z]) =>
      `| ${ENTITY_LABELS[t]} | ${z.erwartet} | ${z.gefunden} | ${pct(z.gefunden, z.erwartet)} | ${z.ersetzungen} | ${z.richtig} | ${pct(z.richtig, z.ersetzungen)} | ${zielText(t, z)} |`,
  ),
  `| **Gesamt** | ${sum("erwartet")} | ${sum("gefunden")} | ${pct(sum("gefunden"), sum("erwartet"))} | ${sum("ersetzungen")} | ${sum("richtig")} | ${pct(sum("richtig"), sum("ersetzungen"))} | |`,
  "",
  `## Übersehen (${verpasst.length})`,
  "",
  ...(verpasst.length ? verpasst.map((v) => `- ${v}`) : ["Nichts übersehen."]),
  "",
  `## Fehlalarme (${fehlalarme.length})`,
  "",
  ...(fehlalarme.length ? fehlalarme.map((v) => `- ${v}`) : ["Keine Fehlalarme."]),
  "",
].join("\n");

const outDir = path.join(PROJECT_ROOT, "docs", "03-qualitaet");
fs.mkdirSync(outDir, { recursive: true });
const label = process.argv[2] ? `-${process.argv[2].replace(/[^a-z0-9-]/gi, "")}` : "";
const outFile = path.join(outDir, `${date}-messung${label}.md`);
fs.writeFileSync(outFile, report);

console.log(
  `Trefferquote ${pct(sum("gefunden"), sum("erwartet"))} (${sum("gefunden")}/${sum("erwartet")}), ` +
    `Genauigkeit ${pct(sum("richtig"), sum("ersetzungen"))} (${sum("richtig")}/${sum("ersetzungen")}), ` +
    `${verpasst.length} übersehen, ${fehlalarme.length} Fehlalarme.`,
);
console.log(`Bericht: ${path.relative(PROJECT_ROOT, outFile)}`);
