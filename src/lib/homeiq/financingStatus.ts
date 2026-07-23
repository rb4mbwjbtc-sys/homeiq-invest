import { EQUITY_THRESHOLDS } from "./config";
import type { AnalysisInputs } from "./types";

export type FinancingLevel = "insufficient" | "minimum" | "solid" | "very_solid";

export interface FinancingStatus {
  level: FinancingLevel;
  label: string;
  hint: string;
  equityPct: number;
  investment: number;
  equity: number;
  missingEquity: number; // >0 nur bei level = "insufficient"
}

/**
 * Bewertet die Eigenkapitalquote gegen typische Schweizer Bank-Anforderungen für
 * Renditeobjekte (mind. 25 % Eigenkapital). Kein Einfluss auf den HomeIQ-Score —
 * dient ausschliesslich der Finanzierungs-Transparenz.
 */
export function financingStatus(i: AnalysisInputs): FinancingStatus {
  const investment =
    (i.purchasePrice || 0) + (i.purchaseCosts || 0) + (i.renovationCosts || 0);
  const equity = i.equity || 0;
  const equityPct = investment > 0 ? (equity / investment) * 100 : 0;
  const minRequired = (EQUITY_THRESHOLDS.minimum / 100) * investment;
  const missingEquity = Math.max(0, Math.round(minRequired - equity));

  if (equityPct < EQUITY_THRESHOLDS.minimum) {
    return {
      level: "insufficient",
      label: "Eigenkapital voraussichtlich nicht ausreichend",
      hint: `Für Renditeobjekte verlangen Schweizer Banken in der Regel mindestens ${EQUITY_THRESHOLDS.minimum} % Eigenkapital. Für die eingegebene Investitionssumme fehlen noch CHF ${missingEquity.toLocaleString("de-CH")} Eigenmittel.`,
      equityPct,
      investment,
      equity,
      missingEquity,
    };
  }
  if (equityPct < EQUITY_THRESHOLDS.solid) {
    return {
      level: "minimum",
      label: "Bankübliche Mindestfinanzierung",
      hint: "Die Eigenkapitalquote erfüllt grundsätzlich die übliche Mindestanforderung für Renditeobjekte. Die definitive Finanzierung hängt jedoch von Belehnungswert, Ertrag, Tragbarkeit und Bankprüfung ab.",
      equityPct,
      investment,
      equity,
      missingEquity: 0,
    };
  }
  if (equityPct < EQUITY_THRESHOLDS.verySolid) {
    return {
      level: "solid",
      label: "Solide Eigenkapitalbasis",
      hint: "Die Eigenkapitalquote liegt über der üblichen Mindestanforderung und verbessert grundsätzlich die Finanzierungssituation.",
      equityPct,
      investment,
      equity,
      missingEquity: 0,
    };
  }
  return {
    level: "very_solid",
    label: "Sehr solide Eigenkapitalbasis",
    hint: "Die hohe Eigenkapitalquote reduziert die Belehnung und die laufende Zinsbelastung deutlich.",
    equityPct,
    investment,
    equity,
    missingEquity: 0,
  };
}
