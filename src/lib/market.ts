import type { AnalysisInput, LocationAnalysis, MarketAnalysis, RentalUnit, UnitMarketRentResult } from "../types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function piecewiseScore(value: number, points: Array<[number, number]>): number {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (value <= sorted[0][0]) return sorted[0][1];
  for (let i = 1; i < sorted.length; i += 1) {
    const [x1, y1] = sorted[i - 1];
    const [x2, y2] = sorted[i];
    if (value <= x2) {
      const t = (value - x1) / Math.max(x2 - x1, 1e-9);
      return y1 + (y2 - y1) * t;
    }
  }
  return sorted[sorted.length - 1][1];
}

const distanceMetersScore = (meters: number | null | undefined, type: "transit" | "shopping" | "school" | "motorway") => {
  if (meters == null) return 0;
  const curves: Record<typeof type, Array<[number, number]>> = {
    transit: [[150,100],[300,95],[500,90],[750,82],[1000,75],[1500,62],[2500,45],[4000,25],[6000,10]],
    shopping: [[300,100],[500,95],[800,85],[1200,72],[2000,55],[3000,40],[5000,20],[10000,5]],
    school: [[300,100],[500,95],[800,85],[1200,75],[2000,60],[3000,45],[5000,25],[10000,10]],
    motorway: [[1000,100],[2000,90],[3000,80],[5000,65],[7000,50],[10000,35],[15000,20],[25000,10]],
  };
  return Math.round(clamp(piecewiseScore(meters, curves[type])));
};

function noiseBaseScore(db: number): number {
  return Math.round(clamp(piecewiseScore(db, [[40,100],[45,100],[50,90],[55,75],[60,55],[65,30],[70,10]])));
}

function noiseConfidence(distanceMeters: number | null | undefined): number {
  if (distanceMeters == null) return 1;
  if (distanceMeters <= 25) return 1;
  if (distanceMeters <= 50) return 0.9;
  if (distanceMeters <= 100) return 0.7;
  if (distanceMeters <= 250) return 0.4;
  return 0;
}

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

  const roadDb = evidence?.roadNoiseDb ?? null;
  const railDb = evidence?.railNoiseDb ?? null;
  const roadDist = evidence?.roadNoiseDistanceMeters ?? null;
  const railDist = evidence?.railNoiseDistanceMeters ?? null;

  const sourceNoiseScore = (db: number | null, distance: number | null) => {
    if (db == null) return null;
    const base = noiseBaseScore(db);
    const confidence = noiseConfidence(distance);
    // A fallback raster cell farther away is weaker evidence of a negative
    // impact at the property. Reduce the penalty toward 100, never the dB.
    return Math.round(clamp(100 - (100 - base) * confidence));
  };
  const roadNoiseScore = sourceNoiseScore(roadDb, roadDist);
  const railNoiseScore = sourceNoiseScore(railDb, railDist);
  const availableNoiseScores = [roadNoiseScore, railNoiseScore].filter((value): value is number => value != null);
  const adjustedNoiseScore = availableNoiseScores.length ? Math.min(...availableNoiseScores) : 0;
  const noiseDetailParts: string[] = [];
  if (roadDb != null) noiseDetailParts.push(`Strasse ${roadDb.toFixed(1)} dB${roadDist != null ? ` · ${Math.round(roadDist)} m · Einfluss ${Math.round(noiseConfidence(roadDist) * 100)}%` : ""}`);
  if (railDb != null) noiseDetailParts.push(`Bahn ${railDb.toFixed(1)} dB${railDist != null ? ` · ${Math.round(railDist)} m · Einfluss ${Math.round(noiseConfidence(railDist) * 100)}%` : ""}`);

  const raw = [
    {
      label: "ÖV-Anbindung",
      available: evidence ? evidence.nearestPublicTransportMeters !== null || !!evidence.transitClass : true,
      score: evidence?.nearestPublicTransportMeters != null ? distanceMetersScore(evidence.nearestPublicTransportMeters, "transit") : Math.round(clamp(l.publicTransportMinutes > 0 ? 100 - l.publicTransportMinutes * 4 : 50)),
      detail: distanceLabel(evidence?.nearestPublicTransportMeters, l.publicTransportMinutes),
    },
    {
      label: "Einkauf",
      available: evidence ? evidence.nearestShoppingMeters !== null : true,
      score: evidence?.nearestShoppingMeters != null ? distanceMetersScore(evidence.nearestShoppingMeters, "shopping") : Math.round(clamp(l.shoppingMinutes > 0 ? 100 - l.shoppingMinutes * 3 : 50)),
      detail: distanceLabel(evidence?.nearestShoppingMeters, l.shoppingMinutes),
    },
    {
      label: "Schule & Betreuung",
      available: evidence ? evidence.nearestSchoolMeters !== null : true,
      score: evidence?.nearestSchoolMeters != null ? distanceMetersScore(evidence.nearestSchoolMeters, "school") : Math.round(clamp(l.schoolMinutes > 0 ? 100 - l.schoolMinutes * 2.5 : 50)),
      detail: distanceLabel(evidence?.nearestSchoolMeters, l.schoolMinutes),
    },
    {
      label: "Verkehrsanbindung",
      available: evidence ? evidence.nearestMotorwayJunctionMeters !== null : true,
      score: evidence?.nearestMotorwayJunctionMeters != null ? distanceMetersScore(evidence.nearestMotorwayJunctionMeters, "motorway") : Math.round(clamp(l.motorwayMinutes > 0 ? 100 - l.motorwayMinutes * 2 : 50)),
      detail: distanceLabel(evidence?.nearestMotorwayJunctionMeters, l.motorwayMinutes, "drive"),
    },
    {
      label: "Lärmbelastung",
      available: evidence ? roadDb !== null || railDb !== null : true,
      score: evidence ? adjustedNoiseScore : Math.round(clamp(100 - l.noiseLevel)),
      detail: evidence && noiseDetailParts.length
        ? noiseDetailParts.join(" · ")
        : `${l.noiseLevel}/100 Belastung`,
    },
    {
      label: "Nachfrage",
      available: evidence ? (evidence.vacancyRate !== null || evidence.populationGrowth5y != null || !!evidence.transitClass) : true,
      score: Math.round(clamp(l.municipalityDemand)),
      detail: evidence?.populationGrowth5y != null
        ? `${l.municipalityDemand}/100 · Bevölkerung ${evidence.populationGrowth5y >= 0 ? "+" : ""}${evidence.populationGrowth5y.toFixed(1)} % / 5J`
        : `${l.municipalityDemand}/100 Nachfrage`,
    },
    {
      label: "Leerstandsrisiko",
      available: evidence ? evidence.vacancyRate !== null : true,
      score: Math.round(clamp(100 - l.vacancyRisk)),
      detail: evidence?.vacancyRate != null ? `${evidence.vacancyRate.toFixed(2)} % Leerwohnungsziffer` : `${l.vacancyRisk}/100 Risiko`,
    },
    {
      label: "Mikrolage",
      available: evidence ? (evidence.microLocationAvailable ?? [
        evidence.nearestPublicTransportMeters,
        evidence.nearestShoppingMeters,
        evidence.nearestSchoolMeters,
        evidence.nearestMotorwayJunctionMeters,
      ].filter((value) => value !== null).length >= 3) : true,
      score: Math.round(clamp(l.microLocation)),
      detail: evidence?.microLocationSummary || `${l.microLocation}/100 Wohnumfeld`,
    },
  ];

  // V5.4: Mikrolage bleibt als transparenter Informations-Subscore sichtbar,
  // fliesst aber NICHT erneut in den Lage-Gesamtscore ein. Die Mikrolage
  // wird bereits aus ÖV, Einkauf, Schule/Betreuung und Autobahn abgeleitet.
  // Eine zusätzliche Gewichtung würde diese Faktoren doppelt zählen.
  const baseWeights = [0.16, 0.10, 0.08, 0.08, 0.14, 0.18, 0.14, 0];
  const baseWeightTotal = baseWeights.reduce((sum, weight) => sum + weight, 0);
  const weights = baseWeights.map((weight) => weight / baseWeightTotal);
  const availableWeight = raw.reduce((sum, factor, index) => sum + (factor.available ? weights[index] : 0), 0);
  const weightedScore = raw.reduce((sum, factor, index) => sum + (factor.available ? factor.score * weights[index] : 0), 0);
  const observedScore = availableWeight > 0 ? weightedScore / availableWeight : 50;
  const confidence = clamp(availableWeight, 0, 1);
  const score = Math.round(observedScore * confidence + 50 * (1 - confidence));
  const factors = raw.map((factor) => ({
    label: factor.label,
    score: factor.available ? factor.score : 0,
    detail: factor.available ? factor.detail : "Nicht verfügbar",
  }));
  const availableFactors = raw.filter((factor) => factor.available).length;
  const dataCoverage = Math.round(availableWeight * 100);
  const strengths = factors.filter((factor) => factor.label !== "Mikrolage" && factor.score >= 75 && factor.detail !== "Nicht verfügbar").map((factor) => `${factor.label}: ${factor.detail}`);
  const risks = factors.filter((factor) => factor.label !== "Mikrolage" && factor.score > 0 && factor.score < 50 && factor.detail !== "Nicht verfügbar").map((factor) => `${factor.label}: ${factor.detail}`);
  const baseRating = score >= 80 ? "Sehr gute Lage" : score >= 65 ? "Gute Lage" : score >= 50 ? "Durchschnittliche Lage" : "Schwache Lage";
  const rating = dataCoverage < 40 ? "Lagebewertung eingeschränkt" : baseRating;
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
