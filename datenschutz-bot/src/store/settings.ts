import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Konto } from "../core/accounting.js";
import type { EigeneFirma } from "../core/invoice.js";
import type { CompanyEntry } from "../core/types.js";

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

const kontenSchema = z.object({
  konten: z.array(z.object({ nummer: z.string().min(1), name: z.string() })).default([]),
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
