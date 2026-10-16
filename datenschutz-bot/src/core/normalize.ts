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
const SEGMENT_BREAKS = new RegExp(SEGMENT_BREAK, "g");

/** Zeichen und Leerraum vereinheitlichen (auch für Betreff, Markierungen und Ausnahmen). */
export function normalizeChars(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(SEGMENT_BREAKS, "")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(SPECIAL_SPACES, " ")
    .replace(LINE_SEPARATORS, "\n");
}

export interface Prepared {
  text: string;
  /** "mail": MIME-Nachricht entschlüsselt, "html": HTML in Text umgewandelt. */
  quelle?: "mail" | "html";
  /** Weggelassene Anhänge oder unlesbare Teile einer Mail. */
  weggelassen: number;
  /** Ersatzzeichen (U+FFFD) im Text: falscher Zeichensatz, Namen wären verstümmelt. */
  unlesbar: boolean;
}

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
  text = normalizeChars(decodeEntities(text));
  return { text, ...(quelle ? { quelle } : {}), weggelassen, unlesbar: text.includes("�") };
}
