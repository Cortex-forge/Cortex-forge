// Anreden, Titel und Namenszusätze. Gemeinsam für Erkennung (detectors.ts) und Rückübersetzung (reidentify.ts),
// damit beide dieselben Anreden kennen.

/** Anreden vor einem Namen: "Frau Huber", "Herrn Dr. Müller", "Mr Smith", "Sig.ra Rossi". */
export const SALUTATION = String.raw`(?:Herrn?|Frau|Hr\.|Fr\.|Familie|Fam\.|Mr\.?|Mrs\.?|Ms\.?|Miss|Mx\.?|Sig\.ra|Sig\.na|Sig\.|Signora|Signore|Signor|Signorina|Sr\.|Sra\.|Mme\.?|Madame|Monsieur|Mevr\.|Mevrouw|Meneer|Dhr\.|De[ \t]heer|herrn?|frau|signora|signore|signor|signorina|sig\.ra|sig\.|mevrouw|meneer|mevr\.|dhr\.|de[ \t]heer|madame|monsieur)`;

/** Ein akademischer Titel. */
export const TITLE = String.raw`(?:Dr\.(?:in)?|DDr\.|Mag\.(?:a)?|MMag\.|Ing\.|DI|Dipl\.-Ing\.|Dkfm\.|Prof\.|Univ\.-Prof\.|Professor|Professorin|Doktor|Prim\.|Hofrat|Dott\.(?:ssa)?|dott\.(?:ssa)?|Avv\.|Arch\.|BSc|MSc|MBA|PhD)`;

/** Beliebig viele Titel, jeweils mit Leerraum dahinter. */
export const TITLES = String.raw`(?:${TITLE}[ \t]+)*`;

/**
 * Namenszusätze vor dem Nachnamen: "von", "von der", "van der", "de la", "di", "da".
 * "der", "den" und "zu" allein gelten nicht: "mit Thomas den Berg besteigen", "Lena bleibt zu Hause".
 */
export const PARTICLE = String.raw`(?:von(?:[ \t]+(?:der|dem|den|und[ \t]+zu))?|vom|van(?:[ \t]+(?:der|den|de|het))?|de(?:[ \t]+la)?|del|della|degli|di|da|dos|du|ten|ter)`;

/** Die einzelnen Wörter der Namenszusätze (eine Liste für Erkennung, Nachziehen, Rückübersetzung und Probe). */
export const PARTICLE_WORDS: ReadonlySet<string> = new Set(
  ["von", "vom", "der", "dem", "den", "und", "zu", "van", "het", "de", "la", "del", "della", "degli", "di", "da", "dos", "du", "ten", "ter"],
);

/** Anrede (mit Titeln) direkt vor einer Stelle, z. B. vor einem Platzhalter. */
export const SALUTATION_BEFORE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])${SALUTATION}(?:[ \t]+${TITLE})*[ \t]+$`,
  "u",
);
