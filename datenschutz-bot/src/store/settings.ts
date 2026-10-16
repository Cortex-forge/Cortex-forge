import fs from "node:fs";
import path from "node:path";
import type { Konto } from "../core/accounting.js";
import type { EigeneFirma } from "../core/invoice.js";
import type { CompanyEntry } from "../core/types.js";

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function loadCompanies(configDir: string): CompanyEntry[] {
  return readJson<{ firmen?: CompanyEntry[] }>(path.join(configDir, "firmen.json"), {}).firmen ?? [];
}

export function loadOwnCompany(configDir: string): EigeneFirma {
  const data = readJson<Partial<EigeneFirma>>(path.join(configDir, "firma.json"), {});
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
  return readJson<{ konten?: Konto[] }>(path.join(configDir, "kontenplan.json"), {}).konten ?? [];
}
