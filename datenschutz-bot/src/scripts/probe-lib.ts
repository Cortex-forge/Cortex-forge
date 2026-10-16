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
import { JobStore } from "../store/jobs.js";

export interface Fall {
  id: string;
  art: string;
  beschreibung?: string;
  betreff?: string;
  text: string;
  sensibel: Array<{ wert: string; typ: string }>;
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

/**
 * Legt alle Fälle in einem frischen Datenordner ab, gibt sie frei, liest sie über den echten MCP-Server und
 * speichert ein Ergebnis. Danach: Lösungsblatt gegen alle MCP-Antworten und alle Dateien.
 */
export async function runProbe(faelle: Fall[]): Promise<{ antworten: number; lecks: Leck[] }> {
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
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      return (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    };

    const lecks: Leck[] = [];
    let antworten = 0;
    try {
      const liste = await call("dokumente_auflisten");
      antworten++;
      for (const { fall, id } of jobs) {
        const gelesen = await call("dokument_lesen", { id });
        // Die "KI" antwortet mit allen Platzhaltern, die sie bekommen hat, plus einem falschen.
        const platzhalter = gelesen.match(/\[[A-Z]+_\d+(?::[^\]\n]*)?\]/g) ?? [];
        const fassung = Number(/Fassung (\d+)/.exec(gelesen)?.[1]);
        const gespeichert = await call("ergebnis_speichern", { id, fassung, text: `Antwort mit ${platzhalter.join(" ")} und [PERSON_999].` });
        antworten += 2;
        for (const s of fall.sensibel) {
          for (const [wo, text] of [["Liste", liste], ["dokument_lesen", gelesen], ["ergebnis_speichern", gespeichert]] as const) {
            if (containsValue(text, s.wert)) lecks.push({ fall: fall.id, wert: s.wert, typ: s.typ, wo: `MCP ${wo}` });
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
          if (containsValue(d.content, s.wert)) lecks.push({ fall: fall.id, wert: s.wert, typ: s.typ, wo: `Datei ${d.name}` });
        }
      }
    }
    return { antworten, lecks };
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
