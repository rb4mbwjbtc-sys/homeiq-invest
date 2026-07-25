const GEOADMIN_SEARCH = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";
const GEOADMIN_IDENTIFY = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
const PXWEB_VACANCY = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0902020300_101/px-x-0902020300_101/px-x-0902020300_101.px";
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];
const SEARCH_RADII = [1000, 2500, 5000, 10000];
let vacancyMetadataCache = null;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=86400, stale-while-revalidate=604800" : "no-store");
  res.end(JSON.stringify(body));
};
const cleanLabel = (value = "") => value.replace(/<[^>]+>/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HomeIQ-Invest/3.1 (Swiss real-estate analysis)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeAddress(street, postalCode, city) {
  const query = [street, postalCode, city].filter(Boolean).join(" ");
  const params = new URLSearchParams({ searchText: query, type: "locations", origins: "address", sr: "2056", limit: "20" });
  const payload = await fetchJson(`${GEOADMIN_SEARCH}?${params}`);
  const candidates = payload.results || [];
  if (!candidates.length) throw new Error("Die Adresse wurde im amtlichen Schweizer Adressverzeichnis nicht gefunden.");
  const streetToken = street.toLowerCase().replace(/\d+.*/, "").trim().split(/\s+/)[0] || "";
  const cityToken = city.toLowerCase();
  const best = candidates.find((item) => {
    const detail = `${item.attrs?.detail || ""} ${item.attrs?.label || ""}`.toLowerCase();
    return (!streetToken || detail.includes(streetToken)) && detail.includes(cityToken);
  }) || candidates.find((item) => String(item.attrs?.label || "").includes(postalCode)) || candidates[0];
  const attrs = best.attrs || {};
  const lat = Number(attrs.lat);
  const lon = Number(attrs.lon);
  const easting = Number(attrs.y);
  const northing = Number(attrs.x);
  if (![lat, lon, easting, northing].every(Number.isFinite)) throw new Error("Die amtliche Adresse enthält keine verwertbaren Koordinaten.");
  return { formattedAddress: cleanLabel(attrs.label) || query, lat, lon, easting, northing };
}

async function identifyLayer(layer, geo, tolerance = 8) {
  const d = 120;
  const params = new URLSearchParams({
    geometry: `${geo.easting},${geo.northing}`,
    geometryType: "esriGeometryPoint",
    geometryFormat: "geojson",
    sr: "2056",
    imageDisplay: "1000,800,96",
    mapExtent: `${geo.easting - d},${geo.northing - d},${geo.easting + d},${geo.northing + d}`,
    tolerance: String(tolerance),
    layers: `all:${layer}`,
    returnGeometry: "false",
    lang: "de",
  });
  try {
    const payload = await fetchJson(`${GEOADMIN_IDENTIFY}?${params}`);
    return payload.results?.[0]?.properties || null;
  } catch {
    return null;
  }
}

function findValue(properties, patterns) {
  if (!properties) return null;
  for (const [key, value] of Object.entries(properties)) {
    const normalized = key.toLowerCase();
    if (patterns.some((pattern) => normalized.includes(pattern)) && value !== null && value !== "") return value;
  }
  return null;
}

function parseTransitClass(properties) {
  const raw = findValue(properties, ["gueteklasse", "güteklasse", "klasse", "quality"]);
  const match = raw === null ? null : String(raw).toUpperCase().match(/(?:^|\s)([A-D])(?:$|\s)/);
  return match ? match[1] : null;
}
function parseNoiseDb(properties) {
  const raw = findValue(properties, ["db", "lr_tag", "laerm", "lärm", "value", "wert"]);
  const match = raw === null ? null : String(raw).replace(",", ".").match(/\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : NaN;
  return Number.isFinite(value) && value >= 30 && value <= 100 ? value : null;
}
function parseMunicipality(properties, fallbackName) {
  if (!properties) return { municipality: fallbackName, municipalityBfs: null };
  const municipality = findValue(properties, ["gemname", "gemeinde", "name"]) || fallbackName;
  const bfsRaw = findValue(properties, ["bfs_nummer", "bfs", "gdenr"]);
  const bfsMatch = bfsRaw === null ? null : String(bfsRaw).match(/\d{1,4}/);
  return { municipality: String(municipality), municipalityBfs: bfsMatch ? bfsMatch[0] : null };
}
async function fetchGwr(geo) {
  const p = await identifyLayer("ch.bfs.gebaeude_wohnungs_register", geo, 12);
  if (!p) return null;
  return {
    egid: findValue(p, ["egid"]),
    buildingCategory: findValue(p, ["gkat", "gebaeudekategorie"]),
    constructionYear: Number(findValue(p, ["gbauj", "baujahr"])) || null,
    municipality: findValue(p, ["gdename", "gemeinde"]),
    municipalityBfs: String(findValue(p, ["gdenr", "bfs"]) || "") || null,
    sourceUpdatedAt: findValue(p, ["datenstand", "stand"]),
  };
}

const haversine = (a, b) => {
  const R = 6371000;
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

function classifyElement(tags) {
  if (tags.highway === "motorway_junction") return "motorway";
  if (["supermarket", "convenience", "grocery", "department_store", "mall"].includes(tags.shop)) return "shopping";
  if (["school", "kindergarten", "childcare", "college"].includes(tags.amenity)) return "school";
  if (
    tags.highway === "bus_stop" ||
    ["station", "halt", "tram_stop"].includes(tags.railway) ||
    ["platform", "stop_position", "station"].includes(tags.public_transport) ||
    tags.amenity === "bus_station"
  ) return "transit";
  return null;
}

async function runOverpass(query) {
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await fetchJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }).toString(),
      }, 22000);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("OpenStreetMap-Abfrage fehlgeschlagen");
}

async function fetchAmenitiesAdaptive(geo) {
  const origin = { lat: geo.lat, lon: geo.lon };
  const result = {
    publicTransportMeters: null,
    shoppingMeters: null,
    schoolMeters: null,
    motorwayMeters: null,
    radiiKm: { transit: null, shopping: null, school: null, motorway: null },
    maximumRadiusKm: 0,
  };

  for (const radius of SEARCH_RADII) {
    const query = `[out:json][timeout:18];(
      nwr(around:${radius},${geo.lat},${geo.lon})[public_transport~"platform|stop_position|station"];
      nwr(around:${radius},${geo.lat},${geo.lon})[railway~"station|halt|tram_stop"];
      nwr(around:${radius},${geo.lat},${geo.lon})[highway=bus_stop];
      nwr(around:${radius},${geo.lat},${geo.lon})[amenity=bus_station];
      nwr(around:${radius},${geo.lat},${geo.lon})[shop~"supermarket|convenience|grocery|department_store|mall"];
      nwr(around:${radius},${geo.lat},${geo.lon})[amenity~"school|kindergarten|childcare|college"];
      nwr(around:${radius},${geo.lat},${geo.lon})[highway=motorway_junction];
    );out center tags;`;
    try {
      const payload = await runOverpass(query);
      const nearest = { transit: Infinity, shopping: Infinity, school: Infinity, motorway: Infinity };
      for (const element of payload.elements || []) {
        const lat = element.lat ?? element.center?.lat;
        const lon = element.lon ?? element.center?.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const category = classifyElement(element.tags || {});
        if (!category) continue;
        nearest[category] = Math.min(nearest[category], haversine(origin, { lat, lon }));
      }
      for (const category of ["transit", "shopping", "school", "motorway"]) {
        const key = category === "transit" ? "publicTransportMeters" : `${category}Meters`;
        if (result[key] === null && Number.isFinite(nearest[category])) {
          result[key] = Math.round(nearest[category]);
          result.radiiKm[category] = radius / 1000;
          result.maximumRadiusKm = Math.max(result.maximumRadiusKm, radius / 1000);
        }
      }
      if (result.publicTransportMeters !== null && result.shoppingMeters !== null && result.schoolMeters !== null && result.motorwayMeters !== null) break;
    } catch {
      // Try the next radius and alternate endpoint. Missing categories remain null.
    }
  }
  return result;
}

async function fetchVacancyRate(municipalityBfs, municipalityName) {
  try {
    if (!vacancyMetadataCache) vacancyMetadataCache = await fetchJson(PXWEB_VACANCY, {}, 22000);
    const variables = vacancyMetadataCache.variables || [];
    if (variables.length < 5) return null;
    const [region, rooms, type, metric, year] = variables;
    const labels = region.valueTexts || [];
    const values = region.values || [];
    const bfs = municipalityBfs ? String(municipalityBfs).padStart(4, "0") : "";
    let regionIndex = labels.findIndex((label) => bfs && String(label).includes(bfs));
    if (regionIndex < 0) regionIndex = labels.findIndex((label) => municipalityName && String(label).toLowerCase().includes(municipalityName.toLowerCase()));
    if (regionIndex < 0) return null;
    const pickTotal = (variable) => {
      const texts = variable.valueTexts || [];
      const idx = texts.findIndex((text) => /total|insgesamt|alle/i.test(String(text)));
      return variable.values[idx >= 0 ? idx : 0];
    };
    const metricTexts = metric.valueTexts || [];
    const metricIndex = metricTexts.findIndex((text) => /ziffer|anteil|prozent/i.test(String(text)));
    const latestYear = year.values[year.values.length - 1];
    const body = { query: [
      { code: region.code, selection: { filter: "item", values: [values[regionIndex]] } },
      { code: rooms.code, selection: { filter: "item", values: [pickTotal(rooms)] } },
      { code: type.code, selection: { filter: "item", values: [pickTotal(type)] } },
      { code: metric.code, selection: { filter: "item", values: [metric.values[metricIndex >= 0 ? metricIndex : metric.values.length - 1]] } },
      { code: year.code, selection: { filter: "item", values: [latestYear] } },
    ], response: { format: "json-stat2" } };
    const data = await fetchJson(PXWEB_VACANCY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 22000);
    const value = Array.isArray(data.value) ? Number(data.value[0]) : null;
    return Number.isFinite(value) ? { value, year: String(latestYear) } : null;
  } catch {
    return null;
  }
}

function vacancyRiskScore(rate) {
  if (rate === null) return 50;
  if (rate <= 0.5) return 8;
  if (rate <= 1) return 18 + (rate - 0.5) * 24;
  if (rate <= 2) return 30 + (rate - 1) * 30;
  if (rate <= 3) return 60 + (rate - 2) * 25;
  return clamp(85 + (rate - 3) * 5);
}
const walkingMinutes = (meters) => meters === null ? null : Math.max(1, Math.round(meters / 80));
const drivingMinutes = (meters) => meters === null ? null : Math.max(2, Math.round(meters / 650));

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const street = String(req.query.street || "").trim();
  const postalCode = String(req.query.postalCode || "").trim();
  const city = String(req.query.city || "").trim();
  if (!postalCode || !city) return json(res, 400, { error: "PLZ und Ort sind erforderlich." });

  try {
    const geo = await geocodeAddress(street, postalCode, city);
    const [gwr, municipalityProps, transitProps, roadNoiseProps, railNoiseProps, amenities] = await Promise.all([
      fetchGwr(geo),
      identifyLayer("ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill", geo, 6),
      identifyLayer("ch.are.gueteklassen_oev", geo, 8),
      identifyLayer("ch.bafu.laerm-strassenlaerm_tag", geo, 10),
      identifyLayer("ch.bafu.laerm-bahnlaerm_tag", geo, 10),
      fetchAmenitiesAdaptive(geo),
    ]);
    const municipality = parseMunicipality(municipalityProps, gwr?.municipality || city);
    const municipalityName = gwr?.municipality || municipality.municipality || city;
    const municipalityBfs = gwr?.municipalityBfs || municipality.municipalityBfs;
    const vacancy = await fetchVacancyRate(municipalityBfs, municipalityName);
    const transitClass = parseTransitClass(transitProps);
    const roadNoiseDb = parseNoiseDb(roadNoiseProps);
    const railNoiseDb = parseNoiseDb(railNoiseProps);
    const maxNoiseDb = Math.max(roadNoiseDb || 0, railNoiseDb || 0) || null;

    const actual = {
      publicTransportMinutes: walkingMinutes(amenities.publicTransportMeters),
      shoppingMinutes: walkingMinutes(amenities.shoppingMeters),
      schoolMinutes: walkingMinutes(amenities.schoolMeters),
      motorwayMinutes: drivingMinutes(amenities.motorwayMeters),
      noiseLevel: maxNoiseDb === null ? null : Math.round(clamp((maxNoiseDb - 35) * 2.1)),
      vacancyRisk: vacancy?.value == null ? null : Math.round(vacancyRiskScore(vacancy.value)),
    };
    const transitClassScore = { A: 95, B: 82, C: 68, D: 54 }[transitClass] || null;
    const vacancyRiskForScore = actual.vacancyRisk ?? 50;
    const ptForScore = actual.publicTransportMinutes ?? (transitClass ? { A: 3, B: 6, C: 10, D: 15 }[transitClass] : 15);
    const shopForScore = actual.shoppingMinutes ?? 18;
    const schoolForScore = actual.schoolMinutes ?? 20;
    const noiseForScore = actual.noiseLevel ?? 50;
    const municipalityDemand = Math.round(clamp(100 - vacancyRiskForScore * 0.78 + (transitClassScore ? (transitClassScore - 50) * 0.22 : 0)));
    const accessibility = clamp(100 - ptForScore * 3 - shopForScore * 1.2 - schoolForScore * 0.8);
    const microLocation = Math.round(clamp(accessibility * 0.55 + (100 - noiseForScore) * 0.25 + municipalityDemand * 0.20));

    const metrics = {
      publicTransportMinutes: actual.publicTransportMinutes ?? 15,
      shoppingMinutes: actual.shoppingMinutes ?? 18,
      schoolMinutes: actual.schoolMinutes ?? 20,
      motorwayMinutes: actual.motorwayMinutes ?? 18,
      noiseLevel: actual.noiseLevel ?? 50,
      municipalityDemand,
      vacancyRisk: actual.vacancyRisk ?? 50,
      microLocation,
    };
    const missing = [];
    if (!transitClass && amenities.publicTransportMeters === null) missing.push("ÖV-Anbindung");
    if (vacancy?.value == null) missing.push("Leerwohnungsziffer");
    if (maxNoiseDb === null) missing.push("Lärmdaten");
    if (amenities.shoppingMeters === null) missing.push("Einkauf");
    if (amenities.schoolMeters === null) missing.push("Schule/Betreuung");
    if (amenities.motorwayMeters === null) missing.push("Autobahnanschluss");
    const foundCount = 6 - missing.length;

    return json(res, 200, {
      address: { formatted: geo.formattedAddress, lat: geo.lat, lon: geo.lon, easting: geo.easting, northing: geo.northing },
      building: gwr ? { ...gwr, municipality: municipalityName, municipalityBfs } : { egid: null, buildingCategory: null, constructionYear: null, municipality: municipalityName, municipalityBfs, sourceUpdatedAt: null },
      metrics,
      evidence: {
        transitClass,
        vacancyRate: vacancy?.value ?? null,
        vacancyYear: vacancy?.year ?? null,
        roadNoiseDb,
        railNoiseDb,
        nearestPublicTransportMeters: amenities.publicTransportMeters,
        nearestShoppingMeters: amenities.shoppingMeters,
        nearestSchoolMeters: amenities.schoolMeters,
        nearestMotorwayJunctionMeters: amenities.motorwayMeters,
        searchRadiusKm: amenities.maximumRadiusKm || 10,
        categoryRadiusKm: amenities.radiiKm,
      },
      quality: foundCount >= 5 ? "hoch" : foundCount >= 3 ? "mittel" : "eingeschränkt",
      missing,
      loadedAt: new Date().toISOString(),
      sources: [
        { name: "swisstopo / GeoAdmin", detail: "Amtliche Adress-, Gemeinde- und Gebäudedaten" },
        { name: "Bundesamt für Raumentwicklung ARE", detail: "ÖV-Güteklassen" },
        { name: "Bundesamt für Umwelt BAFU", detail: "Strassen- und Bahnlärm" },
        { name: "Bundesamt für Statistik BFS", detail: "Gebäude- und Wohnungsregister sowie Leerwohnungszählung" },
        { name: "OpenStreetMap / Overpass", detail: `Adaptive Umkreissuche bis ${amenities.maximumRadiusKm || 10} km für ÖV, Einkauf, Schulen und Autobahnanschlüsse` },
      ],
    });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "Standortdaten konnten nicht geladen werden." });
  }
}
