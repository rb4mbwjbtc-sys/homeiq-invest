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
  // V5.7.3: Objektqualität beantwortet ausschliesslich die Frage
  // "Wie gut ist das konkrete Objekt selbst?". Keine Lage-, Nachfrage-
  // oder Marktdaten fliessen in diesen Score ein.
  // Gewichtung: Substanz 40 %, Grundriss 20 %, Standard 15 %,
  // Ausstattung 10 %, Badezimmer 7 %, Parkierung 8 %.
  const currentYear = new Date().getFullYear();

  // Baujahr-Priorität: Nutzereingabe hat immer Vorrang. Nur wenn kein
  // Baujahr eingegeben wurde, darf das amtliche GWR/Open-Data-Baujahr
  // als Fallback für die Objektqualitätsberechnung verwendet werden.
  const openDataYear = Number(input.openDataLocation?.building?.constructionYear || 0);
  const effectiveYearBuilt = input.yearBuilt > 0 ? input.yearBuilt : openDataYear > 0 ? openDataYear : 0;

  // 1) Alter, Renovation & Zustand (40 %)
  const buildingAge = effectiveYearBuilt > 0 ? Math.max(0, currentYear - effectiveYearBuilt) : null;
  const buildingAgeScore = buildingAge === null ? 60
    : buildingAge <= 5 ? 100
    : buildingAge <= 15 ? 90
    : buildingAge <= 25 ? 78
    : buildingAge <= 35 ? 65
    : buildingAge <= 50 ? 50
    : 35;

  // Fehlende Renovationsangabe erzeugt weder Bonus noch pauschalen Malus:
  // sie übernimmt den altersbasierten Ausgangswert. Eine bekannte jüngere
  // Renovation kann die technische Substanz dagegen klar aufwerten.
  const renovationAge = input.renovatedYear > 0 ? Math.max(0, currentYear - input.renovatedYear) : null;
  const renovationScore = renovationAge === null ? buildingAgeScore
    : renovationAge <= 5 ? 100
    : renovationAge <= 10 ? 90
    : renovationAge <= 20 ? 75
    : renovationAge <= 30 ? 60
    : 45;

  const conditionScore = {
    sanierungsbeduerftig: 10,
    renovationsbeduerftig: 20,
    gepflegt: 75,
    modernisiert: 90,
    neuwertig: 100,
  }[input.condition];

  // Zustand ist der stärkste Einzelindikator, Baujahr und Renovation
  // liefern den technischen Kontext.
  const substanceScore = buildingAgeScore * 0.35 + renovationScore * 0.25 + conditionScore * 0.40;

  // 2) Grundriss & Flächeneffizienz (20 %)
  // Bewertet wird die sinnvolle Dimensionierung je Zimmerzahl. Mehr Fläche
  // ist nicht automatisch besser; deutliche Über- oder Unterdimensionierung
  // reduziert die funktionale Objektqualität.
  const rooms = Math.max(input.rooms || 0, 0.5);
  const targetRanges: Array<[number, number, number]> = [
    [1.0, 25, 40], [1.5, 30, 45], [2.0, 40, 55], [2.5, 55, 75],
    [3.0, 65, 85], [3.5, 70, 95], [4.0, 80, 105], [4.5, 90, 120],
    [5.0, 100, 135], [5.5, 115, 150], [6.0, 125, 170],
  ];
  const nearestRange = targetRanges.reduce((best, row) => Math.abs(row[0] - rooms) < Math.abs(best[0] - rooms) ? row : best, targetRanges[0]);
  const [, minArea, maxArea] = nearestRange;
  const area = Math.max(0, input.livingArea || 0);
  let layoutScore = 60;
  if (area > 0) {
    if (area >= minArea && area <= maxArea) layoutScore = 95;
    else if (area < minArea) {
      const deviation = (minArea - area) / minArea;
      layoutScore = deviation <= 0.10 ? 82 : deviation <= 0.20 ? 68 : 50;
    } else {
      const deviation = (area - maxArea) / maxArea;
      layoutScore = deviation <= 0.15 ? 82 : deviation <= 0.30 ? 65 : 50;
    }
  }

  // 3) Ausbaustandard (15 %)
  const standardScore = { einfach: 40, durchschnittlich: 65, gehoben: 85, luxus: 100 }[input.quality];

  // 4) Ausstattung (10 %): Komfort bleibt bewusst gedeckelt und kann eine
  // schwache Bausubstanz nicht überkompensieren.
  const features = new Set((Array.isArray(input.features) ? input.features : []).map((item) => item.toLowerCase()));
  const has = (...terms: string[]) => [...features].some((x) => terms.some((term) => x.includes(term)));
  let equipmentPoints = 20;
  if (has('balkon', 'terrasse', 'garten')) equipmentPoints += 20;
  if (has('lift')) equipmentPoints += 15;
  if (has('keller', 'reduit')) equipmentPoints += 10;
  if (has('waschmaschine')) equipmentPoints += 10;
  if (has('tumbler')) equipmentPoints += 7;
  if (has('minergie', 'energie')) equipmentPoints += 12;
  if (has('aussicht')) equipmentPoints += 4;
  if (has('whirlpool', 'pool', 'sauna')) equipmentPoints += 4;
  const equipmentScore = clamp(equipmentPoints);

  // 5) Badezimmer (7 %): relative Funktionalität zur Zimmerzahl.
  const bathrooms = Math.max(0, input.bathrooms || 0);
  let bathroomScore = 25;
  if (rooms <= 2.5) bathroomScore = bathrooms >= 1 ? 90 : 25;
  else if (rooms <= 3.5) bathroomScore = bathrooms >= 2 ? 100 : bathrooms === 1 ? 70 : 20;
  else if (rooms <= 4.5) bathroomScore = bathrooms >= 2 ? 100 : bathrooms === 1 ? 65 : 20;
  else bathroomScore = bathrooms >= 2 ? 100 : bathrooms === 1 ? 50 : 15;

  // 6) Parkierung (8 %): reine Objekteigenschaft. Solange HomeIQ nicht
  // zwischen Aussenparkplatz und Garage unterscheidet: 0 / 1 / >=2.
  const parkingScore = input.parkingSpaces >= 2 ? 100 : input.parkingSpaces === 1 ? 80 : 30;

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
