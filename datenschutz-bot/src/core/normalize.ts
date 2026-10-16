// Eingaben vereinheitlichen, bevor sie gespeichert und erkannt werden. Kopiert aus Outlook, Word, HTML-Mails, PDFs
// oder auf macOS enthalten Texte oft geschützte Leerzeichen, zerlegte Umlaute (NFD), weiche Trennzeichen oder
// Nullbreitenzeichen. Die Erkennung sieht dann "Anna Huber" nicht als zwei Wörter oder "Müller" nicht als Wort.
// Normalisiert wird das Original selbst: Was der Mitarbeiter prüft, ist genau das, was erkannt wurde.

import { SEGMENT_BREAK } from "./detectors.js";
import { decodeEntities, decodeMail, htmlToText, looksLikeHtml } from "./mail.js";

/** Weiches Trennzeichen, Nullbreite, Wortverbinder, Byte-Order-Mark: brechen Wörter auf, ohne sichtbar zu sein. */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
/** Geschützte, schmale und andere besondere Leerzeichen. */
const SPECIAL_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const LINE_SEPARATORS = /[\u2028\u2029\u0085]/g;
/**
 * Unsichtbare Formatzeichen (Unicode-Kategorie Cf): Steuerzeichen für die Schreibrichtung und Tag-Zeichen. Im Browser
 * sieht man sie nicht, eine KI liest sie aber als Text. So ließen sich Anweisungen an die KI verstecken.
 */
const FORMAT_CHARS = /\p{Cf}/gu;
/** Ligaturen aus PDFs ("ﬃ" in "Steﬃ") und Zeichen in voller Breite ("０６６４") als normale Buchstaben und Ziffern. */
const LIGATURES = /[\uFB00-\uFB06]/g;
const FULLWIDTH = /[\uFF01-\uFF5E]/g;
/** Bindestrich-Varianten (geschützt, typografisch, Minus) als "-". Gedankenstriche bleiben, die Muster kennen sie. */
const HYPHENS = /[\u2010\u2011\u2012\u2212\uFE63]/g;
const SEGMENT_BREAKS = new RegExp(SEGMENT_BREAK, "g");

/** Zeichen und Leerraum vereinheitlichen (auch für Betreff, Markierungen und Ausnahmen). */
export function normalizeChars(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(SEGMENT_BREAKS, "")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(FORMAT_CHARS, "")
    .replace(LIGATURES, (c) => c.normalize("NFKC"))
    .replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(HYPHENS, "-")
    .replace(SPECIAL_SPACES, " ")
    .replace(LINE_SEPARATORS, "\n");
}

export interface Prepared {
  text: string;
  /** "mail": MIME-Nachricht entschlüsselt, "html": HTML in Text umgewandelt. */
  quelle?: "mail" | "html";
  /** Weggelassene Anhänge oder unlesbare Teile einer Mail. */
  weggelassen: number;
  /** Ersatzzeichen (U+FFFD) oder Steuerzeichen im Text: falscher Zeichensatz, Namen wären verstümmelt. */
  unlesbar: boolean;
}

/**
 * Ersatzzeichen und Steuerzeichen außer Tab und Zeilenumbruch: Der Zeichensatz stimmt nicht (z. B. UTF-16 ohne BOM, als
 * UTF-8 gelesen: ein NUL zwischen allen Buchstaben, Review Claude 4 #13). Die Erkennung fände darin nichts.
 */
const UNREADABLE = /[\uFFFD\u0000-\u0008\u000E-\u001F\u007F-\u009F]/u;

/** Ein abgelegtes Dokument lesbar und einheitlich machen: Mail entschlüsseln, HTML in Text, Zeichen vereinheitlichen. */
export function prepareDocument(raw: string): Prepared {
  let text = raw.replace(/\r\n?/g, "\n").replace(SEGMENT_BREAKS, "");
  let quelle: Prepared["quelle"];
  let weggelassen = 0;
  const mail = decodeMail(text);
  if (mail) {
    text = mail.text;
    quelle = "mail";
    weggelassen = mail.weggelassen;
  } else if (looksLikeHtml(text)) {
    text = htmlToText(text);
    quelle = "html";
  }
  // Seitenumbrüche aus Kopien von PDF ("\f") und senkrechte Tabs werden Zeilenumbrüche.
  text = normalizeChars(decodeEntities(text)).replace(/[\f\v]/g, "\n");
  return { text, ...(quelle ? { quelle } : {}), weggelassen, unlesbar: UNREADABLE.test(text) };
}
