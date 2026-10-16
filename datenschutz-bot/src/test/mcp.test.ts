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

async function connect(dataDir: string, configDir = CONFIG_DIR) {
  const client = new Client({ name: "test-ki", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(PROJECT_ROOT, "dist", "mcp", "server.js")],
      env: { ...(process.env as Record<string, string>), DSB_DATA_DIR: dataDir, DSB_CONFIG_DIR: configDir },
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
  store.releaseForAi(hotel.id, hotel.rev);
  store.releaseForAi(beleg.id, beleg.rev);

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
    assert.match(doc.out, /Fassung 1/);
    // Ohne passende Fassung lehnt der Bot ab (Review Codex 2 #4).
    const wrong = await call("ergebnis_speichern", { id: hotel.id, fassung: 2, text: "Sehr geehrte Frau [PERSON_1]" });
    assert.equal(wrong.isError, true);
    assert.match(wrong.out, /seit dem Lesen geändert/);

    const saved = await call("ergebnis_speichern", {
      id: hotel.id,
      fassung: 1,
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
      fassung: 1,
      buchungen: [
        { datum: "30.09.2026", konto: "7200", gegenkonto: "3300", text: "Wartung [FIRMA_1]", netto: 687, ust_satz: 20, brutto_laut_beleg: 824.4 },
      ],
    });
    assert.match(booked.out, /824,40/);

    // Zu große Eingaben lehnt der Server ab.
    const huge = await call("ergebnis_speichern", { id: hotel.id, fassung: 1, text: "x".repeat(200_001) });
    assert.equal(huge.isError, true);
  } finally {
    await client.close();
  }
});

// Review Codex 2 #1 (Blocker): auch der Kontenplan geht nur mit Platzhaltern an die KI
test("MCP: Kontenplan mit Personennamen kommt nur pseudonymisiert und wie geprüft zur KI", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-mcp-"));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-mcp-config-"));
  fs.writeFileSync(path.join(configDir, "kontenplan.json"), JSON.stringify({ konten: [{ nummer: "3300", name: "Lieferant Anna Huber" }] }));
  const store = new JobStore(dataDir, configDir);
  const job = store.create({ art: "buchhaltung", text: "Lieferant Anna Huber; Wartung 10 EUR." });
  store.releaseForAi(job.id, job.rev);
  const { client, call, responses } = await connect(dataDir, configDir);
  try {
    const doc = await call("dokument_lesen", { id: job.id });
    assert.match(doc.out, /- 3300 Lieferant \[PERSON_1\]/);
    const booked = await call("buchungen_vorschlagen", {
      id: job.id,
      fassung: 1,
      buchungen: [{ datum: "01.10.2026", konto: "3300", gegenkonto: "3300", text: "Wartung [PERSON_1]", netto: 10, ust_satz: 20 }],
    });
    assert.equal(booked.isError, false);
  } finally {
    await client.close();
  }
  for (const r of responses) assert.ok(!r.includes("Huber"), `Original in Antwort: ${r}`);
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
  const marked = store.mark(code.id, { value: "PERSON_987654", type: "SONSTIGES" });
  store.releaseForAi(code.id, marked.job.rev);
  const mail = store.create({ art: "allgemein", text: "Kontakt: PERSON_999@example.com" });
  store.releaseForAi(mail.id, mail.rev);

  const { client, call, responses } = await connect(dataDir);
  try {
    assert.ok((await call("dokument_lesen", { id: code.id })).out.includes("[SONSTIGES_1]"));
    await call("ergebnis_speichern", { id: code.id, fassung: 1, text: "Ihr Code: [SONSTIGES_1]" });
    await call("dokument_lesen", { id: mail.id });
    await call("ergebnis_speichern", { id: mail.id, fassung: 1, text: "Mail: [EMAIL_1]" });
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
