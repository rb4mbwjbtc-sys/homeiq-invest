import type { AnalysisInput, OpenDataLocationReport, OpenDataMarketReport } from "../types";

type LocationApiResponse = OpenDataLocationReport & {
  metrics: AnalysisInput["location"];
};

const EMPTY_MARKET: OpenDataMarketReport = {
  pricePerSqm: null,
  rentPerSqm: null,
  priceSource: null,
  rentSource: null,
  confidence: "eingeschränkt",
  radiusKm: null,
  discoveredDatasets: [],
  tiers: [],
  note: "Marktdaten konnten nicht geladen werden. Es werden keine Ersatzwerte verwendet.",
};

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Daten konnten nicht geladen werden.");
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadLocationCore(url: string): Promise<LocationApiResponse> {
  try {
    return await fetchJsonWithTimeout<LocationApiResponse>(url, 12000);
  } catch (error) {
    // Genau ein Retry. Der Nutzer klickt weiterhin nur einmal auf "Laden".
    // Ein Vercel-Cold-Start ist beim zweiten Versuch in der Regel bereits warm.
    if (error instanceof DOMException && error.name === "AbortError") {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      try {
        return await fetchJsonWithTimeout<LocationApiResponse>(url, 8000);
      } catch (retryError) {
        if (retryError instanceof DOMException && retryError.name === "AbortError") {
          throw new Error("Die Standortquellen antworten momentan zu langsam. Bitte nochmals auf Laden klicken.");
        }
        throw retryError;
      }
    }
    throw error;
  }
}

async function loadMarketOptional(url: string): Promise<OpenDataMarketReport> {
  try {
    return await fetchJsonWithTimeout<OpenDataMarketReport>(url, 6500);
  } catch {
    // Marktdaten dürfen die Lageanalyse nie mehr blockieren.
    return EMPTY_MARKET;
  }
}


export async function lookupSwissCityByPostalCode(postalCode: string): Promise<string | null> {
  const value = postalCode.trim();
  if (!/^\d{4}$/.test(value)) return null;
  try {
    const payload = await fetchJsonWithTimeout<{ city?: string | null }>(
      `/api/location?lookupPostalCode=${encodeURIComponent(value)}`,
      7000,
    );
    return payload.city?.trim() || null;
  } catch {
    // Die automatische Ortsauflösung ist Komfortfunktion und darf die Eingabe nie blockieren.
    return null;
  }
}

export async function loadSwissOpenDataLocation(
  input: Pick<AnalysisInput, "street" | "postalCode" | "city" | "propertyType" | "rooms" | "livingArea">,
): Promise<LocationApiResponse> {
  const locationParams = new URLSearchParams({
    street: input.street,
    postalCode: input.postalCode,
    city: input.city,
    propertyType: input.propertyType,
    rooms: String(input.rooms || 0),
    livingArea: String(input.livingArea || 0),
  });
  const marketParams = new URLSearchParams({
    postalCode: input.postalCode,
    city: input.city,
    propertyType: input.propertyType,
    rooms: String(input.rooms || 0),
    livingArea: String(input.livingArea || 0),
  });

  // Ein Knopfdruck startet beide Pipelines parallel. Die Standortdaten sind Pflicht,
  // die Marktpipeline ist optional und kann unabhängig ausfallen.
  const [locationResult, marketResult] = await Promise.allSettled([
    loadLocationCore(`/api/location?${locationParams.toString()}`),
    loadMarketOptional(`/api/market?${marketParams.toString()}`),
  ]);

  if (locationResult.status === "rejected") throw locationResult.reason;

  const market = marketResult.status === "fulfilled" ? marketResult.value : EMPTY_MARKET;
  return {
    ...locationResult.value,
    market,
  };
}
