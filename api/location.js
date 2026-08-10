const GEOADMIN_SEARCH = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";
const GEOADMIN_IDENTIFY = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
const PXWEB_VACANCY = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0902020300_101/px-x-0902020300_101/px-x-0902020300_101.px";
const TRANSPORT_LOCATIONS = "https://transport.opendata.ch/v1/locations";
const OPENDATA_SEARCH = "https://ckan.opendata.swiss/api/3/action/package_search";
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const LAYERS = {
  municipality: "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill",
  gwr: "ch.bfs.gebaeude_wohnungs_register",
  transitClass: "ch.are.gueteklassen_oev",
  roadNoise: "ch.bafu.laerm-strassenlaerm_tag",
  railNoise: "ch.bafu.laerm-bahnlaerm_tag",
};

let vacancyMetadataCache = null;
const memoryCache = new Map();

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=21600, stale-while-revalidate=604800" : "no-store");
  res.end(JSON.stringify(body));
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const cleanLabel = (value = "") => String(value).replace(/<[^>]+>/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();
const walkingMinutes = (meters) => meters == null ? null : Math.max(1, Math.round(meters / 80));
const drivingMinutes = (meters) => meters == null ? null : Math.max(2, Math.round(meters / 650));

async function fetchJson(url, options = {}, timeoutMs = 4200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HomeIQ-Invest/4.5 (official-data-first Swiss real-estate analysis)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "text/csv,text/plain,application/geo+json,application/json,*/*",
        "User-Agent": "HomeIQ-Invest/4.5 (official-data-first Swiss real-estate analysis)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function errorStatus(error) {
  if (error?.name === "AbortError") return "timeout";
  return "error";
}

async function runDiagnostic(name, source, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return {
      value,
      diagnostic: {
        name,
        source,
        status: value == null ? "not_found" : "loaded",
        durationMs: Date.now() - started,
      },
    };
  } catch (error) {
    return {
      value: null,
      diagnostic: {
        name,
        source,
        status: errorStatus(error),
        durationMs: Date.now() - started,
        detail: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
    };
  }
}

async function geocodeAddress(street, postalCode, city) {
  const query = [street, postalCode, city].filter(Boolean).join(" ");
  const params = new URLSearchParams({ searchText: query, type: "locations", origins: "address", sr: "2056", limit: "20" });
  const payload = await fetchJson(`${GEOADMIN_SEARCH}?${params}`, {}, 5000);
  const candidates = payload.results || [];
  if (!candidates.length) throw new Error("Die Adresse wurde im amtlichen Schweizer Adressverzeichnis nicht gefunden.");
  const streetToken = street.toLowerCase().replace(/\d+.*/, "").trim().split(/\s+/)[0] || "";
  const cityToken = city.toLowerCase();
  const best = candidates.find((item) => {
    const detail = `${item.attrs?.detail || ""} ${item.attrs?.label || ""}`.toLowerCase();
    return (!streetToken || detail.includes(streetToken)) && (!cityToken || detail.includes(cityToken));
  }) || candidates.find((item) => String(item.attrs?.label || "").includes(postalCode)) || candidates[0];
  const attrs = best.attrs || {};
  const lat = Number(attrs.lat);
  const lon = Number(attrs.lon);
  const easting = Number(attrs.y);
  const northing = Number(attrs.x);
  if (![lat, lon, easting, northing].every(Number.isFinite)) throw new Error("Die amtliche Adresse enthält keine verwertbaren Koordinaten.");
  return { formattedAddress: cleanLabel(attrs.label) || query, lat, lon, easting, northing };
}

async function identifyLayers(layerIds, geo, tolerance = 8, radiusMeters = 120) {
  const d = Math.max(40, radiusMeters);
  const params = new URLSearchParams({
    geometry: `${geo.easting},${geo.northing}`,
    geometryType: "esriGeometryPoint",
    geometryFormat: "geojson",
    sr: "2056",
    imageDisplay: "1000,1000,96",
    mapExtent: `${geo.easting - d},${geo.northing - d},${geo.easting + d},${geo.northing + d}`,
    tolerance: String(tolerance),
    layers: `all:${layerIds.join(",")}`,
    returnGeometry: "false",
    lang: "de",
    limit: "200",
  });
  const payload = await fetchJson(`${GEOADMIN_IDENTIFY}?${params}`, {}, 3800);
  const map = {};
  for (const result of payload.results || []) {
    const layer = result.layerBodId || result.layerId;
    if (!layer || map[layer]) continue;
    map[layer] = result.properties || result.attributes || null;
  }
  return map;
}

async function identifyNoiseAdaptive(layer, geo) {
  for (const spec of [
    { tolerance: 0, radius: 50 },
    { tolerance: 4, radius: 150 },
    { tolerance: 8, radius: 300 },
  ]) {
    try {
      const map = await identifyLayers([layer], geo, spec.tolerance, spec.radius);
      if (map[layer]) return map[layer];
    } catch {
      // continue with a slightly larger official spatial query
    }
  }
  return null;
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
  const match = raw == null ? null : String(raw).toUpperCase().match(/(?:^|\s)([A-D])(?:$|\s)/);
  return match ? match[1] : null;
}

function parseNoiseDb(properties) {
  const raw = findValue(properties, ["db", "lr_tag", "laerm", "lärm", "value", "wert"]);
  const match = raw == null ? null : String(raw).replace(",", ".").match(/\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : NaN;
  return Number.isFinite(value) && value >= 30 && value <= 100 ? value : null;
}

function parseMunicipality(properties, fallbackName) {
  if (!properties) return { municipality: fallbackName, municipalityBfs: null };
  const municipality = findValue(properties, ["gemname", "gemeinde", "name"]) || fallbackName;
  const bfsRaw = findValue(properties, ["gde_nr", "bfs_nummer", "bfs", "gdenr"]);
  const bfsMatch = bfsRaw == null ? null : String(bfsRaw).match(/\d{1,4}/);
  return { municipality: String(municipality), municipalityBfs: bfsMatch ? bfsMatch[0] : null };
}

function parseGwr(p) {
  if (!p) return null;
  return {
    egid: findValue(p, ["egid"]),
    buildingCategory: findValue(p, ["gkat", "gebaeudekategorie"]),
    constructionYear: Number(findValue(p, ["gbauj", "baujahr"])) || null,
    municipality: findValue(p, ["gdename", "gemeinde"]),
    municipalityBfs: String(findValue(p, ["gdenr", "gde_nr", "bfs"]) || "") || null,
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

async function fetchNearestTransit(geo) {
  const params = new URLSearchParams({ x: String(geo.lat), y: String(geo.lon), type: "station" });
  const payload = await fetchJson(`${TRANSPORT_LOCATIONS}?${params}`, {}, 3500);
  const stations = payload.stations || [];
  let nearest = Infinity;
  for (const station of stations) {
    const lat = Number(station.coordinate?.x);
    const lon = Number(station.coordinate?.y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distance = haversine({ lat: geo.lat, lon: geo.lon }, { lat, lon });
    if (distance >= 20) nearest = Math.min(nearest, distance);
  }
  return Number.isFinite(nearest) ? Math.round(nearest) : null;
}

async function overpassNearest(geo, queryBody, maxRadiusMeters, timeoutMs = 4200) {
  const query = `[out:json][timeout:4];(${queryBody(maxRadiusMeters)});out center tags qt 2500;`;
  const requests = OVERPASS_ENDPOINTS.map((endpoint) => fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString(),
  }, timeoutMs));
  const settled = await Promise.allSettled(requests);
  let nearest = Infinity;
  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    for (const element of entry.value.elements || []) {
      const lat = Number(element.lat ?? element.center?.lat);
      const lon = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const distance = haversine({ lat: geo.lat, lon: geo.lon }, { lat, lon });
      if (distance <= maxRadiusMeters) nearest = Math.min(nearest, distance);
    }
  }
  return Number.isFinite(nearest) ? Math.round(nearest) : null;
}

const retailQuery = (r) => `
  nwr(around:${r},{{LAT}},{{LON}})[shop~"supermarket|convenience|grocery|general|department_store|mall"];
  nwr(around:${r},{{LAT}},{{LON}})[amenity=marketplace];`;
const schoolQuery = (r) => `
  nwr(around:${r},{{LAT}},{{LON}})[amenity~"school|kindergarten|childcare"];
  nwr(around:${r},{{LAT}},{{LON}})[social_facility~"childcare|day_care"];
  nwr(around:${r},{{LAT}},{{LON}})[office=educational_institution];`;
const motorwayQuery = (r) => `nwr(around:${r},{{LAT}},{{LON}})[highway=motorway_junction];`;

function withCoords(builder, geo) {
  return (radius) => builder(radius).replaceAll("{{LAT}}", String(geo.lat)).replaceAll("{{LON}}", String(geo.lon));
}

function radiusBucket(meters, stepsKm) {
  if (meters == null) return null;
  const km = meters / 1000;
  return stepsKm.find((step) => km <= step) ?? stepsKm[stepsKm.length - 1];
}

function displayName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.de || value.en || value.fr || Object.values(value)[0] || "";
  return "";
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (line) => line.split(delimiter).map((v) => v.replace(/^"|"$/g, "").trim());
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((value, i) => [headers[i] || `c${i}`, value])));
}

function coordFromRecord(record) {
  let lat = null;
  let lon = null;
  for (const [key, raw] of Object.entries(record || {})) {
    const k = key.toLowerCase();
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n)) continue;
    if (lat == null && /(^|_)(lat|latitude|breite|y_wgs)/.test(k) && n >= 45 && n <= 48.5) lat = n;
    if (lon == null && /(^|_)(lon|lng|longitude|laenge|länge|x_wgs)/.test(k) && n >= 5 && n <= 11) lon = n;
  }
  return lat != null && lon != null ? { lat, lon } : null;
}

function coordsFromJson(payload) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "Feature" && node.geometry?.type === "Point" && Array.isArray(node.geometry.coordinates)) {
      const [lon, lat] = node.geometry.coordinates.map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= 45 && lat <= 48.5 && lon >= 5 && lon <= 11) out.push({ lat, lon });
    }
    const direct = coordFromRecord(node);
    if (direct) out.push(direct);
    if (Array.isArray(node)) node.forEach(visit);
    else for (const value of Object.values(node)) if (typeof value === "object") visit(value);
  };
  visit(payload);
  return out;
}

async function fetchOfficialEducationPoi(geo, city) {
  const queries = [`schule ${city}`, `kindergarten ${city}`, `kinderbetreuung ${city}`];
  const resources = [];
  for (const q of queries) {
    try {
      const payload = await fetchJson(`${OPENDATA_SEARCH}?${new URLSearchParams({ q, rows: "4" })}`, {}, 2200);
      for (const pkg of payload.result?.results || []) {
        for (const resource of pkg.resources || []) {
          const format = String(resource.format || "").toLowerCase();
          if (!/geojson|json|csv/.test(format) || !resource.url) continue;
          if (!resources.some((r) => r.url === resource.url)) resources.push({ url: resource.url, format });
          if (resources.length >= 5) break;
        }
        if (resources.length >= 5) break;
      }
    } catch {
      // optional official catalogue source
    }
    if (resources.length >= 5) break;
  }
  let nearest = Infinity;
  for (const resource of resources.slice(0, 5)) {
    try {
      const text = await fetchText(resource.url, {}, 2600);
      let coords = [];
      if (/csv/.test(resource.format)) coords = parseCsv(text).map(coordFromRecord).filter(Boolean);
      else coords = coordsFromJson(JSON.parse(text));
      for (const point of coords) {
        const distance = haversine({ lat: geo.lat, lon: geo.lon }, point);
        if (distance <= 20000) nearest = Math.min(nearest, distance);
      }
    } catch {
      // continue to OSM fallback
    }
  }
  return Number.isFinite(nearest) ? Math.round(nearest) : null;
}

async function fetchVacancyRatePxWeb(municipalityBfs, municipalityName) {
  if (!vacancyMetadataCache) vacancyMetadataCache = await fetchJson(PXWEB_VACANCY, {}, 4200);
  const variables = vacancyMetadataCache.variables || [];
  if (variables.length < 2) return null;

  const region = variables.find((v) => /region|gemeinde|geograph/i.test(`${v.code} ${v.text}`)) || variables[0];
  const year = variables.find((v) => /jahr|year/i.test(`${v.code} ${v.text}`)) || variables[variables.length - 1];
  const metric = variables.find((v) => /messwert|kennzahl|indikator|einheit/i.test(`${v.code} ${v.text}`));
  const labels = region.valueTexts || [];
  const values = region.values || [];
  const bfs = municipalityBfs ? String(municipalityBfs).padStart(4, "0") : "";
  let regionIndex = labels.findIndex((label) => bfs && new RegExp(`(^|\\D)${Number(bfs)}(\\D|$)`).test(String(label)));
  if (regionIndex < 0) regionIndex = labels.findIndex((label) => municipalityName && String(label).toLowerCase().includes(municipalityName.toLowerCase()));
  if (regionIndex < 0) return null;

  const query = variables.map((variable) => {
    if (variable.code === region.code) return { code: variable.code, selection: { filter: "item", values: [values[regionIndex]] } };
    if (variable.code === year.code) return { code: variable.code, selection: { filter: "item", values: [variable.values[variable.values.length - 1]] } };
    if (metric && variable.code === metric.code) {
      const idx = (variable.valueTexts || []).findIndex((text) => /ziffer|anteil|prozent/i.test(String(text)));
      return { code: variable.code, selection: { filter: "item", values: [variable.values[idx >= 0 ? idx : variable.values.length - 1]] } };
    }
    const texts = variable.valueTexts || [];
    const totalIdx = texts.findIndex((text) => /total|insgesamt|alle/i.test(String(text)));
    return { code: variable.code, selection: { filter: "item", values: [variable.values[totalIdx >= 0 ? totalIdx : 0]] } };
  });

  const data = await fetchJson(PXWEB_VACANCY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, response: { format: "json-stat2" } }),
  }, 4200);
  const value = Array.isArray(data.value) ? Number(data.value[0]) : null;
  return Number.isFinite(value) ? { value, year: String(year.values[year.values.length - 1]), source: "BFS PxWeb" } : null;
}

function numberFromRecord(record, patterns, min = 0, max = 100) {
  for (const [key, raw] of Object.entries(record || {})) {
    const k = key.toLowerCase();
    if (!patterns.some((p) => k.includes(p))) continue;
    const n = Number(String(raw).replace(/[^0-9,.-]/g, "").replace("'", "").replace(",", "."));
    if (Number.isFinite(n) && n >= min && n <= max) return n;
  }
  return null;
}

async function fetchVacancyRateOpenData(municipalityBfs, municipalityName) {
  const params = new URLSearchParams({ q: `Leerwohnungsziffer Gemeinde ${municipalityName}`, rows: "8" });
  const payload = await fetchJson(`${OPENDATA_SEARCH}?${params}`, {}, 3000);
  const resources = [];
  for (const pkg of payload.result?.results || []) {
    const title = displayName(pkg.title).toLowerCase();
    if (!/leerwohn/.test(title)) continue;
    for (const resource of pkg.resources || []) {
      const format = String(resource.format || "").toLowerCase();
      if (/csv|json/.test(format) && resource.url) resources.push({ url: resource.url, format });
    }
  }
  for (const resource of resources.slice(0, 5)) {
    try {
      const text = await fetchText(resource.url, {}, 2800);
      const rows = /csv/.test(resource.format) ? parseCsv(text) : (() => {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        return parsed.results || parsed.data || parsed.features?.map((f) => ({ ...(f.properties || {}) })) || [];
      })();
      const matching = rows.filter((row) => {
        const blob = Object.values(row || {}).join(" ").toLowerCase();
        return (municipalityBfs && blob.includes(String(Number(municipalityBfs)))) || blob.includes(String(municipalityName || "").toLowerCase());
      });
      for (const row of matching) {
        const value = numberFromRecord(row, ["leerwohnungsziffer", "leerwohn", "quote", "anteil"], 0, 20);
        if (value != null) return { value, year: String(numberFromRecord(row, ["jahr", "year"], 2000, 2100) || ""), source: "opendata.swiss" };
      }
    } catch {
      // continue
    }
  }
  return null;
}

async function fetchVacancyRate(municipalityBfs, municipalityName) {
  try {
    const bfs = await fetchVacancyRatePxWeb(municipalityBfs, municipalityName);
    if (bfs) return bfs;
  } catch {
    // fallback below
  }
  try {
    return await fetchVacancyRateOpenData(municipalityBfs, municipalityName);
  } catch {
    return null;
  }
}

function vacancyRiskScore(rate) {
  if (rate == null) return 50;
  if (rate <= 0.5) return 8;
  if (rate <= 1) return 18 + (rate - 0.5) * 24;
  if (rate <= 2) return 30 + (rate - 1) * 30;
  if (rate <= 3) return 60 + (rate - 2) * 25;
  return clamp(85 + (rate - 3) * 5);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const street = String(req.query.street || "").trim();
  const postalCode = String(req.query.postalCode || "").trim();
  const city = String(req.query.city || "").trim();
  const propertyType = String(req.query.propertyType || "wohnung").trim();
  const rooms = Number(req.query.rooms || 0);
  if (!postalCode || !city) return json(res, 400, { error: "PLZ und Ort sind erforderlich." });

  const cacheKey = [street, postalCode, city, propertyType, rooms].join("|").toLowerCase();
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return json(res, 200, cached.value);

  try {
    const geocoded = await runDiagnostic("Amtliche Adresse", "swisstopo / GeoAdmin", () => geocodeAddress(street, postalCode, city));
    if (!geocoded.value) throw new Error("Die amtliche Adresse konnte nicht geladen werden.");
    const geo = geocoded.value;

    // First resolve authoritative municipal/building context. Downstream municipal data then uses the exact BFS number.
    const core = await runDiagnostic("Gemeinde, GWR und ÖV-Güteklasse", "GeoAdmin / BFS / ARE", () => identifyLayers([
      LAYERS.municipality,
      LAYERS.gwr,
      LAYERS.transitClass,
    ], geo, 10, 140));
    const layerMap = core.value || {};
    const gwr = parseGwr(layerMap[LAYERS.gwr]);
    const municipalityParsed = parseMunicipality(layerMap[LAYERS.municipality], gwr?.municipality || city);
    const municipalityName = gwr?.municipality || municipalityParsed.municipality || city;
    const municipalityBfs = gwr?.municipalityBfs || municipalityParsed.municipalityBfs;
    const transitClass = parseTransitClass(layerMap[LAYERS.transitClass]);

    const [transitD, roadNoiseD, railNoiseD, vacancyD, officialSchoolD, osmShoppingD, osmSchoolD, motorwayD] = await Promise.all([
      runDiagnostic("Nächster ÖV-Punkt", "OpenTransportData", () => fetchNearestTransit(geo)),
      runDiagnostic("Strassenlärm", "BAFU / GeoAdmin", () => identifyNoiseAdaptive(LAYERS.roadNoise, geo).then(parseNoiseDb)),
      runDiagnostic("Bahnlärm", "BAFU / GeoAdmin", () => identifyNoiseAdaptive(LAYERS.railNoise, geo).then(parseNoiseDb)),
      runDiagnostic("Leerwohnungsziffer", "BFS / opendata.swiss", () => fetchVacancyRate(municipalityBfs, municipalityName)),
      runDiagnostic("Schule / Betreuung (offiziell)", "opendata.swiss", () => fetchOfficialEducationPoi(geo, municipalityName)),
      runDiagnostic("Einkauf", "OpenStreetMap", () => overpassNearest(geo, withCoords(retailQuery, geo), 20000, 4300)),
      runDiagnostic("Schule / Betreuung (OSM)", "OpenStreetMap", () => overpassNearest(geo, withCoords(schoolQuery, geo), 20000, 4300)),
      runDiagnostic("Autobahnanschluss", "OpenStreetMap", () => overpassNearest(geo, withCoords(motorwayQuery, geo), 50000, 4300)),
    ]);

    const nearestPublicTransportMeters = transitD.value;
    const roadNoiseDb = roadNoiseD.value;
    const railNoiseDb = railNoiseD.value;
    const maxNoiseDb = Math.max(roadNoiseDb || 0, railNoiseDb || 0) || null;
    const vacancy = vacancyD.value;
    const schoolMeters = officialSchoolD.value ?? osmSchoolD.value;
    const shoppingMeters = osmShoppingD.value;
    const motorwayMeters = motorwayD.value;

    const actual = {
      publicTransportMinutes: walkingMinutes(nearestPublicTransportMeters),
      shoppingMinutes: walkingMinutes(shoppingMeters),
      schoolMinutes: walkingMinutes(schoolMeters),
      motorwayMinutes: drivingMinutes(motorwayMeters),
      noiseLevel: maxNoiseDb == null ? null : Math.round(clamp((maxNoiseDb - 35) * 2.1)),
      vacancyRisk: vacancy?.value == null ? null : Math.round(vacancyRiskScore(vacancy.value)),
    };

    const transitClassScore = { A: 95, B: 82, C: 68, D: 54 }[transitClass] || null;
    const vacancyRiskForScore = actual.vacancyRisk ?? 50;
    const ptForScore = actual.publicTransportMinutes ?? (transitClass ? { A: 3, B: 6, C: 10, D: 15 }[transitClass] : 12);
    const shopForScore = actual.shoppingMinutes ?? 12;
    const schoolForScore = actual.schoolMinutes ?? 15;
    const noiseForScore = actual.noiseLevel ?? 50;
    const municipalityDemand = Math.round(clamp(100 - vacancyRiskForScore * 0.78 + (transitClassScore ? (transitClassScore - 50) * 0.22 : 0)));
    const accessibility = clamp(100 - ptForScore * 3 - shopForScore * 1.2 - schoolForScore * 0.8);
    const microLocation = Math.round(clamp(accessibility * 0.55 + (100 - noiseForScore) * 0.25 + municipalityDemand * 0.20));

    const metrics = {
      publicTransportMinutes: actual.publicTransportMinutes ?? 12,
      shoppingMinutes: actual.shoppingMinutes ?? 12,
      schoolMinutes: actual.schoolMinutes ?? 15,
      motorwayMinutes: actual.motorwayMinutes ?? 15,
      noiseLevel: actual.noiseLevel ?? 50,
      municipalityDemand,
      vacancyRisk: actual.vacancyRisk ?? 50,
      microLocation,
    };

    const missing = [];
    if (!transitClass && nearestPublicTransportMeters == null) missing.push("ÖV-Anbindung");
    if (vacancy?.value == null) missing.push("Leerwohnungsziffer");
    if (maxNoiseDb == null) missing.push("Lärmdaten");
    if (shoppingMeters == null) missing.push("Einkauf");
    if (schoolMeters == null) missing.push("Schule/Betreuung");
    if (motorwayMeters == null) missing.push("Autobahnanschluss");
    const foundCount = 6 - missing.length;

    const diagnostics = [
      geocoded.diagnostic,
      core.diagnostic,
      transitD.diagnostic,
      vacancyD.diagnostic,
      roadNoiseD.diagnostic,
      railNoiseD.diagnostic,
      officialSchoolD.diagnostic,
      osmShoppingD.diagnostic,
      osmSchoolD.diagnostic,
      motorwayD.diagnostic,
    ];

    const body = {
      address: { formatted: geo.formattedAddress, lat: geo.lat, lon: geo.lon, easting: geo.easting, northing: geo.northing },
      building: gwr ? { ...gwr, municipality: municipalityName, municipalityBfs } : { egid: null, buildingCategory: null, constructionYear: null, municipality: municipalityName, municipalityBfs, sourceUpdatedAt: null },
      metrics,
      evidence: {
        transitClass,
        vacancyRate: vacancy?.value ?? null,
        vacancyYear: vacancy?.year ?? null,
        roadNoiseDb,
        railNoiseDb,
        nearestPublicTransportMeters,
        nearestShoppingMeters: shoppingMeters,
        nearestSchoolMeters: schoolMeters,
        nearestMotorwayJunctionMeters: motorwayMeters,
        searchRadiusKm: Math.max(10, radiusBucket(shoppingMeters, [1, 2.5, 5, 10, 15, 20]) || 0, radiusBucket(schoolMeters, [1, 2.5, 5, 10, 15, 20]) || 0, radiusBucket(motorwayMeters, [5, 10, 20, 35, 50]) || 0),
        categoryRadiusKm: {
          transit: nearestPublicTransportMeters == null ? null : Math.max(1, Math.ceil(nearestPublicTransportMeters / 1000)),
          shopping: radiusBucket(shoppingMeters, [1, 2.5, 5, 10, 15, 20]),
          school: radiusBucket(schoolMeters, [1, 2.5, 5, 10, 15, 20]),
          motorway: radiusBucket(motorwayMeters, [5, 10, 20, 35, 50]),
        },
        educationSource: officialSchoolD.value != null ? "opendata.swiss" : osmSchoolD.value != null ? "OpenStreetMap" : null,
        vacancySource: vacancy?.source ?? null,
      },
      market: {
        pricePerSqm: null, rentPerSqm: null, priceSource: null, rentSource: null,
        confidence: "eingeschränkt", radiusKm: null, discoveredDatasets: [], tiers: [],
        note: "Marktdaten werden von der separaten Markt-Pipeline geladen.",
      },
      quality: foundCount >= 5 ? "hoch" : foundCount >= 3 ? "mittel" : "eingeschränkt",
      missing,
      diagnostics,
      loadedAt: new Date().toISOString(),
      sources: [
        { name: "swisstopo / GeoAdmin", detail: "Amtliche Adresse, Gemeinde und Gebäudeverknüpfung" },
        { name: "Bundesamt für Statistik BFS", detail: "GWR und Leerwohnungsziffer; Gemeinde wird über die BFS-Nummer zugeordnet" },
        { name: "Bundesamt für Raumentwicklung ARE", detail: "ÖV-Güteklasse" },
        { name: "Bundesamt für Umwelt BAFU", detail: "Strassen- und Bahnlärm direkt am Objektstandort mit räumlichem Fallback" },
        { name: "OpenTransportData / transport.opendata.ch", detail: "Nächster ÖV-Servicepunkt" },
        { name: "opendata.swiss", detail: "Offizielle kantonale/kommunale Schul-, Betreuungs- und Leerstandsdaten, sofern maschinenlesbar verfügbar" },
        { name: "OpenStreetMap", detail: "Einkauf sowie POI-Fallback für Schule/Betreuung und Autobahnanschlüsse; Kategorien werden getrennt abgefragt" },
      ],
    };

    memoryCache.set(cacheKey, { at: Date.now(), value: body });
    return json(res, 200, body);
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "Standortdaten konnten nicht geladen werden." });
  }
}
