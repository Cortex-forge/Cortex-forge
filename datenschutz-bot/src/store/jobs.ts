import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, DATA_DIR } from "../config.js";
import {
  bookingsToCsv,
  computeBookings,
  type BuchungBerechnet,
  type BuchungKi,
  type BuchungsSummen,
  type Konto,
} from "../core/accounting.js";
import { manualMatches } from "../core/detectors.js";
import {
  computeInvoice,
  invoiceChecks,
  renderInvoiceHtml,
  type RechnungInhalt,
  type RechnungsSummen,
} from "../core/invoice.js";
import { placeholderRegex } from "../core/placeholders.js";
import { placeholderLegend, pseudonymize } from "../core/pseudonymize.js";
import { reidentify, type InventedData } from "../core/reidentify.js";
import type { EntityType, ManualMark, MappingEntry, PlaceholderInfo } from "../core/types.js";
import { decrypt, encrypt, keyId, loadOrCreateKey } from "../core/vault.js";
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

/** Prüfhinweise zu einem KI-Ergebnis. Enthalten nur, was die KI selbst geschrieben hat, und Beträge. */
export interface Pruefung {
  unbekannt: string[];
  repariert: string[];
  /** Stellen, die wie ein Platzhalter aussehen, aber keiner sind. */
  reste: string[];
  nichtVerwendet: string[];
  erfunden: InventedData[];
  hinweise: string[];
}

/**
 * So liegt ein Dokument auf der Platte: Verwaltungsdaten im Klartext, alle Inhalte verschlüsselt.
 * Auch die Platzhalter-Fassung ist verschlüsselt, denn sie kann übersehene Angaben enthalten.
 */
interface StoredJob {
  format: 2;
  id: string;
  art: JobArt;
  status: JobStatus;
  erstellt: string;
  aktualisiert: string;
  /** Zählt jede Änderung hoch. */
  rev: number;
  /** Version des aktuellen KI-Ergebnisses. Die Freigabe muss genau diese Version nennen. */
  ergebnisRev?: number;
  anzahlPlatzhalter: number;
  anzahlHinweise: number;
  rechnungsnummer?: string;
  /** Kennung des Schlüssels, mit dem verschlüsselt wurde. */
  schluessel: string;
  /** verschlüsselt: Titel für die Liste */
  kopf: string;
  /** verschlüsselt: Platzhalter-Fassung, Ergebnis der KI, Prüfhinweise */
  ki?: string;
  /** verschlüsselt: Original, Zuordnung, Markierungen, fertiges Ergebnis */
  geheim?: string;
}

interface Kopf {
  /** Titel aus dem Original (nur für die Oberfläche). */
  titel: string;
  /** Titel aus der Platzhalter-Fassung. */
  titelKi: string;
  betreffKi: string;
}

interface KiTeil {
  betreffKi: string;
  textKi: string;
  platzhalter: PlaceholderInfo[];
  ergebnisKi?: ErgebnisKi;
  pruefung?: Pruefung;
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
  /** Platzhalter, die schon im Original standen. */
  literal: string[];
  ergebnis?: ErgebnisFertig;
}

export interface ProtokollEintrag {
  zeit: string;
  dokument: string;
  ereignis: string;
  quelle: Quelle;
}

/** Was die Oberfläche in der Liste zeigt. */
export interface JobInfo {
  id: string;
  art: JobArt;
  status: JobStatus;
  erstellt: string;
  aktualisiert: string;
  rev: number;
  ergebnisRev?: number;
  anzahlPlatzhalter: number;
  anzahlHinweise: number;
  rechnungsnummer?: string;
  titel: string;
}

export interface JobDetail {
  job: JobInfo & Partial<KiTeil>;
  original: string;
  markierungen: Markierung[];
  zuordnung: MappingEntry[];
  manuell: ManualMark[];
  ausgeschlossen: string[];
  ergebnis?: ErgebnisFertig;
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

export interface Export {
  dateiname: string;
  typ: string;
  inhalt: string;
}

export class JobError extends Error {}

/** Trennt Betreff und Text intern. Gleich lang wie die Anzeige ("\n\n"), damit die Positionen stimmen. */
const SEP_INTERN = "\n";
const SEP_ANZEIGE = "\n\n";
const MAX_TEXT = 200_000;
const MAX_BETREFF = 500;
const MAX_ERGEBNIS = 200_000;
const MAX_ZEILEN = 500;
const ID_RE = /^D-[0-9a-f]{12}$/;
/** Wie lange ein Vorgang auf eine Sperre wartet (für Tests per DSB_SPERRE_MS verkürzbar). */
const LOCK_TIMEOUT_MS = Number(process.env.DSB_SPERRE_MS ?? 10_000);
const NUMMER_RE = /^\d{4}-\d{4,}$/;

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

function combine(betreff: string, text: string, sep: string): string {
  return betreff ? betreff + sep + text : text;
}

/** Titel eines Dokuments: Betreff-Zeile einer E-Mail, sonst die erste Zeile. */
export function titleOf(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const subject = lines.find((l) => /^(Betreff|Subject|Oggetto|Onderwerp)\s*:/i.test(l));
  return (subject ? subject.replace(/^[^:]+:\s*/, "") : (lines[0] ?? "")).slice(0, 90);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileAtomic(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // Unter Windows schlägt das Ersetzen kurz fehl, wenn ein anderer Prozess die Datei gerade liest.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 20 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
      sleep(10);
    }
  }
}

/** Legt eine Datei nur an, wenn es sie noch nicht gibt. Gibt false zurück, wenn sie schon existiert. */
function createFileExclusive(file: string, content: string): boolean {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class JobStore {
  private readonly jobsDir: string;
  private readonly locksDir: string;
  private readonly archiveDir: string;
  private readonly auditFile: string;
  private readonly numbersFile: string;
  private key: Buffer | null = null;
  private keyKennung = "";

  constructor(
    readonly dataDir: string = DATA_DIR,
    readonly configDir: string = CONFIG_DIR,
  ) {
    this.jobsDir = path.join(dataDir, "dokumente");
    this.locksDir = path.join(dataDir, "sperren");
    this.archiveDir = path.join(dataDir, "rechnungen");
    this.auditFile = path.join(dataDir, "protokoll.jsonl");
    this.numbersFile = path.join(dataDir, "rechnungsnummern.json");
    for (const dir of [this.jobsDir, this.locksDir, this.archiveDir]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // -------------------------------------------------------------------------
  // Schlüssel, Verschlüsselung, Dateien, Sperren

  private secretKey(): Buffer {
    if (!this.key) {
      const empty = () =>
        !fs.readdirSync(this.jobsDir).some((f) => f.endsWith(".json")) &&
        !fs.readdirSync(this.archiveDir).some((f) => f.endsWith(".json"));
      this.key = loadOrCreateKey(this.dataDir, empty);
      this.keyKennung = keyId(this.key);
    }
    return this.key;
  }

  private seal(job: { id: string }, feld: string, value: unknown): string {
    return encrypt(this.secretKey(), JSON.stringify(value), `${job.id}:${feld}`);
  }

  private open<T>(job: StoredJob, feld: "kopf" | "ki" | "geheim"): T {
    const payload = job[feld];
    if (!payload) {
      throw new JobError(
        feld === "geheim" ? "Die Originaldaten dieses Dokuments wurden bereits gelöscht." : "Dieser Teil des Dokuments wurde gelöscht.",
      );
    }
    const key = this.secretKey();
    try {
      return JSON.parse(decrypt(key, payload, `${job.id}:${feld}`)) as T;
    } catch {
      if (job.schluessel !== this.keyKennung) {
        throw new JobError(
          `Dieses Dokument wurde mit einem anderen Schlüssel verschlüsselt (Kennung ${job.schluessel}, aktuell ${this.keyKennung}). Bitte DSB_KEY bzw. DSB_KEY_FILE prüfen.`,
        );
      }
      throw new JobError("Die verschlüsselten Daten dieses Dokuments sind beschädigt oder wurden verändert.");
    }
  }

  private file(id: string): string {
    if (!ID_RE.test(id)) throw new JobError(`Unbekanntes Dokument: ${id}`);
    return path.join(this.jobsDir, `${id}.json`);
  }

  private readStored(id: string): StoredJob {
    const file = this.file(id);
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      throw new JobError(`Unbekanntes Dokument: ${id}`);
    }
    let job: StoredJob;
    try {
      job = JSON.parse(raw) as StoredJob;
    } catch {
      throw new JobError(`Die Datei des Dokuments ${id} ist beschädigt.`);
    }
    if (job.format !== 2 || job.id !== id) {
      throw new JobError(`Das Dokument ${id} liegt in einem alten oder unbekannten Format vor. Bitte neu ablegen.`);
    }
    return job;
  }

  private persist(job: StoredJob): void {
    job.rev += 1;
    job.aktualisiert = now();
    writeFileAtomic(this.file(job.id), JSON.stringify(job, null, 2));
  }

  /**
   * Prozessübergreifende Sperre (Oberfläche und MCP-Server laufen getrennt). Laden, Prüfen und Speichern eines
   * Dokuments geschehen immer unter dieser Sperre, damit keine Änderung verloren geht.
   */
  private withLock<T>(name: string, fn: () => T): T {
    const lockFile = path.join(this.locksDir, `${name}.lock`);
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        fs.writeFileSync(lockFile, `${process.pid}:${Date.now()}`, { flag: "wx", mode: 0o600 });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        try {
          const [pid, since] = fs.readFileSync(lockFile, "utf8").split(":").map(Number);
          const stale = !pid || !processAlive(pid) || Date.now() - (since ?? 0) > 60_000;
          if (stale) {
            fs.rmSync(lockFile, { force: true });
            continue;
          }
        } catch {
          // Sperre wurde gerade freigegeben: erneut versuchen.
          continue;
        }
        if (Date.now() > deadline) {
          throw new JobError("Das Dokument wird gerade von einem anderen Vorgang bearbeitet. Bitte gleich noch einmal versuchen.");
        }
        sleep(20);
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(lockFile, { force: true });
    }
  }

  private mutate<T>(id: string, fn: (job: StoredJob) => T): T {
    this.file(id);
    return this.withLock(`dokument-${id}`, () => fn(this.readStored(id)));
  }

  private requireStatus(job: StoredJob, allowed: JobStatus[], action: string): void {
    if (!allowed.includes(job.status)) {
      throw new JobError(`${action} ist im Status "${STATUS_LABELS[job.status]}" nicht möglich.`);
    }
  }

  private info(job: StoredJob): JobInfo {
    const kopf = this.open<Kopf>(job, "kopf");
    return {
      id: job.id,
      art: job.art,
      status: job.status,
      erstellt: job.erstellt,
      aktualisiert: job.aktualisiert,
      rev: job.rev,
      ...(job.ergebnisRev !== undefined ? { ergebnisRev: job.ergebnisRev } : {}),
      anzahlPlatzhalter: job.anzahlPlatzhalter,
      anzahlHinweise: job.anzahlHinweise,
      ...(job.rechnungsnummer ? { rechnungsnummer: job.rechnungsnummer } : {}),
      titel: (job.status === "abgeschlossen" ? kopf.titelKi : kopf.titel) || kopf.titelKi || job.id,
    };
  }

  // -------------------------------------------------------------------------
  // Protokoll

  log(dokument: string, ereignis: string, quelle: Quelle): void {
    const entry: ProtokollEintrag = { zeit: now(), dokument, ereignis, quelle };
    fs.appendFileSync(this.auditFile, JSON.stringify(entry) + "\n", { mode: 0o600 });
  }

  /** Protokoll lesen. Eine beschädigte Zeile wird übersprungen, statt alles zu blockieren. */
  protokoll(dokument?: string): ProtokollEintrag[] {
    if (!fs.existsSync(this.auditFile)) return [];
    const out: ProtokollEintrag[] = [];
    for (const line of fs.readFileSync(this.auditFile, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as ProtokollEintrag;
        if (!dokument || e.dokument === dokument) out.push(e);
      } catch {
        // beschädigte Zeile
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Platzhalter-Fassung erzeugen

  private pseudonymizeInto(job: StoredJob, secret: Geheim, keep: Pick<KiTeil, "ergebnisKi" | "pruefung"> = {}): void {
    const intern = combine(secret.betreff, secret.text, SEP_INTERN);
    const result = pseudonymize(intern, {
      manual: secret.manuell,
      excluded: secret.ausgeschlossen,
      companies: loadCompanies(this.configDir),
    });
    let betreffKi = "";
    let textKi = result.text;
    if (secret.betreff) {
      const parts = result.text.split(SEP_INTERN);
      if (parts.length !== 2) throw new Error("Interner Fehler: Betreff und Text ließen sich nicht trennen.");
      [betreffKi, textKi] = [parts[0] ?? "", parts[1] ?? ""];
    }
    secret.mapping = result.mapping;
    secret.literal = result.literal;
    secret.markierungen = result.findings.map(({ start, end, type, id, source }) => ({ start, end, type, id, source }));
    const ki: KiTeil = { betreffKi, textKi, platzhalter: placeholderLegend(result.mapping), ...keep };
    const kopf: Kopf = {
      titel: titleOf(combine(secret.betreff, secret.text, "\n")),
      titelKi: titleOf(combine(betreffKi, textKi, "\n")),
      betreffKi,
    };
    job.anzahlPlatzhalter = result.mapping.length;
    job.kopf = this.seal(job, "kopf", kopf);
    job.ki = this.seal(job, "ki", ki);
    job.geheim = this.seal(job, "geheim", secret);
  }

  /** Neue Dokument-ID (48 Bit Zufall). In Tests überschreibbar, um Kollisionen zu prüfen. */
  protected newId(): string {
    return `D-${crypto.randomBytes(6).toString("hex")}`;
  }

  // -------------------------------------------------------------------------
  // Oberfläche

  /** Alle Dokumente. Defekte Dateien werden gezählt, blockieren aber die Liste nicht. */
  list(): { dokumente: JobInfo[]; defekt: number } {
    const dokumente: JobInfo[] = [];
    let defekt = 0;
    for (const f of fs.readdirSync(this.jobsDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        dokumente.push(this.info(this.readStored(f.slice(0, -5))));
      } catch {
        defekt++;
      }
    }
    dokumente.sort((a, b) => b.erstellt.localeCompare(a.erstellt));
    return { dokumente, defekt };
  }

  create(input: { art: string; betreff?: string; text: string }, quelle: Quelle = "oberflaeche"): JobInfo {
    if (!(ARTEN as readonly string[]).includes(input.art)) throw new JobError(`Unbekannte Art: ${input.art}`);
    const text = input.text.replace(/\r\n?/g, "\n").replace(//g, "");
    const betreff = (input.betreff ?? "").replace(/\s*\n\s*/g, " ").replace(//g, "").trim();
    if (!text.trim()) throw new JobError("Das Dokument ist leer.");
    if (text.length > MAX_TEXT) throw new JobError("Das Dokument ist zu groß (höchstens 200.000 Zeichen).");
    if (betreff.length > MAX_BETREFF) throw new JobError("Der Betreff ist zu lang (höchstens 500 Zeichen).");
    const secret: Geheim = {
      betreff,
      text,
      manuell: [],
      ausgeschlossen: [],
      mapping: [],
      markierungen: [],
      literal: [],
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = this.newId();
      this.secretKey();
      const job: StoredJob = {
        format: 2,
        id,
        art: input.art as JobArt,
        status: "neu",
        erstellt: now(),
        aktualisiert: now(),
        rev: 1,
        anzahlPlatzhalter: 0,
        anzahlHinweise: 0,
        schluessel: this.keyKennung,
        kopf: "",
      };
      this.pseudonymizeInto(job, secret);
      // Nie ein bestehendes Dokument überschreiben: exklusiv anlegen, bei Kollision neue ID.
      if (!createFileExclusive(this.file(id), JSON.stringify(job, null, 2))) continue;
      this.log(id, `Dokument abgelegt, ${secret.mapping.length} Angaben durch Platzhalter ersetzt`, quelle);
      return this.info(job);
    }
    throw new JobError("Das Dokument konnte nicht angelegt werden. Bitte noch einmal versuchen.");
  }

  detail(id: string): JobDetail {
    const job = this.readStored(id);
    const info = this.info(job);
    const ki = job.ki ? this.open<KiTeil>(job, "ki") : undefined;
    const base: JobDetail = {
      job: { ...info, ...(ki ?? {}) },
      original: "",
      markierungen: [],
      zuordnung: [],
      manuell: [],
      ausgeschlossen: [],
    };
    if (!job.geheim) return base;
    const secret = this.open<Geheim>(job, "geheim");
    return {
      ...base,
      original: combine(secret.betreff, secret.text, SEP_ANZEIGE),
      markierungen: secret.markierungen,
      zuordnung: secret.mapping,
      manuell: secret.manuell,
      ausgeschlossen: secret.ausgeschlossen,
      ...(secret.ergebnis ? { ergebnis: secret.ergebnis } : {}),
    };
  }

  /** Zusätzlich schwärzen (Text in der Oberfläche markiert). Gibt zurück, wie oft der Text vorkommt. */
  mark(id: string, mark: ManualMark): { job: JobInfo; treffer: number } {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["neu"], "Markieren");
      const secret = this.open<Geheim>(job, "geheim");
      const value = mark.value.trim();
      if (!value) throw new JobError("Leere Markierung.");
      const treffer = manualMatches(combine(secret.betreff, secret.text, SEP_INTERN), value).length;
      if (treffer === 0) {
        throw new JobError("Der markierte Text wurde so nicht im Dokument gefunden. Bitte nur innerhalb eines Absatzes markieren.");
      }
      secret.ausgeschlossen = secret.ausgeschlossen.filter((v) => v.toLowerCase() !== value.toLowerCase());
      if (!secret.manuell.some((m) => m.value.toLowerCase() === value.toLowerCase())) {
        secret.manuell.push({ value, type: mark.type });
      }
      this.pseudonymizeInto(job, secret);
      this.persist(job);
      this.log(id, `Zusätzlich geschwärzt (${mark.type}, ${treffer} Stelle${treffer === 1 ? "" : "n"})`, "oberflaeche");
      return { job: this.info(job), treffer };
    });
  }

  /** Eine Erkennung als "nicht sensibel" verwerfen. */
  exclude(id: string, value: string): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["neu"], "Ausnehmen");
      const secret = this.open<Geheim>(job, "geheim");
      const v = value.trim();
      if (!v) throw new JobError("Leerer Wert.");
      secret.manuell = secret.manuell.filter((m) => m.value.toLowerCase() !== v.toLowerCase());
      if (!secret.ausgeschlossen.some((a) => a.toLowerCase() === v.toLowerCase())) secret.ausgeschlossen.push(v);
      this.pseudonymizeInto(job, secret);
      this.persist(job);
      this.log(id, "Eine Erkennung als nicht sensibel markiert", "oberflaeche");
      return this.info(job);
    });
  }

  /** Manuelle Markierung oder Ausnahme zurücknehmen. */
  undoMark(id: string, value: string): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["neu"], "Zurücknehmen");
      const secret = this.open<Geheim>(job, "geheim");
      secret.manuell = secret.manuell.filter((m) => m.value !== value);
      secret.ausgeschlossen = secret.ausgeschlossen.filter((v) => v !== value);
      this.pseudonymizeInto(job, secret);
      this.persist(job);
      this.log(id, "Markierung zurückgenommen", "oberflaeche");
      return this.info(job);
    });
  }

  releaseForAi(id: string): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["neu"], "Freigeben für die KI");
      job.status = "bereit";
      this.persist(job);
      this.log(id, "Für die KI freigegeben (nur Platzhalter-Fassung)", "oberflaeche");
      return this.info(job);
    });
  }

  /** Zurück zur Prüfung, z. B. wenn ein übersehener Wert auffällt. Ein vorhandenes Ergebnis wird verworfen. */
  backToReview(id: string): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["bereit", "zur_pruefung"], "Zurück zur Prüfung");
      const secret = this.open<Geheim>(job, "geheim");
      delete secret.ergebnis;
      this.pseudonymizeInto(job, secret);
      delete job.ergebnisRev;
      job.anzahlHinweise = 0;
      job.status = "neu";
      this.persist(job);
      this.log(id, "Zurück zur Prüfung, die KI hat keinen Zugriff mehr", "oberflaeche");
      return this.info(job);
    });
  }

  /**
   * Ergebnis freigeben. ergebnisRev ist die Version, die der Mitarbeiter geprüft hat: Hat die KI das Ergebnis
   * inzwischen ersetzt, wird die Freigabe abgelehnt.
   */
  approve(id: string, ergebnisRev: number): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["zur_pruefung"], "Freigeben");
      if (job.ergebnisRev === undefined || job.ergebnisRev !== ergebnisRev) {
        throw new JobError("Das Ergebnis wurde inzwischen geändert. Bitte die neue Fassung prüfen und dann freigeben.");
      }
      const secret = this.open<Geheim>(job, "geheim");
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
        job.geheim = this.seal(job, "geheim", secret);
      }
      job.status = "freigegeben";
      this.persist(job);
      this.log(
        id,
        job.rechnungsnummer ? `Freigegeben, Rechnungsnummer ${job.rechnungsnummer}` : "Ergebnis geprüft und freigegeben",
        "oberflaeche",
      );
      return this.info(job);
    });
  }

  sendBack(id: string): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["zur_pruefung"], "Zurückgeben");
      const secret = this.open<Geheim>(job, "geheim");
      const ki = this.open<KiTeil>(job, "ki");
      delete secret.ergebnis;
      delete ki.ergebnisKi;
      delete ki.pruefung;
      job.geheim = this.seal(job, "geheim", secret);
      job.ki = this.seal(job, "ki", ki);
      delete job.ergebnisRev;
      job.anzahlHinweise = 0;
      job.status = "bereit";
      this.persist(job);
      this.log(id, "Ergebnis verworfen, zurück an die KI", "oberflaeche");
      return this.info(job);
    });
  }

  /**
   * Abschließen: Original, Zuordnung, Platzhalter-Fassung und Ergebnis werden gelöscht. Eine Rechnung mit Nummer
   * kommt vorher verschlüsselt ins Rechnungsarchiv (Aufbewahrungspflicht).
   */
  close(id: string): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["freigegeben"], "Abschließen");
      const secret = this.open<Geheim>(job, "geheim");
      const kopf = this.open<Kopf>(job, "kopf");
      if (job.rechnungsnummer && secret.ergebnis?.art === "rechnung") {
        const nummer = job.rechnungsnummer;
        const archiv = {
          format: 2,
          nummer,
          dokument: id,
          archiviert: now(),
          schluessel: this.keyKennung,
          inhalt: encrypt(this.secretKey(), JSON.stringify(secret.ergebnis), `rechnung:${nummer}`),
        };
        if (!createFileExclusive(this.archiveFile(nummer), JSON.stringify(archiv, null, 2))) {
          throw new JobError(`Im Archiv gibt es schon eine Rechnung ${nummer}. Bitte die Daten prüfen.`);
        }
      }
      delete job.geheim;
      delete job.ki;
      job.kopf = this.seal(job, "kopf", { titel: "", titelKi: kopf.titelKi, betreffKi: "" } satisfies Kopf);
      job.status = "abgeschlossen";
      this.persist(job);
      this.log(
        id,
        job.rechnungsnummer
          ? `Abgeschlossen, Rechnung ${job.rechnungsnummer} archiviert, übrige Daten gelöscht`
          : "Abgeschlossen, Original, Zuordnung, Platzhalter-Fassung und Ergebnis gelöscht",
        "oberflaeche",
      );
      return this.info(job);
    });
  }

  /** Verwerfen. Rechnungen mit vergebener Nummer lassen sich nicht löschen (lückenlose Nummern, Aufbewahrung). */
  remove(id: string): void {
    this.mutate(id, (job) => {
      if (job.rechnungsnummer) {
        throw new JobError(
          `Die Rechnung ${job.rechnungsnummer} hat schon eine Nummer und darf nicht gelöscht werden. Bitte abschließen; sie kommt dann ins Archiv.`,
        );
      }
      fs.rmSync(this.file(id));
      this.log(id, "Dokument verworfen und gelöscht", "oberflaeche");
    });
  }

  /** Download des fertigen Ergebnisses. Nur nach der Freigabe; Rechnungen danach aus dem Archiv. */
  export(id: string): Export {
    const job = this.readStored(id);
    const base = `${id}${job.rechnungsnummer ? "-" + job.rechnungsnummer : ""}`;
    if (job.status === "abgeschlossen" && job.rechnungsnummer) {
      return { dateiname: `${base}-rechnung.html`, typ: "text/html; charset=utf-8", inhalt: this.archivedInvoice(job.rechnungsnummer).html };
    }
    this.requireStatus(job, ["freigegeben"], "Herunterladen");
    const result = this.open<Geheim>(job, "geheim").ergebnis;
    if (!result) throw new JobError("Noch kein Ergebnis vorhanden.");
    if (result.art === "text") {
      return {
        dateiname: `${base}.txt`,
        typ: "text/plain; charset=utf-8",
        inhalt: (result.titel ? result.titel + "\n\n" : "") + result.text + "\n",
      };
    }
    if (result.art === "buchungen") {
      return { dateiname: `${base}-buchungen.csv`, typ: "text/csv; charset=utf-8", inhalt: "﻿" + bookingsToCsv(result.buchungen) };
    }
    return { dateiname: `${base}-rechnung.html`, typ: "text/html; charset=utf-8", inhalt: result.html };
  }

  private archiveFile(nummer: string): string {
    if (!NUMMER_RE.test(nummer)) throw new JobError(`Ungültige Rechnungsnummer: ${nummer}`);
    return path.join(this.archiveDir, `${nummer}.json`);
  }

  /** Eine archivierte Rechnung entschlüsseln. */
  archivedInvoice(nummer: string): { html: string; rechnung: RechnungInhalt; summen: RechnungsSummen } {
    const file = this.archiveFile(nummer);
    if (!fs.existsSync(file)) throw new JobError(`Rechnung ${nummer} ist nicht im Archiv.`);
    const archiv = JSON.parse(fs.readFileSync(file, "utf8")) as { inhalt: string; schluessel: string };
    try {
      return JSON.parse(decrypt(this.secretKey(), archiv.inhalt, `rechnung:${nummer}`)) as {
        html: string;
        rechnung: RechnungInhalt;
        summen: RechnungsSummen;
      };
    } catch {
      throw new JobError(`Die archivierte Rechnung ${nummer} lässt sich nicht entschlüsseln (Schlüssel ${archiv.schluessel}).`);
    }
  }

  private nextInvoiceNumber(): string {
    return this.withLock("rechnungsnummern", () => {
      const year = String(new Date().getFullYear());
      let counters: Record<string, number> = {};
      if (fs.existsSync(this.numbersFile)) {
        try {
          counters = JSON.parse(fs.readFileSync(this.numbersFile, "utf8")) as Record<string, number>;
        } catch {
          // Nie neu bei 1 anfangen: das würde Nummern doppelt vergeben.
          throw new JobError("Die Datei mit den Rechnungsnummern ist beschädigt. Bitte prüfen, bevor weitere Rechnungen freigegeben werden.");
        }
      }
      const next = (counters[year] ?? 0) + 1;
      counters[year] = next;
      writeFileAtomic(this.numbersFile, JSON.stringify(counters, null, 2));
      return `${year}-${String(next).padStart(4, "0")}`;
    });
  }

  // -------------------------------------------------------------------------
  // KI (MCP-Server). Hier kommen nie Originaldaten heraus.

  listForAi(): Array<{ id: string; art: JobArt; betreff: string; erstellt: string }> {
    const out: Array<{ id: string; art: JobArt; betreff: string; erstellt: string }> = [];
    for (const f of fs.readdirSync(this.jobsDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const job = this.readStored(f.slice(0, -5));
        if (job.status !== "bereit") continue;
        out.push({ id: job.id, art: job.art, betreff: this.open<Kopf>(job, "kopf").betreffKi, erstellt: job.erstellt });
      } catch {
        // defekte oder fremde Dateien überspringen
      }
    }
    return out.sort((a, b) => b.erstellt.localeCompare(a.erstellt));
  }

  readForAi(id: string): KiDokument {
    const job = this.readStored(id);
    if (job.status === "neu") throw new JobError("Dieses Dokument ist noch nicht für die KI freigegeben.");
    this.requireStatus(job, ["bereit", "zur_pruefung"], "Lesen");
    const ki = this.open<KiTeil>(job, "ki");
    this.log(id, "Von der KI gelesen (Platzhalter-Fassung)", "ki");
    return {
      id: job.id,
      art: job.art,
      betreff: ki.betreffKi,
      text: ki.textKi,
      platzhalter: ki.platzhalter,
      ...(job.art === "buchhaltung" ? { kontenplan: loadAccounts(this.configDir) } : {}),
    };
  }

  /**
   * Ergebnis der KI übernehmen: Platzhalter zurückübersetzen, nachrechnen, prüfen.
   * Die Antwort an die KI enthält nur Prüfhinweise und Beträge, keine Originaldaten: Hinweise entstehen nur aus
   * dem, was die KI selbst geschrieben hat, und aus Beträgen und Kontonummern vor der Rückübersetzung.
   */
  saveResult(id: string, ergebnis: ErgebnisKi): { pruefung: Pruefung; summen?: { netto: number; ust: number; brutto: number } } {
    checkSize(ergebnis);
    return this.mutate(id, (job) => {
      // Solange noch niemand freigegeben hat, darf die KI ihr Ergebnis korrigieren. Jede neue Fassung braucht
      // eine neue Prüfung, denn die Freigabe nennt die geprüfte Version.
      this.requireStatus(job, ["bereit", "zur_pruefung"], "Ergebnis speichern");
      const replacing = job.status === "zur_pruefung";
      const secret = this.open<Geheim>(job, "geheim");
      const ki = this.open<KiTeil>(job, "ki");

      const used = new Set<string>();
      const unbekannt = new Set<string>();
      const repariert = new Set<string>();
      const reste = new Set<string>();
      const erfunden: InventedData[] = [];
      const back = (value: string): string => {
        const r = reidentify(value, secret.mapping, { literal: secret.literal });
        r.used.forEach((u) => used.add(u));
        r.unknown.forEach((u) => unbekannt.add(u));
        r.repaired.forEach((u) => repariert.add(u));
        r.leftovers.forEach((u) => reste.add(u));
        for (const inv of r.invented) if (!erfunden.some((e) => e.value === inv.value)) erfunden.push(inv);
        return r.text;
      };
      const backOpt = (value: string | undefined): string | undefined => (value === undefined ? undefined : back(value));

      let fertig: ErgebnisFertig;
      const hinweise: string[] = [];
      let summen: { netto: number; ust: number; brutto: number } | undefined;

      if (ergebnis.art === "text") {
        fertig = { art: "text", text: back(ergebnis.text) };
        if (ergebnis.titel) fertig.titel = back(ergebnis.titel);
      } else if (ergebnis.art === "buchungen") {
        // Datum und Konten bleiben, wie die KI sie schrieb: Platzhalter sind dort nicht erlaubt.
        ergebnis.buchungen.forEach((b, i) => {
          for (const [feld, wert] of [["Datum", b.datum], ["Konto", b.konto], ["Gegenkonto", b.gegenkonto]] as const) {
            if (placeholderRegex().test(wert)) hinweise.push(`Buchung ${i + 1}: Im Feld ${feld} ist kein Platzhalter erlaubt.`);
          }
        });
        const computed = computeBookings(ergebnis.buchungen, loadAccounts(this.configDir));
        hinweise.push(...computed.hinweise);
        summen = computed.summen;
        const buchungen = computed.buchungen.map((b) => {
          const row: BuchungBerechnet = { ...b, text: back(b.text) };
          if (b.belegnummer !== undefined) row.belegnummer = back(b.belegnummer);
          return row;
        });
        fertig = { art: "buchungen", buchungen, summen: computed.summen };
      } else {
        const r = ergebnis.rechnung;
        const inhalt: RechnungInhalt = {
          empfaenger: back(r.empfaenger),
          positionen: r.positionen.map((p) => {
            const pos = { ...p, beschreibung: back(p.beschreibung) };
            if (p.einheit !== undefined) pos.einheit = back(p.einheit);
            return pos;
          }),
        };
        for (const key of ["empfaenger_adresse", "empfaenger_uid", "leistungszeitraum", "zahlungshinweis", "anmerkung"] as const) {
          const v = backOpt(r[key]);
          if (v !== undefined) inhalt[key] = v;
        }
        const firma = loadOwnCompany(this.configDir);
        const s = computeInvoice(inhalt.positionen);
        hinweise.push(...invoiceChecks(inhalt, s, firma));
        summen = { netto: s.netto, ust: s.ust, brutto: s.brutto };
        fertig = { art: "rechnung", rechnung: inhalt, summen: s, html: renderInvoiceHtml({ inhalt, summen: s, firma, datum: today() }) };
      }

      const pruefung: Pruefung = {
        unbekannt: [...unbekannt],
        repariert: [...repariert],
        reste: [...reste],
        nichtVerwendet: secret.mapping.map((e) => e.id).filter((pid) => !used.has(pid)),
        erfunden,
        hinweise,
      };
      secret.ergebnis = fertig;
      ki.ergebnisKi = ergebnis;
      ki.pruefung = pruefung;
      job.geheim = this.seal(job, "geheim", secret);
      job.ki = this.seal(job, "ki", ki);
      job.status = "zur_pruefung";
      job.ergebnisRev = job.rev + 1;
      job.anzahlHinweise = pruefung.unbekannt.length + pruefung.reste.length + pruefung.erfunden.length + pruefung.hinweise.length;
      this.persist(job);
      this.log(
        id,
        `${replacing ? "Ergebnis von der KI ersetzt, neue Prüfung nötig" : "Ergebnis von der KI gespeichert"} (${ergebnis.art}), ${job.anzahlHinweise} Hinweise`,
        "ki",
      );
      return summen ? { pruefung, summen } : { pruefung };
    });
  }
}

/** Obergrenzen für Ergebnisse der KI, damit niemand den Bot mit riesigen Eingaben lahmlegt. */
function checkSize(ergebnis: ErgebnisKi): void {
  const tooLong = (v: string | undefined) => v !== undefined && v.length > MAX_ERGEBNIS;
  if (ergebnis.art === "text" && (tooLong(ergebnis.text) || tooLong(ergebnis.titel))) {
    throw new JobError("Das Ergebnis ist zu lang (höchstens 200.000 Zeichen).");
  }
  if (ergebnis.art === "buchungen" && ergebnis.buchungen.length > MAX_ZEILEN) {
    throw new JobError(`Zu viele Buchungen (höchstens ${MAX_ZEILEN}).`);
  }
  if (ergebnis.art === "rechnung" && ergebnis.rechnung.positionen.length > MAX_ZEILEN) {
    throw new JobError(`Zu viele Positionen (höchstens ${MAX_ZEILEN}).`);
  }
  if (JSON.stringify(ergebnis).length > 2 * MAX_ERGEBNIS) throw new JobError("Das Ergebnis ist zu groß.");
}
