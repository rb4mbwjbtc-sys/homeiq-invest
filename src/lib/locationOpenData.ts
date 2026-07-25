import type { AnalysisInput, OpenDataLocationReport } from "../types";

type LocationApiResponse = OpenDataLocationReport & {
  metrics: AnalysisInput["location"];
};

const CACHE_PREFIX = "homeiq-location-v3.2:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

function cacheKey(input: Pick<AnalysisInput, "street" | "postalCode" | "city">) {
  return `${CACHE_PREFIX}${[input.street, input.postalCode, input.city]
    .join("|")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
}

function readCache(key: string): LocationApiResponse | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { createdAt: number; payload: LocationApiResponse };
    if (!parsed?.createdAt || Date.now() - parsed.createdAt > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      ...parsed.payload,
      cache: { hit: true, ttlDays: 30 },
    };
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: LocationApiResponse) {
  try {
    localStorage.setItem(key, JSON.stringify({ createdAt: Date.now(), payload }));
  } catch {
    // Browser storage may be unavailable; the API response still remains usable.
  }
}

export async function loadSwissOpenDataLocation(
  input: Pick<AnalysisInput, "street" | "postalCode" | "city">,
  options: { forceRefresh?: boolean } = {},
): Promise<LocationApiResponse> {
  const key = cacheKey(input);
  if (!options.forceRefresh) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    street: input.street,
    postalCode: input.postalCode,
    city: input.city,
  });
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/location?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json() as LocationApiResponse & { error?: string; retryable?: boolean };
    if (!response.ok) throw new Error(payload.error || "Standortdaten konnten nicht geladen werden.");
    writeCache(key, payload);
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Die Standortanalyse wurde nach 12 Sekunden beendet. Bitte erneut versuchen.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
