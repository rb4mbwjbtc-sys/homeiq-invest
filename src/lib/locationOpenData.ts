import type { AnalysisInput, OpenDataLocationReport } from "../types";

type LocationApiResponse = OpenDataLocationReport & {
  metrics: AnalysisInput["location"];
};

export async function loadSwissOpenDataLocation(input: Pick<AnalysisInput, "street" | "postalCode" | "city">): Promise<LocationApiResponse> {
  const params = new URLSearchParams({
    street: input.street,
    postalCode: input.postalCode,
    city: input.city,
  });
  const response = await fetch(`/api/location?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json() as LocationApiResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Standortdaten konnten nicht geladen werden.");
  return payload;
}
