import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_FILE = ".schluessel";

/**
 * Schlüssel für die Verschlüsselung der Originaldaten.
 * Reihenfolge: Umgebungsvariable DSB_KEY (Base64, 32 Byte), sonst Schlüsseldatei im Datenordner.
 * Für den Echtbetrieb gehört der Schlüssel in einen Schlüsselspeicher (KMS/HSM), nicht neben die Daten.
 */
export function loadOrCreateKey(dataDir: string): Buffer {
  const fromEnv = process.env.DSB_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("DSB_KEY muss 32 Byte lang sein (Base64-kodiert).");
    return key;
  }
  const file = path.join(dataDir, KEY_FILE);
  if (fs.existsSync(file)) {
    const key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
    if (key.length !== 32) throw new Error(`Schlüsseldatei ${file} ist beschädigt.`);
    return key;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(file, key.toString("base64"), { mode: 0o600, flag: "wx" });
    return key;
  } catch {
    // Ein anderer Prozess (Weboberfläche oder MCP-Server) war schneller.
    return Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
  }
}

export function encrypt(key: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${Buffer.concat([iv, tag, data]).toString("base64")}`;
}

export function decrypt(key: Buffer, payload: string): string {
  if (!payload.startsWith("v1.")) throw new Error("Unbekanntes Verschlüsselungsformat.");
  const raw = Buffer.from(payload.slice(3), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
