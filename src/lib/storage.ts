import type { AnalysisInput, RentalUnit } from "../types";
const KEY = "homeiq-analyses-v1";
const defaults: Partial<AnalysisInput> = {
  location: { publicTransportMinutes: 6, shoppingMinutes: 8, schoolMinutes: 10, motorwayMinutes: 12, noiseLevel: 25, municipalityDemand: 70, vacancyRisk: 20, microLocation: 70 },
  condition: "gepflegt",
  quality: "durchschnittlich",
  regionalMarketPricePerSqm: 7000,
  regionalMarketRentPerSqm: 24,
  marketDataRadiusKm: 5,
  rentalUnits: [],
};
const normalizeUnit = (unit: Partial<RentalUnit>, index: number): RentalUnit => ({
  id: unit.id || crypto.randomUUID(),
  label: unit.label || `Wohnung ${index + 1}`,
  rooms: Number(unit.rooms) || 0,
  livingArea: Number(unit.livingArea) || 0,
  floor: unit.floor || "1. OG",
  condition: unit.condition || "gepflegt",
  quality: unit.quality || "durchschnittlich",
  currentMonthlyRent: Number(unit.currentMonthlyRent) || 0,
  marketRentPerSqm: Number(unit.marketRentPerSqm) || 0,
  parkingMonthlyRent: Number(unit.parkingMonthlyRent) || 0,
  features: Array.isArray(unit.features) ? unit.features : [],
});
const normalize = (item: any): AnalysisInput => ({
  ...defaults,
  ...item,
  location: { ...(defaults.location as object), ...(item.location || {}) },
  rentalUnits: Array.isArray(item.rentalUnits) ? item.rentalUnits.map(normalizeUnit) : [],
}) as AnalysisInput;
export const loadAnalyses = (): AnalysisInput[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]").map(normalize); } catch { return []; } };
export const saveAnalysis = (analysis: AnalysisInput) => { const items = loadAnalyses().filter((item) => item.id !== analysis.id); localStorage.setItem(KEY, JSON.stringify([analysis, ...items])); };
export const deleteAnalysis = (id: string) => { localStorage.setItem(KEY, JSON.stringify(loadAnalyses().filter((item) => item.id !== id))); };
export const findAnalysis = (id: string) => loadAnalyses().find((item) => item.id === id);
