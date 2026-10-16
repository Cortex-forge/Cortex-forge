import { KNOWN_VAT_RATES, formatEuro, formatNumber, round2 } from "./money.js";

export interface RechnungsPosition {
  beschreibung: string;
  menge: number;
  einheit?: string;
  einzelpreis: number;
  /** true, wenn der Einzelpreis die Umsatzsteuer schon enthält (üblich bei Privatgästen). */
  preis_ist_brutto?: boolean;
  ust_satz: number;
}

/** Rechnungsinhalt. Von der KI mit Platzhaltern geliefert, nach der Rückübersetzung mit echten Daten. */
export interface RechnungInhalt {
  empfaenger: string;
  empfaenger_adresse?: string;
  empfaenger_uid?: string;
  leistungszeitraum?: string;
  positionen: RechnungsPosition[];
  zahlungshinweis?: string;
  anmerkung?: string;
}

export interface EigeneFirma {
  name: string;
  adresse: string;
  uid: string;
  firmenbuch?: string;
  iban?: string;
  bic?: string;
  telefon?: string;
  email?: string;
}

export interface PositionBerechnet extends RechnungsPosition {
  netto: number;
  ust: number;
  brutto: number;
}

export interface RechnungsSummen {
  positionen: PositionBerechnet[];
  steuern: Array<{ satz: number; netto: number; ust: number; brutto: number }>;
  netto: number;
  ust: number;
  brutto: number;
  /** "brutto", wenn alle Preise die USt schon enthalten (übliche Rechnung an Privatgäste). */
  modus: "brutto" | "netto";
}

const sum = (values: number[]) => round2(values.reduce((s, v) => s + v, 0));

export function computeInvoice(positionen: RechnungsPosition[]): RechnungsSummen {
  const lines = positionen.map((p) => {
    const betrag = round2(p.menge * p.einzelpreis);
    if (p.preis_ist_brutto) {
      const netto = round2(betrag / (1 + p.ust_satz / 100));
      return { ...p, netto, ust: round2(betrag - netto), brutto: betrag };
    }
    const ust = round2((betrag * p.ust_satz) / 100);
    return { ...p, netto: betrag, ust, brutto: round2(betrag + ust) };
  });
  const rates = [...new Set(lines.map((l) => l.ust_satz))].sort((a, b) => a - b);
  // Steuer je Steuersatz aus der Summe rechnen, nicht je Zeile: so entstehen keine Cent-Differenzen.
  const steuern = rates.map((satz) => {
    const group = lines.filter((l) => l.ust_satz === satz);
    if (group.every((l) => l.preis_ist_brutto)) {
      const brutto = sum(group.map((l) => l.brutto));
      const netto = round2(brutto / (1 + satz / 100));
      return { satz, netto, ust: round2(brutto - netto), brutto };
    }
    if (group.every((l) => !l.preis_ist_brutto)) {
      const netto = sum(group.map((l) => l.netto));
      const ust = round2((netto * satz) / 100);
      return { satz, netto, ust, brutto: round2(netto + ust) };
    }
    return {
      satz,
      netto: sum(group.map((l) => l.netto)),
      ust: sum(group.map((l) => l.ust)),
      brutto: sum(group.map((l) => l.brutto)),
    };
  });
  return {
    positionen: lines,
    steuern,
    netto: sum(steuern.map((s) => s.netto)),
    ust: sum(steuern.map((s) => s.ust)),
    brutto: sum(steuern.map((s) => s.brutto)),
    modus: lines.length > 0 && lines.every((l) => l.preis_ist_brutto) ? "brutto" : "netto",
  };
}

/** Hinweise zu Pflichtangaben, die der Bot prüfen kann. Ersetzt keine Prüfung durch die Steuerberatung. */
export function invoiceChecks(inhalt: RechnungInhalt, summen: RechnungsSummen, firma: EigeneFirma): string[] {
  const hinweise: string[] = [];
  if (!inhalt.empfaenger.trim()) hinweise.push("Empfänger fehlt.");
  if (!inhalt.empfaenger_adresse?.trim()) hinweise.push("Anschrift des Empfängers fehlt.");
  if (!inhalt.leistungszeitraum?.trim()) hinweise.push("Leistungsdatum bzw. -zeitraum fehlt.");
  if (inhalt.positionen.length === 0) hinweise.push("Die Rechnung hat keine Positionen.");
  if (!firma.uid.trim()) hinweise.push("Eigene UID-Nummer fehlt in config/firma.json.");
  if (summen.brutto > 10000 && !inhalt.empfaenger_uid?.trim()) {
    hinweise.push("Über 10.000 € brutto: UID-Nummer des Empfängers angeben (bei Unternehmern).");
  }
  const grossLines = inhalt.positionen.filter((p) => p.preis_ist_brutto).length;
  if (grossLines > 0 && grossLines < inhalt.positionen.length) {
    hinweise.push("Die Positionen mischen Brutto- und Nettopreise. Bitte einheitlich angeben.");
  }
  inhalt.positionen.forEach((p, i) => {
    if (!KNOWN_VAT_RATES.includes(p.ust_satz)) hinweise.push(`Position ${i + 1}: ungewöhnlicher Steuersatz ${p.ust_satz} %.`);
    if (p.menge <= 0) hinweise.push(`Position ${i + 1}: Menge ist nicht positiv.`);
  });
  return hinweise;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function multiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

export function renderInvoiceHtml(options: {
  inhalt: RechnungInhalt;
  summen: RechnungsSummen;
  firma: EigeneFirma;
  nummer?: string;
  datum: string;
}): string {
  const { inhalt, summen, firma, nummer, datum } = options;
  const brutto = summen.modus === "brutto";
  const rows = summen.positionen
    .map(
      (p, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.beschreibung)}</td>
        <td class="r">${formatNumber(p.menge).replace(/,00$/, "")}${p.einheit ? " " + escapeHtml(p.einheit) : ""}</td>
        <td class="r">${formatEuro(p.einzelpreis)}</td>
        <td class="r">${p.ust_satz} %</td>
        <td class="r">${formatEuro(brutto ? p.brutto : p.netto)}</td>
      </tr>`,
    )
    .join("");
  const summary = brutto
    ? `<tr class="total"><td colspan="5" class="r">Gesamtbetrag</td><td class="r">${formatEuro(summen.brutto)}</td></tr>
       ${summen.steuern
         .map(
           (s) =>
             `<tr class="incl"><td colspan="5" class="r">darin USt ${s.satz} % (netto ${formatEuro(s.netto)})</td><td class="r">${formatEuro(s.ust)}</td></tr>`,
         )
         .join("")}
       <tr class="incl"><td colspan="5" class="r">Summe netto</td><td class="r">${formatEuro(summen.netto)}</td></tr>`
    : `<tr><td colspan="5" class="r">Summe netto</td><td class="r">${formatEuro(summen.netto)}</td></tr>
       ${summen.steuern
         .map((s) => `<tr><td colspan="5" class="r">USt ${s.satz} % auf ${formatEuro(s.netto)}</td><td class="r">${formatEuro(s.ust)}</td></tr>`)
         .join("")}
       <tr class="total"><td colspan="5" class="r">Gesamtbetrag</td><td class="r">${formatEuro(summen.brutto)}</td></tr>`;
  const bank = [firma.iban ? `IBAN ${escapeHtml(firma.iban)}` : "", firma.bic ? `BIC ${escapeHtml(firma.bic)}` : ""]
    .filter(Boolean)
    .join(" · ");
  const contact = [firma.telefon, firma.email].filter(Boolean).map((v) => escapeHtml(v ?? "")).join(" · ");

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Rechnung ${escapeHtml(nummer ?? "Entwurf")}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2433;margin:0;padding:40px;font-size:14px;line-height:1.45;background:#fff}
  .head{display:flex;justify-content:space-between;gap:24px;margin-bottom:36px}
  .from{font-size:12px;color:#5b6577}
  h1{font-size:22px;margin:0 0 4px}
  .meta td{padding:2px 12px 2px 0}
  table.items{width:100%;border-collapse:collapse;margin-top:24px}
  table.items th{text-align:left;border-bottom:2px solid #1d2433;padding:6px 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  table.items td{border-bottom:1px solid #e3e6ec;padding:6px 4px;vertical-align:top}
  .r{text-align:right;white-space:nowrap}
  tr.total td{font-weight:700;border-top:2px solid #1d2433;border-bottom:none}
  tr.incl td{color:#5b6577;font-size:13px;border-bottom:none;padding-top:2px;padding-bottom:2px}
  .draft{display:inline-block;background:#fff4d6;color:#7a5200;border:1px solid #f0d58a;border-radius:6px;padding:2px 8px;font-size:12px}
  .foot{margin-top:36px;font-size:12px;color:#5b6577;border-top:1px solid #e3e6ec;padding-top:12px}
</style></head><body>
<div class="head">
  <div>
    <div class="from">${escapeHtml(firma.name)} · ${escapeHtml(firma.adresse)}</div>
    <p><strong>${multiline(inhalt.empfaenger)}</strong><br>${multiline(inhalt.empfaenger_adresse ?? "")}${
      inhalt.empfaenger_uid ? `<br>UID: ${escapeHtml(inhalt.empfaenger_uid)}` : ""
    }</p>
  </div>
  <div>
    <h1>Rechnung</h1>
    <table class="meta">
      <tr><td>Nummer</td><td>${nummer ? escapeHtml(nummer) : '<span class="draft">Entwurf – Nummer bei Freigabe</span>'}</td></tr>
      <tr><td>Datum</td><td>${escapeHtml(datum)}</td></tr>
      <tr><td>Leistung</td><td>${escapeHtml(inhalt.leistungszeitraum ?? "")}</td></tr>
      <tr><td>UID</td><td>${escapeHtml(firma.uid)}</td></tr>
    </table>
  </div>
</div>
<table class="items">
  <thead><tr><th>#</th><th>Beschreibung</th><th class="r">Menge</th><th class="r">Einzelpreis${brutto ? " (brutto)" : " (netto)"}</th><th class="r">USt</th><th class="r">Betrag${brutto ? " (brutto)" : " (netto)"}</th></tr></thead>
  <tbody>${rows}
    ${summary}
  </tbody>
</table>
${inhalt.zahlungshinweis ? `<p>${multiline(inhalt.zahlungshinweis)}</p>` : ""}
${inhalt.anmerkung ? `<p>${multiline(inhalt.anmerkung)}</p>` : ""}
<div class="foot">${escapeHtml(firma.name)} · ${escapeHtml(firma.adresse)}${firma.firmenbuch ? " · " + escapeHtml(firma.firmenbuch) : ""}<br>${bank}${
    contact ? "<br>" + contact : ""
  }</div>
</body></html>`;
}
