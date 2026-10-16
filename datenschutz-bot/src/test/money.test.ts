import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBookings } from "../core/accounting.js";
import { computeInvoice, renderInvoiceHtml } from "../core/invoice.js";

const kontenplan = [
  { nummer: "7200", name: "Instandhaltung" },
  { nummer: "3300", name: "Lieferverbindlichkeiten" },
];

test("Buchungen: Bot rechnet USt und Brutto selbst", () => {
  const r = computeBookings(
    [{ datum: "30.09.2026", konto: "7200", gegenkonto: "3300", text: "Wartung", netto: 687, ust_satz: 20, brutto_laut_beleg: 824.4 }],
    kontenplan,
  );
  assert.equal(r.buchungen[0]?.ust_betrag, 137.4);
  assert.equal(r.buchungen[0]?.brutto, 824.4);
  assert.deepEqual(r.summen, { netto: 687, ust: 137.4, brutto: 824.4 });
  assert.deepEqual(r.hinweise, []);
});

test("Buchungen: Abweichung zum Beleg und unbekanntes Konto werden gemeldet", () => {
  const r = computeBookings(
    [{ datum: "01.10.2026", konto: "9999", gegenkonto: "3300", text: "x", netto: 100, ust_satz: 20, brutto_laut_beleg: 125 }],
    kontenplan,
  );
  assert.equal(r.hinweise.length, 2);
  assert.match(r.hinweise.join(" "), /9999/);
  assert.match(r.hinweise.join(" "), /laut Beleg/);
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
