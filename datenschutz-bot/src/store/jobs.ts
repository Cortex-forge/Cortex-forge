import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, DATA_DIR } from "../config.js";
import {
  computeBookings,
  type BuchungBerechnet,
  type BuchungKi,
  type BuchungsSummen,
  type Konto,
} from "../core/accounting.js";
import {
  computeInvoice,
  invoiceChecks,
  renderInvoiceHtml,
  type RechnungInhalt,
  type RechnungsSummen,
} from "../core/invoice.js";
import { placeholderLegend, pseudonymize } from "../core/pseudonymize.js";
import { reidentify, type InventedData } from "../core/reidentify.js";
import type { EntityType, ManualMark, MappingEntry, PlaceholderInfo } from "../core/types.js";
import { decrypt, encrypt, loadOrCreateKey } from "../core/vault.js";
import { loadAccounts, loadCompanies, loadOwnCompany } from "./settings.js";

export const ARTEN = ["hotel", "buchhaltung", "allgemein"] as const;
export type JobArt = (typeof ARTEN)[number];
export type JobStatus = "neu" | "bereit" | "zur_pruefung" | "freigegeben" | "abgeschlossen";
export type Quelle = "oberflaeche" | "ki" | "system";

export const ART_LABELS: Record<JobArt, string> = {
  hotel: "Hotel-Anfrage",
  buchhaltung: "Buchhaltung",
  allgemein: "Allgemein",
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  neu: "Prüfen",
  bereit: "Bereit für KI",
  zur_pruefung: "Ergebnis prüfen",
  freigegeben: "Freigegeben",
  abgeschlossen: "Abgeschlossen",
};

/** Ergebnis, wie die KI es liefert: nur Platzhalter. */
export type ErgebnisKi =
  | { art: "text"; titel?: string; text: string }
  | { art: "buchungen"; buchungen: BuchungKi[] }
  | { art: "rechnung"; rechnung: RechnungInhalt };

/** Ergebnis mit echten Daten. Liegt nur verschlüsselt beim Bot. */
export type ErgebnisFertig =
  | { art: "text"; titel?: string; text: string }
  | { art: "buchungen"; buchungen: BuchungBerechnet[]; summen: BuchungsSummen }
  | { art: "rechnung"; rechnung: RechnungInhalt; summen: RechnungsSummen; html: string };

export interface Pruefung {
  unbekannt: string[];
  repariert: string[];
  nichtVerwendet: string[];
  erfunden: InventedData[];
  hinweise: string[];
}

/** So liegt ein Dokument auf der Platte. Alles außerhalb von "geheim" enthält nur Platzhalter. */
export interface StoredJob {
  id: string;
  art: JobArt;
  status: JobStatus;
  erstellt: string;
  aktualisiert: string;
  betreffKi: string;
  textKi: string;
  platzhalter: PlaceholderInfo[];
  ergebnisKi?: ErgebnisKi;
  pruefung?: Pruefung;
  rechnungsnummer?: string;
  /** AES-256-GCM-verschlüsselt: Original, Zuordnung, Markierungen, fertiges Ergebnis. */
  geheim?: string;
}

export interface Markierung {
  start: number;
  end: number;
  type: EntityType;
  id: string;
  source: string;
}

interface Geheim {
  betreff: string;
  text: string;
  manuell: ManualMark[];
  ausgeschlossen: string[];
  mapping: MappingEntry[];
  markierungen: Markierung[];
  ergebnis?: ErgebnisFertig;
}

export interface ProtokollEintrag {
  zeit: string;
  dokument: string;
  ereignis: string;
  quelle: Quelle;
}

/** Was die KI über ein Dokument erfährt. */
export interface KiDokument {
  id: string;
  art: JobArt;
  betreff: string;
  text: string;
  platzhalter: PlaceholderInfo[];
  kontenplan?: Konto[];
}

export interface JobDetail {
  job: Omit<StoredJob, "geheim">;
  original: string;
  markierungen: Markierung[];
  zuordnung: MappingEntry[];
  manuell: ManualMark[];
  ausgeschlossen: string[];
  ergebnis?: ErgebnisFertig;
}

export class JobError extends Error {}

const SEP = "\n\n";
const MAX_TEXT = 200_000;

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

function combine(betreff: string, text: string): string {
  const b = betreff.replace(/\s*\n\s*/g, " ").trim();
  return b ? b + SEP + text : text;
}

function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class JobStore {
  private readonly jobsDir: string;
  private readonly auditFile: string;
  private readonly numbersFile: string;
  private key: Buffer | null = null;

  constructor(
    readonly dataDir: string = DATA_DIR,
    readonly configDir: string = CONFIG_DIR,
  ) {
    this.jobsDir = path.join(dataDir, "dokumente");
    this.auditFile = path.join(dataDir, "protokoll.jsonl");
    this.numbersFile = path.join(dataDir, "rechnungsnummern.json");
    fs.mkdirSync(this.jobsDir, { recursive: true, mode: 0o700 });
  }

  // -------------------------------------------------------------------------
  // Grundfunktionen

  private secretKey(): Buffer {
    this.key ??= loadOrCreateKey(this.dataDir);
    return this.key;
  }

  private file(id: string): string {
    if (!/^D-[0-9a-f]{6}$/.test(id)) throw new JobError(`Unbekanntes Dokument: ${id}`);
    return path.join(this.jobsDir, `${id}.json`);
  }

  private save(job: StoredJob): void {
    job.aktualisiert = now();
    writeJsonAtomic(this.file(job.id), job);
  }

  private load(id: string): StoredJob {
    const file = this.file(id);
    if (!fs.existsSync(file)) throw new JobError(`Unbekanntes Dokument: ${id}`);
    return JSON.parse(fs.readFileSync(file, "utf8")) as StoredJob;
  }

  private openSecret(job: StoredJob): Geheim {
    if (!job.geheim) throw new JobError("Die Originaldaten dieses Dokuments wurden bereits gelöscht.");
    return JSON.parse(decrypt(this.secretKey(), job.geheim)) as Geheim;
  }

  private sealSecret(job: StoredJob, secret: Geheim): void {
    job.geheim = encrypt(this.secretKey(), JSON.stringify(secret));
  }

  private requireStatus(job: StoredJob, allowed: JobStatus[], action: string): void {
    if (!allowed.includes(job.status)) {
      throw new JobError(`${action} ist im Status "${STATUS_LABELS[job.status]}" nicht möglich.`);
    }
  }

  log(dokument: string, ereignis: string, quelle: Quelle): void {
    const entry: ProtokollEintrag = { zeit: now(), dokument, ereignis, quelle };
    fs.appendFileSync(this.auditFile, JSON.stringify(entry) + "\n", { mode: 0o600 });
  }

  protokoll(dokument?: string): ProtokollEintrag[] {
    if (!fs.existsSync(this.auditFile)) return [];
    return fs
      .readFileSync(this.auditFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ProtokollEintrag)
      .filter((e) => !dokument || e.dokument === dokument);
  }

  /** Neu pseudonymisieren, z. B. nach einer manuellen Markierung. */
  private applyPseudonymization(job: StoredJob, secret: Geheim): void {
    const result = pseudonymize(combine(secret.betreff, secret.text), {
      manual: secret.manuell,
      excluded: secret.ausgeschlossen,
      companies: loadCompanies(this.configDir),
    });
    if (secret.betreff.trim()) {
      const cut = result.text.indexOf(SEP);
      job.betreffKi = result.text.slice(0, cut);
      job.textKi = result.text.slice(cut + SEP.length);
    } else {
      job.betreffKi = "";
      job.textKi = result.text;
    }
    job.platzhalter = placeholderLegend(result.mapping);
    secret.mapping = result.mapping;
    secret.markierungen = result.findings.map(({ start, end, type, id, source }) => ({ start, end, type, id, source }));
  }

  // -------------------------------------------------------------------------
  // Oberfläche

  list(): Array<Omit<StoredJob, "geheim">> {
    return fs
      .readdirSync(this.jobsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.jobsDir, f), "utf8")) as StoredJob)
      .map(({ geheim: _geheim, ...rest }) => rest)
      .sort((a, b) => b.erstellt.localeCompare(a.erstellt));
  }

  create(input: { art: string; betreff?: string; text: string }, quelle: Quelle = "oberflaeche"): StoredJob {
    if (!(ARTEN as readonly string[]).includes(input.art)) throw new JobError(`Unbekannte Art: ${input.art}`);
    const text = input.text.replace(/\r\n/g, "\n");
    if (!text.trim()) throw new JobError("Das Dokument ist leer.");
    if (text.length > MAX_TEXT) throw new JobError("Das Dokument ist zu groß (max. 200.000 Zeichen).");
    const id = `D-${crypto.randomBytes(3).toString("hex")}`;
    const job: StoredJob = {
      id,
      art: input.art as JobArt,
      status: "neu",
      erstellt: now(),
      aktualisiert: now(),
      betreffKi: "",
      textKi: "",
      platzhalter: [],
    };
    const secret: Geheim = {
      betreff: input.betreff ?? "",
      text,
      manuell: [],
      ausgeschlossen: [],
      mapping: [],
      markierungen: [],
    };
    this.applyPseudonymization(job, secret);
    this.sealSecret(job, secret);
    this.save(job);
    this.log(id, `Dokument abgelegt, ${secret.mapping.length} Angaben durch Platzhalter ersetzt`, quelle);
    return job;
  }

  detail(id: string): JobDetail {
    const { geheim: _geheim, ...job } = this.load(id);
    if (!_geheim) return { job, original: "", markierungen: [], zuordnung: [], manuell: [], ausgeschlossen: [] };
    const secret = this.openSecret({ ...job, geheim: _geheim });
    return {
      job,
      original: combine(secret.betreff, secret.text),
      markierungen: secret.markierungen,
      zuordnung: secret.mapping,
      manuell: secret.manuell,
      ausgeschlossen: secret.ausgeschlossen,
      ...(secret.ergebnis ? { ergebnis: secret.ergebnis } : {}),
    };
  }

  /** Zusätzlich schwärzen (Text in der Oberfläche markiert). */
  mark(id: string, mark: ManualMark): StoredJob {
    const job = this.load(id);
    this.requireStatus(job, ["neu"], "Markieren");
    const secret = this.openSecret(job);
    const value = mark.value.trim();
    if (!value) throw new JobError("Leere Markierung.");
    secret.ausgeschlossen = secret.ausgeschlossen.filter((v) => v.toLowerCase() !== value.toLowerCase());
    if (!secret.manuell.some((m) => m.value === value)) secret.manuell.push({ value, type: mark.type });
    this.applyPseudonymization(job, secret);
    this.sealSecret(job, secret);
    this.save(job);
    this.log(id, `Zusätzlich geschwärzt (${mark.type})`, "oberflaeche");
    return job;
  }

  /** Eine Erkennung als "nicht sensibel" verwerfen. */
  exclude(id: string, value: string): StoredJob {
    const job = this.load(id);
    this.requireStatus(job, ["neu"], "Ausnehmen");
    const secret = this.openSecret(job);
    const v = value.trim();
    secret.manuell = secret.manuell.filter((m) => m.value !== v);
    if (!secret.ausgeschlossen.includes(v)) secret.ausgeschlossen.push(v);
    this.applyPseudonymization(job, secret);
    this.sealSecret(job, secret);
    this.save(job);
    this.log(id, "Eine Erkennung als nicht sensibel markiert", "oberflaeche");
    return job;
  }

  /** Manuelle Markierung oder Ausnahme zurücknehmen. */
  undoMark(id: string, value: string): StoredJob {
    const job = this.load(id);
    this.requireStatus(job, ["neu"], "Zurücknehmen");
    const secret = this.openSecret(job);
    secret.manuell = secret.manuell.filter((m) => m.value !== value);
    secret.ausgeschlossen = secret.ausgeschlossen.filter((v) => v !== value);
    this.applyPseudonymization(job, secret);
    this.sealSecret(job, secret);
    this.save(job);
    this.log(id, "Markierung zurückgenommen", "oberflaeche");
    return job;
  }

  releaseForAi(id: string): StoredJob {
    const job = this.load(id);
    this.requireStatus(job, ["neu"], "Freigeben für die KI");
    job.status = "bereit";
    this.save(job);
    this.log(id, "Für die KI freigegeben (nur Platzhalter-Version)", "oberflaeche");
    return job;
  }

  approve(id: string): StoredJob {
    const job = this.load(id);
    this.requireStatus(job, ["zur_pruefung"], "Freigeben");
    const secret = this.openSecret(job);
    const result = secret.ergebnis;
    if (result?.art === "rechnung") {
      // Die Nummer wird erst jetzt vergeben, damit verworfene Entwürfe keine Lücken erzeugen.
      job.rechnungsnummer = this.nextInvoiceNumber();
      result.html = renderInvoiceHtml({
        inhalt: result.rechnung,
        summen: result.summen,
        firma: loadOwnCompany(this.configDir),
        nummer: job.rechnungsnummer,
        datum: today(),
      });
      this.sealSecret(job, secret);
    }
    job.status = "freigegeben";
    this.save(job);
    this.log(
      id,
      job.rechnungsnummer ? `Freigegeben, Rechnungsnummer ${job.rechnungsnummer}` : "Ergebnis geprüft und freigegeben",
      "oberflaeche",
    );
    return job;
  }

  sendBack(id: string): StoredJob {
    const job = this.load(id);
    this.requireStatus(job, ["zur_pruefung"], "Zurückgeben");
    const secret = this.openSecret(job);
    delete secret.ergebnis;
    delete job.ergebnisKi;
    delete job.pruefung;
    this.sealSecret(job, secret);
    job.status = "bereit";
    this.save(job);
    this.log(id, "Ergebnis verworfen, zurück an die KI", "oberflaeche");
    return job;
  }

  /** Abschließen: Originaldaten, Zuordnung und fertiges Ergebnis werden gelöscht. */
  close(id: string): StoredJob {
    const job = this.load(id);
    this.requireStatus(job, ["freigegeben"], "Abschließen");
    delete job.geheim;
    job.status = "abgeschlossen";
    this.save(job);
    this.log(id, "Abgeschlossen, Originaldaten und Zuordnung gelöscht", "oberflaeche");
    return job;
  }

  remove(id: string): void {
    const file = this.file(id);
    if (!fs.existsSync(file)) throw new JobError(`Unbekanntes Dokument: ${id}`);
    fs.rmSync(file);
    this.log(id, "Dokument verworfen und gelöscht", "oberflaeche");
  }

  private nextInvoiceNumber(): string {
    const year = String(new Date().getFullYear());
    let counters: Record<string, number> = {};
    if (fs.existsSync(this.numbersFile)) counters = JSON.parse(fs.readFileSync(this.numbersFile, "utf8"));
    const next = (counters[year] ?? 0) + 1;
    counters[year] = next;
    writeJsonAtomic(this.numbersFile, counters);
    return `${year}-${String(next).padStart(4, "0")}`;
  }

  // -------------------------------------------------------------------------
  // KI (MCP-Server). Hier kommen nie Originaldaten heraus.

  listForAi(): Array<{ id: string; art: JobArt; betreff: string; erstellt: string }> {
    return this.list()
      .filter((j) => j.status === "bereit")
      .map((j) => ({ id: j.id, art: j.art, betreff: j.betreffKi, erstellt: j.erstellt }));
  }

  readForAi(id: string): KiDokument {
    const job = this.load(id);
    if (job.status === "neu") throw new JobError("Dieses Dokument ist noch nicht für die KI freigegeben.");
    this.requireStatus(job, ["bereit", "zur_pruefung"], "Lesen");
    this.log(id, "Von der KI gelesen (Platzhalter-Version)", "ki");
    return {
      id: job.id,
      art: job.art,
      betreff: job.betreffKi,
      text: job.textKi,
      platzhalter: job.platzhalter,
      ...(job.art === "buchhaltung" ? { kontenplan: loadAccounts(this.configDir) } : {}),
    };
  }

  /**
   * Ergebnis der KI übernehmen: Platzhalter zurückübersetzen, nachrechnen, prüfen.
   * Die Antwort an die KI enthält nur Prüfhinweise und Beträge, keine Originaldaten.
   */
  saveResult(id: string, ergebnis: ErgebnisKi): { pruefung: Pruefung; summen?: { netto: number; ust: number; brutto: number } } {
    const job = this.load(id);
    // Solange noch niemand freigegeben hat, darf die KI ihr Ergebnis korrigieren.
    this.requireStatus(job, ["bereit", "zur_pruefung"], "Ergebnis speichern");
    const replacing = job.status === "zur_pruefung";
    const secret = this.openSecret(job);

    const used = new Set<string>();
    const unbekannt = new Set<string>();
    const repariert = new Set<string>();
    const erfunden: InventedData[] = [];
    const back = (value: string | undefined): string | undefined => {
      if (value === undefined) return undefined;
      const r = reidentify(value, secret.mapping);
      r.used.forEach((u) => used.add(u));
      r.unknown.forEach((u) => unbekannt.add(u));
      r.repaired.forEach((u) => repariert.add(u));
      for (const inv of r.invented) if (!erfunden.some((e) => e.value === inv.value)) erfunden.push(inv);
      return r.text;
    };
    const backReq = (value: string): string => back(value) ?? value;

    let fertig: ErgebnisFertig;
    let hinweise: string[] = [];
    let summen: { netto: number; ust: number; brutto: number } | undefined;

    if (ergebnis.art === "text") {
      fertig = { art: "text", text: backReq(ergebnis.text) };
      if (ergebnis.titel) fertig.titel = backReq(ergebnis.titel);
    } else if (ergebnis.art === "buchungen") {
      const rows = ergebnis.buchungen.map((b) => ({ ...b, text: backReq(b.text) }));
      const computed = computeBookings(rows, loadAccounts(this.configDir));
      hinweise = computed.hinweise;
      summen = computed.summen;
      fertig = { art: "buchungen", buchungen: computed.buchungen, summen: computed.summen };
    } else {
      const r = ergebnis.rechnung;
      const inhalt: RechnungInhalt = {
        empfaenger: backReq(r.empfaenger),
        positionen: r.positionen.map((p) => ({ ...p, beschreibung: backReq(p.beschreibung) })),
      };
      const optional = ["empfaenger_adresse", "empfaenger_uid", "leistungszeitraum", "zahlungshinweis", "anmerkung"] as const;
      for (const key of optional) {
        const v = back(r[key]);
        if (v !== undefined) inhalt[key] = v;
      }
      const firma = loadOwnCompany(this.configDir);
      const s = computeInvoice(inhalt.positionen);
      hinweise = invoiceChecks(inhalt, s, firma);
      summen = { netto: s.netto, ust: s.ust, brutto: s.brutto };
      fertig = {
        art: "rechnung",
        rechnung: inhalt,
        summen: s,
        html: renderInvoiceHtml({ inhalt, summen: s, firma, datum: today() }),
      };
    }

    const pruefung: Pruefung = {
      unbekannt: [...unbekannt],
      repariert: [...repariert],
      nichtVerwendet: secret.mapping.map((e) => e.id).filter((pid) => !used.has(pid)),
      erfunden,
      hinweise,
    };
    secret.ergebnis = fertig;
    this.sealSecret(job, secret);
    job.ergebnisKi = ergebnis;
    job.pruefung = pruefung;
    job.status = "zur_pruefung";
    this.save(job);
    const warnCount = pruefung.unbekannt.length + pruefung.erfunden.length + pruefung.hinweise.length;
    this.log(
      id,
      `${replacing ? "Ergebnis von der KI ersetzt" : "Ergebnis von der KI gespeichert"} (${ergebnis.art}), ${warnCount} Hinweise`,
      "ki",
    );
    return summen ? { pruefung, summen } : { pruefung };
  }
}
