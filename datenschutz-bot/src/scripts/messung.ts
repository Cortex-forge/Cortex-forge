// Misst die Erkennung an einem Testset mit Lösungsblatt (Standard: testset/faelle.json).
//   Trefferquote = Anteil der sensiblen Angaben, die vollständig ersetzt wurden (Datenschutz).
//   Genauigkeit  = Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen.
// Aufruf:
//   npm run messung                                  Zusammenfassung, Bericht nach messungen/ (nicht im Repo)
//   npm run messung -- --datei testset/pruefset.json  anderes Testset messen
//   npm run messung -- --ablegen nach-korrektur       Bericht nach docs/03-qualitaet/ (zum Committen)
//   npm run messung -- --streng                       Exit-Code 1, wenn ein Ziel verfehlt wird (für den Nachweis)
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, PROJECT_ROOT } from "../config.js";
import { escapeRegExp } from "../core/detectors.js";
import { pseudonymize } from "../core/pseudonymize.js";
import { ENTITY_LABELS, isEntityType, type EntityType } from "../core/types.js";
import { loadCompanies } from "../store/settings.js";
import { loadTestset } from "./probe-lib.js";

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

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const datei = path.resolve(PROJECT_ROOT, arg("--datei") ?? path.join("testset", "faelle.json"));
const ablegen = arg("--ablegen");
const faelle = loadTestset(datei);
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
const falscherTyp: string[] = [];

for (const fall of faelle) {
  const { findings } = pseudonymize(fall.text, { companies });
  const covered = new Uint8Array(fall.text.length);
  for (const f of findings) covered.fill(1, f.start, f.end);

  // Alle Vorkommen der erwarteten Angaben, nur als ganze Wörter (nicht "Anna" in "Annahme").
  const expected: Array<{ start: number; end: number; typ: EntityType; wert: string }> = [];
  for (const s of fall.sensibel) {
    if (!isEntityType(s.typ)) throw new Error(`${fall.id}: unbekannter Typ ${s.typ}`);
    const re = new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(s.wert)}(?![\p{L}\p{N}])`, "gu");
    let found = false;
    for (const m of fall.text.matchAll(re)) {
      found = true;
      expected.push({ start: m.index, end: m.index + m[0].length, typ: s.typ, wert: s.wert });
    }
    if (!found) throw new Error(`${fall.id}: "${s.wert}" kommt im Text nicht als ganzes Wort vor`);
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
    else verpasst.push(`${fall.id} · ${ENTITY_LABELS[e.typ]} · „${e.wert}“ (${fall.beschreibung ?? fall.art})`);
  }

  // Genauigkeit: Jede Ersetzung soll eine erwartete Angabe desselben Typs treffen.
  for (const f of findings) {
    const z = zaehler(f.type);
    z.ersetzungen++;
    const hits = expected.filter((e) => f.start < e.end && e.start < f.end);
    if (hits.some((e) => e.typ === f.type)) z.richtig++;
    else if (hits.length) falscherTyp.push(`${fall.id} · ersetzt als ${ENTITY_LABELS[f.type]}, erwartet ${hits.map((e) => ENTITY_LABELS[e.typ]).join("/")} · „${f.value}“`);
    else fehlalarme.push(`${fall.id} · ${ENTITY_LABELS[f.type]} · „${f.value}“ (${f.source})`);
  }
}

const pct = (a: number, b: number) => (b === 0 ? "–" : `${(Math.round((a / b) * 1000) / 10).toLocaleString("de-AT")} %`);
const sum = (key: keyof Zaehler) => [...proTyp.values()].reduce((s, z) => s + z[key], 0);
const rows = [...proTyp.entries()].sort((a, b) => b[1].erwartet - a[1].erwartet);
const zielText = (t: EntityType, z: Zaehler) => {
  const ziel = ZIELE[t];
  if (!ziel) return "–";
  const ok =
    (z.erwartet === 0 || z.gefunden / z.erwartet >= ziel.treffer) && (z.ersetzungen === 0 || z.richtig / z.ersetzungen >= ziel.genau);
  return ok ? "erreicht" : "nicht erreicht";
};
const verfehlt = rows
  .filter(([t, z]) => zielText(t, z) === "nicht erreicht")
  .map(([t, z]) => {
    const ziel = ZIELE[t] ?? { treffer: 0, genau: 0 };
    return `${ENTITY_LABELS[t]} (Trefferquote ${pct(z.gefunden, z.erwartet)}, Ziel ${ziel.treffer * 100} %; Genauigkeit ${pct(z.richtig, z.ersetzungen)}, Ziel ${ziel.genau * 100} %)`;
  });
const zielZeile = verfehlt.length ? `Ziele nicht erreicht: ${verfehlt.join("; ")}.` : "Ziele: alle erreicht.";

const date = new Date().toISOString().slice(0, 10);
const relDatei = path.relative(PROJECT_ROOT, datei);
const report = [
  `# Messung der Erkennung · ${date}${ablegen ? ` · ${ablegen}` : ""}`,
  "",
  `Testset: \`${relDatei}\` (${faelle.length} erfundene Fälle, davon ${faelle.filter((f) => f.sensibel.length === 0).length} ohne sensible Angaben). Gemessen mit \`npm run messung\`.`,
  "",
  "**Trefferquote:** Anteil der sensiblen Angaben, die vollständig ersetzt wurden. **Genauigkeit:** Anteil der Ersetzungen, die eine sensible Angabe desselben Typs treffen. Erwartete Werte zählen nur als ganze Wörter.",
  "",
  "| Datenart | Erwartet | Ersetzt | Trefferquote | Ersetzungen | davon richtig | Genauigkeit | Ziel |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map(
    ([t, z]) =>
      `| ${ENTITY_LABELS[t]} | ${z.erwartet} | ${z.gefunden} | ${pct(z.gefunden, z.erwartet)} | ${z.ersetzungen} | ${z.richtig} | ${pct(z.richtig, z.ersetzungen)} | ${zielText(t, z)} |`,
  ),
  `| **Gesamt** | ${sum("erwartet")} | ${sum("gefunden")} | ${pct(sum("gefunden"), sum("erwartet"))} | ${sum("ersetzungen")} | ${sum("richtig")} | ${pct(sum("richtig"), sum("ersetzungen"))} | |`,
  "",
  `**${zielZeile}**`,
  "",
  `## Übersehen (${verpasst.length})`,
  "",
  ...(verpasst.length ? verpasst.map((v) => `- ${v}`) : ["Nichts übersehen."]),
  "",
  `## Fehlalarme (${fehlalarme.length})`,
  "",
  ...(fehlalarme.length ? fehlalarme.map((v) => `- ${v}`) : ["Keine Fehlalarme."]),
  "",
  `## Geschützt, aber mit falschem Typ (${falscherTyp.length})`,
  "",
  ...(falscherTyp.length ? falscherTyp.map((v) => `- ${v}`) : ["Keine."]),
  "",
].join("\n");

const outDir = ablegen ? path.join(PROJECT_ROOT, "docs", "03-qualitaet") : path.join(PROJECT_ROOT, "messungen");
fs.mkdirSync(outDir, { recursive: true });
const label = ablegen ? `-${ablegen.replace(/[^a-z0-9-]/gi, "")}` : `-${path.basename(datei, ".json")}`;
const outFile = path.join(outDir, `${date}-messung${label}.md`);
fs.writeFileSync(outFile, report);

console.log(
  `Trefferquote ${pct(sum("gefunden"), sum("erwartet"))} (${sum("gefunden")}/${sum("erwartet")}), ` +
    `Genauigkeit ${pct(sum("richtig"), sum("ersetzungen"))} (${sum("richtig")}/${sum("ersetzungen")}), ` +
    `${verpasst.length} übersehen, ${fehlalarme.length} Fehlalarme, ${falscherTyp.length} mit falschem Typ.`,
);
console.log(zielZeile);
console.log(`Bericht: ${path.relative(PROJECT_ROOT, outFile)}`);
if (process.argv.includes("--streng") && verfehlt.length) process.exitCode = 1;
