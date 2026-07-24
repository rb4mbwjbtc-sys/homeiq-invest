export type PropertyType = "wohnung" | "efh" | "doppelhaus" | "reihenhaus" | "mfh";

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
  features: string[];
  parkingSpaces: number;
};

export type ScoreBreakdown = {
  netYield: number;
  equityReturn: number;
  location: number;
  condition: number;
  features: number;
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
};
