// npm run probe: Datenschutz-Probe mit Lösungsblatt über Beispiele und Testset, durch den echten MCP-Server.
// Beendet sich mit Code 1, wenn eine Angabe aus dem Lösungsblatt bei der KI oder unverschlüsselt auf der Platte landet.
import { loadExamples, loadTestset, runProbe } from "./probe-lib.js";

const faelle = [...loadExamples(), ...loadTestset()];
const werte = faelle.reduce((n, f) => n + f.sensibel.length, 0);
const { antworten, lecks } = await runProbe(faelle);

console.log(
  `Datenschutz-Probe: ${faelle.length} Dokumente, ${werte} Angaben laut Lösungsblatt, ${antworten} MCP-Antworten und alle Dateien geprüft.`,
);
if (lecks.length === 0) {
  console.log("Ergebnis: keine Angabe aus dem Lösungsblatt bei der KI oder im Klartext auf der Platte.");
} else {
  console.log(`Ergebnis: ${lecks.length} Lecks`);
  for (const l of lecks) console.log(`- ${l.fall} · ${l.typ} · „${l.wert}“ · ${l.wo}`);
  process.exitCode = 1;
}
