import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CONFIG_DIR, PROJECT_ROOT } from "../config.js";
import { containsValue, filesUnder, loadExamples, runProbe } from "../scripts/probe-lib.js";
import { JobStore } from "../store/jobs.js";

async function connect(dataDir: string) {
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
  return { client, call, responses };
}

test("MCP-Server: Werkzeuge, Ablauf, Prüfhinweise", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-mcp-"));
  const store = new JobStore(dataDir, CONFIG_DIR);
  const [hotelFall, belegFall] = loadExamples();
  const hotel = store.create({ art: "hotel", text: hotelFall?.text ?? "" });
  const beleg = store.create({ art: "buchhaltung", text: belegFall?.text ?? "" });
  const notReleased = store.create({ art: "hotel", text: "Anfrage von Maria Gruber, Tel. 0664 7654321" });
  store.releaseForAi(hotel.id);
  store.releaseForAi(beleg.id);

  const { client, call } = await connect(dataDir);
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
    assert.equal((await call("dokument_lesen", { id: notReleased.id })).isError, true);

    const doc = await call("dokument_lesen", { id: hotel.id });
    assert.match(doc.out, /\[PERSON_1\]/);

    const saved = await call("ergebnis_speichern", {
      id: hotel.id,
      text: "Sehr geehrte Frau [PERSON_1], gern für [PERSON_2] und [PERSON_9] sowie [NAME_1]. Rückruf unter Tel. 0512 777777.",
    });
    assert.match(saved.out, /\[PERSON_9\]/, "unbekannter Platzhalter wird gemeldet");
    assert.match(saved.out, /\[NAME_1\]/, "falsch geschriebener Platzhalter wird gemeldet");
    assert.match(saved.out, /Kontaktdaten/, "erfundene Telefonnummer wird gemeldet");
    const result = store.detail(hotel.id).ergebnis;
    assert.equal(
      result?.art === "text" ? result.text : "",
      "Sehr geehrte Frau Huber, gern für Thomas und [PERSON_9] sowie [NAME_1]. Rückruf unter Tel. 0512 777777.",
    );

    await call("dokument_lesen", { id: beleg.id });
    const booked = await call("buchungen_vorschlagen", {
      id: beleg.id,
      buchungen: [
        { datum: "30.09.2026", konto: "7200", gegenkonto: "3300", text: "Wartung [FIRMA_1]", netto: 687, ust_satz: 20, brutto_laut_beleg: 824.4 },
      ],
    });
    assert.match(booked.out, /824,40/);

    // Zu große Eingaben lehnt der Server ab.
    const huge = await call("ergebnis_speichern", { id: hotel.id, text: "x".repeat(200_001) });
    assert.equal(huge.isError, true);
  } finally {
    await client.close();
  }
});

// Review Claude #8, Codex #14: Probe gegen das Lösungsblatt statt gegen die eigenen Funde
test("Datenschutz-Probe mit Lösungsblatt: Beispiele über den echten MCP-Server", async () => {
  const { antworten, lecks } = await runProbe(loadExamples());
  assert.ok(antworten >= 7);
  assert.deepEqual(lecks, []);
});

// Review Codex #1 (Blocker): Originale dürfen auch nicht über Prüfhinweise zur KI gelangen
test("Originale, die wie Platzhalter aussehen, kommen nicht über Prüfhinweise zur KI", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-mcp-"));
  const store = new JobStore(dataDir, CONFIG_DIR);
  const code = store.create({ art: "allgemein", text: "Geheimer Code: PERSON_987654" });
  store.mark(code.id, { value: "PERSON_987654", type: "SONSTIGES" });
  store.releaseForAi(code.id);
  const mail = store.create({ art: "allgemein", text: "Kontakt: PERSON_999@example.com" });
  store.releaseForAi(mail.id);

  const { client, call, responses } = await connect(dataDir);
  try {
    assert.ok((await call("dokument_lesen", { id: code.id })).out.includes("[SONSTIGES_1]"));
    await call("ergebnis_speichern", { id: code.id, text: "Ihr Code: [SONSTIGES_1]" });
    await call("dokument_lesen", { id: mail.id });
    await call("ergebnis_speichern", { id: mail.id, text: "Mail: [EMAIL_1]" });
  } finally {
    await client.close();
  }
  for (const r of responses) {
    assert.ok(!r.includes("987654"), `Original in Antwort: ${r}`);
    assert.ok(!r.includes("PERSON_999"), `Original in Antwort: ${r}`);
  }
  for (const f of filesUnder(dataDir)) {
    assert.ok(!containsValue(f.content, "PERSON_987654"), `Klartext in ${f.name}`);
    assert.ok(!f.content.includes("PERSON_999@example.com"), `Klartext in ${f.name}`);
  }
});
