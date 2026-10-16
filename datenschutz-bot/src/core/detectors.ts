import { FIRST_NAMES, NOT_NAME_AFTER_SALUTATION, NOT_SURNAME } from "./names.js";
import type { CompanyEntry, DetectOptions, EntityType, Finding } from "./types.js";

// Großbuchstabe am Wortanfang, danach Kleinbuchstaben (inkl. Umlaute und Akzente).
const UPPER = "A-ZÄÖÜÉÈÁÀÍÓÚŁŚŻŹĆŃČŠŽŘĚÝŮ";
const LOWER = "a-zäöüßéèêáàâíìóòôúùçšžčřěýůłńśźżőűğış";
const NAME_TOKEN = `[${UPPER}][${LOWER}'’]+(?:-[${UPPER}]?[${LOWER}'’]+)*`;

/** Priorität bei Überschneidungen: höher gewinnt. */
const PRIORITY: Record<string, number> = {
  manuell: 100,
  EMAIL: 90,
  IBAN: 85,
  KREDITKARTE: 85,
  UID: 80,
  KONTEXT: 75,
  TELEFON: 70,
  FIRMA: 60,
  ADRESSE: 55,
  PERSON: 50,
  GESUNDHEIT: 45,
  RELIGION: 45,
};

function priorityOf(f: Finding): number {
  if (f.source === "manuell") return PRIORITY.manuell ?? 100;
  if (f.source.startsWith("kontext")) return PRIORITY.KONTEXT ?? 75;
  return PRIORITY[f.type] ?? 40;
}

function finding(
  text: string,
  start: number,
  end: number,
  type: EntityType,
  source: string,
  extra: Partial<Finding> = {},
): Finding {
  return { start, end, type, value: text.slice(start, end), source, ...extra };
}

function* matchAll(text: string, re: RegExp): Generator<RegExpExecArray> {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const rx = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    if (m[0].length === 0) {
      rx.lastIndex++;
      continue;
    }
    yield m;
  }
}

/** Start und Ende einer benannten Gruppe innerhalb eines Treffers. */
function groupSpan(m: RegExpExecArray, group: string): [number, number] | null {
  const indices = (m as RegExpExecArray & { indices?: { groups?: Record<string, [number, number] | undefined> } })
    .indices;
  const span = indices?.groups?.[group];
  return span ?? null;
}

function lineStartOf(text: string, index: number): number {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// E-Mail

export function detectEmails(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    out.push(finding(text, m.index, m.index + m[0].length, "EMAIL", "email"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// IBAN (mit Prüfziffer nach ISO 13616)

export function ibanIsValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export function detectIbans(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g)) {
    // Am Ende können zusätzliche Wörter mitgefangen werden: kürzen, bis die Prüfziffer stimmt.
    let candidate = m[0];
    while (candidate.replace(/\s/g, "").length >= 15) {
      if (ibanIsValid(candidate)) {
        out.push(finding(text, m.index, m.index + candidate.length, "IBAN", "iban"));
        break;
      }
      const cut = candidate.lastIndexOf(" ");
      if (cut <= 4) break;
      candidate = candidate.slice(0, cut);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kreditkarte (Luhn-Prüfung)

function luhnIsValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function detectCreditCards(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, /\b\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,7}\b/g)) {
    const digits = digitsOnly(m[0]);
    if (digits.length >= 13 && digits.length <= 19 && luhnIsValid(digits)) {
      out.push(finding(text, m.index, m.index + m[0].length, "KREDITKARTE", "kreditkarte"));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Telefon

const PHONE_KEYWORDS = /\b(tel|telefon|phone|mobil|mobile|handy|fax|erreichbar|unter|anrufen|call|cell|rückruf|whatsapp)\W{0,6}$/i;
// Ohne \b vor "nummer"/"nr", damit auch "Rechnungsnummer:" und "Kundennr." greifen.
const NUMBER_KEYWORDS = /(?:nummer|number|nr|\bno|\brechnung|\bbeleg|\bauftrag|\bbestellung|\bkunden|\bvertrag|\bkonto|\bblz|\biban|\bplz|\bref|\breferenz|\bticket)\.?\W{0,6}$/i;

export function detectPhones(text: string): Finding[] {
  const out: Finding[] = [];
  const consider = (start: number, value: string, international: boolean) => {
    const digits = digitsOnly(value);
    if (digits.length < 7 || digits.length > 15) return;
    // "+43 ..." braucht mindestens 8 Ziffern, "0043 ..." mindestens 11 (sonst eher eine Nummer wie "0042-2026").
    if (international && (value.startsWith("00") ? digits.length < 11 : digits.length < 8)) return;
    const before = text.slice(Math.max(0, start - 30), start);
    if (NUMBER_KEYWORDS.test(before)) return;
    if (!international) {
      const atLineStart = text.slice(lineStartOf(text, start), start).trim() === "";
      const mobile = /^0(6[5-9]\d|1[5-7]\d)/.test(digits);
      if (!PHONE_KEYWORDS.test(before) && !atLineStart && !mobile) return;
    }
    out.push(finding(text, start, start + value.length, "TELEFON", "telefon"));
  };

  for (const m of matchAll(text, /(?<![\w+])(?:\+|00)\d{1,3}(?:[ \t/-]*(?:\(0\))?[ \t/-]*\d{1,5}){2,6}(?![\w])/g)) {
    consider(m.index, m[0].trimEnd(), true);
  }
  for (const m of matchAll(text, /(?<![\w.,+\d])0\d{1,5}(?:[ \t/-]?\d{2,8}){1,4}(?![\w]|[.,]\d)/g)) {
    consider(m.index, m[0].trimEnd(), false);
  }
  return out;
}

// ---------------------------------------------------------------------------
// UID-Nummern (Umsatzsteuer-Identifikationsnummern)

export function detectVatIds(text: string): Finding[] {
  const out: Finding[] = [];
  const re =
    /\b(?:ATU ?\d{8}|DE ?\d{9}|CHE[- ]?\d{3}\.?\d{3}\.?\d{3}(?: ?(?:MWST|TVA|IVA))?|IT ?\d{11}|NL ?\d{9}B\d{2}|FR ?[A-Z0-9]{2}\d{9}|BE ?0?\d{9}|LU ?\d{8}|CZ ?\d{8,10}|PL ?\d{10}|HU ?\d{8}|SI ?\d{8}|SK ?\d{10}|DK ?\d{8})\b/g;
  for (const m of matchAll(text, re)) {
    out.push(finding(text, m.index, m.index + m[0].length, "UID", "uid"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Steuernummern (AT: "12 345/6789", DE: "123/456/78901")

export function detectTaxNumbers(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of matchAll(text, /\b(?:\d{2}[ -]?\d{3}\/\d{4}|\d{2,3}\/\d{3}\/\d{4,5})\b/g)) {
    out.push(finding(text, m.index, m.index + m[0].length, "STEUERNR", "steuernummer"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Werte nach Schlüsselwörtern (Geburtsdatum, Ausweis, Kennzeichen, Kundennummer, SV-Nummer)

interface ContextRule {
  type: EntityType;
  re: RegExp;
}

const CONTEXT_RULES: ContextRule[] = [
  {
    type: "GEBURTSDATUM",
    re: /(?:\bgeb\.|\bgeboren(?: am)?|\bGeburtsdatum|\bGeb\.-Datum|\bDOB|\bdate of birth|\bborn(?: on)?)\s*:?\s*(?<v>\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.\s?[A-ZÄÖÜa-zäöü]+\s\d{4})/gi,
  },
  {
    type: "AUSWEIS",
    re: /(?:\bReisepass|\bPass|\bPersonalausweis|\bAusweis|\bPassport|\bID)(?:-?(?:nummer|nr\.?|number|no\.?))?\s*[:#]?\s*(?<v>(?=[A-Z0-9 -]*\d)[A-Z0-9][A-Z0-9 -]{4,14}[A-Z0-9])\b/g,
  },
  {
    type: "KENNZEICHEN",
    re: /(?:\bKennzeichen|\bKfz-Kennzeichen|\bAutokennzeichen|\blicen[cs]e plate)\s*[:#]?\s*(?<v>[A-ZÄÖÜ]{1,3}[ -]?[A-Z0-9]{1,6}(?:[ -][A-Z0-9]{1,4})?)\b/gi,
  },
  {
    type: "KUNDENNR",
    re: /(?:\bKundennummer|\bKunden-Nr\.?|\bKundennr\.?|\bKd\.-Nr\.?|\bVertragsnummer|\bVertrags-Nr\.?|\bMitgliedsnummer|\bPolizzennummer|\bPolicennummer|\bPatientennummer|\bcustomer (?:no\.?|number|id))\s*[:#]?\s*(?<v>(?=[A-Z0-9\/.-]*\d)[A-Z0-9][A-Z0-9\/.-]{2,20})/gi,
  },
  {
    type: "SVNR",
    re: /(?:\bSV-?Nr\.?|\bSVNR|\bSozialversicherungsnummer|\bVersicherungsnummer|\bSozialversicherungs-Nr\.?)\s*[:#]?\s*(?<v>\d{4} ?\d{6}|\d{2} ?\d{6} ?[A-Z] ?\d{3})/gi,
  },
];

export function detectByContext(text: string): Finding[] {
  const out: Finding[] = [];
  for (const rule of CONTEXT_RULES) {
    const rx = new RegExp(rule.re.source, rule.re.flags.includes("d") ? rule.re.flags : rule.re.flags + "d");
    for (const m of matchAll(text, rx)) {
      const span = groupSpan(m, "v");
      if (!span) continue;
      out.push(finding(text, span[0], span[1], rule.type, `kontext:${rule.type.toLowerCase()}`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adressen

// Straßen-Endungen, jeweils klein ("Museumstraße") und groß ("Maria-Theresien-Straße").
const STREET_SUFFIX = [
  "straße", "strasse", "str\\.", "gasse", "weg", "platz", "allee", "ring", "damm", "ufer", "steig", "zeile", "kai",
  "promenade", "graben", "gürtel", "lände", "straat", "laan", "plein", "gracht", "kade",
]
  .map((s) => `[${s[0]?.toUpperCase()}${s[0]}]${s.slice(1)}`)
  .join("|");
// Wörter mit Straßen-Endung, die fast nie eine Adresse sind ("Parkplatz 3", "Fußweg 5 Minuten").
const NOT_A_STREET = new Set(
  `Parkplatz Stellplatz Spielplatz Arbeitsplatz Sitzplatz Campingplatz Golfplatz Tennisplatz Sportplatz Abstellplatz
   Liegeplatz Garagenplatz Rückweg Hinweg Heimweg Wanderweg Radweg Umweg Ausweg Fußweg Gehweg Klettersteig Seeufer
   Flussufer Zahlungsweg Lieferweg Postweg Rechtsweg`
    .split(/\s+/)
    .filter(Boolean),
);
const AFTER_POSTCODE_STOP = new Set(
  `Euro EUR Stück Personen Erwachsene Kinder Kind Zimmer Nächte Nacht Tage Tag Stunden Minuten Kilometer Meter
   Gramm Liter Punkte Mitarbeiter Gäste Betten Seiten Jahre Monate Wochen Uhr Prozent Mal`
    .split(/\s+/)
    .filter(Boolean),
);

export function detectAddresses(text: string): Finding[] {
  const out: Finding[] = [];

  const streetRe = new RegExp(
    String.raw`(?:\b[${UPPER}][${LOWER}]+(?:-[${UPPER}]?[${LOWER}]+)*-?(?:${STREET_SUFFIX})|\b[${UPPER}][${LOWER}]+[ \t]+(?:Straße|Strasse|Gasse|Weg|Platz|Allee)|\b(?:Am|An der|Auf der|Im|In der|Zum|Zur|Unter der|Hinter der)[ \t]+[${UPPER}][${LOWER}]+)[ \t]+\d{1,4}[ \t]?[a-zA-Z]?(?:[ \t]?[\/-][ \t]?\d{1,4}[a-zA-Z]?)*\b`,
    "g",
  );
  for (const m of matchAll(text, streetRe)) {
    const streetWord = m[0].split(/[ \t]/)[0] ?? "";
    if (NOT_A_STREET.has(streetWord)) continue;
    out.push(finding(text, m.index, m.index + m[0].length, "ADRESSE", "adresse:strasse"));
  }

  const italianRe = /\b(?:Via|Viale|Piazza|Corso|Vicolo)[ \t]+[A-Z][\w']+(?:[ \t]+[A-Z][\w']+)*,?[ \t]*\d{1,4}[a-zA-Z]?\b/g;
  for (const m of matchAll(text, italianRe)) {
    out.push(finding(text, m.index, m.index + m[0].length, "ADRESSE", "adresse:strasse"));
  }

  const englishRe = /\b\d{1,4}[ \t]+[A-Z][a-z]+(?:[ \t][A-Z][a-z]+)*[ \t](?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Lane|Drive|Way|Court|Place)\b/g;
  for (const m of matchAll(text, englishRe)) {
    out.push(finding(text, m.index, m.index + m[0].length, "ADRESSE", "adresse:strasse"));
  }

  // Postleitzahl + Ort: nur am Zeilenanfang, nach Komma oder direkt nach einer Straße.
  const postcodeRe = new RegExp(
    String.raw`(?:\b(?:A|AT|D|DE|CH|I|IT|NL)-[ \t]?)?\b\d{4,5}[ \t]+[${UPPER}][${LOWER}]+(?:(?:[ \t]+(?:am|an der|im|in|bei|ob der|an)[ \t]+|[ \t]*-[ \t]*|[ \t]+)[${UPPER}][${LOWER}]+)*`,
    "g",
  );
  for (const m of matchAll(text, postcodeRe)) {
    const start = m.index;
    const firstWord = m[0].replace(/^(?:[A-Z]{1,2}-[ \t]?)?\d{4,5}[ \t]+/, "").split(/[ \t-]/)[0] ?? "";
    if (AFTER_POSTCODE_STOP.has(firstWord)) continue;
    const before = text.slice(lineStartOf(text, start), start);
    const okContext = before.trim() === "" || /,\s*$/.test(before) || /(?:\d[a-zA-Z]?|\))\s*$/.test(before);
    if (!okContext) continue;
    // Großgeschriebene Folgewörter, die keine Ortsteile sind, abschneiden ("6020 Innsbruck Telefon").
    let value = m[0];
    const words = value.split(/([ \t]+)/);
    for (let i = 2; i < words.length; i += 2) {
      const w = words[i] ?? "";
      if (NOT_SURNAME.has(w) || AFTER_POSTCODE_STOP.has(w)) {
        value = words.slice(0, i - 1).join("");
        break;
      }
    }
    out.push(finding(text, start, start + value.length, "ADRESSE", "adresse:ort"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Firmen

const LEGAL_FORM =
  String.raw`(?:GmbH(?:[ \t]*&[ \t]*Co\.?[ \t]*KG)?|gGmbH|mbH|AG|KG|OG|e\.[ \t]?U\.|GesbR|GbR|UG(?:[ \t]*\(haftungsbeschränkt\))?|SE|Ltd\.?|Limited|Inc\.?|LLC|S\.r\.l\.|S\.p\.A\.|B\.V\.|N\.V\.|S\.A\.|Sarl|SARL)`;
const COMPANY_STOP = new Set(
  `Rechnung Lieferant Lieferantin Kunde Kundin Firma An Von Betreff Angebot Auftrag Bestellung Lieferschein Gutschrift
   Mahnung Absender Empfänger Herr Frau Bitte Sehr Liebe Lieber Hallo Die Der Das Den Dem Wir Ich Sie`
    .split(/\s+/)
    .filter(Boolean),
);

export function detectCompanies(text: string, companies: CompanyEntry[] = []): Finding[] {
  const out: Finding[] = [];

  // 1) Bekannte Firmen aus dem Firmenverzeichnis, mit Kategorie für die KI.
  for (const company of companies) {
    for (const alias of [company.name, ...(company.aliases ?? [])]) {
      if (!alias.trim()) continue;
      const re = new RegExp(`(?<![\\w])${escapeRegExp(alias)}(?![\\w])`, "g");
      for (const m of matchAll(text, re)) {
        out.push(
          finding(text, m.index, m.index + m[0].length, "FIRMA", "firma:verzeichnis", {
            description: company.kategorie,
            canonical: company.name,
          }),
        );
      }
    }
  }

  // 2) Unbekannte Firmen an der Rechtsform erkennen.
  const re = new RegExp(
    String.raw`(?:[${UPPER}0-9][\w${UPPER}${LOWER}&.'’-]*[ \t]+){1,4}${LEGAL_FORM}(?![\w${UPPER}${LOWER}])`,
    "g",
  );
  for (const m of matchAll(text, re)) {
    let start = m.index;
    let value = m[0];
    // Führende Allerweltswörter ("Rechnung Muster GmbH") abschneiden.
    for (;;) {
      const first = value.split(/[ \t]+/)[0] ?? "";
      if (!COMPANY_STOP.has(first)) break;
      const cut = value.indexOf(first) + first.length;
      const rest = value.slice(cut).replace(/^[ \t]+/, "");
      start += value.length - rest.length;
      value = rest;
    }
    if (new RegExp(`^${LEGAL_FORM}$`).test(value)) continue;
    out.push(finding(text, start, start + value.length, "FIRMA", "firma:rechtsform"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Personen

const SALUTATION =
  String.raw`(?:Herrn?|Frau|Hr\.|Fr\.|Familie|Fam\.|Mr\.?|Mrs\.?|Ms\.?|Miss|Sig\.(?:ra)?|Signora|Signor|Dhr\.|Mevr\.|Mevrouw|Meneer)`;
const ACADEMIC = String.raw`(?:(?:Dr\.(?:in)?|Mag\.(?:a)?|MMag\.|Ing\.|DI|Dipl\.-Ing\.|Prof\.|BSc|MSc|MBA)[ \t]+)*`;
const PARTICLE = String.raw`(?:(?:von|van|de|di|da|der|den|zu|ten|ter)[ \t]+)?`;
const ABBREVIATION_NAMES = new Set(["Jan", "Max"]);

function nameTokensAt(text: string, start: number, maxTokens: number): { end: number; tokens: string[] } | null {
  const re = new RegExp(`^${NAME_TOKEN}`);
  const tokens: string[] = [];
  let pos = start;
  while (tokens.length < maxTokens) {
    const rest = text.slice(pos);
    const particle = new RegExp(`^${PARTICLE}`).exec(rest)?.[0] ?? "";
    const m = re.exec(rest.slice(particle.length));
    if (!m) break;
    const token = m[0];
    if (tokens.length > 0 && NOT_SURNAME.has(token)) break;
    tokens.push(token);
    pos += particle.length + token.length;
    const gap = /^[ \t]+/.exec(text.slice(pos))?.[0] ?? "";
    if (!gap) break;
    if (tokens.length < maxTokens && new RegExp(`^${PARTICLE}${NAME_TOKEN}`).test(text.slice(pos + gap.length))) {
      pos += gap.length;
    } else {
      break;
    }
  }
  if (tokens.length === 0) return null;
  // Ein Leerzeichen am Ende gehört nicht zum Namen.
  let end = pos;
  while (end > start && /[ \t]/.test(text[end - 1] ?? "")) end--;
  return { end, tokens };
}

export function detectPersons(text: string): Finding[] {
  const out: Finding[] = [];
  const add = (start: number, end: number, source: string) => {
    if (end > start) out.push(finding(text, start, end, "PERSON", source));
  };

  // a) Anrede: "Frau Huber", "Herrn Dr. Max Müller", "Familie Gruber"
  const salRe = new RegExp(String.raw`\b${SALUTATION}[ \t]+${ACADEMIC}(?=[${UPPER}])`, "g");
  for (const m of matchAll(text, salRe)) {
    const start = m.index + m[0].length;
    const span = nameTokensAt(text, start, 3);
    if (!span || NOT_NAME_AFTER_SALUTATION.has(span.tokens[0] ?? "")) continue;
    add(start, span.end, "person:anrede");
  }

  // b) Vorstellung: "mein Name ist ...", "ich bin Anna Huber"
  const introStrict = /\b(?:mein Name ist|ich heiße|my name is|mi chiamo|mijn naam is|je m'appelle)[ \t]+/gi;
  for (const m of matchAll(text, introStrict)) {
    const start = m.index + m[0].length;
    const span = nameTokensAt(text, start, 3);
    if (span) add(start, span.end, "person:vorstellung");
  }
  const introLoose = /\b(?:ich bin|I am|I'm|sono|ik ben|this is)[ \t]+/gi;
  for (const m of matchAll(text, introLoose)) {
    const start = m.index + m[0].length;
    const span = nameTokensAt(text, start, 3);
    if (span && FIRST_NAMES.has(span.tokens[0] ?? "")) add(start, span.end, "person:vorstellung");
  }

  // c) Bekannte Vornamen, optional mit Nachnamen
  const firstRe = new RegExp(`(?<![\\w${UPPER}${LOWER}'’-])${NAME_TOKEN}`, "g");
  for (const m of matchAll(text, firstRe)) {
    if (!FIRST_NAMES.has(m[0])) continue;
    // "12. Jan." ist ein Datum, kein Name.
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    if (/\d\.\s*$/.test(before)) continue;
    const span = nameTokensAt(text, m.index, 3);
    if (!span) continue;
    // "Jan." und "Max." als Abkürzung (Januar, Maximum) überspringen.
    if (span.tokens.length === 1 && ABBREVIATION_NAMES.has(m[0]) && text[span.end] === ".") continue;
    add(m.index, span.end, "person:vorname");
  }

  // d) Signatur: Zeile(n) nach einer Grußformel
  const closingRe =
    /^[ \t]*(?:(?:liebe|viele|beste|herzliche|freundliche|schöne|sonnige|sportliche)[ \t]+grüße|mit freundlichen grüßen|freundliche grüße|grüße|gruß|mfg|lg|vg|servus|ciao|best regards|kind regards|regards|best|cheers|cordiali saluti|distinti saluti|saluti|met vriendelijke groet(?:en)?|groetjes)(?=[\s,.!]|$).*$/gim;
  for (const m of matchAll(text, closingRe)) {
    let pos = m.index + m[0].length;
    let checked = 0;
    while (checked < 2) {
      const nextBreak = text.indexOf("\n", pos);
      if (nextBreak === -1) break;
      const lineStart = nextBreak + 1;
      const lineEnd = text.indexOf("\n", lineStart) === -1 ? text.length : text.indexOf("\n", lineStart);
      const line = text.slice(lineStart, lineEnd);
      pos = lineEnd;
      if (line.trim() === "") continue;
      checked++;
      const lead = /^[ \t]*/.exec(line)?.[0].length ?? 0;
      const academic = new RegExp(`^${ACADEMIC}`).exec(line.slice(lead))?.[0].length ?? 0;
      const nameStart = lineStart + lead + academic;
      const span = nameTokensAt(text, nameStart, 4);
      if (!span) continue;
      // Eine einzelne Zeile wie "Doppelzimmer" ist kein Name: zwei Wörter oder bekannter Vorname nötig.
      if (span.tokens.length < 2 && !FIRST_NAMES.has(span.tokens[0] ?? "")) continue;
      const restOfLine = text.slice(span.end, lineEnd).trim();
      if (restOfLine === "" || /^[,|–-]/.test(restOfLine)) add(nameStart, span.end, "person:signatur");
    }
  }

  // e) E-Mail-Kopf: "Von: Anna Huber <anna@...>"
  const headerRe = /^[ \t]*(?:Von|From|An|To|Cc|Absender)[ \t]*:[ \t]*(?<name>[^<\n]+?)[ \t]*</gimd;
  for (const m of matchAll(text, headerRe)) {
    const span = groupSpan(m, "name");
    if (!span) continue;
    const value = text.slice(span[0], span[1]).replace(/^["']|["']$/g, "");
    if (/@/.test(value) || new RegExp(LEGAL_FORM).test(value)) continue;
    add(span[0], span[1], "person:kopfzeile");
  }

  return out;
}

// ---------------------------------------------------------------------------
// Gesundheit und Religion (besondere Kategorien nach Art. 9 DSGVO)

const HEALTH_STEMS =
  "allergi|allergy|allergic|unverträglich|intoleranz|intolerant|intolerance|zöliakie|coeliac|celiac|diabet|rollstuhl|wheelchair|gehbehindert|behinderung|disabilit|disabled|schwanger|pregnan|epilep|asthma|dialyse|dialysis|medikament|medication|insulin|chemotherapie|herzkrank|gehörlos|rollator|glutenfrei|laktosefrei|gluten-free|lactose-free";
const RELIGION_STEMS = "halal|koscher|kosher|gebetsraum|prayer room|ramadan|sabbat|schabbat|shabbat|gebetszeit";

function detectKeywordPhrases(text: string, stems: string, type: EntityType, source: string): Finding[] {
  const out: Finding[] = [];
  const re = new RegExp(
    // Adjektive ("eine schwere ...") nur nach einem Artikel, sonst würde "essen halal" mitgenommen.
    String.raw`(?:\b(?:eine|einen|ein|einer|keine|a|an|une|un)[ \t]+(?:[a-zäöüß]+(?:e|er|en|em|es)[ \t]+)?)?[\wäöüß-]*(?:${stems})[\wäöüß-]*(?:[ \t]+(?:gegen|auf|to)[ \t]+[\wäöüß-]+)?`,
    "giu",
  );
  for (const m of matchAll(text, re)) {
    out.push(finding(text, m.index, m.index + m[0].length, type, source));
  }
  return out;
}

export function detectHealth(text: string): Finding[] {
  return detectKeywordPhrases(text, HEALTH_STEMS, "GESUNDHEIT", "gesundheit");
}

export function detectReligion(text: string): Finding[] {
  return detectKeywordPhrases(text, RELIGION_STEMS, "RELIGION", "religion");
}

// ---------------------------------------------------------------------------
// Manuelle Markierungen aus der Oberfläche

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectManual(text: string, marks: DetectOptions["manual"] = []): Finding[] {
  const out: Finding[] = [];
  for (const mark of marks) {
    const value = mark.value.trim();
    if (!value) continue;
    const re = new RegExp(`(?<![\\w])${escapeRegExp(value)}(?![\\w])`, "g");
    for (const m of matchAll(text, re)) {
      out.push(finding(text, m.index, m.index + m[0].length, mark.type, "manuell"));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zusammenführen

export function normalizeValue(type: EntityType, value: string): string {
  const v = value.trim().replace(/\s+/g, " ");
  switch (type) {
    case "TELEFON":
    case "KREDITKARTE":
      return digitsOnly(v);
    case "IBAN":
    case "UID":
    case "KENNZEICHEN":
    case "KUNDENNR":
    case "SVNR":
    case "STEUERNR":
    case "AUSWEIS":
      return v.replace(/[\s.-]/g, "").toUpperCase();
    case "EMAIL":
      return v.toLowerCase();
    default:
      return v.toLowerCase();
  }
}

function resolveOverlaps(findings: Finding[]): Finding[] {
  const sorted = [...findings].sort(
    (a, b) => priorityOf(b) - priorityOf(a) || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const accepted: Finding[] = [];
  for (const f of sorted) {
    if (accepted.some((a) => f.start < a.end && a.start < f.end)) continue;
    accepted.push(f);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

/** Straße und "PLZ Ort" direkt hintereinander werden eine Adresse. */
function mergeAdjacentAddresses(text: string, findings: Finding[]): Finding[] {
  const out: Finding[] = [];
  for (const f of findings) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "ADRESSE" && f.type === "ADRESSE") {
      const gap = text.slice(prev.end, f.start);
      if (/^[ \t]*(?:,[ \t]*|\r?\n[ \t]*)$/.test(gap)) {
        out[out.length - 1] = { ...prev, end: f.end, value: text.slice(prev.start, f.end), source: "adresse" };
        continue;
      }
    }
    out.push(f);
  }
  return out;
}

export function detectAll(text: string, options: DetectOptions = {}): Finding[] {
  const excluded = new Set((options.excluded ?? []).map((v) => v.trim().toLowerCase()));
  const raw = [
    ...detectManual(text, options.manual),
    ...detectEmails(text),
    ...detectIbans(text),
    ...detectCreditCards(text),
    ...detectVatIds(text),
    ...detectTaxNumbers(text),
    ...detectByContext(text),
    ...detectPhones(text),
    ...detectCompanies(text, options.companies),
    ...detectAddresses(text),
    ...detectPersons(text),
    ...detectHealth(text),
    ...detectReligion(text),
  ].filter((f) => f.value.trim() !== "" && !excluded.has(f.value.trim().toLowerCase()));
  return mergeAdjacentAddresses(text, resolveOverlaps(raw));
}
