// Geldbeträge rechnet der Bot exakt in ganzen Cent (BigInt) und rundet kaufmännisch: halbe Cent weg von null
// (2,135 € → 2,14 €; -2,135 € → -2,14 €). Gleitkommazahlen werden nur ein- und ausgegeben.

/** Exakter Bruch n / d mit d > 0. */
interface Bruch {
  n: bigint;
  d: bigint;
}

/** Zahl als exakter Bruch, aus ihrer kürzesten Dezimaldarstellung ("21.35" → 2135/100). */
function exakt(value: number): Bruch {
  if (!Number.isFinite(value)) throw new RangeError(`Ungültiger Betrag: ${value}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(value.toString());
  if (!m) throw new RangeError(`Ungültiger Betrag: ${value}`);
  const [, sign, int = "0", frac = "", exp = "0"] = m;
  let n = BigInt(int + frac);
  let d = 10n ** BigInt(frac.length);
  const e = Number(exp);
  if (e > 0) n *= 10n ** BigInt(e);
  if (e < 0) d *= 10n ** BigInt(-e);
  return { n: sign === "-" ? -n : n, d };
}

/** Rundet n / d auf eine ganze Zahl, halbe weg von null. */
function runden(n: bigint, d: bigint): bigint {
  const negativ = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  if ((an % ad) * 2n >= ad) q += 1n;
  return negativ ? -q : q;
}

/** Betrag in ganzen Cent. */
export function cent(value: number): bigint {
  const b = exakt(value);
  return runden(b.n * 100n, b.d);
}

/** Cent in Euro (für Anzeige und Speicherung). */
export function euro(cents: bigint): number {
  return Number(cents) / 100;
}

/** Hat der Betrag mehr als zwei Nachkommastellen? */
export function hatBruchteilCent(value: number): boolean {
  const b = exakt(value);
  return (b.n * 100n) % b.d !== 0n;
}

/** Kaufmännisch auf Cent runden. */
export function round2(value: number): number {
  return euro(cent(value));
}

/** Menge × Preis, auf Cent gerundet (Menge darf Nachkommastellen haben, z. B. 2,5 Stunden). */
export function produktCent(menge: number, preis: number): bigint {
  const a = exakt(menge);
  const b = exakt(preis);
  return runden(a.n * b.n * 100n, a.d * b.d);
}

/** Steuer auf einen Nettobetrag: netto × satz / 100, auf Cent gerundet. */
export function steuerCent(nettoCent: bigint, satz: number): bigint {
  const s = exakt(satz);
  return runden(nettoCent * s.n, s.d * 100n);
}

/** Nettobetrag aus einem Bruttobetrag: brutto × 100 / (100 + satz), auf Cent gerundet. */
export function nettoAusBruttoCent(bruttoCent: bigint, satz: number): bigint {
  const s = exakt(satz);
  return runden(bruttoCent * 100n * s.d, 100n * s.d + s.n);
}

const EURO = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const NUMBER = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatEuro(value: number): string {
  return EURO.format(value);
}

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

/** Übliche Umsatzsteuersätze in Österreich (0, 10, 13, 20) und Deutschland (0, 7, 19). */
export const KNOWN_VAT_RATES = [0, 7, 10, 13, 19, 20];
