import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_AI_URL = "https://api.openai.com/v1/chat/completions";

function getAiConfig() {
  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL || DEFAULT_AI_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey) throw new Error("Missing AI_API_KEY");
  if (!model) throw new Error("Missing AI_MODEL");

  return { apiKey, apiUrl, model };
}

async function assertPremium(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
}) {
  const { data } = await context.supabase
    .from("profiles")
    .select("subscription_status, current_period_end")
    .eq("id", context.userId)
    .maybeSingle();
  const row = data as
    | { subscription_status?: string; current_period_end?: string }
    | null;
  const status = row?.subscription_status ?? "free";
  const periodEnd = row?.current_period_end ? new Date(row.current_period_end) : null;
  const isPremium =
    (status === "active" || status === "canceled_active_until_end") &&
    (!periodEnd || periodEnd > new Date());
  if (!isPremium) throw new Error("PREMIUM_REQUIRED");
}

async function callAiJson<T>(system: string, userJson: unknown, schema: {
  name: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const { apiKey, apiUrl, model } = getAiConfig();
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userJson) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schema.name, schema: schema.schema, strict: true },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("AI provider error", res.status, body);
    if (res.status === 429) throw new Error("AI_RATE_LIMIT");
    if (res.status === 402) throw new Error("AI_CREDITS_EXHAUSTED");
    throw new Error(`AI_ERROR_${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI_EMPTY_RESPONSE");
  return JSON.parse(content) as T;
}

// WICHTIG: In beide Endpunkte fliesst KEIN vom Nutzer eingegebener Kaufpreis
// oder Mietwert ein. Marktmiete und Marktwert werden vollständig unabhängig
// auf Basis externer Markt- und Objektdaten geschätzt und dienen anschliessend
// als Vergleichsmassstab für die Nutzereingabe.

// ---------- Marktmiete ----------

const rentInputSchema = z.object({
  objectType: z.string(),
  zip: z.string(),
  city: z.string(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  gemeinde: z.string().optional(),
  kanton: z.string().optional(),
  livingArea: z.number().optional(),
  rooms: z.number().optional(),
  bathrooms: z.number().optional(),
  yearBuilt: z.number().optional(),
  lastRenovation: z.number().optional(),
  floor: z.string().optional(),
  features: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
  refPricePerSqm: z.number().optional(),
});

export type DataQuality = "hoch" | "mittel" | "tief";

export interface MarketRentResult {
  estimatedRent: number;
  low: number;
  high: number;
  reasoning: string;
  dataQuality: DataQuality;
  comparableCount: number;
  radiusKm: number;
  sources: string[];
}

export const estimateMarketRent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rentInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<MarketRentResult> => {
    await assertPremium(context);
    const system =
      "Du bist ein Experte für den Schweizer Mietwohnungsmarkt. " +
      "Schätze eine realistische monatliche Nettomarktmiete in CHF für die gegebene Immobilie, " +
      "AUSSCHLIESSLICH auf Basis externer Markt- und Objektdaten: regionale Nettomieten pro m², " +
      "vergleichbare Mietinserate im Umkreis, Lage/Mikrolage, Objekttyp, Wohnfläche, Zimmerzahl, " +
      "Baujahr, Renovationsstand, Stockwerk, Ausstattung, Balkon/Terrasse/Garten, Lift, Parksituation. " +
      "Die Eingabe enthält bewusst KEINE vom Nutzer eingetragene Nettomiete — verwende auch keine, " +
      "selbst wenn du sie erraten könntest. Beziehe möglichst viele Datenpunkte ein und gib die " +
      "Datenqualität transparent an (Anzahl herangezogene Vergleichsobjekte, Suchradius in km, verwendete Quellen). " +
      "Antworte ausschliesslich mit dem JSON-Schema. Runde Mieten auf 10 CHF.";
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        estimatedRent: { type: "number", description: "Geschätzte Nettomiete in CHF/Monat" },
        low: { type: "number", description: "Untere Grenze der Marktspanne in CHF/Monat" },
        high: { type: "number", description: "Obere Grenze der Marktspanne in CHF/Monat" },
        reasoning: {
          type: "string",
          description:
            "Kurze deutsche Begründung (1-2 Sätze), welche Faktoren die Schätzung tragen.",
        },
        dataQuality: {
          type: "string",
          enum: ["hoch", "mittel", "tief"],
          description: "Belastbarkeit der Schätzung.",
        },
        comparableCount: {
          type: "number",
          description: "Anzahl herangezogener Vergleichsobjekte (ehrliche Schätzung).",
        },
        radiusKm: {
          type: "number",
          description: "Suchradius in Kilometern.",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Verwendete Datenquellenkategorien, z.B. 'Regionale Mietindizes', 'Vergleichbare Inserate'.",
        },
      },
      required: [
        "estimatedRent",
        "low",
        "high",
        "reasoning",
        "dataQuality",
        "comparableCount",
        "radiusKm",
        "sources",
      ],
    };
    return callAiJson<MarketRentResult>(system, data, {
      name: "market_rent",
      schema,
    });
  });

// ---------- Marktwert / Kaufpreis ----------

const priceInputSchema = z.object({
  objectType: z.string(),
  zip: z.string(),
  city: z.string(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  gemeinde: z.string().optional(),
  kanton: z.string().optional(),
  livingArea: z.number().optional(),
  rooms: z.number().optional(),
  bathrooms: z.number().optional(),
  yearBuilt: z.number().optional(),
  lastRenovation: z.number().optional(),
  floor: z.string().optional(),
  features: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
  refPricePerSqm: z.number().optional(),
});

export interface PurchasePriceResult {
  marketValue: number;
  low: number;
  high: number;
  attractivePrice: number;
  veryAttractivePrice: number;
  reasoning: string;
  dataQuality: DataQuality;
  comparableCount: number;
  radiusKm: number;
  sources: string[];
}

export const estimateOptimalPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => priceInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<PurchasePriceResult> => {
    await assertPremium(context);
    const system =
      "Du bist ein Experte für den Schweizer Immobilienmarkt und Investmentbewertung. " +
      "Schätze einen realistischen Marktwert in CHF für die gegebene Immobilie, " +
      "AUSSCHLIESSLICH auf Basis externer Markt- und Objektdaten: Lage/Mikrolage, " +
      "regionale Preise pro m², vergleichbare Verkäufe und Angebotspreise im Umkreis, " +
      "Objekttyp, Wohnfläche, Zimmerzahl, Baujahr, Renovationsstand, Stockwerk, Zustand, " +
      "Ausstattung, Balkon/Terrasse/Garten, Lift, Parksituation. " +
      "Die Eingabe enthält bewusst KEINEN vom Nutzer eingetragenen Kaufpreis und KEINE Miete — " +
      "verwende auch keine, selbst wenn du sie erraten könntest. Der Marktwert muss unabhängig " +
      "berechnet werden und darf sich nicht am (unbekannten) Angebotspreis orientieren. " +
      "Zusätzlich: 'attractivePrice' ist ein Kaufpreis, bei dem das Objekt als Investment klar attraktiv wird; " +
      "'veryAttractivePrice' ein aggressiverer Verhandlungspreis. " +
      "Reihenfolge muss gelten: veryAttractivePrice < attractivePrice ≤ marketValue. " +
      "Gib zusätzlich die Marktwertspanne (low/high) sowie Datenqualität, Anzahl Vergleichsobjekte, " +
      "Suchradius (km) und verwendete Quellenkategorien an. " +
      "Runde alle Preise auf 5'000 CHF. Antworte ausschliesslich mit dem JSON-Schema.";
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        marketValue: { type: "number" },
        low: { type: "number", description: "Untere Grenze der Marktwertspanne in CHF" },
        high: { type: "number", description: "Obere Grenze der Marktwertspanne in CHF" },
        attractivePrice: { type: "number" },
        veryAttractivePrice: { type: "number" },
        reasoning: {
          type: "string",
          description:
            "Kurze deutsche Erklärung (2-3 Sätze), welche Faktoren den Marktwert und die Verhandlungspreise stützen.",
        },
        dataQuality: {
          type: "string",
          enum: ["hoch", "mittel", "tief"],
        },
        comparableCount: { type: "number" },
        radiusKm: { type: "number" },
        sources: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "marketValue",
        "low",
        "high",
        "attractivePrice",
        "veryAttractivePrice",
        "reasoning",
        "dataQuality",
        "comparableCount",
        "radiusKm",
        "sources",
      ],
    };
    return callAiJson<PurchasePriceResult>(system, data, {
      name: "purchase_price",
      schema,
    });
  });
