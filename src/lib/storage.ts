import type { AnalysisInput, RentalUnit, ConditionLevel, QualityLevel, PropertyType } from "../types";

const KEY = "homeiq-analyses-v1";

const validPropertyTypes = new Set<PropertyType>(["wohnung", "efh", "doppelhaus", "reihenhaus", "mfh"]);
const validConditions = new Set<ConditionLevel>(["sanierungsbeduerftig", "renovationsbeduerftig", "gepflegt", "modernisiert", "neuwertig"]);
const validQualities = new Set<QualityLevel>(["einfach", "durchschnittlich", "gehoben", "luxus"]);
const num = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const str = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const arr = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];

const defaultLocation = {
  publicTransportMinutes: 0, shoppingMinutes: 0, schoolMinutes: 0, motorwayMinutes: 0,
  noiseLevel: 50, municipalityDemand: 50, vacancyRisk: 50, microLocation: 50,
};

const normalizeUnit = (unit: Partial<RentalUnit> | null | undefined, index: number): RentalUnit => ({
  id: str(unit?.id) || `unit-${index + 1}-${Date.now()}`,
  label: str(unit?.label) || `Wohnung ${index + 1}`,
  rooms: num(unit?.rooms), livingArea: num(unit?.livingArea), floor: str(unit?.floor, "1. OG"),
  condition: validConditions.has(unit?.condition as ConditionLevel) ? unit?.condition as ConditionLevel : "gepflegt",
  quality: validQualities.has(unit?.quality as QualityLevel) ? unit?.quality as QualityLevel : "durchschnittlich",
  currentMonthlyRent: num(unit?.currentMonthlyRent), marketRentPerSqm: num(unit?.marketRentPerSqm),
  parkingMonthlyRent: num(unit?.parkingMonthlyRent), features: arr(unit?.features),
});

const normalize = (raw: unknown): AnalysisInput | null => {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, any>;
  const createdAt = str(item.createdAt) || new Date().toISOString();
  const locationRaw = item.location && typeof item.location === "object" ? item.location : {};
  const propertyType = validPropertyTypes.has(item.propertyType as PropertyType) ? item.propertyType as PropertyType : "wohnung";
  const condition = validConditions.has(item.condition as ConditionLevel) ? item.condition as ConditionLevel : "gepflegt";
  const quality = validQualities.has(item.quality as QualityLevel) ? item.quality as QualityLevel : "durchschnittlich";
  return {
    id: str(item.id) || `analysis-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, createdAt, propertyType,
    title: str(item.title, "Unbenannte Analyse"), street: str(item.street), postalCode: str(item.postalCode), city: str(item.city),
    purchasePrice: num(item.purchasePrice), ancillaryCosts: num(item.ancillaryCosts), equity: num(item.equity),
    interestRate: num(item.interestRate), amortizationRate: num(item.amortizationRate), monthlyRent: num(item.monthlyRent),
    parkingMonthlyRent: num(item.parkingMonthlyRent), annualOperatingCosts: num(item.annualOperatingCosts), annualMaintenance: num(item.annualMaintenance),
    livingArea: num(item.livingArea), landArea: num(item.landArea), yearBuilt: num(item.yearBuilt), renovatedYear: num(item.renovatedYear),
    rooms: num(item.rooms), bathrooms: num(item.bathrooms), floor: str(item.floor, "EG"), locationScore: num(item.locationScore, 50),
    location: {
      publicTransportMinutes: num(locationRaw.publicTransportMinutes), shoppingMinutes: num(locationRaw.shoppingMinutes),
      schoolMinutes: num(locationRaw.schoolMinutes), motorwayMinutes: num(locationRaw.motorwayMinutes), noiseLevel: num(locationRaw.noiseLevel, 50),
      municipalityDemand: num(locationRaw.municipalityDemand, 50), vacancyRisk: num(locationRaw.vacancyRisk, 50), microLocation: num(locationRaw.microLocation, 50),
    },
    condition, quality, features: arr(item.features), parkingSpaces: num(item.parkingSpaces),
    // Alte Versionen enthielten hier Default-Benchmarks. Fehlende Werte werden ab V4.3 bewusst als 0 normalisiert.
    regionalMarketPricePerSqm: num(item.regionalMarketPricePerSqm), regionalMarketRentPerSqm: num(item.regionalMarketRentPerSqm),
    marketDataRadiusKm: num(item.marketDataRadiusKm),
    rentalUnits: Array.isArray(item.rentalUnits) ? item.rentalUnits.map(normalizeUnit) : [],
    openDataLocation: item.openDataLocation && typeof item.openDataLocation === "object" ? item.openDataLocation : null,
  };
};

export const loadAnalyses = (): AnalysisInput[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((item): item is AnalysisInput => item !== null);
  } catch {
    return [];
  }
};
export const saveAnalysis = (analysis: AnalysisInput) => { const items = loadAnalyses().filter((item) => item.id !== analysis.id); localStorage.setItem(KEY, JSON.stringify([analysis, ...items])); };
export const deleteAnalysis = (id: string) => { localStorage.setItem(KEY, JSON.stringify(loadAnalyses().filter((item) => item.id !== id))); };
export const findAnalysis = (id: string) => loadAnalyses().find((item) => item.id === id);
