const GEOADMIN_SEARCH = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";
const GEOADMIN_IDENTIFY = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
const TRANSPORT_LOCATIONS = "https://transport.opendata.ch/v1/locations";
const PXWEB_VACANCY = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0902020300_101/px-x-0902020300_101/px-x-0902020300_101.px";
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const GLOBAL_TIMEOUT_MS = 9000;
const SOURCE_TIMEOUT_MS = 3200;
const OVERPASS_TIMEOUT_MS = 4200;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const responseCache = new Map();
let vacancyMetadataCache = null;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";


const json = (res, status, body, cacheSeconds = 0) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    status === 200 && cacheSeconds > 0
      ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 7}`
      : "no-store",
  );
  res.end(JSON.stringify(body));
};

const cleanLabel = (value = "") => value.replace(/<[^>]+>/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const normalizeKey = (...parts) => parts.join("|").trim().toLowerCase().replace(/\s+/g, " ");
const walkingMinutes = (meters) => meters === null ? null : Math.max(1, Math.round(meters / 80));
const drivingMinutes = (meters) => meters === null ? null : Math.max(2, Math.round(meters / 650));

function timeoutError(label) {
  const error = new Error(`${label} hat das Zeitlimit überschritten.`);
  error.code = "TIMEOUT";
  return error;
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}, timeoutMs = SOURCE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HomeIQ-Invest/3.2 (Swiss real-estate analysis; contact via deployed application)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function settledSource(name, task) {
  const startedAt = Date.now();
  try {
    const value = await task();
    return { name, status: value == null ? "unavailable" : "loaded", durationMs: Date.now() - startedAt, value };
  } catch (error) {
    return {
      name,
      status: error?.code === "TIMEOUT" || error?.name === "AbortError" ? "timeout" : "error",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      value: null,
    };
  }
}


async function readPersistentCache(cacheKey) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/location_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=payload,expires_at&limit=1`;
    const rows = await fetchJson(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }, 1200);
    const row = rows?.[0];
    if (!row?.payload || !row?.expires_at || Date.parse(row.expires_at) <= Date.now()) return null;
    return row.payload;
  } catch {
    return null;
  }
}

async function writePersistentCache(cacheKey, payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetchJson(`${SUPABASE_URL}/rest/v1/location_cache?on_conflict=cache_key`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        payload,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }, 1200);
  } catch {
    // Persistent cache is optional and must never block an analysis.
  }
}

async function geocodeAddress(street, postalCode, city) {
  const query = [street, postalCode, city].filter(Boolean).join(" ");
  const params = new URLSearchParams({ searchText: query, type: "locations", origins: "address", sr: "2056", limit: "20" });
  const payload = await fetchJson(`${GEOADMIN_SEARCH}?${params}`, {}, 3500);
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
  const payload = await fetchJson(`${GEOADMIN_IDENTIFY}?${params}`);
  return payload.results?.[0]?.properties || null;
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

function inferRadiusKm(meters) {
  if (meters == null) return null;
  if (meters <= 1000) return 1;
  if (meters <= 2500) return 2.5;
  if (meters <= 5000) return 5;
  return 10;
}

async function fetchNearestTransit(geo) {
  const params = new URLSearchParams({ x: String(geo.lat), y: String(geo.lon), type: "station" });
  const payload = await fetchJson(`${TRANSPORT_LOCATIONS}?${params}`, {}, 3000);
  const stations = (payload.stations || []).filter((station) => Number.isFinite(Number(station.distance)));
  if (!stations.length) return null;
  const station = stations.sort((a, b) => Number(a.distance) - Number(b.distance))[0];
  return { meters: Math.round(Number(station.distance)), name: station.name || null };
}

function classifyElement(tags) {
  if (tags.highway === "motorway_junction") return "motorway";
  if (["supermarket", "convenience", "grocery", "department_store", "mall"].includes(tags.shop)) return "shopping";
  if (["school", "kindergarten", "childcare", "college"].includes(tags.amenity)) return "school";
  return null;
}

async function fetchPoiSnapshot(geo) {
  const query = `[out:json][timeout:4];(
    nwr(around:10000,${geo.lat},${geo.lon})[shop~"supermarket|convenience|grocery|department_store|mall"];
    nwr(around:10000,${geo.lat},${geo.lon})[amenity~"school|kindergarten|childcare|college"];
    nwr(around:10000,${geo.lat},${geo.lon})[highway=motorway_junction];
  );out center tags;`;
  const requests = OVERPASS_ENDPOINTS.map((endpoint) => fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString(),
  }, OVERPASS_TIMEOUT_MS));
  const payload = await withTimeout(Promise.any(requests), OVERPASS_TIMEOUT_MS + 300, "OpenStreetMap-POI-Suche");
  const origin = { lat: geo.lat, lon: geo.lon };
  const nearest = { shopping: Infinity, school: Infinity, motorway: Infinity };
  for (const element of payload.elements || []) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const category = classifyElement(element.tags || {});
    if (!category) continue;
    nearest[category] = Math.min(nearest[category], haversine(origin, { lat, lon }));
  }
  return {
    shoppingMeters: Number.isFinite(nearest.shopping) ? Math.round(nearest.shopping) : null,
    schoolMeters: Number.isFinite(nearest.school) ? Math.round(nearest.school) : null,
    motorwayMeters: Number.isFinite(nearest.motorway) ? Math.round(nearest.motorway) : null,
  };
}

async function fetchVacancyRate(municipalityBfs, municipalityName) {
  if (!vacancyMetadataCache) vacancyMetadataCache = await fetchJson(PXWEB_VACANCY, {}, 2600);
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
  const data = await fetchJson(PXWEB_VACANCY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 2600);
  const value = Array.isArray(data.value) ? Number(data.value[0]) : null;
  return Number.isFinite(value) ? { value, year: String(latestYear) } : null;
}

function vacancyRiskScore(rate) {
  if (rate === null) return 50;
  if (rate <= 0.5) return 8;
  if (rate <= 1) return 18 + (rate - 0.5) * 24;
  if (rate <= 2) return 30 + (rate - 1) * 30;
  if (rate <= 3) return 60 + (rate - 2) * 25;
  return clamp(85 + (rate - 3) * 5);
}

async function buildLocationReport(street, postalCode, city) {
  const geo = await withTimeout(geocodeAddress(street, postalCode, city), 4000, "Amtliche Adresssuche");

  const officialResults = await Promise.all([
    settledSource("gwr", () => fetchGwr(geo)),
    settledSource("municipality", () => identifyLayer("ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill", geo, 6)),
    settledSource("transitClass", () => identifyLayer("ch.are.gueteklassen_oev", geo, 8)),
    settledSource("roadNoise", () => identifyLayer("ch.bafu.laerm-strassenlaerm_tag", geo, 10)),
    settledSource("railNoise", () => identifyLayer("ch.bafu.laerm-bahnlaerm_tag", geo, 10)),
    settledSource("nearestTransit", () => fetchNearestTransit(geo)),
    settledSource("poi", () => fetchPoiSnapshot(geo)),
  ]);

  const byName = Object.fromEntries(officialResults.map((item) => [item.name, item]));
  const gwr = byName.gwr.value;
  const municipality = parseMunicipality(byName.municipality.value, gwr?.municipality || city);
  const municipalityName = gwr?.municipality || municipality.municipality || city;
  const municipalityBfs = gwr?.municipalityBfs || municipality.municipalityBfs;
  const vacancyResult = await settledSource("vacancy", () => fetchVacancyRate(municipalityBfs, municipalityName));
  const sourceResults = [...officialResults, vacancyResult];

  const transitClass = parseTransitClass(byName.transitClass.value);
  const roadNoiseDb = parseNoiseDb(byName.roadNoise.value);
  const railNoiseDb = parseNoiseDb(byName.railNoise.value);
  const maxNoiseDb = Math.max(roadNoiseDb || 0, railNoiseDb || 0) || null;
  const transit = byName.nearestTransit.value;
  const poi = byName.poi.value || {};
  const vacancy = vacancyResult.value;

  const actual = {
    publicTransportMinutes: walkingMinutes(transit?.meters ?? null),
    shoppingMinutes: walkingMinutes(poi.shoppingMeters ?? null),
    schoolMinutes: walkingMinutes(poi.schoolMeters ?? null),
    motorwayMinutes: drivingMinutes(poi.motorwayMeters ?? null),
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

  const evidence = {
    transitClass,
    vacancyRate: vacancy?.value ?? null,
    vacancyYear: vacancy?.year ?? null,
    roadNoiseDb,
    railNoiseDb,
    nearestPublicTransportMeters: transit?.meters ?? null,
    nearestShoppingMeters: poi.shoppingMeters ?? null,
    nearestSchoolMeters: poi.schoolMeters ?? null,
    nearestMotorwayJunctionMeters: poi.motorwayMeters ?? null,
    searchRadiusKm: 10,
    categoryRadiusKm: {
      transit: inferRadiusKm(transit?.meters ?? null),
      shopping: inferRadiusKm(poi.shoppingMeters ?? null),
      school: inferRadiusKm(poi.schoolMeters ?? null),
      motorway: inferRadiusKm(poi.motorwayMeters ?? null),
    },
  };

  const missing = [];
  if (!transitClass && evidence.nearestPublicTransportMeters === null) missing.push("ÖV-Anbindung");
  if (evidence.vacancyRate === null) missing.push("Leerwohnungsziffer");
  if (maxNoiseDb === null) missing.push("Lärmdaten");
  if (evidence.nearestShoppingMeters === null) missing.push("Einkauf");
  if (evidence.nearestSchoolMeters === null) missing.push("Schule/Betreuung");
  if (evidence.nearestMotorwayJunctionMeters === null) missing.push("Autobahnanschluss");
  const foundCount = 6 - missing.length;

  return {
    address: { formatted: geo.formattedAddress, lat: geo.lat, lon: geo.lon, easting: geo.easting, northing: geo.northing },
    building: gwr ? { ...gwr, municipality: municipalityName, municipalityBfs } : { egid: null, buildingCategory: null, constructionYear: null, municipality: municipalityName, municipalityBfs, sourceUpdatedAt: null },
    metrics,
    evidence,
    quality: foundCount >= 5 ? "hoch" : foundCount >= 3 ? "mittel" : "eingeschränkt",
    missing,
    loadedAt: new Date().toISOString(),
    cache: { hit: false, ttlDays: 30 },
    sourceStatus: sourceResults.map(({ name, status, durationMs, error }) => ({ name, status, durationMs, error: error || null })),
    sources: [
      { name: "swisstopo / GeoAdmin", detail: "Amtliche Adresse, Gemeinde, GWR, ÖV-Güteklasse und Lärmlayer" },
      { name: "Transport API Schweiz", detail: "Nächstgelegene ÖV-Haltestelle anhand der Koordinaten" },
      { name: "Bundesamt für Statistik BFS", detail: "Leerwohnungsziffer nach Gemeinde, mit kurzem Zeitlimit" },
      { name: "OpenStreetMap / Overpass", detail: "Einmalige parallele POI-Suche bis 10 km für Einkauf, Schule/Betreuung und Autobahn" },
    ],
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const street = String(req.query.street || "").trim();
  const postalCode = String(req.query.postalCode || "").trim();
  const city = String(req.query.city || "").trim();
  if (!postalCode || !city) return json(res, 400, { error: "PLZ und Ort sind erforderlich." });

  const cacheKey = normalizeKey(street, postalCode, city);
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return json(res, 200, { ...cached.payload, cache: { hit: true, ttlDays: 30, layer: "memory" } }, 86400);
  }

  const persistent = await readPersistentCache(cacheKey);
  if (persistent) {
    responseCache.set(cacheKey, { createdAt: Date.now(), payload: persistent });
    return json(res, 200, { ...persistent, cache: { hit: true, ttlDays: 30, layer: "supabase" } }, 86400);
  }

  try {
    const report = await withTimeout(buildLocationReport(street, postalCode, city), GLOBAL_TIMEOUT_MS, "Standortanalyse");
    responseCache.set(cacheKey, { createdAt: Date.now(), payload: report });
    void writePersistentCache(cacheKey, report);
    return json(res, 200, report, 86400);
  } catch (error) {
    return json(res, 504, {
      error: error instanceof Error ? error.message : "Standortdaten konnten nicht rechtzeitig geladen werden.",
      retryable: true,
      timeoutSeconds: Math.round(GLOBAL_TIMEOUT_MS / 1000),
    });
  }
}
