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


export type OpenDataSource = { name: string; detail: string };

export type DataSourceTierStatus = {
  tier: 1 | 2 | 3;
  name: string;
  status: "verwendet" | "gefunden" | "nicht_verfuegbar" | "vorbereitet";
  detail: string;
};

export type OpenDataMarketReport = {
  pricePerSqm: number | null;
  rentPerSqm: number | null;
  priceSource: string | null;
  rentSource: string | null;
  confidence: "hoch" | "mittel" | "eingeschränkt";
  radiusKm: number | null;
  discoveredDatasets: Array<{ title: string; publisher: string; url: string; kind: "price" | "rent" | "other" }>;
  tiers: DataSourceTierStatus[];
  note: string;
};

export type OpenDataDiagnostic = {
  name: string;
  source: string;
  status: "loaded" | "not_found" | "timeout" | "error";
  durationMs: number;
  detail?: string;
};

export type OpenDataLocationReport = {
  address: {
    formatted: string;
    lat: number;
    lon: number;
    easting: number;
    northing: number;
  };
  building: {
    egid: string | number | null;
    buildingCategory: string | null;
    constructionYear: number | null;
    municipality: string | null;
    municipalityBfs: string | null;
    sourceUpdatedAt: string | null;
  } | null;
  evidence: {
    transitClass: string | null;
    vacancyRate: number | null;
    vacancyYear: string | null;
    roadNoiseDb: number | null;
    railNoiseDb: number | null;
    roadNoiseDayDb?: number | null;
    roadNoiseNightDb?: number | null;
    railNoiseDayDb?: number | null;
    railNoiseNightDb?: number | null;
    roadNoiseDistanceMeters?: number | null;
    railNoiseDistanceMeters?: number | null;
    noiseImpactPercent?: number | null;
    noiseStrongestType?: string | null;
    noiseStrongestPeriod?: string | null;
    roadNoiseImpactPercent?: number | null;
    railNoiseImpactPercent?: number | null;
    roadNoiseSource?: string | null;
    railNoiseSource?: string | null;
    roadNoiseMethod?: string | null;
    railNoiseMethod?: string | null;
    nearestPublicTransportMeters: number | null;
    nearestShoppingMeters: number | null;
    nearestSchoolMeters: number | null;
    nearestMotorwayJunctionMeters: number | null;
    searchRadiusKm?: number;
    categoryRadiusKm?: {
      transit: number | null;
      shopping: number | null;
      school: number | null;
      motorway: number | null;
    };
    educationSource?: string | null;
    shoppingSource?: string | null;
    motorwaySource?: string | null;
    noiseSource?: string | null;
    vacancySource?: string | null;
  };
  quality: "hoch" | "mittel" | "eingeschränkt";
  missing: string[];
  loadedAt: string;
  sources: OpenDataSource[];
  diagnostics?: OpenDataDiagnostic[];
  market: OpenDataMarketReport;
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
  parkingMonthlyRent: number;
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
  openDataLocation?: OpenDataLocationReport | null;
};

export type ScoreBreakdown = {
  netYield: number;
  equityReturn: number;
  location: number;
  objectQuality: number;
  marketability: number;
};

export type LocationFactor = { label: string; score: number; detail: string };
export type LocationAnalysis = {
  score: number;
  rating: string;
  factors: LocationFactor[];
  strengths: string[];
  risks: string[];
  dataCoverage: number;
  availableFactors: number;
  totalFactors: number;
};

export type UnitMarketRentResult = RentalUnit & {
  adjustedMarketRentPerSqm: number;
  estimatedMonthlyMarketRent: number;
  differenceMonthly: number;
  differencePercent: number;
};

export type MarketAnalysis = {
  marketValueAvailable: boolean;
  marketRentAvailable: boolean;
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
