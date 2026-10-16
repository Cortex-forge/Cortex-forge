#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { RechnungInhalt } from "../core/invoice.js";
import { formatEuro } from "../core/money.js";
import { formatPlaceholder } from "../core/pseudonymize.js";
import { ENTITY_LABELS } from "../core/types.js";
import { ART_LABELS, JobError, JobStore, type ErgebnisKi, type JobArt, type Pruefung } from "../store/jobs.js";

const INSTRUCTIONS = `Datenschutz-Bot: Über diese Werkzeuge bekommst du Dokumente (Gästeanfragen, Rechnungen, Belege), in denen alle personenbezogenen Daten durch Platzhalter ersetzt sind, z. B. [PERSON_1], [ADRESSE_1] oder [FIRMA_1: Elektroinstallateur].

Regeln:
1. Übernimm Platzhalter exakt so in dein Ergebnis, z. B. "Sehr geehrte Frau [PERSON_1]". Der Bot setzt danach die echten Daten ein.
2. Erfinde keine Namen, Adressen, Telefonnummern, E-Mail-Adressen oder Bankdaten.
3. Versuche nicht, Platzhalter zu erraten oder aufzulösen.
4. Speichere jedes Ergebnis mit ergebnis_speichern, buchungen_vorschlagen oder rechnung_erstellen. Ein Mitarbeiter prüft es in der Oberfläche, bevor es verschickt oder gebucht wird.
5. Rechne Steuern und Summen nicht selbst aus. Das macht der Bot.`;

const NEXT_STEPS: Record<JobArt, string> = {
  hotel:
    "Schreibe eine Antwort an den Gast und speichere sie mit ergebnis_speichern. Wenn eine Rechnung gewünscht ist, nutze rechnung_erstellen.",
  buchhaltung:
    "Erstelle Buchungsvorschläge mit buchungen_vorschlagen (Nettobetrag und Steuersatz je Buchung, nur Konten aus dem Kontenplan). Soll eine Rechnung geschrieben werden, nutze rechnung_erstellen.",
  allgemein: "Bearbeite das Dokument wie gewünscht und speichere das Ergebnis mit ergebnis_speichern.",
};

const store = new JobStore();

function text(value: string, isError = false) {
  return { content: [{ type: "text" as const, text: value }], ...(isError ? { isError: true } : {}) };
}

function guard<A>(fn: (args: A) => string) {
  return async (args: A) => {
    try {
      return text(fn(args));
    } catch (err) {
      if (err instanceof JobError) return text(err.message, true);
      throw err;
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
  if (pruefung.erfunden.length) {
    lines.push(
      `Du hast selbst Kontaktdaten geschrieben (${pruefung.erfunden.map((e) => e.label).join(", ")}). Bitte keine Kontaktdaten erfinden; nutze Platzhalter.`,
    );
  }
  for (const h of pruefung.hinweise) lines.push(`Hinweis: ${h}`);
  return lines.join("\n");
}

const server = new McpServer(
  { name: "datenschutz-bot", version: "0.1.0" },
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
    inputSchema: { id: z.string().describe("Dokument-ID, z. B. D-1a2b3c") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  guard(({ id }: { id: string }) => {
    const doc = store.readForAi(id);
    const legend = doc.platzhalter.length
      ? doc.platzhalter.map((p) => `- ${formatPlaceholder(p)} = ${ENTITY_LABELS[p.type]}`).join("\n")
      : "(keine)";
    const parts = [`Dokument ${doc.id} · ${ART_LABELS[doc.art]}`];
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
      id: z.string().describe("Dokument-ID"),
      text: z.string().min(1).describe("Das Ergebnis mit Platzhaltern, z. B. 'Sehr geehrte Frau [PERSON_1], ...'"),
      titel: z.string().optional().describe("Optional: Betreff oder Titel des Ergebnisses"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  guard(({ id, text: body, titel }: { id: string; text: string; titel?: string }) => {
    const ergebnis: ErgebnisKi = titel ? { art: "text", titel, text: body } : { art: "text", text: body };
    const { pruefung } = store.saveResult(id, ergebnis);
    return describeCheck(pruefung);
  }),
);

const buchungSchema = z.object({
  datum: z.string().describe("Buchungs- bzw. Belegdatum, z. B. 30.09.2026"),
  belegnummer: z.string().optional().describe("Nummer des Belegs, z. B. Rechnungsnummer des Lieferanten"),
  konto: z.string().describe("Aufwands- oder Erlöskonto aus dem Kontenplan"),
  gegenkonto: z.string().describe("Gegenkonto, z. B. 3300 für Lieferverbindlichkeiten"),
  text: z.string().describe("Buchungstext, Platzhalter erlaubt, z. B. 'Wartung [FIRMA_1]'"),
  netto: z.number().describe("Nettobetrag in Euro"),
  ust_satz: z.number().min(0).max(100).describe("Umsatzsteuersatz in Prozent, z. B. 20"),
  brutto_laut_beleg: z.number().optional().describe("Bruttobetrag laut Beleg, zur Gegenprobe"),
});

server.registerTool(
  "buchungen_vorschlagen",
  {
    title: "Buchungsvorschläge speichern",
    description:
      "Speichert Buchungsvorschläge zu einem Beleg. Gib Nettobetrag und Steuersatz an; der Bot berechnet Steuer und Brutto selbst und vergleicht mit dem Beleg. Ein Mitarbeiter prüft, bevor gebucht wird.",
    inputSchema: {
      id: z.string().describe("Dokument-ID"),
      buchungen: z.array(buchungSchema).min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  guard(({ id, buchungen }: { id: string; buchungen: z.infer<typeof buchungSchema>[] }) => {
    const { pruefung, summen } = store.saveResult(id, { art: "buchungen", buchungen });
    return describeCheck(pruefung, summen);
  }),
);

const positionSchema = z.object({
  beschreibung: z.string().describe("Leistung, Platzhalter erlaubt"),
  menge: z.number().positive(),
  einheit: z.string().optional().describe("z. B. Nächte, Stück, Stunden"),
  einzelpreis: z.number().describe("Preis pro Einheit in Euro"),
  preis_ist_brutto: z.boolean().optional().describe("true, wenn der Einzelpreis die USt schon enthält (z. B. Preise für Privatgäste)"),
  ust_satz: z.number().min(0).max(100).describe("Umsatzsteuersatz in Prozent, z. B. 10 für Beherbergung in Österreich"),
});

server.registerTool(
  "rechnung_erstellen",
  {
    title: "Rechnung erstellen",
    description:
      "Erstellt einen Rechnungsentwurf. Empfänger und Adresse als Platzhalter angeben (z. B. [PERSON_1], [ADRESSE_1]). Der Bot setzt die echten Daten und die eigenen Firmendaten ein, rechnet Steuern und Summen und vergibt die Rechnungsnummer erst bei der Freigabe durch einen Mitarbeiter.",
    inputSchema: {
      id: z.string().describe("Dokument-ID"),
      empfaenger: z.string().describe("Platzhalter des Empfängers, z. B. [PERSON_1] oder [FIRMA_1]"),
      empfaenger_adresse: z.string().optional().describe("Platzhalter der Adresse, z. B. [ADRESSE_1]"),
      empfaenger_uid: z.string().optional().describe("Platzhalter der UID-Nummer des Empfängers, falls vorhanden"),
      leistungszeitraum: z.string().optional().describe("z. B. '12.02.2027 bis 15.02.2027'"),
      positionen: z.array(positionSchema).min(1),
      zahlungshinweis: z.string().optional().describe("z. B. 'Bezahlt bei Abreise mit Karte.'"),
      anmerkung: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  guard(({ id, ...rechnung }: { id: string } & RechnungInhalt) => {
    const { pruefung, summen } = store.saveResult(id, { art: "rechnung", rechnung });
    return describeCheck(pruefung, summen);
  }),
);

await server.connect(new StdioServerTransport());
process.stderr.write("datenschutz-bot MCP-Server läuft (stdio).\n");
