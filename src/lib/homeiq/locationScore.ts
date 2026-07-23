import {
  LOCATION_WEIGHTS,
  NOISE_HIGHWAY_THRESHOLDS,
  NOISE_RAILWAY_THRESHOLDS,
  PRICE_RATIO_THRESHOLDS,
  pickScore,
  vacancyTier,
} from "./config";
import type {
  LocationData,
  LocationScoreDetail,
  LocationSubscores,
  VacancyRisk,
} from "./types";

const TRANSPORT_STOP_THRESHOLDS: { max: number; score: number }[] = [
  { max: 200, score: 100 },
  { max: 400, score: 85 },
  { max: 700, score: 65 },
  { max: 1200, score: 45 },
  { max: Infinity, score: 25 },
];

const DISTANCE_THRESHOLDS: { max: number; score: number }[] = [
  { max: 300, score: 100 },
  { max: 600, score: 85 },
  { max: 1000, score: 65 },
  { max: 2000, score: 45 },
  { max: Infinity, score: 25 },
];

const POP_GROWTH_THRESHOLDS: { min: number; score: number }[] = [
  { min: 1.5, score: 100 },
  { min: 0.5, score: 80 },
  { min: -0.5, score: 55 },
  { min: -1.5, score: 35 },
  { min: -Infinity, score: 15 },
];

const TAX_INDEX_THRESHOLDS: { max: number; score: number }[] = [
  { max: 75, score: 100 },
  { max: 90, score: 85 },
  { max: 105, score: 65 },
  { max: 120, score: 45 },
  { max: Infinity, score: 25 },
];

function scoreVacancy(pct: number | undefined): { score: number | null; risk: VacancyRisk } {
  if (typeof pct !== "number") return { score: null, risk: "unbekannt" };
  const tier = vacancyTier(pct);
  return { score: tier.score, risk: tier.risk };
}

function scoreDistance(
  meters: number | undefined,
  ths: { max: number; score: number }[],
): number | null {
  if (typeof meters !== "number") return null;
  return pickScore(ths, meters);
}

function scoreNoise(loc: LocationData): { score: number | null; label: string } {
  const highwayD = loc.nearestMotorwayMeters ?? loc.nearestMajorRoadMeters;
  const railD = loc.nearestRailwayMeters;
  if (typeof highwayD !== "number" && typeof railD !== "number") {
    return { score: null, label: "Lärmdaten nicht verfügbar" };
  }
  const highwayScore =
    typeof highwayD === "number" ? pickScore(NOISE_HIGHWAY_THRESHOLDS, highwayD) : 100;
  const railScore =
    typeof railD === "number" ? pickScore(NOISE_RAILWAY_THRESHOLDS, railD) : 100;
  const s = Math.min(highwayScore, railScore);
  const parts: string[] = [];
  if (typeof highwayD === "number") parts.push(`Hauptstrasse/Autobahn ${highwayD} m`);
  if (typeof railD === "number") parts.push(`Bahnlinie ${railD} m`);
  return { score: s, label: `Distanz: ${parts.join(", ")}` };
}

function scorePriceTrend(
  loc: LocationData,
  pricePerSqm: number,
): { score: number | null; label: string } {
  if (!loc.refPricePerSqm || pricePerSqm <= 0) {
    return { score: null, label: "Regionaler Preisvergleich nicht verfügbar" };
  }
  const ratio = pricePerSqm / loc.refPricePerSqm;
  let picked = PRICE_RATIO_THRESHOLDS[PRICE_RATIO_THRESHOLDS.length - 1];
  for (const t of PRICE_RATIO_THRESHOLDS) {
    if (ratio <= t.max) { picked = t; break; }
  }
  const src = loc.refPriceSource ? ` (${loc.refPriceSource})` : "";
  return {
    score: picked.score,
    label: `Objekt CHF ${Math.round(pricePerSqm).toLocaleString("de-CH")}/m² vs. Referenz CHF ${Math.round(loc.refPricePerSqm).toLocaleString("de-CH")}/m² → ${picked.label}${src}`,
  };
}

export function computeLocationScore(
  loc: LocationData | undefined,
  pricePerSqm: number = 0,
): LocationScoreDetail {
  const explanations: Record<keyof LocationSubscores, string> = {
    vacancy: "",
    transport: "",
    shopping: "",
    schools: "",
    population: "",
    priceTrend: "",
    tax: "",
    noise: "",
  };

  if (!loc || loc.geocodingFailed) {
    return {
      score: 50,
      vacancyRisk: "unbekannt",
      subscores: {
        vacancy: null, transport: null, shopping: null, schools: null,
        population: null, priceTrend: null, tax: null, noise: null,
      },
      effectiveWeights: {
        vacancy: 0, transport: 0, shopping: 0, schools: 0,
        population: 0, priceTrend: 0, tax: 0, noise: 0,
      },
      explanations: {
        vacancy: "Keine Adressdaten — neutrale Bewertung (50).",
        transport: "", shopping: "", schools: "", population: "",
        priceTrend: "", tax: "", noise: "",
      },
      unavailable: [
        "Leerstand", "ÖV", "Einkaufen", "Schulen",
        "Bevölkerung", "Preisentwicklung", "Steuern", "Lärm",
      ],
    };
  }

  const vacancy = scoreVacancy(loc.vacancyPct);
  const transport = scoreDistance(
    loc.nearestStopMeters ?? loc.nearestStationMeters,
    TRANSPORT_STOP_THRESHOLDS,
  );
  const shopping = scoreDistance(loc.supermarketMeters, DISTANCE_THRESHOLDS);
  const schools = scoreDistance(loc.schoolMeters, DISTANCE_THRESHOLDS);
  const population = typeof loc.populationGrowthPct === "number"
    ? pickScore(POP_GROWTH_THRESHOLDS, loc.populationGrowthPct)
    : null;
  const tax = typeof loc.taxIndex === "number" ? pickScore(TAX_INDEX_THRESHOLDS, loc.taxIndex) : null;
  const priceTrendRes = scorePriceTrend(loc, pricePerSqm);
  const noiseRes = scoreNoise(loc);

  const subscores: LocationSubscores = {
    vacancy: vacancy.score,
    transport,
    shopping,
    schools,
    population,
    priceTrend: priceTrendRes.score,
    tax,
    noise: noiseRes.score,
  };

  explanations.vacancy = vacancy.score !== null
    ? `Leerstandsziffer ${loc.vacancyPct?.toFixed(2)} % (${loc.vacancyYear ?? "aktuell"}) → ${vacancyTier(loc.vacancyPct!).label}`
    : "Leerstandsdaten nicht verfügbar";
  explanations.population = population !== null
    ? `Bev.-Wachstum ${loc.populationGrowthPct?.toFixed(1)} % p.a.`
    : "Bevölkerungsdaten nicht verfügbar";
  explanations.tax = tax !== null
    ? `Steuerindex ${loc.taxIndex?.toFixed(0)} (CH = 100)`
    : "Steuerdaten nicht verfügbar";
  explanations.transport = transport !== null
    ? `Nächste ÖV-Haltestelle ${loc.nearestStopMeters ?? loc.nearestStationMeters} m`
    : "ÖV-Distanz nicht verfügbar";
  explanations.shopping = shopping !== null
    ? `Supermarkt in ${loc.supermarketMeters} m`
    : "Einkaufs-Distanz nicht verfügbar";
  explanations.schools = schools !== null
    ? `Schule in ${loc.schoolMeters} m`
    : "Schul-Distanz nicht verfügbar";
  explanations.priceTrend = priceTrendRes.label;
  explanations.noise = noiseRes.label;

  const rawWeights: Record<keyof LocationSubscores, number> = {
    vacancy: subscores.vacancy !== null ? LOCATION_WEIGHTS.vacancy : 0,
    transport: subscores.transport !== null ? LOCATION_WEIGHTS.transport : 0,
    shopping: subscores.shopping !== null ? LOCATION_WEIGHTS.shopping : 0,
    schools: subscores.schools !== null ? LOCATION_WEIGHTS.schools : 0,
    population: subscores.population !== null ? LOCATION_WEIGHTS.population : 0,
    priceTrend: subscores.priceTrend !== null ? LOCATION_WEIGHTS.priceTrend : 0,
    tax: subscores.tax !== null ? LOCATION_WEIGHTS.tax : 0,
    noise: subscores.noise !== null ? LOCATION_WEIGHTS.noise : 0,
  };
  const sum = Object.values(rawWeights).reduce((s, v) => s + v, 0);
  const eff = (k: keyof LocationSubscores) => (sum > 0 ? rawWeights[k] / sum : 0);
  const effectiveWeights: LocationSubscores = {
    vacancy: eff("vacancy"), transport: eff("transport"), shopping: eff("shopping"),
    schools: eff("schools"), population: eff("population"), priceTrend: eff("priceTrend"),
    tax: eff("tax"), noise: eff("noise"),
  };

  const weighted =
    (subscores.vacancy ?? 0) * (effectiveWeights.vacancy ?? 0) +
    (subscores.transport ?? 0) * (effectiveWeights.transport ?? 0) +
    (subscores.shopping ?? 0) * (effectiveWeights.shopping ?? 0) +
    (subscores.schools ?? 0) * (effectiveWeights.schools ?? 0) +
    (subscores.population ?? 0) * (effectiveWeights.population ?? 0) +
    (subscores.priceTrend ?? 0) * (effectiveWeights.priceTrend ?? 0) +
    (subscores.tax ?? 0) * (effectiveWeights.tax ?? 0) +
    (subscores.noise ?? 0) * (effectiveWeights.noise ?? 0);

  const score = sum > 0 ? Math.round(weighted) : 50;

  const unavailable: string[] = [];
  if (subscores.vacancy === null) unavailable.push("Leerstand");
  if (subscores.transport === null) unavailable.push("ÖV");
  if (subscores.shopping === null) unavailable.push("Einkaufen");
  if (subscores.schools === null) unavailable.push("Schulen");
  if (subscores.population === null) unavailable.push("Bevölkerung");
  if (subscores.priceTrend === null) unavailable.push("Preisentwicklung");
  if (subscores.tax === null) unavailable.push("Steuern");
  if (subscores.noise === null) unavailable.push("Lärm");

  return {
    score,
    vacancyRisk: vacancy.risk,
    subscores,
    effectiveWeights,
    explanations,
    unavailable,
  };
}
