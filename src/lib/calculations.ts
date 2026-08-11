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
  // V5.7.2: Objektqualität beantwortet ausschliesslich die Frage
  // "Wie gut ist das konkrete Objekt selbst?". Keine Lage-, Nachfrage-
  // oder Marktdaten fliessen in diesen Score ein.
  // Gewichtung: Substanz 40 %, Grundriss 20 %, Standard 15 %,
  // Ausstattung 10 %, Badezimmer 7 %, Parkierung 8 %.
  const currentYear = new Date().getFullYear();

  // 1) Alter, Renovation & Zustand (40 %)
  const buildingAge = input.yearBuilt > 0 ? Math.max(0, currentYear - input.yearBuilt) : 35;
  const buildingAgeScore = buildingAge <= 5 ? 100
    : buildingAge <= 10 ? 94
    : buildingAge <= 20 ? 84
    : buildingAge <= 30 ? 72
    : buildingAge <= 40 ? 60
    : buildingAge <= 55 ? 48
    : 36;

  // Fehlende Renovationsangabe ist neutral und wird nie als "nie renoviert" bestraft.
  const renovationAge = input.renovatedYear > 0 ? Math.max(0, currentYear - input.renovatedYear) : null;
  const renovationScore = renovationAge === null ? 70
    : renovationAge <= 5 ? 100
    : renovationAge <= 10 ? 92
    : renovationAge <= 20 ? 78
    : renovationAge <= 30 ? 62
    : 48;

  const conditionScore = {
    sanierungsbeduerftig: 25,
    renovationsbeduerftig: 45,
    gepflegt: 72,
    modernisiert: 88,
    neuwertig: 98,
  }[input.condition];

  // Zustand hat die höchste Aussagekraft; Baujahr und Renovationsalter ergänzen ihn.
  const substanceScore = buildingAgeScore * 0.35 + renovationScore * 0.25 + conditionScore * 0.40;

  // 2) Grundriss & Flächeneffizienz (20 %): funktionale Dimensionierung,
  // nicht Vermietbarkeit. Bewertet wird primär die Fläche pro Zimmer.
  const rooms = Math.max(input.rooms || 0, 0.5);
  const areaPerRoom = input.livingArea > 0 ? input.livingArea / rooms : 0;
  let layoutScore = 65;
  if (areaPerRoom >= 20 && areaPerRoom <= 30) layoutScore = 92;
  else if (areaPerRoom >= 17 && areaPerRoom < 20) layoutScore = 82;
  else if (areaPerRoom > 30 && areaPerRoom <= 35) layoutScore = 82;
  else if (areaPerRoom >= 14 && areaPerRoom < 17) layoutScore = 68;
  else if (areaPerRoom > 35 && areaPerRoom <= 42) layoutScore = 68;
  else if (areaPerRoom > 0) layoutScore = 52;

  // 3) Ausbaustandard (15 %)
  const standardScore = { einfach: 45, durchschnittlich: 70, gehoben: 88, luxus: 98 }[input.quality];

  // 4) Ausstattung (10 %): begrenzter Komfortbonus, damit einzelne Häkchen
  // eine schwache Bausubstanz nicht überkompensieren können.
  const features = new Set((Array.isArray(input.features) ? input.features : []).map((item) => item.toLowerCase()));
  const has = (...terms: string[]) => [...features].some((x) => terms.some((term) => x.includes(term)));
  let equipmentPoints = 30; // neutrale Grundausstattung
  if (has('balkon', 'terrasse', 'garten')) equipmentPoints += 18;
  if (has('lift')) equipmentPoints += 14;
  if (has('keller', 'reduit')) equipmentPoints += 10;
  if (has('waschmaschine')) equipmentPoints += 8;
  if (has('tumbler')) equipmentPoints += 6;
  if (has('minergie', 'energie')) equipmentPoints += 10;
  if (has('aussicht', 'whirlpool', 'pool')) equipmentPoints += 4;
  const equipmentScore = clamp(equipmentPoints);

  // 5) Badezimmer (7 %): passend zur Objektgrösse, nicht "mehr = immer besser".
  const bathrooms = Math.max(0, input.bathrooms || 0);
  let bathroomScore = 35;
  if (rooms <= 2.5) bathroomScore = bathrooms >= 1 ? 95 : 35;
  else if (rooms <= 3.5) bathroomScore = bathrooms >= 1 ? 90 : 30;
  else if (rooms <= 4.5) bathroomScore = bathrooms >= 2 ? 100 : bathrooms === 1 ? 72 : 25;
  else bathroomScore = bathrooms >= 2 ? 100 : bathrooms === 1 ? 58 : 20;

  // 6) Parkierung (8 %): reine Objekteigenschaft; die lokale Notwendigkeit
  // eines Parkplatzes gehört nicht in die Objektqualität.
  const parkingScore = input.parkingSpaces >= 2 ? 100 : input.parkingSpaces === 1 ? 85 : 45;

  return Math.round(clamp(
    substanceScore * 0.40 +
    layoutScore * 0.20 +
    standardScore * 0.15 +
    equipmentScore * 0.10 +
    bathroomScore * 0.07 +
    parkingScore * 0.08
  ));
}

function marketabilityScore(input: AnalysisInput) {
  // V5.6: Marktfähigkeit bewertet nur die konkrete Vermietbarkeit des Objekts.
  // Standort-Nachfrage und Leerstand gehören zur Lageanalyse und werden hier
  // bewusst nicht nochmals eingerechnet.
  let score = 25;
  const f = new Set((Array.isArray(input.features) ? input.features : []).map((item) => item.toLowerCase()));
  const hasOutdoor = [...f].some((x) => x.includes("balkon") || x.includes("terrasse") || x.includes("garten"));
  const hasLift = [...f].some((x) => x.includes("lift"));
  const hasStorage = [...f].some((x) => x.includes("keller") || x.includes("reduit"));

  if (hasOutdoor) score += 15;
  if (hasLift) score += 10;
  if (input.parkingSpaces > 0) score += 15;
  if (hasStorage) score += 5;

  score += input.rooms >= 2.5 && input.rooms <= 4.5 ? 15 : input.rooms >= 1.5 && input.rooms <= 5.5 ? 10 : 5;
  score += input.livingArea >= 55 && input.livingArea <= 125 ? 15 : input.livingArea >= 40 && input.livingArea <= 150 ? 10 : 5;

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
  // Bruttorendite als klassische Vergleichskennzahl auf den Kaufpreis.
  const grossYield = input.purchasePrice > 0 ? (annualRent / input.purchasePrice) * 100 : 0;
  const netIncomeBeforeFinancing = annualRent - input.annualOperatingCosts - input.annualMaintenance;
  // Konservative Nettorendite auf dem effektiv gebundenen Gesamtinvestment.
  const netYield = totalInvestment > 0 ? (netIncomeBeforeFinancing / totalInvestment) * 100 : 0;
  const annualInterest = mortgage * input.interestRate / 100;
  const annualAmortization = mortgage * input.amortizationRate / 100;
  const annualCashflow = netIncomeBeforeFinancing - annualInterest - annualAmortization;
  const monthlyCashflow = annualCashflow / 12;
  // Eigenkapitalrendite: Nettoertrag nach Finanzierungskosten, Amortisation ist
  // Vermögensumschichtung und wird nicht als Aufwand abgezogen.
  const annualEquityIncome = netIncomeBeforeFinancing - annualInterest;
  const equityReturn = input.equity > 0 ? annualEquityIncome / input.equity * 100 : 0;
  // Cash-on-Cash bleibt als Liquiditätskennzahl nach Zins und Amortisation sichtbar.
  const cashOnCashReturn = input.equity > 0 ? annualCashflow / input.equity * 100 : 0;
  // Belehnung bezieht sich auf den Kaufpreis/Objektwert, nicht auf Erwerbsnebenkosten.
  const ltv = input.purchasePrice > 0 ? mortgage / input.purchasePrice * 100 : 0;
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
  const marketPriceOkay = !marketAnalysis.marketValueAvailable || marketAnalysis.priceDifferencePercent > -8;
  const recommendation = score >= 75 && netYield >= 3.4 && marketPriceOkay
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
  if (marketAnalysis.marketValueAvailable && marketAnalysis.priceDifferencePercent >= 8) positives.push("Kaufpreis unter geschätztem Marktwert");
  else if (marketAnalysis.marketValueAvailable && marketAnalysis.priceDifferencePercent <= -8) negatives.push("Kaufpreis über geschätztem Marktwert");
  if (marketAnalysis.marketRentAvailable && marketAnalysis.rentDifferencePercent >= 6) positives.push("Erkennbares Marktmietpotenzial");
  if (ltv > 80) negatives.push("Hohe Belehnung");
  if (scoreBreakdown.objectQuality < 50) negatives.push("Erhöhter Sanierungs- oder Unterhaltsbedarf möglich");
  if (scoreBreakdown.marketability < 50) negatives.push("Eingeschränkte Vermietbarkeit des konkreten Objekts");

  return { input, totalInvestment, mortgage, annualRent, grossYield, netYield, annualInterest, annualAmortization, annualCashflow, monthlyCashflow, cashOnCashReturn, equityReturn, ltv, pricePerSqm, score, scoreBreakdown, rating, recommendation, positives, negatives, locationAnalysis, marketAnalysis };
}
