import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PROJECT_ROOT } from "../config.js";

// Review Claude 2 #22: Unsichtbare Zeichen im Quelltext sehen beim Lesen wie nichts aus. Solche Zeichen gehören als
// Escape in den Code (z. B. "\uE000" für die Teilgrenze).
test("Quelltext enthält keine unsichtbaren Zeichen", () => {
  const unsichtbar = /[\p{Cf}\p{Co}\p{Zl}\p{Zp}\u0000-\u0008\u000B-\u001F\u007F\u00A0\u2000-\u200A\u202F\u205F\u3000]/u;
  const funde: string[] = [];
  for (const dir of ["src", "public", "scripts"]) {
    for (const entry of fs.readdirSync(path.join(PROJECT_ROOT, dir), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(ts|js|mjs|css|html)$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (unsichtbar.test(line)) funde.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}`);
        });
    }
  }
  assert.deepEqual(funde, []);
});

// Review Claude 3 #22: Wortlisten ohne doppelte Einträge (doppelte Einträge verdecken, welche Liste was regelt)
test("Wortlisten der Erkennung enthalten keine doppelten Einträge", () => {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, "src", "core", "names.ts"), "utf8");
  const lists = [...source.matchAll(/(?:words\(|_RAW = )`([^`]*)`/g)].map((m) => (m[1] ?? "").split(/\s+/).filter(Boolean));
  assert.ok(lists.length >= 10, "Wortlisten gefunden");
  for (const list of lists) {
    const doppelt = list.filter((w, i) => list.indexOf(w) !== i);
    assert.deepEqual(doppelt, [], `doppelt: ${doppelt.join(" ")}`);
  }
});
