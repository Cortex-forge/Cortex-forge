import { KNOWN_VAT_RATES, formatEuro, round2 } from "./money.js";

export interface Konto {
  nummer: string;
  name: string;
}

/** Buchungsvorschlag, wie ihn die KI liefert (Texte enthalten nur Platzhalter). */
export interface BuchungKi {
  datum: string;
  belegnummer?: string;
  konto: string;
  gegenkonto: string;
  text: string;
  netto: number;
  ust_satz: number;
  /** Bruttobetrag laut Beleg, zur Gegenprobe. */
  brutto_laut_beleg?: number;
}

export interface BuchungBerechnet extends BuchungKi {
  ust_betrag: number;
  brutto: number;
}

export interface BuchungsSummen {
  netto: number;
  ust: number;
  brutto: number;
}

/**
 * Der Bot rechnet selbst nach, statt der KI zu vertrauen: Steuer und Brutto werden hier
 * berechnet, Abweichungen zum Beleg und unbekannte Konten werden als Hinweis gemeldet.
 */
export function computeBookings(
  rows: BuchungKi[],
  kontenplan: Konto[],
): { buchungen: BuchungBerechnet[]; summen: BuchungsSummen; hinweise: string[] } {
  const hinweise: string[] = [];
  const known = new Set(kontenplan.map((k) => k.nummer));
  const buchungen = rows.map((row, i) => {
    const nr = i + 1;
    const ust_betrag = round2((row.netto * row.ust_satz) / 100);
    const brutto = round2(row.netto + ust_betrag);
    if (!KNOWN_VAT_RATES.includes(row.ust_satz)) {
      hinweise.push(`Buchung ${nr}: ungewöhnlicher Steuersatz ${row.ust_satz} %.`);
    }
    if (known.size > 0) {
      for (const konto of [row.konto, row.gegenkonto]) {
        if (!known.has(konto)) hinweise.push(`Buchung ${nr}: Konto ${konto} steht nicht im Kontenplan.`);
      }
    }
    if (row.brutto_laut_beleg !== undefined && Math.abs(row.brutto_laut_beleg - brutto) > 0.01) {
      hinweise.push(
        `Buchung ${nr}: berechnet ${formatEuro(brutto)} brutto, laut Beleg ${formatEuro(row.brutto_laut_beleg)}.`,
      );
    }
    return { ...row, ust_betrag, brutto };
  });
  const summen = {
    netto: round2(buchungen.reduce((s, b) => s + b.netto, 0)),
    ust: round2(buchungen.reduce((s, b) => s + b.ust_betrag, 0)),
    brutto: round2(buchungen.reduce((s, b) => s + b.brutto, 0)),
  };
  return { buchungen, summen, hinweise };
}

/** CSV für den Import in die Buchhaltung (allgemeines Format; BMD-/RZL-/DATEV-Formate folgen im Pilot). */
export function bookingsToCsv(buchungen: BuchungBerechnet[]): string {
  const header = ["Datum", "Belegnummer", "Konto", "Gegenkonto", "Text", "Netto", "USt-Satz", "USt-Betrag", "Brutto"];
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const num = (v: number) => v.toFixed(2).replace(".", ",");
  const lines = buchungen.map((b) =>
    [b.datum, b.belegnummer ?? "", b.konto, b.gegenkonto, b.text, num(b.netto), String(b.ust_satz), num(b.ust_betrag), num(b.brutto)]
      .map((v) => esc(v))
      .join(";"),
  );
  return [header.join(";"), ...lines].join("\n") + "\n";
}
