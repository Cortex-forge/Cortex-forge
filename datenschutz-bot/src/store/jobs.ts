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
import { manualSpans, SEGMENT_BREAK } from "../core/detectors.js";
import {
  computeInvoice,
  invoiceChecks,
  renderInvoiceHtml,
  type EigeneFirma,
  type RechnungInhalt,
  type RechnungsSummen,
} from "../core/invoice.js";
import { nachkommastellen } from "../core/money.js";
import { normalizeChars, prepareDocument } from "../core/normalize.js";
import { placeholderRegex } from "../core/placeholders.js";
import { placeholderLegend, pseudonymize } from "../core/pseudonymize.js";
import { reidentify, type InventedData } from "../core/reidentify.js";
import type { EntityType, ManualMark, MappingEntry, PlaceholderInfo } from "../core/types.js";
import { decrypt, encrypt, KeyError, keyId, loadOrCreateKey, recordMac } from "../core/vault.js";
import { createFileExclusive, readOptional, removeLeftovers, withFileLock, writeFileAtomic } from "./dateien.js";
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
  | { art: "rechnung"; rechnung: RechnungInhalt; summen: RechnungsSummen; html: string; firma?: EigeneFirma };

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
  /** Fassung, die die KI liest. Steigt mit jeder Freigabe für die KI; Ergebnisse müssen sie nennen. */
  kiFassung?: number;
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
  /** Prüfsumme über alle anderen Felder (siehe recordMac). Fehlt sie, darf die KI das Dokument nicht lesen. */
  pruefsumme?: string;
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
  /** Nur Buchhaltung: Kontenplan, wie die KI ihn sieht (Bezeichnungen mit Platzhaltern). */
  kontenplanKi?: Konto[];
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

/** Ein Konto aus dem Kontenplan mit den Fundstellen in seiner Bezeichnung (Positionen relativ zum Namen). */
export interface KontoGeprueft extends Konto {
  markierungen: Markierung[];
}

interface Geheim {
  betreff: string;
  text: string;
  manuell: ManualMark[];
  ausgeschlossen: string[];
  mapping: MappingEntry[];
  markierungen: Markierung[];
  /** Nur Buchhaltung: der Kontenplan, der mit dem Dokument pseudonymisiert wurde. */
  konten?: KontoGeprueft[];
  /** Platzhalter, die schon im Original standen. */
  literal: string[];
  /** Alle je vergebenen Platzhalter (Angabe → Nummer): Nummern bleiben stabil und werden nie neu belegt. */
  vergeben?: Record<string, string>;
  ergebnis?: ErgebnisFertig;
  /** Kontaktdaten im Ergebnis, die im Original stehen: Die Erkennung hat sie übersehen, die KI hat sie gesehen. */
  lecks?: string[];
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
  kiFassung?: number;
  anzahlPlatzhalter: number;
  anzahlHinweise: number;
  rechnungsnummer?: string;
  titel: string;
}

export interface JobDetail {
  job: JobInfo & Partial<KiTeil>;
  original: string;
  markierungen: Markierung[];
  /** Nur Buchhaltung: Kontenplan im Original mit Fundstellen. */
  konten: KontoGeprueft[];
  zuordnung: MappingEntry[];
  manuell: ManualMark[];
  ausgeschlossen: string[];
  ergebnis?: ErgebnisFertig;
  /** Nur für die Oberfläche: übersehene Angaben, die die KI ins Ergebnis übernommen hat. */
  lecks: string[];
}

/** Was die KI über ein Dokument erfährt. */
export interface KiDokument {
  id: string;
  art: JobArt;
  /** Fassung des Dokuments; die KI nennt sie beim Speichern. */
  fassung: number;
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
const SEP_INTERN = SEGMENT_BREAK + "\n";
const SEP_ANZEIGE = "\n\n";
const MAX_TEXT = 200_000;
const MAX_BETREFF = 500;
const MAX_ERGEBNIS = 200_000;
const MAX_ZEILEN = 500;
const ID_RE = /^D-[0-9a-f]{12}$/;
/** Wie lange ein Vorgang auf eine Sperre wartet (für Tests per DSB_SPERRE_MS verkürzbar). */
const LOCK_TIMEOUT_MS = Number(process.env.DSB_SPERRE_MS ?? 10_000);
const NUMMER_RE = /^\d{4}-\d{4,}$/;
const LEGACY_MESSAGE =
  "Dieses Dokument stammt aus einer älteren Version ohne Prüfsumme. Es lässt sich nur noch ansehen und verwerfen: Bitte den Text kopieren, das Dokument verwerfen und neu ablegen.";

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
        // KeyError: Die Oberfläche zeigt die Meldung, der MCP-Server meldet der KI nur allgemein einen Fehler.
        throw new KeyError(
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

  /** Der Datensatz ohne Prüfsumme, in fester Reihenfolge der Felder. */
  private macOf(job: StoredJob): string {
    const { pruefsumme: _ignored, ...rest } = job;
    const ordered = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
    return recordMac(this.secretKey(), JSON.stringify(ordered));
  }

  private serialize(job: StoredJob): string {
    job.pruefsumme = this.macOf(job);
    return JSON.stringify(job, null, 2);
  }

  /**
   * Prüfsumme kontrollieren. Eine falsche Prüfsumme heißt: Die Datei wurde außerhalb des Bots verändert. Ohne
   * Prüfsumme (Dokumente aus Version 0.5 und älter) zeigt die Oberfläche das Dokument nur noch an; ändern,
   * freigeben und an die KI geben geht nicht mehr (siehe mutate).
   */
  private verify(job: StoredJob, forAi: boolean): void {
    if (job.pruefsumme === undefined) {
      if (forAi) throw new JobError(LEGACY_MESSAGE);
      return;
    }
    const expected = Buffer.from(this.macOf(job));
    const given = Buffer.from(job.pruefsumme);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      if (job.schluessel !== this.keyKennung) {
        throw new KeyError(
          `Dieses Dokument wurde mit einem anderen Schlüssel verschlüsselt (Kennung ${job.schluessel}, aktuell ${this.keyKennung}). Bitte DSB_KEY bzw. DSB_KEY_FILE prüfen.`,
        );
      }
      throw new JobError(`Die Datei des Dokuments ${job.id} wurde außerhalb des Bots verändert und wird nicht verwendet.`);
    }
  }

  private readStored(id: string, forAi = false): StoredJob {
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
    this.verify(job, forAi);
    return job;
  }

  /**
   * Speichern mit Gegenprobe: Die Datei muss noch genau den Stand haben, der geladen wurde (Compare-and-Swap). Unter der
   * Sperre ist das immer so; die Probe fängt den Fall ab, dass eine Sperre doch einmal verloren ging.
   */
  private persist(job: StoredJob): void {
    // Gegenprobe auf den Stand (nicht auf die Prüfsumme): Hat jemand anderes inzwischen gespeichert?
    let current: number | undefined;
    try {
      current = (JSON.parse(fs.readFileSync(this.file(job.id), "utf8")) as { rev?: number }).rev;
    } catch {
      current = undefined;
    }
    if (current !== job.rev) {
      throw new JobError("Das Dokument wurde gleichzeitig geändert. Bitte die Seite neu laden und noch einmal versuchen.");
    }
    job.rev += 1;
    job.aktualisiert = now();
    writeFileAtomic(this.file(job.id), this.serialize(job));
  }

  /**
   * Prozessübergreifende Sperre (Oberfläche und MCP-Server laufen getrennt). Laden, Prüfen und Speichern eines
   * Dokuments geschehen immer unter dieser Sperre, damit keine Änderung verloren geht. Ablauf: siehe dateien.ts.
   */
  protected withLock<T>(name: string, fn: () => T): T {
    return withFileLock(path.join(this.locksDir, `${name}.lock`), LOCK_TIMEOUT_MS, fn, () => {
      throw new JobError("Das Dokument wird gerade von einem anderen Vorgang bearbeitet. Bitte gleich noch einmal versuchen.");
    });
  }

  /**
   * Laden, ändern und speichern unter der Sperre. Ein Dokument ohne Prüfsumme lässt sich nur noch verwerfen: Sonst
   * könnte jemand mit Schreibzugriff die Prüfsumme entfernen, ältere verschlüsselte Blöcke zurückspielen und der Bot
   * würde die Datei beim nächsten Speichern als echt signieren (z. B. bei der Freigabe einer geprüften Fassung).
   */
  private mutate<T>(id: string, fn: (job: StoredJob) => T, opts: { forAi?: boolean; legacy?: boolean } = {}): T {
    this.file(id);
    return this.withLock(`dokument-${id}`, () => {
      const job = this.readStored(id, opts.forAi);
      if (job.pruefsumme === undefined && !opts.legacy) throw new JobError(LEGACY_MESSAGE);
      return fn(job);
    });
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
      ...(job.kiFassung !== undefined ? { kiFassung: job.kiFassung } : {}),
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

  /**
   * Der Text, den die Erkennung sieht: Betreff, Text und bei Buchhaltung die Bezeichnungen aus dem Kontenplan, je
   * durch SEP_INTERN getrennt. Der Kontenplan geht mit an die KI; er läuft deshalb durch dieselbe Erkennung (dieselbe
   * Person bekommt überall denselben Platzhalter) und erscheint in der Vorschau.
   */
  private internText(job: StoredJob, secret: Geheim): { text: string; docLength: number; konten: Konto[] } {
    const doc = combine(secret.betreff, secret.text, SEP_INTERN);
    const konten =
      job.art === "buchhaltung"
        ? loadAccounts(this.configDir).map((k) => ({ nummer: k.nummer, name: normalizeChars(k.name).replace(/\n+/g, " ") }))
        : [];
    return { text: doc + konten.map((k) => SEP_INTERN + k.name).join(""), docLength: doc.length, konten };
  }

  private pseudonymizeInto(job: StoredJob, secret: Geheim, keep: Pick<KiTeil, "ergebnisKi" | "pruefung"> = {}): void {
    const { text: intern, docLength, konten } = this.internText(job, secret);
    const result = pseudonymize(intern, {
      manual: secret.manuell,
      excluded: secret.ausgeschlossen,
      companies: loadCompanies(this.configDir),
      assigned: secret.vergeben ?? {},
    });
    const parts = result.text.split(SEP_INTERN);
    const docParts = secret.betreff ? 2 : 1;
    if (parts.length !== docParts + konten.length) throw new Error("Interner Fehler: Die Teile des Dokuments ließen sich nicht trennen.");
    const betreffKi = secret.betreff ? (parts[0] ?? "") : "";
    const textKi = parts[docParts - 1] ?? "";
    const kontenplanKi = konten.map((k, i) => ({ nummer: k.nummer, name: parts[docParts + i] ?? "" }));

    const marks: Markierung[] = result.findings.map(({ start, end, type, id, source }) => ({ start, end, type, id, source }));
    secret.mapping = result.mapping;
    secret.literal = result.literal;
    secret.vergeben = result.assigned;
    secret.markierungen = marks.filter((m) => m.end <= docLength);
    let pos = docLength;
    const geprueft = konten.map((k) => {
      const start = pos + SEP_INTERN.length;
      pos = start + k.name.length;
      const end = pos;
      return { ...k, markierungen: marks.filter((m) => m.start >= start && m.end <= end).map((m) => ({ ...m, start: m.start - start, end: m.end - start })) };
    });
    if (geprueft.length) secret.konten = geprueft;
    else delete secret.konten;
    const ki: KiTeil = {
      betreffKi,
      textKi,
      platzhalter: placeholderLegend(result.mapping),
      ...(konten.length ? { kontenplanKi } : {}),
      ...keep,
    };
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
    // Mail entschlüsseln, HTML in Text, Zeichen vereinheitlichen: erkannt und geprüft wird derselbe Text.
    const prepared = prepareDocument(input.text);
    if (prepared.unlesbar) {
      throw new JobError(
        "Der Text enthält unlesbare Zeichen (z. B. � oder Steuerzeichen), vermutlich ein falscher Zeichensatz. Namen wären so nicht erkennbar. Bitte die Datei als UTF-8 speichern oder den Text direkt einfügen.",
      );
    }
    const text = prepared.text;
    const betreff = normalizeChars(input.betreff ?? "").replace(/\s*\n\s*/g, " ").trim();
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
      if (!createFileExclusive(this.file(id), this.serialize(job))) continue;
      const herkunft =
        prepared.quelle === "mail"
          ? ` (E-Mail entschlüsselt${prepared.weggelassen ? `, ${prepared.weggelassen} Anhang/Teil weggelassen` : ""})`
          : prepared.quelle === "html"
            ? " (HTML in Text umgewandelt)"
            : "";
      this.log(id, `Dokument abgelegt${herkunft}, ${secret.mapping.length} Angaben durch Platzhalter ersetzt`, quelle);
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
      konten: [],
      zuordnung: [],
      manuell: [],
      ausgeschlossen: [],
      lecks: [],
    };
    if (!job.geheim) return base;
    const secret = this.open<Geheim>(job, "geheim");
    return {
      ...base,
      original: combine(secret.betreff, secret.text, SEP_ANZEIGE),
      markierungen: secret.markierungen,
      konten: secret.konten ?? [],
      zuordnung: secret.mapping,
      manuell: secret.manuell,
      ausgeschlossen: secret.ausgeschlossen,
      lecks: secret.lecks ?? [],
      ...(secret.ergebnis ? { ergebnis: secret.ergebnis } : {}),
    };
  }

  /**
   * Zusätzlich schwärzen (Text in der Oberfläche markiert). stelle ist die Auswahl im Original (Anfang, Ende); sie
   * wird immer geschwärzt, auch wenn der Text anderswo als ganzes Wort vorkommt. Gibt die Zahl der Stellen zurück.
   */
  mark(id: string, mark: ManualMark, stelle?: [number, number]): { job: JobInfo; treffer: number } {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["neu"], "Markieren");
      const secret = this.open<Geheim>(job, "geheim");
      const value = normalizeChars(mark.value).trim();
      if (!value) throw new JobError("Leere Markierung.");
      const { text: intern, docLength } = this.internText(job, secret);
      if (stelle) {
        const [s, e] = stelle;
        if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > docLength || intern.slice(s, e) !== value) {
          throw new JobError("Die markierte Stelle passt nicht zum Dokument. Bitte nur innerhalb eines Absatzes markieren oder die Seite neu laden.");
        }
      }
      const existing = secret.manuell.find((m) => m.value.toLowerCase() === value.toLowerCase());
      const stellen = [...(existing?.stellen ?? []), ...(stelle ? [stelle] : [])];
      // Wird derselbe Text mit anderem Typ geschwärzt, gilt der neue Typ.
      const entry: ManualMark = { value: existing?.value ?? value, type: mark.type, ...(stellen.length ? { stellen } : {}) };
      const treffer = manualSpans(intern, entry).length;
      if (treffer === 0) {
        throw new JobError("Der markierte Text wurde so nicht im Dokument gefunden. Bitte nur innerhalb eines Absatzes markieren.");
      }
      secret.ausgeschlossen = secret.ausgeschlossen.filter((v) => v.toLowerCase() !== value.toLowerCase());
      secret.manuell = [...secret.manuell.filter((m) => m !== existing), entry];
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
      const v = normalizeChars(value).trim();
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

  /**
   * Für die KI freigeben. rev ist die Fassung, die der Mitarbeiter geprüft hat: Hat sich das Dokument inzwischen
   * geändert (z. B. in einem zweiten Fenster), wird die Freigabe abgelehnt.
   */
  releaseForAi(id: string, rev: number): JobInfo {
    return this.mutate(id, (job) => {
      this.requireStatus(job, ["neu"], "Freigeben für die KI");
      if (job.rev !== rev) {
        throw new JobError("Das Dokument wurde inzwischen geändert. Bitte die aktuelle Fassung prüfen und dann freigeben.");
      }
      job.status = "bereit";
      job.kiFassung = (job.kiFassung ?? 0) + 1;
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
      delete secret.lecks;
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
        // Die Nummer wird erst jetzt vergeben, damit verworfene Entwürfe keine Lücken erzeugen. Alles, was scheitern
        // kann (Firmendaten lesen), passiert vorher; gezählt wird die Nummer erst, wenn das Dokument gespeichert ist.
        // Auf die Rechnung kommen genau die Firmendaten, die im geprüften Entwurf standen. Wurden sie seitdem
        // geändert (z. B. eine neue IBAN), muss erst ein neuer Entwurf geprüft werden.
        const firma = loadOwnCompany(this.configDir);
        if (!result.firma || JSON.stringify(result.firma) !== JSON.stringify(firma)) {
          throw new JobError(
            "Die Firmendaten (config/firma.json) wurden seit dem Entwurf geändert. Bitte das Ergebnis an die KI zurückgeben und den neuen Entwurf prüfen.",
          );
        }
        this.assignInvoiceNumber((nummer) => {
          result.html = renderInvoiceHtml({ inhalt: result.rechnung, summen: result.summen, firma, nummer, datum: today() });
          job.rechnungsnummer = nummer;
          job.geheim = this.seal(job, "geheim", secret);
          job.status = "freigegeben";
          this.persist(job);
        });
      } else {
        job.status = "freigegeben";
        this.persist(job);
      }
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
      delete secret.lecks;
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
      if (job.rechnungsnummer && secret.ergebnis?.art === "rechnung") {
        const nummer = job.rechnungsnummer;
        const inhalt = JSON.stringify(secret.ergebnis);
        const archiv = {
          format: 2,
          nummer,
          dokument: id,
          archiviert: now(),
          schluessel: this.keyKennung,
          inhalt: encrypt(this.secretKey(), inhalt, `rechnung:${nummer}`),
        };
        // Liegt genau diese Rechnung schon im Archiv, war ein früherer Abschluss unterbrochen: dann weitermachen.
        if (!createFileExclusive(this.archiveFile(nummer), JSON.stringify(archiv, null, 2)) && !this.isArchived(nummer, id, inhalt)) {
          throw new JobError(`Im Archiv gibt es schon eine andere Rechnung ${nummer}. Bitte die Daten prüfen.`);
        }
      }
      delete job.geheim;
      delete job.ki;
      // Auch der Titel kann übersehene Angaben enthalten: Übrig bleiben nur ID, Art und Zeiten.
      job.kopf = this.seal(job, "kopf", { titel: "", titelKi: "", betreffKi: "" } satisfies Kopf);
      job.status = "abgeschlossen";
      this.persist(job);
      removeLeftovers(this.file(id));
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
    // Auch Dokumente ohne Prüfsumme: Verwerfen gibt nichts heraus und signiert nichts.
    this.mutate(id, (job) => {
      if (job.rechnungsnummer) {
        throw new JobError(
          `Die Rechnung ${job.rechnungsnummer} hat schon eine Nummer und darf nicht gelöscht werden. Bitte abschließen; sie kommt dann ins Archiv.`,
        );
      }
      fs.rmSync(this.file(id));
      // Auch Zwischendateien eines abgebrochenen Speicherns: Sie enthalten noch die verschlüsselten Originale.
      removeLeftovers(this.file(id));
      this.log(id, "Dokument verworfen und gelöscht", "oberflaeche");
    }, { legacy: true });
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
      return { dateiname: `${base}-buchungen.csv`, typ: "text/csv; charset=utf-8", inhalt: "\uFEFF" + bookingsToCsv(result.buchungen) };
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

  /** Liegt im Archiv genau diese Rechnung (gleiches Dokument, gleicher Inhalt)? */
  private isArchived(nummer: string, dokument: string, inhalt: string): boolean {
    try {
      const archiv = JSON.parse(fs.readFileSync(this.archiveFile(nummer), "utf8")) as { dokument?: string; inhalt?: string };
      return archiv.dokument === dokument && decrypt(this.secretKey(), archiv.inhalt ?? "", `rechnung:${nummer}`) === inhalt;
    } catch {
      return false;
    }
  }

  /**
   * Vergibt die nächste Rechnungsnummer und speichert damit, alles unter der Nummern-Sperre. Gezählt wird erst nach
   * dem Speichern: Scheitert es, ist keine Nummer verbraucht. Die nächste Nummer richtet sich nach dem Zähler und nach
   * den Nummern, die tatsächlich in Dokumenten und im Archiv stehen. So gibt es auch nach einem Absturz zwischen
   * Speichern und Zählen keine Nummer doppelt.
   */
  private assignInvoiceNumber(save: (nummer: string) => void): void {
    this.withLock("rechnungsnummern", () => {
      const year = String(new Date().getFullYear());
      let counters: Record<string, number> = {};
      const raw = readOptional(this.numbersFile);
      if (raw !== undefined) {
        // Nie neu bei 1 anfangen und nie mit einem unsinnigen Wert weiterzählen: das gäbe doppelte oder ungültige
        // Nummern. Erwartet wird {"2026": 12, ...} mit ganzen Zahlen ab 0.
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
        const valid =
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed) &&
          Object.entries(parsed).every(([k, v]) => /^\d{4}$/.test(k) && Number.isSafeInteger(v) && (v as number) >= 0);
        if (!valid) {
          throw new JobError("Die Datei mit den Rechnungsnummern ist beschädigt. Bitte prüfen, bevor weitere Rechnungen freigegeben werden.");
        }
        counters = parsed as Record<string, number>;
      }
      const next = Math.max(counters[year] ?? 0, this.highestUsedNumber(year)) + 1;
      save(`${year}-${String(next).padStart(4, "0")}`);
      counters[year] = next;
      try {
        writeFileAtomic(this.numbersFile, JSON.stringify(counters, null, 2));
      } catch {
        // Die Nummer steht schon im Dokument; die nächste Vergabe findet sie dort.
      }
    });
  }

  /** Höchste laufende Nummer eines Jahres, die in Dokumenten oder im Archiv vorkommt. */
  private highestUsedNumber(year: string): number {
    let max = 0;
    const consider = (nummer: unknown) => {
      const m = typeof nummer === "string" ? /^(\d{4})-(\d+)$/.exec(nummer) : null;
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    };
    for (const f of fs.readdirSync(this.archiveDir)) if (f.endsWith(".json")) consider(f.slice(0, -5));
    for (const f of fs.readdirSync(this.jobsDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        consider((JSON.parse(fs.readFileSync(path.join(this.jobsDir, f), "utf8")) as { rechnungsnummer?: unknown }).rechnungsnummer);
      } catch {
        // defekte Datei: wird in der Liste gemeldet
      }
    }
    return max;
  }

  // -------------------------------------------------------------------------
  // KI (MCP-Server). Hier kommen nie Originaldaten heraus.

  listForAi(): Array<{ id: string; art: JobArt; betreff: string; erstellt: string }> {
    const out: Array<{ id: string; art: JobArt; betreff: string; erstellt: string }> = [];
    for (const f of fs.readdirSync(this.jobsDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const job = this.readStored(f.slice(0, -5), true);
        if (job.status !== "bereit") continue;
        out.push({ id: job.id, art: job.art, betreff: this.open<Kopf>(job, "kopf").betreffKi, erstellt: job.erstellt });
      } catch {
        // defekte oder fremde Dateien überspringen
      }
    }
    return out.sort((a, b) => b.erstellt.localeCompare(a.erstellt));
  }

  readForAi(id: string): KiDokument {
    const job = this.readStored(id, true);
    if (job.status === "neu") throw new JobError("Dieses Dokument ist noch nicht für die KI freigegeben.");
    this.requireStatus(job, ["bereit", "zur_pruefung"], "Lesen");
    const ki = this.open<KiTeil>(job, "ki");
    this.log(id, "Von der KI gelesen (Platzhalter-Fassung)", "ki");
    return {
      id: job.id,
      art: job.art,
      fassung: job.kiFassung ?? 0,
      betreff: ki.betreffKi,
      text: ki.textKi,
      platzhalter: ki.platzhalter,
      // Der Kontenplan so, wie er geprüft und freigegeben wurde (mit Platzhaltern), nie frisch aus der Konfiguration.
      ...(ki.kontenplanKi ? { kontenplan: ki.kontenplanKi } : {}),
    };
  }

  /**
   * Ergebnis der KI übernehmen: Platzhalter zurückübersetzen, nachrechnen, prüfen.
   * Die Antwort an die KI enthält nur Prüfhinweise und Beträge, keine Originaldaten: Hinweise entstehen nur aus
   * dem, was die KI selbst geschrieben hat, und aus Beträgen und Kontonummern vor der Rückübersetzung.
   */
  saveResult(
    id: string,
    ergebnis: ErgebnisKi,
    fassung: number,
  ): { pruefung: Pruefung; summen?: { netto: number; ust: number; brutto: number } } {
    checkSize(ergebnis);
    if (ergebnis.art === "rechnung") checkInvoiceInput(ergebnis.rechnung);
    return this.mutate(id, (job) => {
      // Solange noch niemand freigegeben hat, darf die KI ihr Ergebnis korrigieren. Jede neue Fassung braucht
      // eine neue Prüfung, denn die Freigabe nennt die geprüfte Version.
      this.requireStatus(job, ["bereit", "zur_pruefung"], "Ergebnis speichern");
      // Das Ergebnis muss zur Fassung gehören, die gerade freigegeben ist. Nach einer Änderung (zurück zur Prüfung,
      // neu markiert) können Platzhalter andere Personen bezeichnen: Dann lieber ablehnen als falsch einsetzen.
      if (job.kiFassung === undefined) {
        throw new JobError("Dieses Dokument wurde mit einer älteren Version freigegeben. Bitte in der Oberfläche zurück zur Prüfung holen und neu freigeben.");
      }
      if (fassung !== job.kiFassung) {
        throw new JobError(
          `Das Dokument wurde seit dem Lesen geändert (jetzt Fassung ${job.kiFassung}). Bitte mit dokument_lesen neu lesen und das Ergebnis neu erstellen.`,
        );
      }
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
        fertig = { art: "rechnung", rechnung: inhalt, summen: s, firma, html: renderInvoiceHtml({ inhalt, summen: s, firma, datum: today() }) };
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
      // Hat die KI Kontaktdaten "erfunden", die im Original stehen, hat die Erkennung sie übersehen: deutlich melden
      // (nur in der Oberfläche; die KI erfährt nichts über das Original).
      const original = this.internText(job, secret).text;
      const imOriginal = originalMatcher(original);
      secret.lecks = erfunden.filter((e) => imOriginal(e)).map((e) => `${e.label}: ${e.value}`);
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
    }, { forAi: true });
  }
}

/**
 * Steht eine von der KI geschriebene Kontaktangabe im Original (Ziffern bzw. Adresse verglichen)? Das Original wird
 * nur einmal aufbereitet, auch bei sehr vielen Angaben (Review Claude 3 #14).
 */
function originalMatcher(original: string): (inv: InventedData) => boolean {
  const norm = (v: string) => v.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();
  const lower = original.toLowerCase();
  const normalized = norm(original);
  return (inv) => {
    if (inv.type === "EMAIL") return lower.includes(inv.value.toLowerCase());
    const target = norm(inv.value);
    return target.length >= 6 && normalized.includes(target);
  };
}

/**
 * Eine Rechnung muss aus den sichtbaren Angaben nachvollziehbar sein: einheitlich netto oder brutto, und Mengen und
 * Preise nur so genau, wie die Rechnung sie zeigt.
 */
function checkInvoiceInput(r: RechnungInhalt): void {
  const brutto = r.positionen.filter((p) => p.preis_ist_brutto).length;
  if (brutto > 0 && brutto < r.positionen.length) {
    throw new JobError(
      "Die Positionen mischen Brutto- und Nettopreise. Bitte alle Preise einheitlich netto oder einheitlich brutto angeben (preis_ist_brutto bei allen Positionen gleich).",
    );
  }
  r.positionen.forEach((p, i) => {
    if (nachkommastellen(p.menge) > 3) throw new JobError(`Position ${i + 1}: Menge bitte mit höchstens 3 Nachkommastellen angeben.`);
    if (nachkommastellen(p.einzelpreis) > 4) {
      throw new JobError(`Position ${i + 1}: Einzelpreis bitte mit höchstens 4 Nachkommastellen angeben.`);
    }
  });
  // Rabattzeilen dürfen negativ sein, die Rechnung als Ganzes nicht und auch kein einzelner Steuersatz: Eine
  // Gutschrift braucht den Bezug zur ursprünglichen Rechnung, das kann der Bot noch nicht. Geprüft wird der
  // berechnete Zahlbetrag mit Steuer.
  const summen = computeInvoice(r.positionen);
  const negativ = summen.steuern.find((g) => g.brutto < 0);
  if (negativ) {
    throw new JobError(
      `Im Steuersatz ${negativ.satz} % ergibt sich ein negativer Betrag. Rabatte bitte im selben Steuersatz wie die rabattierten Leistungen angeben. Gutschriften (mit Bezug auf die ursprüngliche Rechnung) kann der Bot noch nicht erstellen.`,
    );
  }
  if (summen.brutto <= 0) {
    throw new JobError("Der Rechnungsbetrag ist nicht positiv. Gutschriften (mit Bezug auf die ursprüngliche Rechnung) kann der Bot noch nicht erstellen.");
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
