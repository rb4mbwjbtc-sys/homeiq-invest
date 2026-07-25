import type { AnalysisInput, AnalysisResult, ScoreBreakdown } from "../types";
import { analyseLocation, analyseMarket } from "./market";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function yieldScore(value: number) {
  if (value >= 5) return 100;
  if (value >= 4) return 80 + (value - 4) * 20;
  if (value >= 3.5) return 60 + (value - 3.5) * 40;
  if (value >= 3) return 40 + (value - 3) * 40;
  if (value >= 2) return 20 + (value - 2) * 20;
  return clamp(value * 10);
}

function equityScore(value: number) {
  if (value >= 10) return 100;
  if (value >= 8) return 85 + (value - 8) * 7.5;
  if (value >= 6) return 65 + (value - 6) * 10;
  if (value >= 4) return 45 + (value - 4) * 10;
  if (value >= 2) return 25 + (value - 2) * 10;
  return clamp(value * 12.5);
}

function objectQualityScore(input: AnalysisInput) {
  const conditionBase = {
    sanierungsbeduerftig: 18,
    renovationsbeduerftig: 40,
    gepflegt: 66,
    modernisiert: 86,
    neuwertig: 98,
  }[input.condition];
  const currentYear = new Date().getFullYear();
  const effectiveYear = Math.max(input.renovatedYear || 0, input.yearBuilt || 0);
  const age = effectiveYear ? currentYear - effectiveYear : 35;
  const ageScore = age <= 5 ? 100 : age <= 15 ? 86 : age <= 30 ? 68 : age <= 50 ? 48 : 30;
  const qualityScore = { einfach: 45, durchschnittlich: 65, gehoben: 84, luxus: 96 }[input.quality];
  return Math.round(clamp(conditionBase * 0.55 + ageScore * 0.25 + qualityScore * 0.20));
}

function marketabilityScore(input: AnalysisInput) {
  let score = 38;
  const f = new Set(input.features.map((item) => item.toLowerCase()));
  if ([...f].some((x) => x.includes("balkon") || x.includes("terrasse") || x.includes("garten"))) score += 10;
  if ([...f].some((x) => x.includes("lift"))) score += 7;
  if (input.parkingSpaces > 0) score += Math.min(12, 6 + input.parkingSpaces * 2);
  if ([...f].some((x) => x.includes("keller") || x.includes("reduit"))) score += 5;
  if (input.rooms >= 2.5 && input.rooms <= 4.5) score += 8;
  if (input.livingArea >= 55 && input.livingArea <= 125) score += 7;
  score += clamp((input.location.municipalityDemand - 50) * 0.12, -6, 6);
  score += clamp((50 - input.location.vacancyRisk) * 0.10, -5, 5);
  return Math.round(clamp(score));
}

export function calculateAnalysis(input: AnalysisInput): AnalysisResult {
  const locationAnalysis = analyseLocation(input);
  const marketAnalysis = analyseMarket(input, locationAnalysis);
  const totalInvestment = input.purchasePrice + input.ancillaryCosts;
  const mortgage = Math.max(totalInvestment - input.equity, 0);
  const monthlyRent = input.propertyType === "mfh" && input.rentalUnits.length
    ? input.rentalUnits.reduce((sum, unit) => sum + unit.currentMonthlyRent + (unit.parkingMonthlyRent || 0), 0)
    : input.monthlyRent + (input.parkingMonthlyRent || 0);
  const annualRent = monthlyRent * 12;
  const grossYield = totalInvestment > 0 ? (annualRent / totalInvestment) * 100 : 0;
  const netIncomeBeforeFinancing = annualRent - input.annualOperatingCosts - input.annualMaintenance;
  const netYield = totalInvestment > 0 ? (netIncomeBeforeFinancing / totalInvestment) * 100 : 0;
  const annualInterest = mortgage * input.interestRate / 100;
  const annualAmortization = mortgage * input.amortizationRate / 100;
  const annualCashflow = netIncomeBeforeFinancing - annualInterest - annualAmortization;
  const monthlyCashflow = annualCashflow / 12;
  const equityReturn = input.equity > 0 ? annualCashflow / input.equity * 100 : 0;
  const ltv = totalInvestment > 0 ? mortgage / totalInvestment * 100 : 0;
  const totalArea = input.propertyType === "mfh" && input.rentalUnits.length
    ? input.rentalUnits.reduce((sum, unit) => sum + unit.livingArea, 0)
    : input.livingArea;
  const pricePerSqm = totalArea > 0 ? input.purchasePrice / totalArea : 0;

  const scoreBreakdown: ScoreBreakdown = {
    netYield: Math.round(yieldScore(netYield)),
    equityReturn: Math.round(equityScore(equityReturn)),
    location: locationAnalysis.score,
    objectQuality: objectQualityScore(input),
    marketability: marketabilityScore(input),
  };
  const score = Math.round(
    scoreBreakdown.netYield * 0.35 +
    scoreBreakdown.equityReturn * 0.20 +
    scoreBreakdown.location * 0.25 +
    scoreBreakdown.objectQuality * 0.12 +
    scoreBreakdown.marketability * 0.08
  );

  const rating = score >= 80 ? "Sehr gute Investitionsmöglichkeit" : score >= 65 ? "Gute Investitionsmöglichkeit" : score >= 50 ? "Investment genauer prüfen" : "Kritische Investitionsmöglichkeit";
  const recommendation = score >= 75 && netYield >= 3.4 && marketAnalysis.priceDifferencePercent > -8
    ? "Kauf empfehlenswert"
    : score >= 55 ? "Kauf interessant nach Preisverhandlung" : "Kauf aktuell nicht empfohlen";

  const positives: string[] = [];
  const negatives: string[] = [];
  if (netYield >= 4) positives.push(`Attraktive Nettorendite (${netYield.toFixed(1)} %)`);
  else if (netYield >= 3.3) positives.push(`Solide Nettorendite (${netYield.toFixed(1)} %)`);
  else negatives.push(`Tiefe Nettorendite (${netYield.toFixed(1)} %)`);
  if (equityReturn >= 8) positives.push(`Starke Eigenkapitalrendite (${equityReturn.toFixed(1)} %)`);
  else if (equityReturn < 4) negatives.push(`Schwache Eigenkapitalrendite (${equityReturn.toFixed(1)} %)`);
  if (monthlyCashflow > 500) positives.push("Deutlich positiver monatlicher Cashflow");
  else if (monthlyCashflow < 0) negatives.push("Negativer monatlicher Cashflow");
  if (locationAnalysis.score >= 75) positives.push(locationAnalysis.rating);
  else if (locationAnalysis.score < 50) negatives.push(locationAnalysis.rating);
  if (marketAnalysis.priceDifferencePercent >= 8) positives.push("Kaufpreis unter geschätztem Marktwert");
  else if (marketAnalysis.priceDifferencePercent <= -8) negatives.push("Kaufpreis über geschätztem Marktwert");
  if (marketAnalysis.rentDifferencePercent >= 6) positives.push("Erkennbares Marktmietpotenzial");
  if (ltv > 80) negatives.push("Hohe Belehnung");
  if (scoreBreakdown.objectQuality < 50) negatives.push("Erhöhter Sanierungs- oder Unterhaltsbedarf möglich");
  if (scoreBreakdown.marketability < 50) negatives.push("Eingeschränkte Vermietbarkeit oder Marktnachfrage");

  return { input, totalInvestment, mortgage, annualRent, grossYield, netYield, annualInterest, annualAmortization, annualCashflow, monthlyCashflow, equityReturn, ltv, pricePerSqm, score, scoreBreakdown, rating, recommendation, positives, negatives, locationAnalysis, marketAnalysis };
}
