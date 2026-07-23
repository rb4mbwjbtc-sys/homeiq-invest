export type ObjectType =
  | "eigentumswohnung"
  | "einfamilienhaus"
  | "doppelhaus"
  | "reihenhaus"
  | "mfh";

export const OBJECT_TYPES: { value: ObjectType; label: string }[] = [
  { value: "eigentumswohnung", label: "Eigentumswohnung" },
  { value: "einfamilienhaus", label: "Einfamilienhaus" },
  { value: "doppelhaus", label: "Doppelhaushälfte" },
  { value: "reihenhaus", label: "Reihenhaus" },
  { value: "mfh", label: "Mehrfamilienhaus" },
];

// Zimmer-Dropdown: 1 bis 10 in 0.5-Schritten, "10+" als 10
export const ROOM_OPTIONS = [
  1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
] as const;

// Badezimmer: 0..5 + 6+
export const BATHROOM_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const;

export type FloorCode =
  | "UG"
  | "EG"
  | "OG1"
  | "OG2"
  | "OG3"
  | "OG4"
  | "OG5"
  | "OG6"
  | "OG7"
  | "OG8"
  | "OG9"
  | "OG10P"
  | "DG"
  | "ATTIKA"
  | "MAISONETTE";

export const FLOOR_OPTIONS: { value: FloorCode; label: string; num: number }[] = [
  { value: "UG", label: "Untergeschoss (UG)", num: -1 },
  { value: "EG", label: "Erdgeschoss (EG)", num: 0 },
  { value: "OG1", label: "1. OG", num: 1 },
  { value: "OG2", label: "2. OG", num: 2 },
  { value: "OG3", label: "3. OG", num: 3 },
  { value: "OG4", label: "4. OG", num: 4 },
  { value: "OG5", label: "5. OG", num: 5 },
  { value: "OG6", label: "6. OG", num: 6 },
  { value: "OG7", label: "7. OG", num: 7 },
  { value: "OG8", label: "8. OG", num: 8 },
  { value: "OG9", label: "9. OG", num: 9 },
  { value: "OG10P", label: "10. OG oder höher", num: 10 },
  { value: "DG", label: "Dachgeschoss (DG)", num: 8 },
  { value: "ATTIKA", label: "Attika", num: 9 },
  { value: "MAISONETTE", label: "Maisonette", num: 3 },
];

export interface Features {
  balcony: boolean;
  terrace: boolean;
  garden: boolean;
  cellar: boolean;
  storage: boolean;
  elevator: boolean;
  pool: boolean;
  whirlpool: boolean;
  sauna: boolean;
  washingMachine: boolean;
  tumbler: boolean;
  garage: number;
  doubleGarage: number;
  undergroundParking: number;
  outdoorParking: number;
  carport: number;
}

export interface LocationData {
  address: {
    zip: string;
    city: string;
    street?: string;
    houseNumber?: string;
  };
  latitude?: number;
  longitude?: number;
  gemeinde?: string;
  kanton?: string;
  bfsNr?: number;
  vacancyPct?: number;
  vacancyYear?: number;
  taxIndex?: number;
  population?: number;
  populationGrowthPct?: number;
  nearestStopMeters?: number;
  nearestStopName?: string;
  nearestStationMeters?: number;
  nearestStationName?: string;
  supermarketMeters?: number;
  schoolMeters?: number;
  nearestMotorwayMeters?: number;
  nearestMajorRoadMeters?: number;
  nearestRailwayMeters?: number;
  refPricePerSqm?: number;
  refPriceSource?: string;
  unavailable: string[];
  geocodingFailed?: boolean;
  fetchedAt?: string;
}

// Einzelne Wohneinheit in einem Mehrfamilienhaus
export interface MfhUnit {
  id: string;
  label: string;
  rooms?: number;
  area?: number;
  bathrooms?: number;
  monthlyRent?: number;
  vacant?: boolean;
  floor?: FloorCode;
  parkingLabel?: string;
}

export type CommercialUsage =
  | "buero"
  | "verkauf"
  | "gastronomie"
  | "praxis"
  | "lager"
  | "sonstiges";

export const COMMERCIAL_USAGE_OPTIONS: { value: CommercialUsage; label: string }[] = [
  { value: "buero", label: "Büro" },
  { value: "verkauf", label: "Verkauf" },
  { value: "gastronomie", label: "Gastronomie" },
  { value: "praxis", label: "Praxis" },
  { value: "lager", label: "Lager" },
  { value: "sonstiges", label: "Sonstiges" },
];

// Einzelne Gewerbeeinheit in einem Mehrfamilienhaus
export interface MfhCommercialUnit {
  id: string;
  label: string;
  area?: number;
  monthlyRent?: number;
  floor?: FloorCode;
  vacant?: boolean;
  usage?: CommercialUsage;
}

export interface AnalysisInputs {
  objectType: ObjectType;
  name: string;
  purchasePrice: number;
  livingArea: number;
  rooms: number;
  bathrooms: number;
  yearBuilt: number;
  zip: string;
  city: string;
  street?: string;
  houseNumber?: string;

  landArea?: number;
  lastRenovation?: number;
  note?: string;
  floor?: FloorCode;
  totalFloors?: number;
  hasElevator?: boolean;
  features: Features;
  balconyArea?: number;
  terraceArea?: number;
  gardenArea?: number;
  equity: number;
  interestRate: number;
  mortgage?: number;
  amortization?: number;
  purchaseCosts?: number;
  renovationCosts?: number;
  maintenance?: number;
  management?: number;
  renewalFund?: number;
  monthlyRent: number;
  /** @deprecated Legacy – ersetzt durch garageRentPerUnit × Anzahl */
  garageRent?: number;
  /** @deprecated Legacy – ersetzt durch undergroundRentPerUnit × Anzahl */
  undergroundRent?: number;
  /** @deprecated Legacy – ersetzt durch outdoorRentPerUnit × Anzahl */
  outdoorRent?: number;
  otherIncome?: number;
  // Miete pro Parkeinheit / Monat (für alle Objekttypen)
  garageRentPerUnit?: number;
  undergroundRentPerUnit?: number;
  outdoorRentPerUnit?: number;
  carportRentPerUnit?: number;
  // MFH-spezifisch
  mfhUnits?: MfhUnit[];
  mfhCommercialUnits?: MfhCommercialUnit[];
  /** @deprecated Ersetzt durch mfhCommercialUnits.length */
  commercialUnits?: number;
  /** @deprecated Ersetzt durch Summe der Nettomieten belegter Gewerbeeinheiten */
  commercialRent?: number;
  storageRent?: number;
  location?: LocationData;
  premiumInsights?: PremiumInsights;
}

export interface PremiumInsights {
  marketRent?: {
    estimatedRent: number;
    low: number;
    high: number;
    reasoning: string;
    dataQuality?: "hoch" | "mittel" | "tief";
    comparableCount?: number;
    radiusKm?: number;
    sources?: string[];
    generatedAt?: string;
  };
  purchasePrice?: {
    /** @deprecated Wird nicht mehr vom AI geliefert; ausschliesslich Nutzereingabe */
    askingPrice?: number;
    marketValue: number;
    low?: number;
    high?: number;
    attractivePrice: number;
    veryAttractivePrice: number;
    reasoning: string;
    dataQuality?: "hoch" | "mittel" | "tief";
    comparableCount?: number;
    radiusKm?: number;
    sources?: string[];
    generatedAt?: string;
  };
}

export type Category =
  | "attraktiv"
  | "solide"
  | "neutral"
  | "kritisch"
  | "unattraktiv";

export type VacancyRisk =
  | "sehr_tief"
  | "tief"
  | "durchschnittlich"
  | "erhöht"
  | "hoch"
  | "unbekannt";

export interface LocationSubscores {
  vacancy: number | null;
  transport: number | null;
  shopping: number | null;
  schools: number | null;
  population: number | null;
  priceTrend: number | null;
  tax: number | null;
  noise: number | null;
}

export interface LocationScoreDetail {
  score: number;
  vacancyRisk: VacancyRisk;
  subscores: LocationSubscores;
  effectiveWeights: LocationSubscores;
  explanations: Record<keyof LocationSubscores, string>;
  unavailable: string[];
}

export interface AnalysisResult {
  grossAnnualRent: number;
  effectiveRent: number;
  grossYield: number;
  investment: number;
  operatingCosts: number;
  netIncomeBeforeFinancing: number;
  netYield: number;
  mortgage: number;
  interestCost: number;
  annualCashflow: number;
  monthlyCashflow: number;
  equityReturn: number;
  pricePerSqm: number;
  ltv: number;
  vacancyAssumptionPct: number;
  score: number;
  category: Category;
  categoryLabel: string;
  subscores: {
    yield: number;
    equityReturn: number;
    location: number;
    condition: number;
    features: number;
  };
  subscoreReasons: {
    yield: string;
    equityReturn: string;
    location: string;
    condition: string;
    features: string;
  };
  strengths: string[];
  risks: string[];
  verdict: string;
  verdictStructured: {
    overall: string;
    positives: string[];
    negatives: string[];
    recommendation: RecommendationKey;
    recommendationLabel: string;
    recommendationReason: string;
  };
  dataQuality: "hoch" | "mittel" | "niedrig";
  dataQualityMissing: string[];
  locationDetail: LocationScoreDetail;
}

export type RecommendationKey =
  | "kauf_empfehlenswert"
  | "kauf_interessant_nach_verhandlung"
  | "bedingt_geeignet"
  | "nicht_empfehlenswert";

export interface StoredAnalysis {
  id: string;
  name: string;
  inputs: AnalysisInputs;
  result: AnalysisResult;
  createdAt: string;
  updatedAt: string;
}

export function emptyFeatures(): Features {
  return {
    balcony: false,
    terrace: false,
    garden: false,
    cellar: false,
    storage: false,
    elevator: false,
    pool: false,
    whirlpool: false,
    sauna: false,
    washingMachine: false,
    tumbler: false,
    garage: 0,
    doubleGarage: 0,
    undergroundParking: 0,
    outdoorParking: 0,
    carport: 0,
  };
}

export function emptyInputs(): AnalysisInputs {
  return {
    objectType: "eigentumswohnung",
    name: "",
    purchasePrice: 0,
    livingArea: 0,
    rooms: 3.5,
    bathrooms: 1,
    yearBuilt: new Date().getFullYear(),
    zip: "",
    city: "",
    features: emptyFeatures(),
    equity: 0,
    interestRate: 1.5,
    monthlyRent: 0,
  };
}
