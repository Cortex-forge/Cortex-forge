import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CONFIG_DIR, EXAMPLES_DIR, PROJECT_ROOT } from "../config.js";
import { JobStore } from "../store/jobs.js";

const example = (name: string) => fs.readFileSync(path.join(EXAMPLES_DIR, name), "utf8");

test("MCP-Server: Werkzeuge, Ablauf und keine Originaldaten in den Antworten", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-mcp-"));
  const store = new JobStore(dataDir, CONFIG_DIR);
  const hotel = store.create({ art: "hotel", text: example("hotel-anfrage.txt") });
  const beleg = store.create({ art: "buchhaltung", text: example("eingangsrechnung.txt") });
  const notReleased = store.create({ art: "hotel", text: "Anfrage von Maria Gruber, Tel. 0664 7654321" });
  store.releaseForAi(hotel.id);
  store.releaseForAi(beleg.id);

  const client = new Client({ name: "test-ki", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(PROJECT_ROOT, "dist", "mcp", "server.js")],
      env: { ...(process.env as Record<string, string>), DSB_DATA_DIR: dataDir },
      stderr: "ignore",
    }),
  );

  const responses: string[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const out = (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    responses.push(out);
    return { out, isError: result.isError === true };
  };

  try {
    assert.match(client.getInstructions() ?? "", /Platzhalter/);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "buchungen_vorschlagen",
      "dokument_lesen",
      "dokumente_auflisten",
      "ergebnis_speichern",
      "rechnung_erstellen",
    ]);

    const list = await call("dokumente_auflisten");
    assert.ok(list.out.includes(hotel.id) && list.out.includes(beleg.id));
    assert.ok(!list.out.includes(notReleased.id), "nicht freigegebene Dokumente dürfen nicht erscheinen");

    const blocked = await call("dokument_lesen", { id: notReleased.id });
    assert.equal(blocked.isError, true);

    const doc = await call("dokument_lesen", { id: hotel.id });
    assert.match(doc.out, /\[PERSON_1\]/);

    const saved = await call("ergebnis_speichern", {
      id: hotel.id,
      text: "Sehr geehrte Frau [PERSON_1], gern für [PERSON_2] und [PERSON_9]. Rückruf unter Tel. 0512 777777.",
    });
    assert.match(saved.out, /\[PERSON_9\]/, "unbekannter Platzhalter wird gemeldet");
    assert.match(saved.out, /Kontaktdaten/, "erfundene Telefonnummer wird gemeldet");
    const result = store.detail(hotel.id).ergebnis;
    assert.equal(result?.art === "text" ? result.text : "", "Sehr geehrte Frau Huber, gern für Thomas und [PERSON_9]. Rückruf unter Tel. 0512 777777.");

    await call("dokument_lesen", { id: beleg.id });
    const booked = await call("buchungen_vorschlagen", {
      id: beleg.id,
      buchungen: [
        { datum: "30.09.2026", konto: "7200", gegenkonto: "3300", text: "Wartung [FIRMA_1]", netto: 687, ust_satz: 20, brutto_laut_beleg: 824.4 },
      ],
    });
    assert.match(booked.out, /824,40/);

    // Datenschutz-Probe: kein Originalwert in irgendeiner Antwort an die KI.
    for (const job of [hotel, beleg, notReleased]) {
      for (const entry of store.detail(job.id).zuordnung) {
        for (const variant of entry.variants) {
          for (const r of responses) assert.ok(!r.includes(variant), `"${variant}" wurde an die KI gegeben`);
        }
      }
    }
  } finally {
    await client.close();
  }
});
