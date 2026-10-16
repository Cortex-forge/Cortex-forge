// Dateien und Sperren für die Ablage: atomar schreiben, exklusiv anlegen, prozessübergreifend sperren.
// Oberfläche und MCP-Server sind getrennte Prozesse mit demselben Datenordner.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Name einer Zwischendatei neben der Zieldatei. Reste davon räumt removeLeftovers() weg. */
function tmpName(file: string): string {
  return `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
}

/**
 * Legt eine neue Datei an und schreibt den ganzen Inhalt. Ein kürzerer Schreibvorgang (Platte voll, Größenlimit) gilt
 * als Fehler. Scheitert etwas, wird die Datei wieder entfernt: Kein halber Inhalt und kein verschlüsselter Rest bleibt.
 */
function writeNewFile(target: string, content: string): void {
  const data = Buffer.from(content, "utf8");
  const fd = fs.openSync(target, "wx", 0o600);
  try {
    try {
      let written = 0;
      while (written < data.length) {
        const n = fs.writeSync(fd, data, written, data.length - written);
        if (n <= 0) throw new Error(`Die Datei ${target} konnte nicht vollständig geschrieben werden.`);
        written += n;
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    fs.rmSync(target, { force: true });
    throw err;
  }
}

/** Ersetzt eine Datei in einem Schritt. Bis zum Ersetzen bleibt der bisherige Inhalt vollständig erhalten. */
export function writeFileAtomic(file: string, content: string): void {
  const tmp = tmpName(file);
  writeNewFile(tmp, content);
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

/** Fehler beim Anlegen eines Hardlinks, wenn das Dateisystem keine kann (z. B. FAT, manche Netzlaufwerke). */
const NO_HARDLINKS = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV", "EINVAL"]);

/**
 * Legt eine Datei nur an, wenn es sie noch nicht gibt, und zwar gleich mit vollständigem Inhalt: Der Inhalt wird
 * erst in eine eigene Datei geschrieben und dann per Hardlink veröffentlicht. Gibt false zurück, wenn es die Datei
 * schon gibt. Ohne Hardlinks wird exklusiv angelegt und danach geschrieben (kurz unvollständig sichtbar).
 */
export function createFileExclusive(file: string, content: string): boolean {
  const tmp = tmpName(file);
  writeNewFile(tmp, content);
  try {
    fs.linkSync(tmp, file);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (code === "EEXIST") return false;
    if (!NO_HARDLINKS.has(code)) throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  try {
    writeNewFile(file, content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
  return true;
}

/**
 * Entfernt Zwischendateien, die zu einer Datei gehören (etwa nach einem Absturz zwischen Schreiben und Ersetzen). Sie
 * sind verschlüsselt, ließen sich mit dem Schlüssel aber noch lesen. Nur unter der Sperre der Datei aufrufen.
 */
export function removeLeftovers(file: string): void {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.`;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(prefix) && /^\d+\.[0-9a-f]{8}\.tmp$/.test(f.slice(prefix.length))) fs.rmSync(path.join(dir, f), { force: true });
  }
}

/** Inhalt einer Datei oder undefined, wenn es sie (gerade) nicht gibt. */
export function readOptional(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** Kennung des laufenden Systemstarts. Eine Sperre aus einem früheren Start ist sicher verwaist. */
const BOOT_ID = readOptional("/proc/sys/kernel/random/boot_id")?.trim() ?? "";
/** Startzeit des Systems; dort, wo es keine Startkennung gibt (Windows, macOS). */
const BOOT_TIME = Date.now() - os.uptime() * 1000;

/** Unter Linux: Startzeitpunkt eines Prozesses (Feld 22 in /proc/<pid>/stat), um neu vergebene Prozessnummern zu erkennen. */
function processStart(pid: number): string | undefined {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  } catch {
    return undefined;
  }
}

interface LockOwner {
  pid: number;
  boot?: string;
  bootZeit?: number;
  start?: string;
  token?: string;
}

const OWN_START = processStart(process.pid);

function lockContent(): string {
  const owner: LockOwner = {
    pid: process.pid,
    boot: BOOT_ID,
    bootZeit: BOOT_TIME,
    ...(OWN_START ? { start: OWN_START } : {}),
    token: crypto.randomBytes(8).toString("hex"),
  };
  return JSON.stringify(owner);
}

function parseLock(raw: string): LockOwner | null {
  try {
    const owner = JSON.parse(raw) as LockOwner;
    if (Number.isInteger(owner.pid) && owner.pid > 0) return owner;
  } catch {
    // älteres Format "pid:zeit"
    const pid = Number(/^(\d+):\d+$/.exec(raw.trim())?.[1]);
    if (Number.isInteger(pid) && pid > 0) return { pid };
  }
  return null;
}

/**
 * Ist der Besitzer einer Sperre sicher nicht mehr da? Nur dann darf sie weg. Eine Sperre wird nie nur wegen ihres
 * Alters entfernt: Sie gilt als verwaist, wenn sie aus einem früheren Systemstart stammt, der Prozess nicht mehr
 * existiert oder (unter Linux) die Prozessnummer inzwischen einem anderen Prozess gehört.
 */
function ownerGone(owner: LockOwner): boolean {
  if (owner.boot !== undefined) {
    if (owner.boot && BOOT_ID) {
      if (owner.boot !== BOOT_ID) return true;
    } else if (owner.bootZeit !== undefined && Math.abs(owner.bootZeit - BOOT_TIME) > 120_000) {
      return true;
    }
  }
  try {
    process.kill(owner.pid, 0);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return true;
  }
  if (owner.start !== undefined) {
    const current = processStart(owner.pid);
    if (current !== undefined && current !== owner.start) return true;
  }
  return false;
}

/** Verwaiste Sperre? Unlesbare Inhalte (nur ohne Hardlinks kurz möglich) erst nach 10 Sekunden. */
function lockAbandoned(file: string, raw: string): boolean {
  const owner = parseLock(raw);
  if (owner) return ownerGone(owner);
  try {
    return Date.now() - fs.statSync(file).mtimeMs > 10_000;
  } catch {
    return false;
  }
}

/**
 * Prozessübergreifende Sperre über eine Datei. Die Sperrdatei entsteht in einem Schritt mit vollständigem Inhalt (wer
 * sie sieht, sieht auch den Besitzer). Freigeben darf nur der Besitzer. Verwaiste Sperren (Besitzer nicht mehr da)
 * räumt immer nur ein Vorgang auf, und nur, wenn die Sperre noch dieselbe ist. timeout() wird aufgerufen, wenn die
 * Sperre nach timeoutMs noch belegt ist, und muss einen Fehler werfen.
 */
export function withFileLock<T>(lockFile: string, timeoutMs: number, fn: () => T, timeout: () => never): T {
  const mine = lockContent();
  const deadline = Date.now() + timeoutMs;
  while (!createFileExclusive(lockFile, mine)) {
    // Jede erfolglose Runde zählt, auch das Warten auf einen anderen Vorgang, der gerade aufräumt (Review Codex 4 #9).
    if (Date.now() > deadline) timeout();
    const held = readOptional(lockFile);
    if (held !== undefined && lockAbandoned(lockFile, held)) {
      breakLock(lockFile, held, mine);
    } else if (held !== undefined) {
      sleep(20);
    }
  }
  try {
    return fn();
  } finally {
    if (readOptional(lockFile) === mine) fs.rmSync(lockFile, { force: true });
  }
}

/** Eine verwaiste Sperre entfernen. Ein zweiter Sperr-Schritt sorgt dafür, dass nie eine frische Sperre verschwindet. */
function breakLock(lockFile: string, stale: string, mine: string): void {
  const breaker = `${lockFile}.aufraeumen`;
  if (!createFileExclusive(breaker, mine)) {
    // Ein anderer Vorgang räumt gerade auf. Ist dieser selbst verwaist, seinen Rest entfernen.
    const other = readOptional(breaker);
    if (other !== undefined && lockAbandoned(breaker, other) && readOptional(breaker) === other) fs.rmSync(breaker, { force: true });
    sleep(5);
    return;
  }
  try {
    if (readOptional(lockFile) === stale) fs.rmSync(lockFile, { force: true });
  } finally {
    fs.rmSync(breaker, { force: true });
  }
}
