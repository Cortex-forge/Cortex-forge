export const ENTITY_TYPES = [
  "PERSON",
  "FIRMA",
  "EMAIL",
  "TELEFON",
  "IBAN",
  "KREDITKARTE",
  "UID",
  "STEUERNR",
  "SVNR",
  "ADRESSE",
  "GEBURTSDATUM",
  "AUSWEIS",
  "KENNZEICHEN",
  "KUNDENNR",
  "GESUNDHEIT",
  "RELIGION",
  "SONSTIGES",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_LABELS: Record<EntityType, string> = {
  PERSON: "Person",
  FIRMA: "Firma",
  EMAIL: "E-Mail",
  TELEFON: "Telefon",
  IBAN: "IBAN",
  KREDITKARTE: "Kreditkarte",
  UID: "UID-Nummer",
  STEUERNR: "Steuernummer",
  SVNR: "Sozialversicherungsnr.",
  ADRESSE: "Adresse",
  GEBURTSDATUM: "Geburtsdatum",
  AUSWEIS: "Ausweisnummer",
  KENNZEICHEN: "Kfz-Kennzeichen",
  KUNDENNR: "Kunden-/Vertragsnr.",
  GESUNDHEIT: "Gesundheitsangabe",
  RELIGION: "Religionsangabe",
  SONSTIGES: "Sonstiges",
};

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

/** Ein erkannter sensibler Textabschnitt im Original. */
export interface Finding {
  start: number;
  end: number;
  type: EntityType;
  value: string;
  /** Welcher Erkenner den Fund gemacht hat (für Fehlersuche und Oberfläche). */
  source: string;
  /** Kategorie, die die KI sehen darf, z. B. "Mobilfunkanbieter". */
  description?: string;
  /** Kanonischer Wert, wenn mehrere Schreibweisen dieselbe Sache meinen. */
  canonical?: string;
  /** Nur Personen: der Nachname, z. B. für "Sehr geehrte Frau Huber". */
  nachname?: string;
}

/** Zuordnung Platzhalter -> Originaldaten. Verlässt nie den Bot. */
export interface MappingEntry {
  id: string;
  type: EntityType;
  original: string;
  variants: string[];
  description?: string;
  /** Nur Personen: der Nachname, den die Rückübersetzung nach einer Anrede einsetzt. */
  nachname?: string;
}

/** Was die KI über einen Platzhalter erfahren darf. */
export interface PlaceholderInfo {
  id: string;
  type: EntityType;
  description?: string;
}

export interface ManualMark {
  value: string;
  type: EntityType;
  /** Ausgewählte Stellen im Dokument (Anfang, Ende). Sie werden immer geschwärzt, auch mitten in einem Wort. */
  stellen?: Array<[number, number]>;
}

export interface DetectOptions {
  manual?: ManualMark[];
  excluded?: string[];
  companies?: CompanyEntry[];
  /** Vorlagen für feste Dokumente der Firma (ADR-007). */
  templates?: DocumentTemplate[];
}

/** Ein Feld einer Vorlage: Bezeichnung am Zeilenanfang, danach der Wert. */
export interface TemplateField {
  /** So steht die Bezeichnung im Dokument, z. B. "Gast" oder "Anschrift" (ein Doppelpunkt dahinter ist erlaubt). */
  bezeichnung: string;
  /** Art der Angabe; "FREITEXT" läuft durch die normale Erkennung (Wünsche, Bemerkungen). */
  typ: EntityType | "FREITEXT";
  /** Wie viele Zeilen der Wert hat (Adresse: Straße und Ort). Standard 1. */
  zeilen?: number;
  /** Fehlt das Feld oder ist es leer, meldet die Oberfläche eine Abweichung. Standard: ja. */
  pflicht?: boolean;
}

/** Vorlage für ein festes Dokument einer Firma (z. B. ihre Buchungsbestätigung). Enthält keine Personendaten. */
export interface DocumentTemplate {
  id: string;
  name: string;
  /** Texte, die alle im Dokument stehen müssen, damit die Vorlage passt. */
  erkennen: string[];
  felder: TemplateField[];
  /** Feste Texte der Firma (Briefkopf, Fußzeile): Darin wird nichts ersetzt. */
  unveraendert?: string[];
}

export interface CompanyEntry {
  name: string;
  kategorie?: string;
  aliases?: string[];
}

export interface PseudonymizeOptions extends DetectOptions {
  /**
   * Schon vergebene Platzhalter dieses Dokuments (Schlüssel der Angabe → Platzhalter). Dieselbe Angabe behält ihre
   * Nummer, und keine einmal vergebene Nummer bezeichnet je eine andere Angabe.
   */
  assigned?: Record<string, string>;
}

export interface PseudonymizeResult {
  text: string;
  mapping: MappingEntry[];
  findings: Array<Finding & { id: string }>;
  /** Platzhalter, die schon im Original standen (z. B. "[PERSON_1]" in einer Vorlage). Sie bleiben unverändert. */
  literal: string[];
  /** Alle vergebenen Platzhalter, die bisherigen und die neuen (für den nächsten Durchgang). */
  assigned: Record<string, string>;
}
