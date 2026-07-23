// Zentrale, ohne Codeänderung anpassbare Konfiguration für Score-Logik.
import type { Category, VacancyRisk } from "./types";

// HomeIQ-Score-Gewichte (Summe = 1.0). Finanzierung ist NICHT Teil des Scores.
export const SCORE_WEIGHTS = {
  yield: 0.35,
  equityReturn: 0.2,
  location: 0.25,
  condition: 0.12,
  features: 0.08,
} as const;

// Eigenkapital-Rendite-Schwellen (%)
export const EQUITY_RETURN_THRESHOLDS: { min: number; score: number }[] = [
  { min: 10, score: 100 },
  { min: 7, score: 85 },
  { min: 4, score: 65 },
  { min: 1, score: 45 },
  { min: -Infinity, score: 20 },
];

// Gewichte innerhalb des Lagescores (Summe = 1.0)
export const LOCATION_WEIGHTS = {
  vacancy: 0.25,
  transport: 0.2,
  shopping: 0.1,
  schools: 0.1,
  population: 0.1,
  priceTrend: 0.1,
  tax: 0.1,
  noise: 0.05,
} as const;

// Netto-Rendite-Schwellen (%)
export const YIELD_THRESHOLDS: { min: number; score: number }[] = [
  { min: 5, score: 100 },
  { min: 4, score: 80 },
  { min: 3, score: 60 },
  { min: 2, score: 40 },
  { min: -Infinity, score: 20 },
];

// Cashflow-Schwellen (CHF / Monat)
export const CASHFLOW_THRESHOLDS: { min: number; score: number }[] = [
  { min: 500, score: 100 },
  { min: 100, score: 80 },
  { min: -100, score: 55 },
  { min: -500, score: 30 },
  { min: -Infinity, score: 10 },
];

// LTV-Schwellen (%) — je tiefer, desto besser
export const LTV_THRESHOLDS: { max: number; score: number }[] = [
  { max: 60, score: 100 },
  { max: 70, score: 85 },
  { max: 80, score: 65 },
  { max: 90, score: 45 },
  { max: Infinity, score: 20 },
];

// Zustand nach effektivem Alter
export const CONDITION_THRESHOLDS: { max: number; score: number }[] = [
  { max: 10, score: 100 },
  { max: 25, score: 80 },
  { max: 40, score: 60 },
  { max: 60, score: 40 },
  { max: Infinity, score: 20 },
];

// Leerstands-Risiko-Klassen (Basis: Wohnungs-Leerstandsziffer CH gemäss BFS)
export const VACANCY_TIERS: {
  max: number;
  risk: VacancyRisk;
  score: number;
  assumptionPct: number;
  label: string;
}[] = [
  { max: 0.5, risk: "sehr_tief", score: 100, assumptionPct: 2, label: "Sehr tief" },
  { max: 1.0, risk: "tief", score: 85, assumptionPct: 3, label: "Tief" },
  { max: 1.75, risk: "durchschnittlich", score: 65, assumptionPct: 5, label: "Durchschnittlich" },
  { max: 3.0, risk: "erhöht", score: 40, assumptionPct: 8, label: "Erhöht" },
  { max: Infinity, risk: "hoch", score: 20, assumptionPct: 12, label: "Hoch" },
];

export function vacancyTier(pct: number) {
  for (const t of VACANCY_TIERS) if (pct <= t.max) return t;
  return VACANCY_TIERS[VACANCY_TIERS.length - 1];
}

// Standard-Leerstandsannahme wenn Lagedaten fehlen (%)
export const DEFAULT_VACANCY_ASSUMPTION_PCT = 5;

export const CATEGORY_THRESHOLDS: { min: number; category: Category; label: string }[] = [
  { min: 80, category: "attraktiv", label: "Attraktives Investment" },
  { min: 65, category: "solide", label: "Solides Investment" },
  { min: 50, category: "neutral", label: "Neutral — genauer prüfen" },
  { min: 35, category: "kritisch", label: "Kritisches Investment" },
  { min: 0, category: "unattraktiv", label: "Unattraktives Investment" },
];

export function pickScore<T extends { min?: number; max?: number; score: number }>(
  thresholds: T[],
  value: number,
): number {
  for (const t of thresholds) {
    if (t.min !== undefined && value >= t.min) return t.score;
    if (t.max !== undefined && value <= t.max) return t.score;
  }
  return thresholds[thresholds.length - 1].score;
}

// Nutzungslimits
export const FREE_ANALYSIS_LIMIT = 3;
export const PREMIUM_PRICE_CHF = 9.9;

// Eigenkapitalquote-Schwellen (%) für Finanzierungs-Bewertung (kein Score-Einfluss).
export const EQUITY_THRESHOLDS = {
  minimum: 25,
  solid: 30,
  verySolid: 40,
} as const;

// Ausstattungs-Punkte für eigene Waschmaschine/Tumbler nach Objekttyp.
// In der Wohnung meistens Gemeinschaftsanlage → eigene Geräte höher gewichtet.
// Beim EFH/RH/DH normalerweise Standard → geringere Zusatzpunkte.
export const WASHING_POINTS: Record<
  "apartment" | "house" | "mfh",
  { washingMachine: number; tumbler: number; bothBonus: number }
> = {
  apartment: { washingMachine: 8, tumbler: 6, bothBonus: 3 },
  house: { washingMachine: 3, tumbler: 2, bothBonus: 1 },
  mfh: { washingMachine: 2, tumbler: 2, bothBonus: 1 },
};

// Regionale Referenzpreise (CHF / m²) für Wohneigentum (grobe Marktdurchschnitte 2024).
// Wird verwendet, wenn keine feineren Daten in gemeinde_data vorhanden sind.
export const CANTON_PRICE_PER_SQM: Record<string, number> = {
  ZH: 12500, GE: 14000, ZG: 15000, BS: 11000, VD: 11000, LU: 9500, BE: 8000,
  AG: 8500, SZ: 12000, TG: 7500, SG: 7500, VS: 7500, TI: 8000, NE: 6500,
  JU: 5500, FR: 8000, GR: 9500, AR: 7000, AI: 7000, GL: 6500, SH: 7000,
  SO: 7500, UR: 7000, NW: 11000, OW: 9000, BL: 9500,
};
export const DEFAULT_PRICE_PER_SQM = 8500;

// Lärm-Schwellen (Meter zur Lärmquelle: >= = Score)
export const NOISE_HIGHWAY_THRESHOLDS: { min: number; score: number }[] = [
  { min: 500, score: 100 },
  { min: 250, score: 80 },
  { min: 120, score: 55 },
  { min: 50, score: 30 },
  { min: -Infinity, score: 15 },
];
export const NOISE_RAILWAY_THRESHOLDS: { min: number; score: number }[] = [
  { min: 400, score: 100 },
  { min: 200, score: 80 },
  { min: 100, score: 55 },
  { min: 40, score: 30 },
  { min: -Infinity, score: 15 },
];

// Preis-/Markt-Bewertung: Verhältnis Objekt zu Referenz (Objekt/Referenz)
export const PRICE_RATIO_THRESHOLDS: { max: number; score: number; label: string }[] = [
  { max: 0.85, score: 100, label: "deutlich unter Marktdurchschnitt" },
  { max: 0.95, score: 85, label: "unter Marktdurchschnitt" },
  { max: 1.05, score: 70, label: "marktgerecht" },
  { max: 1.15, score: 50, label: "leicht über Marktdurchschnitt" },
  { max: 1.3, score: 30, label: "deutlich über Marktdurchschnitt" },
  { max: Infinity, score: 15, label: "stark überteuert" },
];
