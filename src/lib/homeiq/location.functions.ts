import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LocationData } from "./types";

const inputSchema = z.object({
  zip: z.string().regex(/^\d{4}$/),
  city: z.string().min(1),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
});

function addressKey(i: {
  zip: string;
  city: string;
  street?: string;
  houseNumber?: string;
}): string {
  return [
    i.zip,
    i.city.trim().toLowerCase(),
    (i.street ?? "").trim().toLowerCase(),
    (i.houseNumber ?? "").trim().toLowerCase(),
  ].join("|");
}

/** Reichert eine Adresse mit Standortdaten an: Geocoding (Nominatim), Gemeindedaten (BFS-Snapshot in DB), Cache. */
export const enrichLocation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<LocationData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = addressKey(data);

    // 1) Cache
    const { data: cached } = await supabaseAdmin
      .from("location_cache")
      .select("*")
      .eq("address_key", key)
      .maybeSingle();

    let latitude: number | undefined;
    let longitude: number | undefined;
    let geocodingFailed = false;

    if (cached && cached.latitude && cached.longitude) {
      latitude = cached.latitude;
      longitude = cached.longitude;
    } else {
      // 2) Nominatim (OSM) — kostenfrei, mit User-Agent
      const q = encodeURIComponent(
        [data.street, data.houseNumber, data.zip, data.city, "Schweiz"]
          .filter(Boolean)
          .join(" "),
      );
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ch&q=${q}`,
          {
            headers: {
              "User-Agent": "HomeIQ-Invest/1.0 (contact: support@homeiq.ch)",
              "Accept-Language": "de-CH",
            },
          },
        );
        if (res.ok) {
          const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
          if (arr[0]) {
            latitude = parseFloat(arr[0].lat);
            longitude = parseFloat(arr[0].lon);
          }
        }
      } catch {
        // ignore
      }
      if (!latitude || !longitude) geocodingFailed = true;
    }

    // 3) Gemeindedaten (Snapshot BFS in DB)
    // Wir suchen zuerst per exaktem Städtenamen, dann per case-insensitive ilike.
    let gemeindeRow: {
      name: string;
      kanton: string;
      bfs_nr: number | null;
      vacancy_pct: number | null;
      vacancy_year: number | null;
      tax_index: number | null;
      population: number | null;
      population_growth_pct: number | null;
    } | null = null;

    const cityTrim = data.city.trim();
    const { data: exact } = await supabaseAdmin
      .from("gemeinde_data")
      .select(
        "name, kanton, bfs_nr, vacancy_pct, vacancy_year, tax_index, population, population_growth_pct",
      )
      .ilike("name", cityTrim)
      .limit(1)
      .maybeSingle();
    if (exact) gemeindeRow = exact;

    // Interpolation: fehlende Felder mit regionalem Durchschnitt (gleicher Kanton)
    // auffüllen. Dies approximiert den 10-km-Radius-Ansatz mit den verfügbaren
    // Gemeindedaten. Zusätzlich Landesdurchschnitt als letzter Fallback.
    const missingFields = gemeindeRow
      ? {
          vacancy_pct: gemeindeRow.vacancy_pct == null,
          tax_index: gemeindeRow.tax_index == null,
          population_growth_pct: gemeindeRow.population_growth_pct == null,
        }
      : { vacancy_pct: true, tax_index: true, population_growth_pct: true };

    if (missingFields.vacancy_pct || missingFields.tax_index || missingFields.population_growth_pct) {
      const kantonFilter = gemeindeRow?.kanton;
      let query = supabaseAdmin
        .from("gemeinde_data")
        .select("kanton, vacancy_pct, vacancy_year, tax_index, population_growth_pct");
      if (kantonFilter) query = query.eq("kanton", kantonFilter);
      const { data: neighbors } = await query.limit(200);
      const rows = neighbors ?? [];
      const avg = (pick: (r: (typeof rows)[number]) => number | null): number | null => {
        const vals = rows.map(pick).filter((v): v is number => typeof v === "number");
        if (vals.length === 0) return null;
        return vals.reduce((s, v) => s + v, 0) / vals.length;
      };
      if (!gemeindeRow) {
        gemeindeRow = {
          name: cityTrim,
          kanton: "",
          bfs_nr: null,
          vacancy_pct: null,
          vacancy_year: null,
          tax_index: null,
          population: null,
          population_growth_pct: null,
        };
      }
      if (missingFields.vacancy_pct) {
        gemeindeRow.vacancy_pct = avg((r) => r.vacancy_pct);
        if (gemeindeRow.vacancy_pct != null && gemeindeRow.vacancy_year == null) {
          const years = rows
            .map((r) => r.vacancy_year)
            .filter((v): v is number => typeof v === "number");
          if (years.length) gemeindeRow.vacancy_year = Math.max(...years);
        }
      }
      if (missingFields.tax_index) gemeindeRow.tax_index = avg((r) => r.tax_index);
      if (missingFields.population_growth_pct)
        gemeindeRow.population_growth_pct = avg((r) => r.population_growth_pct);
    }

    // 4) Amenities via Overpass (OSM) — nur wenn Koordinaten vorhanden und nicht im Cache
    let nearestStopMeters: number | undefined;
    let supermarketMeters: number | undefined;
    let schoolMeters: number | undefined;
    let nearestMotorwayMeters: number | undefined;
    let nearestMajorRoadMeters: number | undefined;
    let nearestRailwayMeters: number | undefined;

    const cachedAmenities = (cached?.amenities as {
      nearestStopMeters?: number;
      supermarketMeters?: number;
      schoolMeters?: number;
      nearestMotorwayMeters?: number;
      nearestMajorRoadMeters?: number;
      nearestRailwayMeters?: number;
    } | null) ?? null;

    if (cachedAmenities) {
      nearestStopMeters = cachedAmenities.nearestStopMeters;
      supermarketMeters = cachedAmenities.supermarketMeters;
      schoolMeters = cachedAmenities.schoolMeters;
      nearestMotorwayMeters = cachedAmenities.nearestMotorwayMeters;
      nearestMajorRoadMeters = cachedAmenities.nearestMajorRoadMeters;
      nearestRailwayMeters = cachedAmenities.nearestRailwayMeters;
    } else if (latitude && longitude) {
      const amen = await fetchOverpassAmenities(latitude, longitude);
      nearestStopMeters = amen.nearestStopMeters;
      supermarketMeters = amen.supermarketMeters;
      schoolMeters = amen.schoolMeters;
      nearestMotorwayMeters = amen.nearestMotorwayMeters;
      nearestMajorRoadMeters = amen.nearestMajorRoadMeters;
      nearestRailwayMeters = amen.nearestRailwayMeters;
    }

    // 5) Cache-Upsert
    if (!cached || !cached.latitude || !cachedAmenities) {
      await supabaseAdmin.from("location_cache").upsert(
        {
          address_key: key,
          zip: data.zip,
          city: data.city,
          street: data.street ?? null,
          house_number: data.houseNumber ?? null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          gemeinde: gemeindeRow?.name ?? null,
          kanton: gemeindeRow?.kanton ?? null,
          bfs_nr: gemeindeRow?.bfs_nr ?? null,
          amenities: {
            nearestStopMeters: nearestStopMeters ?? null,
            supermarketMeters: supermarketMeters ?? null,
            schoolMeters: schoolMeters ?? null,
            nearestMotorwayMeters: nearestMotorwayMeters ?? null,
            nearestMajorRoadMeters: nearestMajorRoadMeters ?? null,
            nearestRailwayMeters: nearestRailwayMeters ?? null,
          },
        },
        { onConflict: "address_key" },
      );
    }

    // 6) Preisreferenz pro m² (Kanton-Durchschnitt)
    const { CANTON_PRICE_PER_SQM, DEFAULT_PRICE_PER_SQM } = await import("./config");
    const kanton = gemeindeRow?.kanton;
    const refPricePerSqm = kanton && CANTON_PRICE_PER_SQM[kanton]
      ? CANTON_PRICE_PER_SQM[kanton]
      : DEFAULT_PRICE_PER_SQM;
    const refPriceSource = kanton && CANTON_PRICE_PER_SQM[kanton]
      ? `Ø Kanton ${kanton}`
      : "Ø Schweiz";

    const unavailable: string[] = [];
    if (!gemeindeRow) unavailable.push("Gemeindedaten");
    if (nearestStopMeters === undefined) unavailable.push("ÖV");
    if (supermarketMeters === undefined) unavailable.push("Einkaufen");
    if (schoolMeters === undefined) unavailable.push("Schulen");

    const result: LocationData = {
      address: {
        zip: data.zip,
        city: data.city,
        street: data.street,
        houseNumber: data.houseNumber,
      },
      latitude,
      longitude,
      gemeinde: gemeindeRow?.name,
      kanton: gemeindeRow?.kanton ?? undefined,
      bfsNr: gemeindeRow?.bfs_nr ?? undefined,
      vacancyPct: gemeindeRow?.vacancy_pct ?? undefined,
      vacancyYear: gemeindeRow?.vacancy_year ?? undefined,
      taxIndex: gemeindeRow?.tax_index ?? undefined,
      population: gemeindeRow?.population ?? undefined,
      populationGrowthPct: gemeindeRow?.population_growth_pct ?? undefined,
      nearestStopMeters,
      supermarketMeters,
      schoolMeters,
      nearestMotorwayMeters,
      nearestMajorRoadMeters,
      nearestRailwayMeters,
      refPricePerSqm,
      refPriceSource,
      unavailable,
      geocodingFailed,
      fetchedAt: new Date().toISOString(),
    };

    return result;
  });

/** Haversine-Distanz in Metern. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Fragt Overpass (OSM) nach nächstgelegenen POIs sowie Lärmquellen (Autobahn/Hauptstrasse/Bahn). */
async function fetchOverpassAmenities(
  lat: number,
  lon: number,
): Promise<{
  nearestStopMeters?: number;
  supermarketMeters?: number;
  schoolMeters?: number;
  nearestMotorwayMeters?: number;
  nearestMajorRoadMeters?: number;
  nearestRailwayMeters?: number;
}> {
  const radius = 2000;
  const noiseRadius = 2500;
  const query = `
[out:json][timeout:20];
(
  node["highway"="bus_stop"](around:${radius},${lat},${lon});
  node["public_transport"="stop_position"](around:${radius},${lat},${lon});
  node["railway"="tram_stop"](around:${radius},${lat},${lon});
  node["railway"="station"](around:${radius},${lat},${lon});
  node["shop"="supermarket"](around:${radius},${lat},${lon});
  way["shop"="supermarket"](around:${radius},${lat},${lon});
  node["amenity"="school"](around:${radius},${lat},${lon});
  way["amenity"="school"](around:${radius},${lat},${lon});
  way["highway"="motorway"](around:${noiseRadius},${lat},${lon});
  way["highway"="trunk"](around:${noiseRadius},${lat},${lon});
  way["highway"="primary"](around:${noiseRadius},${lat},${lon});
  way["railway"="rail"](around:${noiseRadius},${lat},${lon});
);
out center;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "HomeIQ-Invest/1.0 (contact: support@homeiq.ch)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      elements: Array<{
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };
    let stop = Infinity;
    let market = Infinity;
    let school = Infinity;
    let motorway = Infinity;
    let majorRoad = Infinity;
    let railway = Infinity;
    for (const el of json.elements) {
      const eLat = el.lat ?? el.center?.lat;
      const eLon = el.lon ?? el.center?.lon;
      if (typeof eLat !== "number" || typeof eLon !== "number") continue;
      const d = haversine(lat, lon, eLat, eLon);
      const t = el.tags ?? {};
      if (
        t.highway === "bus_stop" ||
        t.public_transport === "stop_position" ||
        t.railway === "tram_stop" ||
        t.railway === "station"
      ) stop = Math.min(stop, d);
      if (t.shop === "supermarket") market = Math.min(market, d);
      if (t.amenity === "school") school = Math.min(school, d);
      if (t.highway === "motorway") motorway = Math.min(motorway, d);
      if (t.highway === "trunk" || t.highway === "primary")
        majorRoad = Math.min(majorRoad, d);
      if (t.railway === "rail") railway = Math.min(railway, d);
    }
    return {
      nearestStopMeters: Number.isFinite(stop) ? Math.round(stop) : undefined,
      supermarketMeters: Number.isFinite(market) ? Math.round(market) : undefined,
      schoolMeters: Number.isFinite(school) ? Math.round(school) : undefined,
      nearestMotorwayMeters: Number.isFinite(motorway) ? Math.round(motorway) : undefined,
      nearestMajorRoadMeters: Number.isFinite(majorRoad) ? Math.round(majorRoad) : undefined,
      nearestRailwayMeters: Number.isFinite(railway) ? Math.round(railway) : undefined,
    };
  } catch {
    return {};
  }
}
