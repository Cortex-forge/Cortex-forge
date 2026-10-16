/** Kaufmännisch auf Cent runden. */
export function round2(value: number): number {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
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
