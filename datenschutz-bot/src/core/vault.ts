import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_FILE = ".schluessel";

export class KeyError extends Error {}

function parseKey(raw: string, source: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new KeyError(`${source} ist kein gültiger Schlüssel (32 Byte, Base64-kodiert).`);
  return key;
}

/** Woher der Schlüssel kommt. "datenordner": Er liegt neben den Daten, das ist nur für Tests und Ausprobieren gedacht. */
export function keySource(): "umgebung" | "datei" | "datenordner" {
  if (process.env.DSB_KEY) return "umgebung";
  if (process.env.DSB_KEY_FILE) return "datei";
  return "datenordner";
}

export const KEY_WARNING =
  "Hinweis: Der Schlüssel liegt im Datenordner. Wer den Ordner lesen kann (auch ein KI-Agent mit Shell unter demselben Benutzer), kann alles entschlüsseln. Für echte Daten DSB_KEY_FILE außerhalb des Datenordners setzen und den Bot unter eigenem Benutzer betreiben (siehe README, Sicherheit).";

/** Kurze Kennung eines Schlüssels. Steht bei jedem Dokument, damit ein falscher Schlüssel sofort auffällt. */
export function keyId(key: Buffer): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/**
 * Schlüssel für die Verschlüsselung. Reihenfolge:
 * 1. Umgebungsvariable DSB_KEY (Base64, 32 Byte),
 * 2. Datei aus DSB_KEY_FILE (z. B. außerhalb des Datenordners, nur für den Bot-Benutzer lesbar),
 * 3. Schlüsseldatei im Datenordner.
 * Einen neuen Schlüssel legt der Bot nur an, wenn mayCreate() das erlaubt (keine verschlüsselten Dokumente da sind).
 * Sonst würde ein zweiter Prozess ohne DSB_KEY still einen zweiten Schlüssel erzeugen.
 * Für den Echtbetrieb gehört der Schlüssel in einen Schlüsselspeicher (KMS/HSM), nicht neben die Daten.
 */
export function loadOrCreateKey(dataDir: string, mayCreate: () => boolean = () => true): Buffer {
  if (process.env.DSB_KEY) return parseKey(process.env.DSB_KEY, "DSB_KEY");
  const file = process.env.DSB_KEY_FILE ? path.resolve(process.env.DSB_KEY_FILE) : path.join(dataDir, KEY_FILE);
  if (fs.existsSync(file)) return parseKey(fs.readFileSync(file, "utf8"), `Schlüsseldatei ${file}`);
  if (process.env.DSB_KEY_FILE) throw new KeyError(`Schlüsseldatei ${file} (DSB_KEY_FILE) fehlt.`);
  if (!mayCreate()) {
    throw new KeyError(
      "Kein Schlüssel gefunden, aber es gibt bereits verschlüsselte Dokumente. Bitte DSB_KEY bzw. DSB_KEY_FILE " +
        "so setzen wie bei der Oberfläche, oder die Schlüsseldatei wiederherstellen.",
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(file, key.toString("base64"), { mode: 0o600, flag: "wx" });
    return key;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    // Ein anderer Prozess (Oberfläche oder MCP-Server) war schneller.
    return parseKey(fs.readFileSync(file, "utf8"), `Schlüsseldatei ${file}`);
  }
}

/**
 * AES-256-GCM. "kontext" (z. B. Dokument-ID und Feld) wird als zusätzliche authentifizierte Daten mitgeprüft:
 * Ein verschlüsselter Block lässt sich so nicht in ein anderes Dokument oder Feld kopieren.
 */
export function encrypt(key: Buffer, plaintext: string, kontext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(kontext, "utf8"));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2.${Buffer.concat([iv, tag, data]).toString("base64")}`;
}

export function decrypt(key: Buffer, payload: string, kontext: string): string {
  if (!payload.startsWith("v2.")) throw new Error("Unbekanntes Verschlüsselungsformat.");
  const raw = Buffer.from(payload.slice(3), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(kontext, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
