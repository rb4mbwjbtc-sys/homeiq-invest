import type { AnalysisInputs } from "./types";
import { DEFAULT_VACANCY_ASSUMPTION_PCT, vacancyTier } from "./config";

export interface CoreMetrics {
  grossAnnualRent: number;
  effectiveRent: number;
  grossYield: number;
  investment: number;
  operatingCosts: number;
  netIncomeBeforeFinancing: number;
  netYield: number;
  mortgage: number;
  interestCost: number;
  annualCashflow: number;
  monthlyCashflow: number;
  equityReturn: number;
  pricePerSqm: number;
  ltv: number;
  vacancyAssumptionPct: number;
}

const n = (v: number | undefined | null) => (typeof v === "number" && !isNaN(v) ? v : 0);

/** Berechnet die Hypothek automatisch, wenn nicht angegeben. */
export function computeMortgage(i: AnalysisInputs): number {
  if (typeof i.mortgage === "number" && i.mortgage > 0) return i.mortgage;
  const auto =
    n(i.purchasePrice) + n(i.purchaseCosts) + n(i.renovationCosts) - n(i.equity);
  return Math.max(0, auto);
}

/** Leitet die Leerstandsannahme automatisch aus den Lagedaten ab. */
export function computeVacancyAssumption(i: AnalysisInputs): number {
  const loc = i.location;
  if (loc && typeof loc.vacancyPct === "number") {
    return vacancyTier(loc.vacancyPct).assumptionPct;
  }
  return DEFAULT_VACANCY_ASSUMPTION_PCT;
}

export function computeMetrics(i: AnalysisInputs): CoreMetrics {
  // Bei MFH: monatliche Nettomiete ergibt sich aus den Einzeleinheiten (nur belegte),
  // NICHT aus i.monthlyRent — verhindert Doppelzählung.
  const isMfh = i.objectType === "mfh";
  const unitsRent =
    isMfh && Array.isArray(i.mfhUnits)
      ? i.mfhUnits.reduce(
          (sum, u) => (u.vacant ? sum : sum + (n(u.monthlyRent))),
          0,
        )
      : 0;
  const baseRent = isMfh ? unitsRent : n(i.monthlyRent);

  // Parkplatz-Einnahmen: für ALLE Objekttypen zentral aus Anzahl (Ausstattung)
  // × Miete pro Einheit (Einnahmen-Schritt) berechnet.
  const f = i.features;
  const parkingMonthly =
    (f.garage + f.doubleGarage) * n(i.garageRentPerUnit) +
    f.undergroundParking * n(i.undergroundRentPerUnit) +
    f.outdoorParking * n(i.outdoorRentPerUnit) +
    f.carport * n(i.carportRentPerUnit);

  // Gewerbemieten bei MFH: Summe der Nettomieten belegter Gewerbeeinheiten
  const commercialMonthly =
    isMfh && Array.isArray(i.mfhCommercialUnits)
      ? i.mfhCommercialUnits.reduce(
          (sum, u) => (u.vacant ? sum : sum + n(u.monthlyRent)),
          0,
        )
      : 0;

  const monthlyGross =
    baseRent +
    parkingMonthly +
    (isMfh
      ? commercialMonthly + n(i.storageRent) + n(i.otherIncome)
      : n(i.otherIncome));
  const grossAnnualRent = monthlyGross * 12;


  const vacancyAssumptionPct = computeVacancyAssumption(i);
  const vacancy = Math.max(0, Math.min(100, vacancyAssumptionPct)) / 100;
  const effectiveRent = grossAnnualRent * (1 - vacancy);

  const purchasePrice = n(i.purchasePrice);
  const grossYield = purchasePrice > 0 ? (grossAnnualRent / purchasePrice) * 100 : 0;

  const investment = purchasePrice + n(i.purchaseCosts) + n(i.renovationCosts);

  const operatingCosts = n(i.maintenance) + n(i.management) + n(i.renewalFund);
  const netIncomeBeforeFinancing = effectiveRent - operatingCosts;
  const netYield = investment > 0 ? (netIncomeBeforeFinancing / investment) * 100 : 0;

  const mortgage = computeMortgage(i);
  const interestCost = mortgage * (n(i.interestRate) / 100);

  const annualCashflow =
    effectiveRent - operatingCosts - interestCost - n(i.amortization);
  const monthlyCashflow = annualCashflow / 12;

  const equity = n(i.equity);
  const equityReturn = equity > 0 ? (annualCashflow / equity) * 100 : 0;

  const livingArea = n(i.livingArea);
  const pricePerSqm = livingArea > 0 ? purchasePrice / livingArea : 0;

  const ltv = investment > 0 ? (mortgage / investment) * 100 : 0;

  return {
    grossAnnualRent,
    effectiveRent,
    grossYield,
    investment,
    operatingCosts,
    netIncomeBeforeFinancing,
    netYield,
    mortgage,
    interestCost,
    annualCashflow,
    monthlyCashflow,
    equityReturn,
    pricePerSqm,
    ltv,
    vacancyAssumptionPct,
  };
}
