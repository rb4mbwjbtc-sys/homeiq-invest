import type { AnalysisInput, LocationAnalysis, MarketAnalysis, RentalUnit, UnitMarketRentResult } from "../types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const distanceScore = (minutes: number, ideal: number, limit: number) => clamp(100 - Math.max(0, minutes - ideal) * (100 / Math.max(limit - ideal, 1)));

export function analyseLocation(input: AnalysisInput): LocationAnalysis {
  const l = input.location;
  const factors = [
    { label: "ÖV-Anbindung", score: Math.round(distanceScore(l.publicTransportMinutes, 3, 25)), detail: `${l.publicTransportMinutes} Min. zu Fuss` },
    { label: "Einkauf", score: Math.round(distanceScore(l.shoppingMinutes, 5, 30)), detail: `${l.shoppingMinutes} Min. entfernt` },
    { label: "Schule & Betreuung", score: Math.round(distanceScore(l.schoolMinutes, 8, 35)), detail: `${l.schoolMinutes} Min. entfernt` },
    { label: "Verkehrsanbindung", score: Math.round(distanceScore(l.motorwayMinutes, 5, 30)), detail: `${l.motorwayMinutes} Min. zum Anschluss` },
    { label: "Lärmbelastung", score: Math.round(clamp(110 - l.noiseLevel)), detail: `${l.noiseLevel}/100 Belastung` },
    { label: "Nachfrage", score: Math.round(clamp(l.municipalityDemand)), detail: `${l.municipalityDemand}/100 Nachfrage` },
    { label: "Leerstandsrisiko", score: Math.round(clamp(100 - l.vacancyRisk)), detail: `${l.vacancyRisk}/100 Risiko` },
    { label: "Mikrolage", score: Math.round(clamp(l.microLocation)), detail: `${l.microLocation}/100 Qualität` }
  ];
  const weights = [0.16, 0.10, 0.08, 0.08, 0.14, 0.18, 0.14, 0.12];
  const score = Math.round(factors.reduce((sum, factor, index) => sum + factor.score * weights[index], 0));
  const strengths = factors.filter(f => f.score >= 75).map(f => `${f.label}: ${f.detail}`);
  const risks = factors.filter(f => f.score < 50).map(f => `${f.label}: ${f.detail}`);
  const rating = score >= 80 ? "Sehr gute Lage" : score >= 65 ? "Gute Lage" : score >= 50 ? "Durchschnittliche Lage" : "Schwache Lage";
  return { score, rating, factors, strengths, risks };
}

const floorFactor = (floor: string) => floor.includes("Attika") || floor.includes("PH") ? 1.08 : floor.includes("3.") ? 1.04 : floor.includes("2.") ? 1.03 : floor.includes("1.") ? 1.01 : floor === "EG" ? 0.97 : 1;
const conditionFactor = (condition: AnalysisInput["condition"]) => ({ sanierungsbeduerftig: 0.78, renovationsbeduerftig: 0.88, gepflegt: 1, modernisiert: 1.08, neuwertig: 1.14 }[condition]);
const qualityFactor = (quality: AnalysisInput["quality"]) => ({ einfach: 0.90, durchschnittlich: 1, gehoben: 1.10, luxus: 1.22 }[quality]);
const featureFactor = (features: string[]) => Math.min(1.12, 1 + features.length * 0.012);
const areaFactor = (area: number) => area < 45 ? 1.10 : area < 70 ? 1.05 : area > 140 ? 0.93 : area > 105 ? 0.97 : 1;

function unitRent(unit: RentalUnit, fallbackBenchmark: number): UnitMarketRentResult {
  const benchmark = unit.marketRentPerSqm > 0 ? unit.marketRentPerSqm : fallbackBenchmark;
  const adjustedMarketRentPerSqm = benchmark * floorFactor(unit.floor) * conditionFactor(unit.condition) * qualityFactor(unit.quality) * featureFactor(unit.features) * areaFactor(unit.livingArea);
  const estimatedMonthlyMarketRent = adjustedMarketRentPerSqm * unit.livingArea + (unit.parkingMonthlyRent || 0);
  const currentMonthlyRent = unit.currentMonthlyRent + (unit.parkingMonthlyRent || 0);
  const differenceMonthly = estimatedMonthlyMarketRent - currentMonthlyRent;
  const differencePercent = currentMonthlyRent > 0 ? differenceMonthly / currentMonthlyRent * 100 : 0;
  return { ...unit, currentMonthlyRent, adjustedMarketRentPerSqm, estimatedMonthlyMarketRent, differenceMonthly, differencePercent };
}

export function analyseMarket(input: AnalysisInput, location: LocationAnalysis): MarketAnalysis {
  const condition = conditionFactor(input.condition);
  const quality = qualityFactor(input.quality);
  const locationAdjustment = 0.86 + location.score / 500;
  const propertyTypeFactor = input.propertyType === "efh" ? 1.05 : input.propertyType === "mfh" ? 0.94 : input.propertyType === "wohnung" ? 1 : 0.98;
  const adjustedPricePerSqm = input.regionalMarketPricePerSqm * condition * quality * locationAdjustment * propertyTypeFactor * featureFactor(input.features);
  const estimatedMarketValue = adjustedPricePerSqm * input.livingArea + input.parkingSpaces * 25000 + (input.landArea > 0 ? Math.min(input.landArea * 180, input.purchasePrice * 0.22) : 0);
  const uncertainty = input.marketDataRadiusKm <= 3 ? 0.06 : input.marketDataRadiusKm <= 7 ? 0.09 : 0.13;
  const marketValueLow = estimatedMarketValue * (1 - uncertainty);
  const marketValueHigh = estimatedMarketValue * (1 + uncertainty);
  const priceDifference = estimatedMarketValue - input.purchasePrice;
  const priceDifferencePercent = input.purchasePrice > 0 ? priceDifference / input.purchasePrice * 100 : 0;
  const priceRating = priceDifferencePercent >= 8 ? "Unter Marktwert" : priceDifferencePercent <= -8 ? "Über Marktwert" : "Im marktüblichen Bereich";

  const units = input.propertyType === "mfh" ? input.rentalUnits.map(unit => unitRent(unit, input.regionalMarketRentPerSqm)) : [];
  const estimatedMonthlyMarketRent = units.length
    ? units.reduce((sum, unit) => sum + unit.estimatedMonthlyMarketRent, 0)
    : input.regionalMarketRentPerSqm * input.livingArea * floorFactor(input.floor) * condition * quality * featureFactor(input.features) * areaFactor(input.livingArea) + input.parkingSpaces * 120;
  const currentMonthlyRent = units.length ? units.reduce((sum, unit) => sum + unit.currentMonthlyRent, 0) : input.monthlyRent + (input.parkingMonthlyRent || 0);
  const rentDifferenceMonthly = estimatedMonthlyMarketRent - currentMonthlyRent;
  const rentDifferencePercent = currentMonthlyRent > 0 ? rentDifferenceMonthly / currentMonthlyRent * 100 : 0;
  const rentRating = rentDifferencePercent >= 6 ? "Mietsteigerungspotenzial" : rentDifferencePercent <= -6 ? "Aktuelle Miete über Marktniveau" : "Miete auf Marktniveau";
  const confidence = input.marketDataRadiusKm <= 3 ? "hoch" : input.marketDataRadiusKm <= 7 ? "mittel" : "niedrig";

  return { benchmarkPricePerSqm: input.regionalMarketPricePerSqm, adjustedPricePerSqm, estimatedMarketValue, marketValueLow, marketValueHigh, priceDifference, priceDifferencePercent, priceRating, benchmarkRentPerSqm: input.regionalMarketRentPerSqm, estimatedMonthlyMarketRent, currentMonthlyRent, rentDifferenceMonthly, rentDifferencePercent, rentRating, confidence, units };
}
