#!/usr/bin/env node
// Nachweis für einen Merge (Gesetzbuch G12): führt Build, Typprüfung, Tests, beide Datenschutz-Proben
// (Demo und Lösungsblatt) und die Messung aus und schreibt die echten Ausgaben nach docs/05-nachweise/.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cmd, args, env = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(), sekunden: ((Date.now() - started) / 1000).toFixed(1) };
}

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "dsb-nachweis-"));
const steps = [];
steps.push({ name: "Build", ...run(npm, ["run", "build", "--silent"]) });
steps.push({ name: "Typprüfung", ...run(npm, ["run", "typecheck", "--silent"]) });
const tests = run(process.execPath, ["--test", "dist/test/*.test.js"]);
const testLines = tests.out.split("\n").filter((l) => /^(ok|not ok) \d+|^# (tests|pass|fail|cancelled|skipped)/.test(l));
// Ein übersprungener Test (z. B. Browser-Test ohne Chromium) ist kein Nachweis: dann nicht bestanden.
const skipped = Number(/^# skipped (\d+)/m.exec(tests.out)?.[1] ?? 0);
if (skipped > 0) testLines.push(`Nicht bestanden: ${skipped} Test(s) übersprungen.`);
steps.push({ name: "Tests", ...tests, ok: tests.ok && skipped === 0, out: tests.ok ? testLines.join("\n") : tests.out });
steps.push({ name: "Datenschutz-Probe (Demo, Lösungsblatt der Beispiele)", ...run(process.execPath, ["dist/scripts/demo.js", "--leise"], { DSB_DATA_DIR: tmpData }) });
fs.rmSync(tmpData, { recursive: true, force: true });
steps.push({ name: "Datenschutz-Probe (Lösungsblatt: Beispiele und Testset über den MCP-Server)", ...run(process.execPath, ["dist/scripts/probe.js"]) });
// Alle Messungen mit Zielen: Ein verfehltes Ziel lässt den Nachweis scheitern. Das blinde Prüfset ist Pflicht, denn
// gute Werte an den Sets, an denen entwickelt wird, sagen wenig über neue Dokumente.
const messung = (name, args) => {
  const r = run(process.execPath, ["dist/scripts/messung.js", "--streng", ...args]);
  return { name, ...r, out: r.out.split("\n").filter((l) => !l.startsWith("Bericht:")).join("\n") };
};
steps.push(messung("Messung Entwicklungsset", []));
steps.push(messung("Messung Prüfset 1 (blind erstellt, seit 2026-10-16 zum Entwickeln freigegeben)", ["--datei", "testset/pruefset.json"]));
steps.push(messung("Messung Vorlagen-Testset (feste Dokumente, ADR-007)", ["--datei", "testset/vorlagen.json"]));
if (fs.existsSync(path.join(root, "testset", "pruefset-2.json"))) {
  steps.push(messung("Messung Prüfset 2 (blind erstellt, nicht zum Entwickeln benutzt)", ["--datei", "testset/pruefset-2.json", "--nur-zahlen"]));
} else {
  steps.push({ name: "Messung Prüfset 2", ok: false, out: "Das blinde Prüfset testset/pruefset-2.json fehlt.", sekunden: "0.0" });
}

const allOk = steps.every((s) => s.ok);
const sha = git("rev-parse --short HEAD") || "ohne-git";
const branch = git("rev-parse --abbrev-ref HEAD") || "unbekannt";
const dirty = git("status --porcelain -- .") !== "";
const date = new Date().toISOString().slice(0, 10);

const md = [
  `# Nachweis ${date} · ${sha}`,
  "",
  "| | |",
  "|---|---|",
  `| Branch | \`${branch}\` |`,
  `| Commit | \`${sha}\`${dirty ? " plus nicht committete Änderungen" : ""} |`,
  `| Node | ${process.version} |`,
  `| Ergebnis | ${allOk ? "**bestanden**" : "**NICHT bestanden**"} |`,
  "",
  ...steps.flatMap((s) => [
    `## ${s.name}: ${s.ok ? "bestanden" : "FEHLGESCHLAGEN"} (${s.sekunden} s)`,
    "",
    "```text",
    s.out || "(keine Ausgabe)",
    "```",
    "",
  ]),
].join("\n");

const dir = path.join(root, "docs", "05-nachweise");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${date}-${sha}.md`);
fs.writeFileSync(file, md + "\n");
console.log(`${allOk ? "Bestanden" : "NICHT bestanden"}: ${path.relative(root, file)}`);
process.exit(allOk ? 0 : 1);
