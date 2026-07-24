export type PropertyType = "wohnung" | "efh" | "doppelhaus" | "reihenhaus" | "mfh";

export type QualityLevel = "einfach" | "durchschnittlich" | "gehoben" | "luxus";
export type ConditionLevel = "sanierungsbeduerftig" | "renovationsbeduerftig" | "gepflegt" | "modernisiert" | "neuwertig";

export type RentalUnit = {
  id: string;
  label: string;
  rooms: number;
  livingArea: number;
  floor: string;
  condition: ConditionLevel;
  quality: QualityLevel;
  currentMonthlyRent: number;
  marketRentPerSqm: number;
  parkingMonthlyRent: number;
  features: string[];
};

export type LocationInputs = {
  publicTransportMinutes: number;
  shoppingMinutes: number;
  schoolMinutes: number;
  motorwayMinutes: number;
  noiseLevel: number;
  municipalityDemand: number;
  vacancyRisk: number;
  microLocation: number;
};

export type AnalysisInput = {
  id: string;
  createdAt: string;
  propertyType: PropertyType;
  title: string;
  street: string;
  postalCode: string;
  city: string;
  purchasePrice: number;
  ancillaryCosts: number;
  equity: number;
  interestRate: number;
  amortizationRate: number;
  monthlyRent: number;
  annualOperatingCosts: number;
  annualMaintenance: number;
  livingArea: number;
  landArea: number;
  yearBuilt: number;
  renovatedYear: number;
  rooms: number;
  bathrooms: number;
  floor: string;
  locationScore: number;
  location: LocationInputs;
  condition: ConditionLevel;
  quality: QualityLevel;
  features: string[];
  parkingSpaces: number;
  regionalMarketPricePerSqm: number;
  regionalMarketRentPerSqm: number;
  marketDataRadiusKm: number;
  rentalUnits: RentalUnit[];
};

export type ScoreBreakdown = {
  netYield: number;
  equityReturn: number;
  location: number;
  condition: number;
  features: number;
};

export type LocationFactor = { label: string; score: number; detail: string };
export type LocationAnalysis = {
  score: number;
  rating: string;
  factors: LocationFactor[];
  strengths: string[];
  risks: string[];
};

export type UnitMarketRentResult = RentalUnit & {
  adjustedMarketRentPerSqm: number;
  estimatedMonthlyMarketRent: number;
  differenceMonthly: number;
  differencePercent: number;
};

export type MarketAnalysis = {
  benchmarkPricePerSqm: number;
  adjustedPricePerSqm: number;
  estimatedMarketValue: number;
  marketValueLow: number;
  marketValueHigh: number;
  priceDifference: number;
  priceDifferencePercent: number;
  priceRating: string;
  benchmarkRentPerSqm: number;
  estimatedMonthlyMarketRent: number;
  currentMonthlyRent: number;
  rentDifferenceMonthly: number;
  rentDifferencePercent: number;
  rentRating: string;
  confidence: "hoch" | "mittel" | "niedrig";
  units: UnitMarketRentResult[];
};

export type AnalysisResult = {
  input: AnalysisInput;
  totalInvestment: number;
  mortgage: number;
  annualRent: number;
  grossYield: number;
  netYield: number;
  annualInterest: number;
  annualAmortization: number;
  annualCashflow: number;
  monthlyCashflow: number;
  equityReturn: number;
  ltv: number;
  pricePerSqm: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  rating: string;
  recommendation: string;
  positives: string[];
  negatives: string[];
  locationAnalysis: LocationAnalysis;
  marketAnalysis: MarketAnalysis;
};
