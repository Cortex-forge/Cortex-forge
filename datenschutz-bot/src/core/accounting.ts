import { KNOWN_VAT_RATES, cent, euro, formatEuro, hatBruchteilCent, steuerCent } from "./money.js";

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
 * Der Bot rechnet selbst nach, statt der KI zu vertrauen: Steuer und Brutto werden hier in ganzen Cent berechnet,
 * Abweichungen zum Beleg (ab 1 Cent) und unbekannte Konten werden als Hinweis gemeldet.
 */
export function computeBookings(
  rows: BuchungKi[],
  kontenplan: Konto[],
): { buchungen: BuchungBerechnet[]; summen: BuchungsSummen; hinweise: string[] } {
  const hinweise: string[] = [];
  const known = new Set(kontenplan.map((k) => k.nummer));
  let summeNetto = 0n;
  let summeUst = 0n;
  let summeBrutto = 0n;
  const buchungen = rows.map((row, i) => {
    const nr = i + 1;
    if (hatBruchteilCent(row.netto)) hinweise.push(`Buchung ${nr}: Nettobetrag ${row.netto} auf Cent gerundet.`);
    const nettoC = cent(row.netto);
    const ustC = steuerCent(nettoC, row.ust_satz);
    const bruttoC = nettoC + ustC;
    summeNetto += nettoC;
    summeUst += ustC;
    summeBrutto += bruttoC;
    if (!KNOWN_VAT_RATES.includes(row.ust_satz)) {
      hinweise.push(`Buchung ${nr}: ungewöhnlicher Steuersatz ${row.ust_satz} %.`);
    }
    if (known.size > 0) {
      for (const konto of [row.konto, row.gegenkonto]) {
        if (!known.has(konto)) hinweise.push(`Buchung ${nr}: Konto ${konto} steht nicht im Kontenplan.`);
      }
    }
    if (row.brutto_laut_beleg !== undefined && cent(row.brutto_laut_beleg) !== bruttoC) {
      hinweise.push(
        `Buchung ${nr}: berechnet ${formatEuro(euro(bruttoC))} brutto, laut Beleg ${formatEuro(row.brutto_laut_beleg)}.`,
      );
    }
    return { ...row, netto: euro(nettoC), ust_betrag: euro(ustC), brutto: euro(bruttoC) };
  });
  const summen = { netto: euro(summeNetto), ust: euro(summeUst), brutto: euro(summeBrutto) };
  return { buchungen, summen, hinweise };
}

/**
 * Zelleninhalt, den Tabellenprogramme als Formel lesen könnten ("=HYPERLINK(…)", "+1", "@SUM"), wird mit einem
 * Apostroph entschärft. Gilt nur für Textspalten; Beträge formatiert der Bot selbst.
 */
export function csvTextCell(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
}

/** CSV für den Import in die Buchhaltung (allgemeines Format; BMD-/RZL-/DATEV-Formate folgen im Pilot). */
export function bookingsToCsv(buchungen: BuchungBerechnet[]): string {
  const header = ["Datum", "Belegnummer", "Konto", "Gegenkonto", "Text", "Netto", "USt-Satz", "USt-Betrag", "Brutto"];
  const quote = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const num = (v: number) => v.toFixed(2).replace(".", ",");
  const lines = buchungen.map((b) =>
    [
      csvTextCell(b.datum),
      csvTextCell(b.belegnummer ?? ""),
      csvTextCell(b.konto),
      csvTextCell(b.gegenkonto),
      csvTextCell(b.text),
      num(b.netto),
      String(b.ust_satz),
      num(b.ust_betrag),
      num(b.brutto),
    ]
      .map(quote)
      .join(";"),
  );
  return [header.join(";"), ...lines].join("\n") + "\n";
}
