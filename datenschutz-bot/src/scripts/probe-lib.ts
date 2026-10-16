// Datenschutz-Probe gegen ein Lösungsblatt: Dokumente durch den echten MCP-Server schicken und prüfen, ob eine
// der Angaben aus dem Lösungsblatt in einer Antwort an die KI oder unverschlüsselt auf der Platte auftaucht.
// Anders als ein Vergleich mit den eigenen Funden findet das auch, was die Erkennung übersehen hat.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CONFIG_DIR, EXAMPLES_DIR, PROJECT_ROOT } from "../config.js";
import { escapeRegExp } from "../core/detectors.js";
import { PARTICLE_WORDS } from "../core/salutations.js";
import { JobStore } from "../store/jobs.js";

export interface Fall {
  id: string;
  art: string;
  beschreibung?: string;
  betreff?: string;
  text: string;
  sensibel: Array<{ wert: string; typ: string }>;
  /** Teile von Namen, die hier als gewöhnliches Wort stehen bleiben dürfen ("an euren Koch" neben "Thomas Koch"). */
  teilwort_erlaubt?: string[];
}

export interface Leck {
  fall: string;
  wert: string;
  typ: string;
  wo: string;
}

export function loadExamples(): Fall[] {
  const { beispiele } = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, "loesungen.json"), "utf8")) as {
    beispiele: Array<{ datei: string; art: string; betreff: string; sensibel: Fall["sensibel"] }>;
  };
  return beispiele.map((b) => ({
    id: b.datei,
    art: b.art,
    betreff: b.betreff,
    text: fs.readFileSync(path.join(EXAMPLES_DIR, b.datei), "utf8"),
    sensibel: b.sensibel,
  }));
}

export function loadTestset(file = path.join(PROJECT_ROOT, "testset", "faelle.json")): Fall[] {
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { faelle: Fall[] }).faelle;
}

/** Kommt der Wert als eigenes Wort (nicht als Teil eines längeren Wortes) im Text vor? */
export function containsValue(haystack: string, value: string): boolean {
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(value)}(?![\p{L}\p{N}])`, "u").test(haystack);
}

const NUMERIC_TYPES = new Set(["TELEFON", "IBAN", "KREDITKARTE", "SVNR", "STEUERNR", "KUNDENNR", "AUSWEIS", "UID", "KENNZEICHEN"]);

/**
 * Welcher Teil eines Werts ist sichtbar? Auch Teil-Lecks zählen: ein Nachname ohne Vornamen, eine IBAN ohne die letzte
 * Ziffer, der Name vor dem @ einer E-Mail. Gibt den sichtbaren Teil zurück oder undefined.
 */
export function leakedPart(haystack: string, value: string, typ: string, erlaubt: string[] = []): string | undefined {
  if (containsValue(haystack, value)) return value;
  if (typ === "PERSON") {
    // Auch Teile von Doppelnamen und gebeugte Formen ("Huber" aus "Huber-Moosbrugger", "Moosbruggers", "Whitcombe's").
    const inflected = (t: string) =>
      new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(t)}(?:['’]s|es|s)?(?![\p{L}\p{N}])`, "u").test(haystack);
    return value
      .split(/[\s,]+/)
      .flatMap((t) => (t.includes("-") ? [t, ...t.split("-")] : [t]))
      .filter((t) => t.length >= 3 && !PARTICLE_WORDS.has(t.toLowerCase()) && !erlaubt.includes(t))
      .find((t) => inflected(t));
  }
  if (typ === "EMAIL") {
    const local = value.split("@")[0] ?? "";
    return local.length >= 4 && containsValue(haystack, local) ? local : undefined;
  }
  if (NUMERIC_TYPES.has(typ)) {
    // Ohne Leer- und Trennzeichen vergleichen; sieben Zeichen am Stück sind schon ein Leck.
    const norm = (v: string) => v.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();
    const target = norm(value);
    const hay = norm(haystack);
    const width = 7;
    if (target.length < width) return undefined;
    for (let i = 0; i + width <= target.length; i++) {
      const piece = target.slice(i, i + width);
      if (/\d/.test(piece) && hay.includes(piece)) return piece;
    }
  }
  return undefined;
}

/**
 * Alle Dateien im Datenordner als Text. Verschlüsselte Blöcke ("v2.…") und die Schlüsseldatei werden vorher
 * entfernt: Zufällige Buchstabenfolgen darin sind kein Klartext und würden sonst gelegentlich Fehlalarme auslösen.
 */
export function filesUnder(dir: string): Array<{ name: string; content: string }> {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== ".schluessel")
    .map((e) => ({
      name: path.relative(dir, path.join(e.parentPath, e.name)),
      content: fs.readFileSync(path.join(e.parentPath, e.name), "utf8").replace(/v2\.[A-Za-z0-9+/=]{16,}/g, "v2.…"),
    }));
}

/** Platzhalter in Stücke, die in ein Feld passen (die Werkzeuge begrenzen die Länge eines Felds). */
function chunks(items: string[], max = 1500): string[] {
  const out: string[] = [];
  let cur = "";
  for (const item of items) {
    if (cur && cur.length + 1 + item.length > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur} ${item}` : item;
  }
  return cur ? [...out, cur] : out;
}

/**
 * Legt alle Fälle in einem frischen Datenordner ab, gibt sie frei, liest sie über den echten MCP-Server und
 * speichert über jedes Werkzeug ein Ergebnis. Danach: Lösungsblatt gegen alle MCP-Antworten und alle Dateien.
 * Jeder Werkzeugaufruf muss gelingen (bzw. bei der absichtlich falschen Fassung scheitern); sonst steht er unter
 * "fehler" und die Probe gilt als nicht bestanden, weil der Weg nicht geprüft wurde.
 */
export async function runProbe(faelle: Fall[]): Promise<{ antworten: number; lecks: Leck[]; fehler: string[] }> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-probe-"));
  try {
    const store = new JobStore(dataDir, CONFIG_DIR);
    const jobs = faelle.map((f) => {
      const art = ["hotel", "buchhaltung", "allgemein"].includes(f.art) ? f.art : "allgemein";
      const job = store.create({ art, ...(f.betreff ? { betreff: f.betreff } : {}), text: f.text }, "system");
      store.releaseForAi(job.id, job.rev);
      return { fall: f, id: job.id };
    });

    const client = new Client({ name: "datenschutz-probe", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.join(PROJECT_ROOT, "dist", "mcp", "server.js")],
        env: { ...(process.env as Record<string, string>), DSB_DATA_DIR: dataDir },
        stderr: "ignore",
      }),
    );
    const fehler: string[] = [];
    /** Ruft ein Werkzeug auf und prüft, ob es wie erwartet gelingt (bzw. scheitert). */
    const call = async (fall: string, name: string, args: Record<string, unknown> = {}, sollScheitern = false) => {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
      if ((result.isError === true) !== sollScheitern) {
        fehler.push(`${fall} · ${name}: ${sollScheitern ? "hätte abgelehnt werden müssen" : `fehlgeschlagen (${text.slice(0, 160)})`}`);
      }
      return text;
    };

    const lecks: Leck[] = [];
    let antworten = 0;
    try {
      const liste = await call("alle", "dokumente_auflisten");
      antworten++;
      for (const { fall, id } of jobs) {
        const gelesen = await call(fall.id, "dokument_lesen", { id });
        // Die "KI" antwortet mit allen Platzhaltern, die sie bekommen hat, plus einem falschen, und benutzt alle
        // Speicherwerkzeuge (auch deren Antworten dürfen nichts verraten). Lange Listen werden auf mehrere
        // Buchungszeilen und Positionen verteilt, damit jedes Feld in die Grenzen der Werkzeuge passt.
        const platzhalter = gelesen.match(/\[[A-Z]+_\d+(?::[^\]\n]*)?\]/g) ?? [];
        const fassung = Number(/Fassung (\d+)/.exec(gelesen)?.[1]);
        const teile = chunks([...platzhalter, "und [PERSON_999]"]);
        const alle = teile.join(" ");
        const antwortenFall: Array<[string, string]> = [
          ["dokument_lesen", gelesen],
          ["ergebnis_speichern", await call(fall.id, "ergebnis_speichern", { id, fassung, text: `Antwort mit ${alle}.` })],
          // Absichtlich mit falscher Fassung: muss scheitern, und auch die Fehlermeldung darf nichts verraten.
          ["ergebnis_speichern (falsche Fassung)", await call(fall.id, "ergebnis_speichern", { id, fassung: fassung + 1, text: `Antwort mit ${alle}.` }, true)],
          [
            "buchungen_vorschlagen",
            await call(fall.id, "buchungen_vorschlagen", {
              id,
              fassung,
              buchungen: teile.map((t) => ({ datum: "01.10.2026", belegnummer: platzhalter[0] ?? "1", konto: "7200", gegenkonto: "3300", text: `Buchung ${t}`, netto: 100, ust_satz: 20 })),
            }),
          ],
          [
            "rechnung_erstellen",
            await call(fall.id, "rechnung_erstellen", {
              id,
              fassung,
              empfaenger: platzhalter[0] ?? "[PERSON_1]",
              empfaenger_adresse: platzhalter[1] ?? "",
              positionen: teile.map((t) => ({ beschreibung: `Leistung ${t}`, menge: 1, einzelpreis: 100, ust_satz: 10 })),
              anmerkung: teile[0] ?? "",
            }),
          ],
        ];
        antworten += antwortenFall.length;
        for (const s of fall.sensibel) {
          for (const [wo, text] of [["Liste", liste], ...antwortenFall] as Array<[string, string]>) {
            const teil = leakedPart(text, s.wert, s.typ, fall.teilwort_erlaubt);
            if (teil) lecks.push({ fall: fall.id, wert: teil === s.wert ? s.wert : `${s.wert} (Teil „${teil}“)`, typ: s.typ, wo: `MCP ${wo}` });
          }
        }
      }
    } finally {
      await client.close();
    }

    const dateien = filesUnder(dataDir);
    for (const fall of faelle) {
      for (const s of fall.sensibel) {
        for (const d of dateien) {
          const teil = leakedPart(d.content, s.wert, s.typ, fall.teilwort_erlaubt);
          if (teil) lecks.push({ fall: fall.id, wert: teil === s.wert ? s.wert : `${s.wert} (Teil „${teil}“)`, typ: s.typ, wo: `Datei ${d.name}` });
        }
      }
    }
    return { antworten, lecks, fehler };
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
