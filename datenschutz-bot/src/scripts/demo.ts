// Demo ohne KI-Konto: Ein Skript spielt die Rolle von Claude und ruft den MCP-Server genau so auf,
// wie es Claude oder Codex tun würden. So sieht man den ganzen Ablauf und prüft nebenbei mit dem
// Lösungsblatt (examples/loesungen.json), dass keine sensible Angabe den Bot verlässt.
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EXAMPLES_DIR, PROJECT_ROOT } from "../config.js";
import { JobStore } from "../store/jobs.js";
import { containsValue, loadExamples } from "./probe-lib.js";

const quiet = process.argv.includes("--leise");
const say = (line = "") => {
  if (!quiet) console.log(line);
};
const example = (name: string) => fs.readFileSync(path.join(EXAMPLES_DIR, name), "utf8");

// 1) Mitarbeiter legt Dokumente ab, prüft die KI-Sicht und gibt sie frei (sonst in der Oberfläche).
const store = new JobStore();
const hotel = store.create({ art: "hotel", text: example("hotel-anfrage.txt") });
const beleg = store.create({ art: "buchhaltung", betreff: "Eingangsrechnung Elektriker", text: example("eingangsrechnung.txt") });
const auftrag = store.create({ art: "hotel", betreff: "Rechnung Aufenthalt", text: example("rechnungsauftrag.txt") });
for (const job of [hotel, beleg, auftrag]) store.releaseForAi(job.id);

// 2) Die "KI" verbindet sich per MCP.
const client = new Client({ name: "demo-ki", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.join(PROJECT_ROOT, "dist", "mcp", "server.js")],
    env: { ...(process.env as Record<string, string>), DSB_DATA_DIR: store.dataDir },
    stderr: "ignore",
  }),
);

const responses: string[] = [];
async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text?: string }>;
  const out = content.map((c) => c.text ?? "").join("\n");
  responses.push(out);
  if (result.isError) throw new Error(`${name}: ${out}`);
  return out;
}

const { tools } = await client.listTools();
say(`MCP-Werkzeuge: ${tools.map((t) => t.name).join(", ")}`);
say();
say(await call("dokumente_auflisten"));
say();

const hotelView = await call("dokument_lesen", { id: hotel.id });
say("=== So sieht die KI die Hotel-Anfrage ===");
say(hotelView);
say();

say(
  await call("ergebnis_speichern", {
    id: hotel.id,
    titel: "Ihre Anfrage für Februar 2027",
    text: `Sehr geehrte Frau [PERSON_1],

vielen Dank für Ihre Anfrage! Für den 12. bis 15. Februar 2027 können wir Ihnen gerne ein Doppelzimmer mit Zustellbett für Sie, [PERSON_2] und [PERSON_3] anbieten.

Den Hinweis zu [PERSON_3] ([GESUNDHEIT_1]) haben wir an unsere Küche weitergegeben. Einen Parkplatz für Ihr Auto ([KENNZEICHEN_1]) reservieren wir gerne für Sie.

Möchten Sie verbindlich buchen? Dann genügt eine kurze Antwort auf diese E-Mail.

Herzliche Grüße aus Axams
Ihr Team vom Hotel Alpenrose`,
  }),
);
say();

const belegView = await call("dokument_lesen", { id: beleg.id });
say("=== So sieht die KI die Eingangsrechnung ===");
say(belegView);
say();
say(
  await call("buchungen_vorschlagen", {
    id: beleg.id,
    buchungen: [
      {
        datum: "30.09.2026",
        belegnummer: "2026-0815",
        konto: "7200",
        gegenkonto: "3300",
        text: "Wartung Notbeleuchtung, LED-Tausch, [FIRMA_1]",
        netto: 687,
        ust_satz: 20,
        brutto_laut_beleg: 824.4,
      },
    ],
  }),
);
say();

await call("dokument_lesen", { id: auftrag.id });
say(
  await call("rechnung_erstellen", {
    id: auftrag.id,
    empfaenger: "[PERSON_1]",
    empfaenger_adresse: "[ADRESSE_1]",
    leistungszeitraum: "12.02.2027 bis 15.02.2027",
    positionen: [
      { beschreibung: "Doppelzimmer inkl. Frühstück", menge: 3, einheit: "Nächte", einzelpreis: 189, preis_ist_brutto: true, ust_satz: 10 },
      { beschreibung: "Zustellbett Kind", menge: 3, einheit: "Nächte", einzelpreis: 35, preis_ist_brutto: true, ust_satz: 10 },
      { beschreibung: "Parkplatz", menge: 3, einheit: "Tage", einzelpreis: 12, preis_ist_brutto: true, ust_satz: 20 },
    ],
    zahlungshinweis: "Der Betrag wurde bei Abreise mit Karte bezahlt. Vielen Dank für Ihren Aufenthalt!",
  }),
);
await client.close();

// 3) Datenschutz-Probe gegen das Lösungsblatt: Kommt eine sensible Angabe in einer Antwort an die KI vor?
//    Das Lösungsblatt ist unabhängig von der Erkennung, die Probe findet also auch Übersehenes.
const leaks: string[] = [];
for (const fall of loadExamples()) {
  for (const s of fall.sensibel) {
    if (responses.some((r) => containsValue(r, s.wert))) leaks.push(`${fall.id}: ${s.typ} „${s.wert}“`);
  }
}

// 4) Was der Mitarbeiter in der Oberfläche zur Prüfung bekommt.
const hotelResult = store.detail(hotel.id).ergebnis;
say();
say("=== Ergebnis mit echten Daten (nur beim Bot, zur Prüfung) ===");
if (hotelResult?.art === "text") say(hotelResult.text);
const belegResult = store.detail(beleg.id).ergebnis;
if (belegResult?.art === "buchungen") {
  for (const b of belegResult.buchungen) {
    say(`Buchung: ${b.konto} an ${b.gegenkonto} · ${b.text} · netto ${b.netto} · USt ${b.ust_betrag} · brutto ${b.brutto}`);
  }
}
const invoice = store.detail(auftrag.id).ergebnis;
if (invoice?.art === "rechnung") {
  say(`Rechnung an ${invoice.rechnung.empfaenger}, ${invoice.rechnung.empfaenger_adresse}: brutto ${invoice.summen.brutto} €`);
}
say();
if (leaks.length) {
  console.error(`ACHTUNG: ${leaks.length} Originalwerte in KI-Antworten gefunden:\n${leaks.join("\n")}`);
  process.exit(1);
}
console.log(
  `Datenschutz-Probe bestanden: ${responses.length} Antworten an die KI gegen das Lösungsblatt geprüft, keine sensible Angabe enthalten.`,
);
console.log("Öffne die Oberfläche (npm start) und prüfe die drei Ergebnisse.");
