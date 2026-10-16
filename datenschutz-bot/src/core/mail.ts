// E-Mails im MIME-Format (.eml) lesbar machen, bevor die Erkennung läuft. Übliche Mails sind Quoted-Printable oder
// Base64 kodiert, Kopfzeilen nutzen "encoded words", HTML-Teile Entities. Roh abgelegt würde die Erkennung daran
// vorbeilaufen. Anhänge und unbekannte Teile werden weggelassen. Nur eingebaute Funktionen (TextDecoder).

export interface MailText {
  text: string;
  /** Weggelassene Anhänge und nicht lesbare Teile. */
  weggelassen: number;
}

// Kopfnamen nach RFC 5322: druckbare Zeichen außer Doppelpunkt ("X_Mailer_Info:" ist erlaubt).
const HEADER_LINE = /^[!-9;-~]{1,76}:/;
// Trennzeile aus mbox-Postfächern vor der eigentlichen Mail: "From anna@example.com Mon Oct 12 09:14:00 2026"
const MBOX_FROM = /^From [^\n]{1,200}\n/;
const MAX_DEPTH = 8;

/** Sieht der Text wie eine MIME-Nachricht aus (Kopfzeilen, Leerzeile, darunter MIME-Angaben)? */
function looksLikeMime(raw: string): boolean {
  const end = raw.indexOf("\n\n");
  if (end <= 0) return false;
  const head = raw.slice(0, end);
  const lines = head.split("\n");
  if (!HEADER_LINE.test(lines[0] ?? "")) return false;
  if (!lines.every((l) => HEADER_LINE.test(l) || /^[ \t]/.test(l))) return false;
  return /^(?:mime-version|content-type|content-transfer-encoding)[ \t]*:/im.test(head);
}

interface Entity {
  headers: Map<string, string>;
  body: string;
}

function parseEntity(raw: string): Entity {
  const end = raw.indexOf("\n\n");
  const head = end === -1 ? raw : raw.slice(0, end);
  const body = end === -1 ? "" : raw.slice(end + 2);
  const headers = new Map<string, string>();
  let last = "";
  for (const line of head.split("\n")) {
    if (/^[ \t]/.test(line) && last) {
      headers.set(last, `${headers.get(last) ?? ""} ${line.trim()}`);
      continue;
    }
    const i = line.indexOf(":");
    if (i <= 0) continue;
    last = line.slice(0, i).trim().toLowerCase();
    if (!headers.has(last)) headers.set(last, line.slice(i + 1).trim());
  }
  return { headers, body };
}

/** "text/plain; charset=utf-8; name=\"a b\"" → { type: "text/plain", params: { charset: "utf-8", name: "a b" } } */
function parseHeaderValue(value: string): { type: string; params: Record<string, string> } {
  const [type = "", ...rest] = value.split(";");
  const params: Record<string, string> = {};
  for (const m of rest.join(";").matchAll(/([A-Za-z0-9*-]{1,60})[ \t]*=[ \t]*(?:"([^"]{0,500})"|([^;\s]{0,500}))/g)) {
    params[(m[1] ?? "").toLowerCase()] = m[2] ?? m[3] ?? "";
  }
  return { type: type.trim().toLowerCase(), params };
}

function decoder(charset: string | undefined): TextDecoder {
  try {
    return new TextDecoder((charset ?? "utf-8").trim().toLowerCase() || "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

function decodeQuotedPrintable(value: string, underscoreIsSpace = false): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < value.length; i++) {
    const c = value[i] ?? "";
    if (c === "=") {
      const hex = value.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
      // weicher Zeilenumbruch "=\n"
      const soft = /^[ \t]*\n/.exec(value.slice(i + 1, i + 40));
      if (soft) {
        i += soft[0].length;
        continue;
      }
    }
    if (underscoreIsSpace && c === "_") {
      bytes.push(0x20);
      continue;
    }
    for (const b of encoder.encode(c)) bytes.push(b);
  }
  return Uint8Array.from(bytes);
}

function decodeBody(body: string, encoding: string, charset: string | undefined): string {
  const enc = encoding.trim().toLowerCase();
  if (enc === "base64") return decoder(charset).decode(Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64"));
  if (enc === "quoted-printable") return decoder(charset).decode(decodeQuotedPrintable(body));
  return body;
}

/** "=?utf-8?Q?J=C3=BCrgen?= =?utf-8?B?...?=" → "Jürgen …" */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/(\?=)[ \t]+(?==\?)/g, "$1")
    .replace(/=\?([^?\s]{1,40})\?([BbQq])\?([^?\s]{0,2000})\?=/g, (_m, charset: string, kind: string, text: string) => {
      const bytes = kind.toUpperCase() === "B" ? Buffer.from(text, "base64") : decodeQuotedPrintable(text, true);
      return decoder(charset).decode(bytes);
    });
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", copy: "©", reg: "®", shy: "",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", eacute: "é", egrave: "è",
  ecirc: "ê", Eacute: "É", agrave: "à", aacute: "á", acirc: "â", ccedil: "ç", iacute: "í", igrave: "ì",
  oacute: "ó", ograve: "ò", ocirc: "ô", uacute: "ú", ugrave: "ù", ntilde: "ñ", aring: "å", oslash: "ø",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘",
  rsquo: "’", middot: "·", bull: "•",
};

/** HTML-Entities auflösen (benannte aus der Liste, dezimal und hexadezimal). */
export function decodeEntities(value: string): string {
  return value.replace(/&(?:#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z]{2,10}));/g, (m, dec?: string, hex?: string, name?: string) => {
    if (dec || hex) {
      const code = dec ? Number(dec) : parseInt(hex ?? "", 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[name ?? ""] ?? m;
  });
}

/** Ein Block wie <script>…</script> entfernen, ohne Regex über den ganzen Text (lineare Laufzeit). */
/** Das nächste Tag mit genau diesem Namen: "<head" trifft nicht "<header>" (Review Codex 4 #7). */
function findTag(lower: string, prefix: string, from: number): number {
  for (let i = lower.indexOf(prefix, from); i !== -1; i = lower.indexOf(prefix, i + 1)) {
    const next = lower[i + prefix.length];
    if (next === undefined || next === ">" || next === "/" || /\s/.test(next)) return i;
  }
  return -1;
}

function dropBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let pos = 0;
  for (;;) {
    const start = findTag(lower, `<${tag}`, pos);
    if (start === -1) break;
    const end = findTag(lower, `</${tag}`, start);
    out += html.slice(pos, start);
    if (end === -1) return out;
    const close = lower.indexOf(">", end);
    pos = close === -1 ? html.length : close + 1;
  }
  return out + html.slice(pos);
}

const BLOCK_TAGS = new Set(["p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "blockquote", "section", "article", "header", "footer"]);

/** Was an die Stelle eines Tags tritt: Zeilenumbruch nach Absätzen, Leerzeichen zwischen Zellen, sonst nichts. */
function tagReplacement(inner: string): string {
  const closing = inner.startsWith("/");
  const name = (/^\/?\s*([A-Za-z][A-Za-z0-9]{0,15})/.exec(inner)?.[1] ?? "").toLowerCase();
  if (name === "br") return "\n";
  if (closing && BLOCK_TAGS.has(name)) return "\n";
  if (!closing && (name === "td" || name === "th")) return " ";
  return "";
}

/** Tags entfernen in einem Durchgang (lineare Laufzeit, auch bei "<" ohne passendes ">"). */
function stripTags(s: string): string {
  const out: string[] = [];
  let plain = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] !== "<") {
      i++;
      continue;
    }
    let j = i + 1;
    const limit = Math.min(s.length, i + 2000);
    while (j < limit && s[j] !== ">" && s[j] !== "<") j++;
    if (j < limit && s[j] === ">") {
      out.push(s.slice(plain, i), tagReplacement(s.slice(i + 1, j)));
      i = j + 1;
      plain = i;
    } else {
      i++;
    }
  }
  out.push(s.slice(plain));
  return out.join("");
}

/** HTML als Text: Absätze und Zeilenumbrüche bleiben, Tags verschwinden, Entities werden aufgelöst. */
export function htmlToText(html: string): string {
  let s = html;
  for (const tag of ["head", "script", "style", "title"]) s = dropBlocks(s, tag);
  return decodeEntities(stripTags(s))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sieht ein Text wie HTML aus (typische Tags)? */
export function looksLikeHtml(value: string): boolean {
  return /<(?:html|body|p|div|br|span|table|td|tr|font|b|i|strong|em|a)\b[^>]{0,500}>/i.test(value);
}

interface Collected {
  plain: string[];
  weggelassen: number;
}

function collect(entity: Entity, out: Collected, depth: number): void {
  const { type, params } = parseHeaderValue(entity.headers.get("content-type") ?? "text/plain");
  const disposition = parseHeaderValue(entity.headers.get("content-disposition") ?? "").type;
  const encoding = entity.headers.get("content-transfer-encoding") ?? "7bit";
  if (depth > MAX_DEPTH) {
    out.weggelassen++;
    return;
  }
  if (type.startsWith("multipart/") && params.boundary) {
    const parts = splitMultipart(entity.body, params.boundary);
    if (type === "multipart/alternative") {
      // Eine Fassung genügt: Text bevorzugt, sonst HTML.
      const entities = parts.map(parseEntity);
      const plain = entities.find((e) => parseHeaderValue(e.headers.get("content-type") ?? "text/plain").type === "text/plain");
      const chosen = plain ?? entities[0];
      if (chosen) collect(chosen, out, depth + 1);
      return;
    }
    for (const part of parts) collect(parseEntity(part), out, depth + 1);
    return;
  }
  if (disposition === "attachment") {
    out.weggelassen++;
    return;
  }
  if (type === "message/rfc822") {
    const inner = decodeBody(entity.body, encoding, params.charset);
    out.plain.push("---------- Weitergeleitete Nachricht ----------", mailHeaderLines(parseEntity(inner)).join("\n"));
    collect(parseEntity(inner), out, depth + 1);
    return;
  }
  if (type === "text/plain" || type === "") {
    out.plain.push(decodeBody(entity.body, encoding, params.charset));
    return;
  }
  if (type === "text/html") {
    out.plain.push(htmlToText(decodeBody(entity.body, encoding, params.charset)));
    return;
  }
  out.weggelassen++;
}

function splitMultipart(body: string, boundary: string): string[] {
  const parts: string[] = [];
  const marker = `--${boundary}`;
  const lines = body.split("\n");
  let current: string[] | null = null;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === marker || trimmed === `${marker}--`) {
      if (current) parts.push(current.join("\n"));
      current = trimmed === marker ? [] : null;
      if (trimmed !== marker) break;
      continue;
    }
    if (current) current.push(line);
  }
  if (current && current.length) parts.push(current.join("\n"));
  return parts;
}

const SHOWN_HEADERS: Array<[string, string]> = [
  ["from", "Von"],
  ["to", "An"],
  ["cc", "Cc"],
  ["date", "Datum"],
  ["subject", "Betreff"],
];

function mailHeaderLines(entity: Entity): string[] {
  const lines: string[] = [];
  for (const [key, label] of SHOWN_HEADERS) {
    const value = entity.headers.get(key);
    if (value) lines.push(`${label}: ${decodeEncodedWords(value)}`);
  }
  return lines;
}

/**
 * Macht aus einer MIME-Nachricht lesbaren Text: wichtige Kopfzeilen (Von, An, Cc, Datum, Betreff), dann die Textteile.
 * Gibt null zurück, wenn der Text keine MIME-Nachricht ist.
 */
export function decodeMail(input: string): MailText | null {
  const raw = input.replace(MBOX_FROM, "");
  if (!looksLikeMime(raw)) return null;
  const entity = parseEntity(raw);
  const out: Collected = { plain: [], weggelassen: 0 };
  collect(entity, out, 0);
  const body = out.plain.map((p) => p.trim()).filter(Boolean).join("\n\n");
  const lines = [...mailHeaderLines(entity), "", body];
  if (out.weggelassen) lines.push("", `[${out.weggelassen} Anhang/Teil weggelassen]`);
  return { text: lines.join("\n").trim(), weggelassen: out.weggelassen };
}
