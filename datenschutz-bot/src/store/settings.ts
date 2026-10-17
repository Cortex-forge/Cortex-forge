import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Konto } from "../core/accounting.js";
import type { EigeneFirma } from "../core/invoice.js";
import { ENTITY_TYPES, type CompanyEntry, type DocumentTemplate, type EntityType } from "../core/types.js";

/** Fehler in einer Konfigurationsdatei. Der Bot bricht dann ab, statt still weniger zu schützen. */
export class ConfigError extends Error {}

/** Liest eine JSON-Datei. Nur eine fehlende Datei gilt als leer; Syntax- und Formatfehler brechen ab. */
function readConfig<T>(file: string, schema: z.ZodType<T>, empty: T): T {
  if (!fs.existsSync(file)) return empty;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new ConfigError(`Die Datei ${path.basename(file)} ist kein gültiges JSON: ${(err as Error).message}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (bei ${issue.path.join(".")})` : "";
    throw new ConfigError(`Die Datei ${path.basename(file)} ist fehlerhaft${where}: ${issue?.message ?? "unbekannter Fehler"}`);
  }
  return parsed.data;
}

const firmenSchema = z.object({
  firmen: z
    .array(
      z.object({
        name: z.string().min(1),
        kategorie: z.string().optional(),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});

const firmaSchema = z.object({
  name: z.string().optional(),
  adresse: z.string().optional(),
  uid: z.string().optional(),
  firmenbuch: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  telefon: z.string().optional(),
  email: z.string().optional(),
});

// Kontonummern sind Ziffern ("7200", auch "3300.1" oder "3300/01"). Ersetzt werden nur die Bezeichnungen: Eine Kennung
// wie eine Mailadresse käme sonst unverändert zur KI (Review Codex 4 #8).
const KONTONUMMER_RE = /^\d[\d./-]{0,11}$/;

const kontenSchema = z.object({
  konten: z
    .array(
      z.object({
        nummer: z.string().regex(KONTONUMMER_RE, "Kontonummern bestehen nur aus Ziffern, auch mit Punkt, Schrägstrich oder Bindestrich (z. B. 7200)"),
        name: z.string(),
      }),
    )
    .default([]),
});

export function loadCompanies(configDir: string): CompanyEntry[] {
  const { firmen } = readConfig(path.join(configDir, "firmen.json"), firmenSchema, { firmen: [] });
  return firmen.map((f) => ({
    name: f.name,
    ...(f.kategorie ? { kategorie: f.kategorie } : {}),
    ...(f.aliases ? { aliases: f.aliases } : {}),
  }));
}

export function loadOwnCompany(configDir: string): EigeneFirma {
  const data = readConfig(path.join(configDir, "firma.json"), firmaSchema, {});
  return {
    name: data.name ?? "Eigener Betrieb",
    adresse: data.adresse ?? "",
    uid: data.uid ?? "",
    ...(data.firmenbuch ? { firmenbuch: data.firmenbuch } : {}),
    ...(data.iban ? { iban: data.iban } : {}),
    ...(data.bic ? { bic: data.bic } : {}),
    ...(data.telefon ? { telefon: data.telefon } : {}),
    ...(data.email ? { email: data.email } : {}),
  };
}

export function loadAccounts(configDir: string): Konto[] {
  return readConfig(path.join(configDir, "kontenplan.json"), kontenSchema, { konten: [] }).konten;
}

// Vorlagen für feste Dokumente (ADR-007), je Firma und Dokumentart eine Datei in config/vorlagen/.
const FIELD_TYPES = [...ENTITY_TYPES, "FREITEXT"] as [EntityType | "FREITEXT", ...Array<EntityType | "FREITEXT">];
const vorlageSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "Die Kennung (id) besteht aus Kleinbuchstaben, Ziffern und Bindestrichen"),
  name: z.string().min(1),
  erkennen: z.array(z.string().trim().min(3, "Ein Erkennungsmerkmal braucht mindestens 3 Zeichen")).min(1, "Mindestens ein Erkennungsmerkmal"),
  felder: z
    .array(
      z.object({
        bezeichnung: z.string().trim().min(2),
        typ: z.enum(FIELD_TYPES),
        zeilen: z.number().int().min(1).max(10).optional(),
        pflicht: z.boolean().optional(),
      }),
    )
    .min(1, "Mindestens ein Feld"),
  unveraendert: z.array(z.string().min(3)).optional(),
});

export function loadTemplates(configDir: string): DocumentTemplate[] {
  const dir = path.join(configDir, "vorlagen");
  if (!fs.existsSync(dir)) return [];
  const templates: DocumentTemplate[] = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const t = readConfig(path.join(dir, name), vorlageSchema, null as never);
    if (templates.some((x) => x.id === t.id)) throw new ConfigError(`Die Vorlage „${t.id}“ gibt es doppelt (${name}).`);
    templates.push({
      id: t.id,
      name: t.name,
      erkennen: t.erkennen,
      felder: t.felder.map((f) => ({
        bezeichnung: f.bezeichnung,
        typ: f.typ,
        ...(f.zeilen !== undefined ? { zeilen: f.zeilen } : {}),
        ...(f.pflicht !== undefined ? { pflicht: f.pflicht } : {}),
      })),
      ...(t.unveraendert ? { unveraendert: t.unveraendert } : {}),
    });
  }
  return templates;
}
