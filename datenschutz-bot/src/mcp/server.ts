#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { RechnungInhalt } from "../core/invoice.js";
import { VERSION } from "../config.js";
import { formatEuro } from "../core/money.js";
import { formatPlaceholder } from "../core/pseudonymize.js";
import { ENTITY_LABELS } from "../core/types.js";
import { KEY_WARNING, KeyError, keySource } from "../core/vault.js";
import { ART_LABELS, JobError, JobStore, type ErgebnisKi, type JobArt, type Pruefung } from "../store/jobs.js";
import { ConfigError } from "../store/settings.js";

const INSTRUCTIONS = `Datenschutz-Bot: Über diese Werkzeuge bekommst du Dokumente (Gästeanfragen, Rechnungen, Belege), in denen alle personenbezogenen Daten durch Platzhalter ersetzt sind, z. B. [PERSON_1], [ADRESSE_1] oder [FIRMA_1: Elektroinstallateur].

Regeln:
1. Übernimm Platzhalter exakt so in dein Ergebnis, z. B. "Sehr geehrte Frau [PERSON_1]". Der Bot setzt danach die echten Daten ein.
2. Erfinde keine Namen, Adressen, Telefonnummern, E-Mail-Adressen oder Bankdaten.
3. Versuche nicht, Platzhalter zu erraten oder aufzulösen.
4. Speichere jedes Ergebnis mit ergebnis_speichern, buchungen_vorschlagen oder rechnung_erstellen und gib dabei die Fassung an, die dokument_lesen nennt. Ein Mitarbeiter prüft das Ergebnis in der Oberfläche, bevor es verschickt oder gebucht wird. Speicherst du ein Ergebnis neu, muss der Mitarbeiter die neue Fassung prüfen.
5. Lehnt der Bot ein Ergebnis ab, weil sich das Dokument geändert hat, lies es mit dokument_lesen neu: Die Platzhalter können sich geändert haben.
6. Rechne Steuern und Summen nicht selbst aus. Das macht der Bot.`;

const NEXT_STEPS: Record<JobArt, string> = {
  hotel:
    "Schreibe eine Antwort an den Gast und speichere sie mit ergebnis_speichern. Wenn eine Rechnung gewünscht ist, nutze rechnung_erstellen.",
  buchhaltung:
    "Erstelle Buchungsvorschläge mit buchungen_vorschlagen (Nettobetrag und Steuersatz je Buchung, nur Konten aus dem Kontenplan). Soll eine Rechnung geschrieben werden, nutze rechnung_erstellen.",
  allgemein: "Bearbeite das Dokument wie gewünscht und speichere das Ergebnis mit ergebnis_speichern.",
};

const store = new JobStore();

const fassung = z.number().int().min(1).describe("Fassung des Dokuments, wie dokument_lesen sie nennt");

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

function guard<A>(fn: (args: A) => string) {
  return async (args: A) => {
    try {
      return text(fn(args));
    } catch (err) {
      if (err instanceof JobError) return text(err.message, true);
      // Fehlermeldungen zu Konfiguration und Schlüssel können Ausschnitte aus Dateien enthalten: nur allgemein melden.
      if (err instanceof ConfigError || err instanceof KeyError) {
        return text("Der Datenschutz-Bot ist gerade nicht richtig eingerichtet. Bitte in der Oberfläche nachsehen.", true);
      }
      // Ins Protokoll des Servers nur die Art des Fehlers, keine Inhalte.
      process.stderr.write(`datenschutz-bot: interner Fehler (${err instanceof Error ? err.name : typeof err})\n`);
      return text("Interner Fehler im Datenschutz-Bot.", true);
    }
  };
}

function describeCheck(pruefung: Pruefung, summen?: { netto: number; ust: number; brutto: number }): string {
  const lines = ["Gespeichert. Ein Mitarbeiter prüft das Ergebnis in der Oberfläche, bevor etwas verschickt oder gebucht wird."];
  if (summen) {
    lines.push(`Vom Bot berechnet: netto ${formatEuro(summen.netto)}, USt ${formatEuro(summen.ust)}, brutto ${formatEuro(summen.brutto)}.`);
  }
  if (pruefung.unbekannt.length) {
    lines.push(
      `Diese Platzhalter gibt es im Dokument nicht: ${pruefung.unbekannt.join(", ")}. Bitte nur Platzhalter aus dem Dokument verwenden und das Ergebnis neu speichern.`,
    );
  }
  if (pruefung.reste.length) {
    lines.push(
      `Diese Stellen sehen wie Platzhalter aus, sind aber keine: ${pruefung.reste.join(", ")}. Bitte Platzhalter genau so schreiben wie im Dokument, z. B. [PERSON_1].`,
    );
  }
  if (pruefung.erfunden.length) {
    lines.push(
      `Du hast selbst Kontaktdaten geschrieben (${pruefung.erfunden.map((e) => e.label).join(", ")}). Bitte keine Kontaktdaten erfinden; nutze Platzhalter.`,
    );
  }
  for (const h of pruefung.hinweise) lines.push(`Hinweis: ${h}`);
  return lines.join("\n");
}

const server = new McpServer(
  { name: "datenschutz-bot", version: VERSION },
  { instructions: INSTRUCTIONS },
);

server.registerTool(
  "dokumente_auflisten",
  {
    title: "Freigegebene Dokumente auflisten",
    description:
      "Listet die Dokumente, die ein Mitarbeiter für die KI freigegeben hat. Enthält nur Platzhalter, keine personenbezogenen Daten.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  guard(() => {
    const docs = store.listForAi();
    if (docs.length === 0) return "Zurzeit ist kein Dokument für die KI freigegeben.";
    return [
      `${docs.length} Dokument(e) bereit:`,
      ...docs.map((d) => `- ${d.id} · ${ART_LABELS[d.art]} · ${d.betreff || "(ohne Betreff)"}`),
      "",
      "Lies ein Dokument mit dokument_lesen.",
    ].join("\n");
  }),
);

server.registerTool(
  "dokument_lesen",
  {
    title: "Dokument lesen (mit Platzhaltern)",
    description:
      "Gibt ein freigegebenes Dokument zurück. Personenbezogene Daten sind durch Platzhalter ersetzt, z. B. [PERSON_1]. Übernimm Platzhalter unverändert in dein Ergebnis.",
    inputSchema: { id: z.string().max(40).describe("Dokument-ID, z. B. D-1a2b3c4d5e6f") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  guard(({ id }: { id: string }) => {
    const doc = store.readForAi(id);
    const legend = doc.platzhalter.length
      ? doc.platzhalter.map((p) => `- ${formatPlaceholder(p)} = ${ENTITY_LABELS[p.type]}`).join("\n")
      : "(keine)";
    const parts = [`Dokument ${doc.id} · ${ART_LABELS[doc.art]} · Fassung ${doc.fassung} (beim Speichern als fassung angeben)`];
    if (doc.betreff) parts.push(`Betreff: ${doc.betreff}`);
    parts.push("", "-----", doc.text, "-----", "", "Platzhalter in diesem Dokument:", legend);
    if (doc.kontenplan?.length) {
      parts.push("", "Kontenplan (nur diese Konten verwenden):", ...doc.kontenplan.map((k) => `- ${k.nummer} ${k.name}`));
    }
    parts.push("", `Nächster Schritt: ${NEXT_STEPS[doc.art]}`);
    return parts.join("\n");
  }),
);

server.registerTool(
  "ergebnis_speichern",
  {
    title: "Text-Ergebnis speichern",
    description:
      "Speichert ein Text-Ergebnis (z. B. Antwort-E-Mail, Bericht, Zusammenfassung) mit Platzhaltern. Der Bot setzt die echten Daten ein; ein Mitarbeiter prüft vor dem Versand.",
    inputSchema: {
      id: z.string().max(40).describe("Dokument-ID"),
      fassung,
      text: z.string().min(1).max(200_000).describe("Das Ergebnis mit Platzhaltern, z. B. 'Sehr geehrte Frau [PERSON_1], ...'"),
      titel: z.string().max(500).optional().describe("Optional: Betreff oder Titel des Ergebnisses"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  guard(({ id, fassung: f, text: body, titel }: { id: string; fassung: number; text: string; titel?: string }) => {
    const ergebnis: ErgebnisKi = titel ? { art: "text", titel, text: body } : { art: "text", text: body };
    const { pruefung } = store.saveResult(id, ergebnis, f);
    return describeCheck(pruefung);
  }),
);

const betrag = z.number().min(-1e9).max(1e9);
const buchungSchema = z.object({
  datum: z.string().max(40).describe("Buchungs- bzw. Belegdatum, z. B. 30.09.2026"),
  belegnummer: z.string().max(200).optional().describe("Nummer des Belegs, z. B. Rechnungsnummer des Lieferanten; Platzhalter erlaubt"),
  konto: z.string().max(40).describe("Aufwands- oder Erlöskonto aus dem Kontenplan (keine Platzhalter)"),
  gegenkonto: z.string().max(40).describe("Gegenkonto, z. B. 3300 für Lieferverbindlichkeiten (keine Platzhalter)"),
  text: z.string().max(2000).describe("Buchungstext, Platzhalter erlaubt, z. B. 'Wartung [FIRMA_1]'"),
  netto: betrag.describe("Nettobetrag in Euro"),
  ust_satz: z.number().min(0).max(100).describe("Umsatzsteuersatz in Prozent, z. B. 20"),
  brutto_laut_beleg: betrag.optional().describe("Bruttobetrag laut Beleg, zur Gegenprobe"),
});

server.registerTool(
  "buchungen_vorschlagen",
  {
    title: "Buchungsvorschläge speichern",
    description:
      "Speichert Buchungsvorschläge zu einem Beleg. Gib Nettobetrag und Steuersatz an; der Bot berechnet Steuer und Brutto selbst und vergleicht mit dem Beleg. Ein Mitarbeiter prüft, bevor gebucht wird.",
    inputSchema: {
      id: z.string().max(40).describe("Dokument-ID"),
      fassung,
      buchungen: z.array(buchungSchema).min(1).max(500),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  guard(({ id, fassung: f, buchungen }: { id: string; fassung: number; buchungen: z.infer<typeof buchungSchema>[] }) => {
    const { pruefung, summen } = store.saveResult(id, { art: "buchungen", buchungen }, f);
    return describeCheck(pruefung, summen);
  }),
);

const positionSchema = z.object({
  beschreibung: z.string().max(2000).describe("Leistung, Platzhalter erlaubt"),
  menge: z.number().positive().max(1e6).describe("Menge, höchstens 3 Nachkommastellen"),
  einheit: z.string().max(40).optional().describe("z. B. Nächte, Stück, Stunden"),
  einzelpreis: betrag.describe("Preis pro Einheit in Euro, höchstens 4 Nachkommastellen"),
  preis_ist_brutto: z
    .boolean()
    .optional()
    .describe("true, wenn der Einzelpreis die USt schon enthält (z. B. Preise für Privatgäste); bei allen Positionen gleich"),
  ust_satz: z.number().min(0).max(100).describe("Umsatzsteuersatz in Prozent, z. B. 10 für Beherbergung in Österreich"),
});

server.registerTool(
  "rechnung_erstellen",
  {
    title: "Rechnung erstellen",
    description:
      "Erstellt einen Rechnungsentwurf. Empfänger und Adresse als Platzhalter angeben (z. B. [PERSON_1], [ADRESSE_1]). Der Bot setzt die echten Daten und die eigenen Firmendaten ein, rechnet Steuern und Summen und vergibt die Rechnungsnummer erst bei der Freigabe durch einen Mitarbeiter.",
    inputSchema: {
      id: z.string().max(40).describe("Dokument-ID"),
      fassung,
      empfaenger: z.string().max(500).describe("Platzhalter des Empfängers, z. B. [PERSON_1] oder [FIRMA_1]"),
      empfaenger_adresse: z.string().max(500).optional().describe("Platzhalter der Adresse, z. B. [ADRESSE_1]"),
      empfaenger_uid: z.string().max(200).optional().describe("Platzhalter der UID-Nummer des Empfängers, falls vorhanden"),
      leistungszeitraum: z.string().max(200).optional().describe("z. B. '12.02.2027 bis 15.02.2027'"),
      positionen: z.array(positionSchema).min(1).max(500),
      zahlungshinweis: z.string().max(2000).optional().describe("z. B. 'Bezahlt bei Abreise mit Karte.'"),
      anmerkung: z.string().max(2000).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  guard(({ id, fassung: f, ...rechnung }: { id: string; fassung: number } & RechnungInhalt) => {
    const { pruefung, summen } = store.saveResult(id, { art: "rechnung", rechnung }, f);
    return describeCheck(pruefung, summen);
  }),
);

await server.connect(new StdioServerTransport());
process.stderr.write("datenschutz-bot MCP-Server läuft (stdio).\n");
// Nur ins Fehlerprotokoll des Servers, nicht an die KI.
if (keySource() === "datenordner") process.stderr.write(`${KEY_WARNING}\n`);
