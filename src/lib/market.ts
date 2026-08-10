import type { AnalysisInput, LocationAnalysis, MarketAnalysis, RentalUnit, UnitMarketRentResult } from "../types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const distanceScore = (minutes: number, ideal: number, limit: number) => clamp(100 - Math.max(0, minutes - ideal) * (100 / Math.max(limit - ideal, 1)));

export function analyseLocation(input: AnalysisInput): LocationAnalysis {
  const l = input.location;
  const evidence = input.openDataLocation?.evidence;
  const distanceLabel = (meters: number | null | undefined, fallbackMinutes: number, mode: "walk" | "drive" = "walk") => {
    if (evidence && meters != null) {
      if (meters < 1000) return `${Math.round(meters)} m entfernt`;
      return `${(meters / 1000).toFixed(1)} km entfernt`;
    }
    return mode === "drive" ? `${fallbackMinutes} Min. entfernt` : `${fallbackMinutes} Min. zu Fuss`;
  };

  const raw = [
    {
      label: "ÖV-Anbindung",
      available: evidence ? evidence.nearestPublicTransportMeters !== null || !!evidence.transitClass : true,
      score: Math.round(distanceScore(l.publicTransportMinutes, 3, 25)),
      detail: distanceLabel(evidence?.nearestPublicTransportMeters, l.publicTransportMinutes),
    },
    {
      label: "Einkauf",
      available: evidence ? evidence.nearestShoppingMeters !== null : true,
      score: Math.round(distanceScore(l.shoppingMinutes, 5, 35)),
      detail: distanceLabel(evidence?.nearestShoppingMeters, l.shoppingMinutes),
    },
    {
      label: "Schule & Betreuung",
      available: evidence ? evidence.nearestSchoolMeters !== null : true,
      score: Math.round(distanceScore(l.schoolMinutes, 8, 40)),
      detail: distanceLabel(evidence?.nearestSchoolMeters, l.schoolMinutes),
    },
    {
      label: "Verkehrsanbindung",
      available: evidence ? evidence.nearestMotorwayJunctionMeters !== null : true,
      score: Math.round(distanceScore(l.motorwayMinutes, 8, 55)),
      detail: distanceLabel(evidence?.nearestMotorwayJunctionMeters, l.motorwayMinutes, "drive"),
    },
    {
      label: "Lärmbelastung",
      available: evidence ? evidence.roadNoiseDb !== null || evidence.railNoiseDb !== null : true,
      score: Math.round(clamp(110 - l.noiseLevel)),
      detail: evidence && (evidence.roadNoiseDb !== null || evidence.railNoiseDb !== null)
        ? `${Math.max(evidence.roadNoiseDb || 0, evidence.railNoiseDb || 0)} dB` : `${l.noiseLevel}/100 Belastung`,
    },
    {
      label: "Nachfrage",
      available: evidence ? evidence.vacancyRate !== null : true,
      score: Math.round(clamp(l.municipalityDemand)),
      detail: `${l.municipalityDemand}/100 Nachfrage`,
    },
    {
      label: "Leerstandsrisiko",
      available: evidence ? evidence.vacancyRate !== null : true,
      score: Math.round(clamp(100 - l.vacancyRisk)),
      detail: evidence?.vacancyRate != null ? `${evidence.vacancyRate.toFixed(2)} % Leerwohnungsziffer` : `${l.vacancyRisk}/100 Risiko`,
    },
    {
      label: "Mikrolage",
      // Mikrolage darf bei Open-Data-Analysen nicht als scheinbar gemessener Wert erscheinen,
      // solange sie nicht aus ausreichend vielen realen Teilfaktoren abgeleitet werden kann.
      available: evidence ? [
        evidence.nearestPublicTransportMeters,
        evidence.nearestShoppingMeters,
        evidence.nearestSchoolMeters,
        evidence.nearestMotorwayJunctionMeters,
      ].filter((value) => value !== null).length >= 3 : true,
      score: Math.round(clamp(l.microLocation)),
      detail: `${l.microLocation}/100 Qualität`,
    },
  ];
  const weights = [0.16, 0.10, 0.08, 0.08, 0.14, 0.18, 0.14, 0.12];
  const availableWeight = raw.reduce((sum, factor, index) => sum + (factor.available ? weights[index] : 0), 0);
  const weightedScore = raw.reduce((sum, factor, index) => sum + (factor.available ? factor.score * weights[index] : 0), 0);
  const observedScore = availableWeight > 0 ? weightedScore / availableWeight : 50;
  // Bei geringer Datenabdeckung darf ein einzelner guter Faktor (z.B. ÖV) nicht zu 100/100 Lage führen.
  // Wir ziehen die Aussage kontrolliert Richtung neutral (50), bis genügend echte Faktoren vorhanden sind.
  const confidence = clamp(availableWeight, 0, 1);
  const score = Math.round(observedScore * confidence + 50 * (1 - confidence));
  const factors = raw.map((factor) => ({
    label: factor.label,
    score: factor.available ? factor.score : 0,
    detail: factor.available ? factor.detail : "Nicht verfügbar",
  }));
  const availableFactors = raw.filter((factor) => factor.available).length;
  const dataCoverage = Math.round(availableWeight * 100);
  const strengths = factors.filter((factor) => factor.score >= 75 && factor.detail !== "Nicht verfügbar").map((factor) => `${factor.label}: ${factor.detail}`);
  const risks = factors.filter((factor) => factor.score > 0 && factor.score < 50 && factor.detail !== "Nicht verfügbar").map((factor) => `${factor.label}: ${factor.detail}`);
  const rating = score >= 80 ? "Sehr gute Lage" : score >= 65 ? "Gute Lage" : score >= 50 ? "Durchschnittliche Lage" : "Schwache Lage";
  return { score, rating, factors, strengths, risks, dataCoverage, availableFactors, totalFactors: raw.length };
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
  const marketValueAvailable = Number.isFinite(input.regionalMarketPricePerSqm) && input.regionalMarketPricePerSqm > 0 && input.livingArea > 0;
  const marketRentAvailable = Number.isFinite(input.regionalMarketRentPerSqm) && input.regionalMarketRentPerSqm > 0 && input.livingArea > 0;
  const condition = conditionFactor(input.condition);
  const quality = qualityFactor(input.quality);
  const locationAdjustment = 0.86 + location.score / 500;
  const propertyTypeFactor = input.propertyType === "efh" ? 1.05 : input.propertyType === "mfh" ? 0.94 : input.propertyType === "wohnung" ? 1 : 0.98;
  const adjustedPricePerSqm = marketValueAvailable ? input.regionalMarketPricePerSqm * condition * quality * locationAdjustment * propertyTypeFactor * featureFactor(input.features) : 0;
  const estimatedMarketValue = marketValueAvailable ? adjustedPricePerSqm * input.livingArea + input.parkingSpaces * 25000 + (input.landArea > 0 ? Math.min(input.landArea * 180, input.purchasePrice * 0.22) : 0) : 0;
  const uncertainty = input.marketDataRadiusKm <= 3 ? 0.06 : input.marketDataRadiusKm <= 7 ? 0.09 : 0.13;
  const marketValueLow = marketValueAvailable ? estimatedMarketValue * (1 - uncertainty) : 0;
  const marketValueHigh = marketValueAvailable ? estimatedMarketValue * (1 + uncertainty) : 0;
  const priceDifference = marketValueAvailable ? estimatedMarketValue - input.purchasePrice : 0;
  const priceDifferencePercent = marketValueAvailable && input.purchasePrice > 0 ? priceDifference / input.purchasePrice * 100 : 0;
  const priceRating = !marketValueAvailable ? "Nicht verfügbar" : priceDifferencePercent >= 8 ? "Unter Marktwert" : priceDifferencePercent <= -8 ? "Über Marktwert" : "Im marktüblichen Bereich";

  const units = marketRentAvailable && input.propertyType === "mfh" ? input.rentalUnits.map(unit => unitRent(unit, input.regionalMarketRentPerSqm)) : [];
  const estimatedMonthlyMarketRent = marketRentAvailable ? (units.length
    ? units.reduce((sum, unit) => sum + unit.estimatedMonthlyMarketRent, 0)
    : input.regionalMarketRentPerSqm * input.livingArea * floorFactor(input.floor) * condition * quality * featureFactor(input.features) * areaFactor(input.livingArea) + input.parkingSpaces * 120) : 0;
  const currentMonthlyRent = input.propertyType === "mfh" ? input.rentalUnits.reduce((sum, unit) => sum + unit.currentMonthlyRent + (unit.parkingMonthlyRent || 0), 0) : input.monthlyRent + (input.parkingMonthlyRent || 0);
  const rentDifferenceMonthly = marketRentAvailable ? estimatedMonthlyMarketRent - currentMonthlyRent : 0;
  const rentDifferencePercent = marketRentAvailable && currentMonthlyRent > 0 ? rentDifferenceMonthly / currentMonthlyRent * 100 : 0;
  const rentRating = !marketRentAvailable ? "Nicht verfügbar" : rentDifferencePercent >= 6 ? "Mietsteigerungspotenzial" : rentDifferencePercent <= -6 ? "Aktuelle Miete über Marktniveau" : "Miete auf Marktniveau";
  const confidence = input.openDataLocation?.market.confidence === "eingeschränkt" ? "niedrig" : input.openDataLocation?.market.confidence || (input.marketDataRadiusKm <= 3 ? "hoch" : input.marketDataRadiusKm <= 7 ? "mittel" : "niedrig");

  return { marketValueAvailable, marketRentAvailable, benchmarkPricePerSqm: input.regionalMarketPricePerSqm, adjustedPricePerSqm, estimatedMarketValue, marketValueLow, marketValueHigh, priceDifference, priceDifferencePercent, priceRating, benchmarkRentPerSqm: input.regionalMarketRentPerSqm, estimatedMonthlyMarketRent, currentMonthlyRent, rentDifferenceMonthly, rentDifferencePercent, rentRating, confidence, units };
}
