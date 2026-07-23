import { computeMetrics, type CoreMetrics } from "./calc";
import {
  CATEGORY_THRESHOLDS,
  CONDITION_THRESHOLDS,
  EQUITY_RETURN_THRESHOLDS,
  SCORE_WEIGHTS,
  WASHING_POINTS,
  YIELD_THRESHOLDS,
  pickScore,
} from "./config";
import { computeLocationScore } from "./locationScore";
import {
  FLOOR_OPTIONS,
  type AnalysisInputs,
  type AnalysisResult,
  type Category,
  type ObjectType,
  type RecommendationKey,
} from "./types";

function washingBucket(t: ObjectType): "apartment" | "house" | "mfh" {
  if (t === "eigentumswohnung") return "apartment";
  if (t === "mfh") return "mfh";
  return "house";
}

function conditionScore(i: AnalysisInputs): number {
  const currentYear = new Date().getFullYear();
  const buildAge = currentYear - (i.yearBuilt || currentYear);
  const renoAge = i.lastRenovation ? currentYear - i.lastRenovation : Infinity;
  const effectiveAge = Math.min(buildAge, renoAge);
  let s = pickScore(CONDITION_THRESHOLDS, effectiveAge);
  if (!i.lastRenovation && buildAge > 30) s = Math.max(10, s - 15);
  const price = i.purchasePrice || 1;
  if ((i.renovationCosts ?? 0) / price > 0.15) s = Math.max(10, s - 10);
  return s;
}

function featuresScore(i: AnalysisInputs): { score: number; reason: string } {
  const f = i.features;
  const parts: string[] = [];

  let outdoor = 0;
  if (f.garden) { outdoor = 25; parts.push("Garten"); }
  else if (f.terrace) { outdoor = 20; parts.push("Terrasse"); }
  else if (f.balcony) { outdoor = 14; parts.push("Balkon"); }

  let parking =
    Math.min(f.doubleGarage, 2) * 20 +
    Math.min(f.garage, 2) * 14 +
    Math.min(f.undergroundParking, 3) * 12 +
    Math.min(f.carport, 2) * 10 +
    Math.min(f.outdoorParking, 3) * 6;
  parking = Math.min(28, parking);
  if (f.garage + f.doubleGarage + f.undergroundParking + f.carport + f.outdoorParking > 0)
    parts.push("Parkplatz");

  let extras = 0;
  const floorNum = i.floor
    ? (FLOOR_OPTIONS.find((o) => o.value === i.floor)?.num ?? 0)
    : 0;
  const liftRelevant = i.objectType === "eigentumswohnung" && floorNum >= 2;
  if (f.elevator) { extras += liftRelevant ? 14 : 6; parts.push("Lift"); }
  if (f.cellar) extras += 5;
  if (f.storage) extras += 4;
  extras = Math.min(22, extras);

  let luxury = 0;
  if (f.pool) { luxury += 10; parts.push("Pool"); }
  if (f.whirlpool) { luxury += 6; parts.push("Whirlpool"); }
  if (f.sauna) { luxury += 7; parts.push("Sauna"); }
  luxury = Math.min(18, luxury);

  let baths = 0;
  if (i.bathrooms >= 4) baths = 15;
  else if (i.bathrooms >= 3) baths = 12;
  else if (i.bathrooms >= 2) baths = 9;
  else if (i.bathrooms >= 1) baths = 4;

  // Waschturm (objekttyp-abhängig)
  const wp = WASHING_POINTS[washingBucket(i.objectType)];
  let washing = 0;
  if (f.washingMachine) { washing += wp.washingMachine; parts.push("Waschmaschine"); }
  if (f.tumbler) { washing += wp.tumbler; parts.push("Tumbler"); }
  if (f.washingMachine && f.tumbler) washing += wp.bothBonus;

  // Grundausstattung-Bonus, damit normale Wohnungen nicht bei 50 hängen bleiben
  const raw = outdoor + parking + extras + luxury + baths + washing;
  const total = Math.min(100, Math.round(35 + raw * 0.72));
  const summary = parts.length ? parts.slice(0, 4).join(", ") : "Standardausstattung";
  const reason = `${summary} → ${total}/100 (Aussen ${outdoor}, Parkierung ${parking}, Gebäude ${extras}, Luxus ${luxury}, Bäder ${baths}, Waschturm ${washing}).`;
  return { score: total, reason };
}

function scoreCategory(score: number): { category: Category; label: string } {
  for (const t of CATEGORY_THRESHOLDS) {
    if (score >= t.min) return { category: t.category, label: t.label };
  }
  return { category: "unattraktiv", label: "Unattraktives Investment" };
}

type Verdicts = {
  strengths: string[];
  risks: string[];
  netYieldSentiment: "positiv" | "neutral" | "negativ";
};

function classifyVerdicts(
  i: AnalysisInputs,
  m: CoreMetrics,
  locScore: number,
  vacancyPct: number | undefined,
  refPricePerSqm: number | undefined,
  locationMissing: boolean,
): Verdicts {
  const strengths: string[] = [];
  const risks: string[] = [];
  let netYieldSentiment: "positiv" | "neutral" | "negativ" = "neutral";

  // Nettorendite — genau eine Zuordnung
  if (m.netYield >= 4) {
    strengths.push(`Attraktive Nettorendite (${m.netYield.toFixed(1)} %)`);
    netYieldSentiment = "positiv";
  } else if (m.netYield >= 3.2) {
    strengths.push(`Solide Nettorendite (${m.netYield.toFixed(1)} %)`);
    netYieldSentiment = "positiv";
  } else if (m.netYield >= 2.5) {
    // neutral — bewusst weder in Stärken noch in Risiken
    netYieldSentiment = "neutral";
  } else {
    risks.push(`Unterdurchschnittliche Nettorendite (${m.netYield.toFixed(1)} %)`);
    netYieldSentiment = "negativ";
  }

  // EK-Rendite
  if (m.equityReturn >= 7) {
    strengths.push(`Starke Eigenkapital-Rendite (${m.equityReturn.toFixed(1)} %)`);
  } else if (m.equityReturn < 3 && i.equity > 0) {
    risks.push(`Geringe Eigenkapital-Rendite (${m.equityReturn.toFixed(1)} %)`);
  }

  // Cashflow
  if (m.monthlyCashflow >= 300) {
    strengths.push("Deutlich positiver monatlicher Cashflow");
  } else if (m.monthlyCashflow >= 50) {
    strengths.push("Positiver monatlicher Cashflow");
  } else if (m.monthlyCashflow < -100) {
    risks.push("Deutlich negativer monatlicher Cashflow");
  } else if (m.monthlyCashflow < 0) {
    risks.push("Leicht negativer Cashflow");
  }

  // LTV
  if (m.ltv > 0 && m.ltv <= 65) {
    strengths.push("Moderate Fremdfinanzierung");
  } else if (m.ltv > 85) {
    risks.push(`Sehr hohe Fremdfinanzierung (${m.ltv.toFixed(0)} %)`);
  } else if (m.ltv > 80) {
    risks.push(`Hohe Fremdfinanzierung (${m.ltv.toFixed(0)} %)`);
  }

  // Preisniveau
  if (refPricePerSqm && m.pricePerSqm > 0) {
    const ratio = m.pricePerSqm / refPricePerSqm;
    if (ratio >= 1.15) {
      risks.push(
        `Hoher Kaufpreis pro m² (CHF ${Math.round(m.pricePerSqm).toLocaleString("de-CH")} vs. Region CHF ${Math.round(refPricePerSqm).toLocaleString("de-CH")})`,
      );
    } else if (ratio <= 0.9) {
      strengths.push("Kaufpreis unter regionalem Durchschnitt");
    }
  }

  // Lage
  if (locScore >= 80) {
    strengths.push("Sehr gute Lagequalität");
  } else if (locScore >= 65) {
    strengths.push("Gute Lagequalität");
  } else if (locScore <= 45) {
    risks.push("Schwache Lagequalität");
  } else if (locScore <= 55) {
    risks.push("Durchschnittliche Lagequalität");
  }

  // Zustand / Baujahr
  const currentYear = new Date().getFullYear();
  const buildAge = currentYear - (i.yearBuilt || currentYear);
  const recentReno = i.lastRenovation && currentYear - i.lastRenovation <= 10;
  if (buildAge <= 10) {
    strengths.push("Modernes Baujahr");
  } else if (recentReno) {
    strengths.push("Kürzlich renoviert");
  } else if (buildAge > 40 && !i.lastRenovation) {
    risks.push("Älteres Baujahr ohne Renovationsangaben");
  }

  // Renovationsbedarf
  if ((i.renovationCosts ?? 0) / (i.purchasePrice || 1) > 0.15) {
    risks.push("Hoher Renovationsbedarf");
  }

  // Zins
  if (i.interestRate >= 3) risks.push("Hohe Zinsbelastung");

  // Aussenbereich
  if (i.features.garden) strengths.push("Eigener Garten");
  else if (i.features.terrace || i.features.balcony) strengths.push("Balkon oder Terrasse");
  if (i.features.pool || i.features.whirlpool || i.features.sauna)
    strengths.push("Wellness-Ausstattung");

  // Leerstand
  if (typeof vacancyPct === "number" && vacancyPct >= 2) {
    risks.push(`Erhöhter Wohnungsleerstand in der Gemeinde (${vacancyPct.toFixed(2)} %)`);
  }
  if (locationMissing) risks.push("Standortdaten unvollständig");

  return {
    strengths: strengths.slice(0, 5),
    risks: risks.slice(0, 5),
    netYieldSentiment,
  };
}

function recommendationFor(
  score: number,
  m: CoreMetrics,
  refPricePerSqm: number | undefined,
): { key: RecommendationKey; label: string; reason: string } {
  const overpriced =
    refPricePerSqm && m.pricePerSqm > 0 && m.pricePerSqm / refPricePerSqm >= 1.1;
  if (score >= 80) {
    return {
      key: "kauf_empfehlenswert",
      label: "Kauf empfehlenswert",
      reason: "Das Objekt überzeugt in den zentralen Kennzahlen und der Lage.",
    };
  }
  if (score >= 65) {
    return overpriced
      ? {
          key: "kauf_interessant_nach_verhandlung",
          label: "Kauf interessant nach Preisverhandlung",
          reason:
            "Grundsätzlich solides Investment — der Kaufpreis liegt jedoch über dem regionalen Marktdurchschnitt.",
        }
      : {
          key: "kauf_empfehlenswert",
          label: "Kauf empfehlenswert",
          reason: "Solide Kennzahlen mit fairer Bewertung.",
        };
  }
  if (score >= 50) {
    return {
      key: "kauf_interessant_nach_verhandlung",
      label: "Kauf interessant nach Preisverhandlung",
      reason:
        "Rentabilität oder Lage sind grenzwertig — eine Preisreduktion würde das Investment attraktiver machen.",
    };
  }
  if (score >= 35) {
    return {
      key: "bedingt_geeignet",
      label: "Nur bedingt geeignet",
      reason:
        "Mehrere Kennzahlen liegen unter den üblichen Renditeerwartungen. Ein Kauf sollte kritisch geprüft werden.",
    };
  }
  return {
    key: "nicht_empfehlenswert",
    label: "Eher nicht empfehlenswert",
    reason:
      "Aus reiner Renditesicht wenig attraktiv. Ein Kauf ist nur bei starken persönlichen Argumenten sinnvoll.",
  };
}

function overallSummary(
  category: Category,
  m: CoreMetrics,
  strengths: string[],
  risks: string[],
  netYieldSentiment: "positiv" | "neutral" | "negativ",
  refPricePerSqm: number | undefined,
): string {
  // Kernaussagen dynamisch aus Kennzahlen bauen, damit der Text nicht
  // wie ein Standardsatz wirkt.
  const cf = Math.round(m.monthlyCashflow);
  const yieldStrong = m.netYield >= 4;
  const yieldSolid = m.netYield >= 3;
  const yieldWeak = m.netYield < 2.5;
  const equityStrong = m.equityReturn >= 7;
  const equityWeak = m.equityReturn < 3;
  const cfPositive = cf >= 50;
  const cfNegative = cf < 0;

  // Preisniveau relativ zur Region
  let priceTone: "unter" | "fair" | "über" | null = null;
  if (refPricePerSqm && m.pricePerSqm > 0) {
    const ratio = m.pricePerSqm / refPricePerSqm;
    if (ratio <= 0.92) priceTone = "unter";
    else if (ratio >= 1.12) priceTone = "über";
    else priceTone = "fair";
  }

  const opener: Record<Category, string> = {
    attraktiv: "Das Objekt überzeugt insgesamt als Investment.",
    solide: "Das Objekt präsentiert sich als solides Investment.",
    neutral: "Das Objekt zeigt ein gemischtes Bild.",
    kritisch: "Das Objekt weist mehrere kritische Aspekte auf.",
    unattraktiv: "Das Objekt ist aus Renditesicht wenig attraktiv.",
  };

  // Positiv-Argumente kombinieren
  const positives: string[] = [];
  if (yieldStrong) positives.push(`eine attraktive Nettorendite von ${m.netYield.toFixed(1)} %`);
  else if (yieldSolid) positives.push(`eine solide Nettorendite von ${m.netYield.toFixed(1)} %`);
  if (cfPositive) positives.push("einen positiven Cashflow");
  if (equityStrong) positives.push(`eine überdurchschnittliche Eigenkapitalrendite (${m.equityReturn.toFixed(1)} %)`);
  const hasGoodLocation = strengths.some((s) => /Lagequalität/i.test(s) && !/Schwach|Durchschnitt/i.test(s));
  if (hasGoodLocation) positives.push("eine gute Lage");
  if (priceTone === "unter") positives.push("einen Kaufpreis unter regionalem Durchschnitt");
  else if (priceTone === "fair" && (yieldSolid || equityStrong)) positives.push("einen fairen Kaufpreis");

  // Negativ-/Warnpunkte
  const negatives: string[] = [];
  if (yieldWeak) negatives.push(`eine tiefe Nettorendite von ${m.netYield.toFixed(1)} %`);
  if (cfNegative) negatives.push("einen negativen Cashflow");
  if (equityWeak && !yieldWeak) negatives.push(`eine schwache Eigenkapitalrendite (${m.equityReturn.toFixed(1)} %)`);
  if (priceTone === "über") negatives.push("einen Kaufpreis über dem regionalen Marktdurchschnitt");
  const hasWeakLocation = risks.some((r) => /Lagequalität/i.test(r));
  if (hasWeakLocation) negatives.push("eine schwächere Lage");

  const joinList = (arr: string[]): string => {
    if (arr.length === 0) return "";
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} sowie ${arr[1]}`;
    return `${arr.slice(0, -1).join(", ")} sowie ${arr[arr.length - 1]}`;
  };

  const parts: string[] = [opener[category]];

  if (positives.length && negatives.length) {
    parts.push(
      `Positiv wirken ${joinList(positives.slice(0, 3))}. Weniger überzeugend sind ${joinList(negatives.slice(0, 2))}.`,
    );
  } else if (positives.length) {
    parts.push(`Es überzeugt insbesondere durch ${joinList(positives.slice(0, 3))}.`);
  } else if (negatives.length) {
    parts.push(`Besonders kritisch sind ${joinList(negatives.slice(0, 3))}.`);
  }

  // Abschluss
  if (category === "attraktiv" || category === "solide") {
    if (priceTone === "über") {
      parts.push("Eine Preisverhandlung würde das Investment weiter aufwerten.");
    } else {
      parts.push("Insgesamt eine interessante langfristige Investition.");
    }
  } else if (category === "neutral") {
    parts.push("Eine Preisverhandlung oder gezielte Optimierungen könnten die Rentabilität deutlich verbessern.");
  } else if (category === "kritisch") {
    parts.push("Ein Kauf sollte nur nach kritischer Prüfung und deutlicher Preisreduktion in Betracht gezogen werden.");
  } else {
    parts.push("Aus reiner Renditesicht ist ein Kauf nur bei starken persönlichen Argumenten sinnvoll.");
  }

  return parts.join(" ");
}

function computeDataQuality(i: AnalysisInputs): {
  quality: "hoch" | "mittel" | "niedrig";
  missing: string[];
} {
  const missing: string[] = [];
  if (!i.maintenance) missing.push("Rückstellungen");
  if (!i.renovationCosts && !i.lastRenovation) missing.push("Renovationskosten/-datum");
  if (!i.renewalFund && i.objectType === "eigentumswohnung") missing.push("Erneuerungsfonds");
  if (!i.management) missing.push("Verwaltungskosten");
  if (!i.location || i.location.geocodingFailed) missing.push("Standortdaten");
  const q: "hoch" | "mittel" | "niedrig" =
    missing.length <= 1 ? "hoch" : missing.length <= 3 ? "mittel" : "niedrig";
  return { quality: q, missing };
}

function yieldReason(v: number, s: number): string {
  return `Nettorendite ${v.toFixed(1)} % → ${s}/100 (≥ 5 % = 100, ≥ 4 % = 80, ≥ 3 % = 60).`;
}
function equityReturnReason(v: number, s: number): string {
  return `Eigenkapital-Rendite ${v.toFixed(1)} % → ${s}/100 (≥ 10 % = 100, ≥ 7 % = 85, ≥ 4 % = 65).`;
}
function conditionReason(i: AnalysisInputs, s: number): string {
  const year = new Date().getFullYear();
  const buildAge = year - (i.yearBuilt || year);
  const reno = i.lastRenovation ? `, Renovation ${i.lastRenovation}` : ", keine Renovation";
  return `Baujahr ${i.yearBuilt}${reno} (Alter ${buildAge} J.) → ${s}/100.`;
}
function locationReason(loc: AnalysisResult["locationDetail"], s: number): string {
  if (!loc || loc.unavailable.length >= 6) {
    return `Lagedaten begrenzt → Bewertung ${s}/100 nur auf Basis verfügbarer Daten.`;
  }
  const risk = loc.vacancyRisk === "unbekannt" ? "unbekannt" : loc.vacancyRisk.replace("_", " ");
  return `Automatischer Lagescore → ${s}/100 (Leerstandsrisiko: ${risk}).`;
}

export function computeAnalysis(i: AnalysisInputs): AnalysisResult {
  const m = computeMetrics(i);
  const locationDetail = computeLocationScore(i.location, m.pricePerSqm);

  const subYield = pickScore(YIELD_THRESHOLDS, m.netYield);
  const subEquity = pickScore(EQUITY_RETURN_THRESHOLDS, m.equityReturn);
  const subLocation = locationDetail.score;
  const subCondition = conditionScore(i);
  const feat = featuresScore(i);

  const score = Math.round(
    subYield * SCORE_WEIGHTS.yield +
      subEquity * SCORE_WEIGHTS.equityReturn +
      subLocation * SCORE_WEIGHTS.location +
      subCondition * SCORE_WEIGHTS.condition +
      feat.score * SCORE_WEIGHTS.features,
  );

  const { category, label } = scoreCategory(score);
  const locationMissing = !i.location || !!i.location.geocodingFailed;
  const verdicts = classifyVerdicts(
    i,
    m,
    subLocation,
    i.location?.vacancyPct,
    i.location?.refPricePerSqm,
    locationMissing,
  );
  const { strengths, risks, netYieldSentiment } = verdicts;
  const rec = recommendationFor(score, m, i.location?.refPricePerSqm);
  const overall = overallSummary(category, m, strengths, risks, netYieldSentiment, i.location?.refPricePerSqm);
  const verdict = `${overall} ${rec.reason}`;
  const dq = computeDataQuality(i);

  return {
    ...m,
    score,
    category,
    categoryLabel: label,
    subscores: {
      yield: subYield,
      equityReturn: subEquity,
      location: subLocation,
      condition: subCondition,
      features: feat.score,
    },
    subscoreReasons: {
      yield: yieldReason(m.netYield, subYield),
      equityReturn: equityReturnReason(m.equityReturn, subEquity),
      location: locationReason(locationDetail, subLocation),
      condition: conditionReason(i, subCondition),
      features: feat.reason,
    },
    strengths,
    risks,
    verdict,
    verdictStructured: {
      overall,
      positives: strengths,
      negatives: risks,
      recommendation: rec.key,
      recommendationLabel: rec.label,
      recommendationReason: rec.reason,
    },
    dataQuality: dq.quality,
    dataQualityMissing: dq.missing,
    locationDetail,
  };
}
