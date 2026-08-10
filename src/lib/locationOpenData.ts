import type { AnalysisInput, OpenDataLocationReport } from "../types";

type LocationApiResponse = OpenDataLocationReport & {
  metrics: AnalysisInput["location"];
};

async function fetchLocation(url: string, timeoutMs: number): Promise<LocationApiResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json() as LocationApiResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Standortdaten konnten nicht geladen werden.");
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function loadSwissOpenDataLocation(
  input: Pick<AnalysisInput, "street" | "postalCode" | "city" | "propertyType" | "rooms" | "livingArea">,
): Promise<LocationApiResponse> {
  const params = new URLSearchParams({
    street: input.street,
    postalCode: input.postalCode,
    city: input.city,
    propertyType: input.propertyType,
    rooms: String(input.rooms || 0),
    livingArea: String(input.livingArea || 0),
  });
  const url = `/api/location?${params.toString()}`;

  try {
    return await fetchLocation(url, 16000);
  } catch (error) {
    // Beim ersten Cold-Start kann eine Vercel-Funktion oder ein externer Open-Data-Dienst
    // knapp zu spät antworten. Ein einmaliger kurzer Retry profitiert meist bereits vom Cache.
    if (error instanceof DOMException && error.name === "AbortError") {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      try {
        return await fetchLocation(url, 9000);
      } catch (retryError) {
        if (retryError instanceof DOMException && retryError.name === "AbortError") {
          throw new Error("Die Datenquellen antworten momentan zu langsam. Bitte in einigen Sekunden nochmals laden.");
        }
        throw retryError;
      }
    }
    throw error;
  }
}
