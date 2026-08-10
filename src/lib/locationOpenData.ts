import type { AnalysisInput, OpenDataLocationReport } from "../types";

type LocationApiResponse = OpenDataLocationReport & {
  metrics: AnalysisInput["location"];
};

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

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`/api/location?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json() as LocationApiResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Standortdaten konnten nicht geladen werden.");
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Die Datenabfrage hat zu lange gedauert. Bitte erneut versuchen.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
