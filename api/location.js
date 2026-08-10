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

async function fetchJson(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HomeIQ-Invest/4.4 (Swiss real-estate analysis; public/open data gateway)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "text/csv,text/plain,*/*",
        "User-Agent": "HomeIQ-Invest/4.4 (Swiss real-estate analysis; public/open data gateway)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
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
    const payload = await fetchJson(`${GEOADMIN_IDENTIFY}?${params}`, {}, 3500);
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
  const bfsRaw = findValue(properties, ["bfs_nummer", "bfs", "gdenr"]);
  const bfsMatch = bfsRaw == null ? null : String(bfsRaw).match(/\d{1,4}/);
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

async function fetchNearestTransit(geo) {
  try {
    const params = new URLSearchParams({ x: String(geo.lat), y: String(geo.lon), type: "station" });
    const payload = await fetchJson(`${TRANSPORT_LOCATIONS}?${params}`, {}, 3500);
    const stations = payload.stations || [];
    let nearest = Infinity;
    for (const station of stations) {
      const lat = Number(station.coordinate?.x);
      const lon = Number(station.coordinate?.y);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const distance = haversine({ lat: geo.lat, lon: geo.lon }, { lat, lon });
      // 0 m is often a malformed/duplicate coordinate response. Only accept credible results.
      if (distance >= 20) nearest = Math.min(nearest, distance);
    }
    return Number.isFinite(nearest) ? Math.round(nearest) : null;
  } catch {
    return null;
  }
}

function classifyPoi(tags = {}) {
  if (tags.highway === "motorway_junction") return "motorway";
  if (["supermarket", "convenience", "grocery", "department_store", "mall", "general"].includes(tags.shop) || tags.amenity === "marketplace") return "shopping";
  if (["school", "kindergarten", "childcare"].includes(tags.amenity)) return "school";
  return null;
}

async function overpassCombined(geo, radiusKm, timeoutMs = 4300) {
  const poiRadius = Math.round(radiusKm * 1000);
  const motorwayRadius = Math.round(Math.max(15, radiusKm) * 1000);
  const query = `[out:json][timeout:4];(
    nwr(around:${poiRadius},${geo.lat},${geo.lon})[shop~"supermarket|convenience|grocery|department_store|mall|general|bakery|butcher"];
    nwr(around:${poiRadius},${geo.lat},${geo.lon})[amenity~"marketplace|school|kindergarten|childcare"];
    nwr(around:${motorwayRadius},${geo.lat},${geo.lon})[highway=motorway_junction];
  );out center tags qt 2500;`;
  const requests = OVERPASS_ENDPOINTS.map((endpoint) => fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString(),
  }, timeoutMs));

  const settled = await Promise.allSettled(requests);
  const unique = new Map();
  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    for (const element of entry.value.elements || []) {
      const key = `${element.type || ""}:${element.id || ""}`;
      if (!unique.has(key)) unique.set(key, element);
    }
  }

  const nearest = { shopping: Infinity, school: Infinity, motorway: Infinity };
  for (const element of unique.values()) {
    const lat = Number(element.lat ?? element.center?.lat);
    const lon = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const kind = classifyPoi(element.tags || {});
    if (!kind) continue;
    nearest[kind] = Math.min(nearest[kind], haversine({ lat: geo.lat, lon: geo.lon }, { lat, lon }));
  }

  return {
    shoppingMeters: Number.isFinite(nearest.shopping) ? Math.round(nearest.shopping) : null,
    schoolMeters: Number.isFinite(nearest.school) ? Math.round(nearest.school) : null,
    motorwayMeters: Number.isFinite(nearest.motorway) ? Math.round(nearest.motorway) : null,
  };
}

function radiusBucket(meters, stepsKm) {
  if (meters == null) return null;
  const km = meters / 1000;
  return stepsKm.find((step) => km <= step) ?? stepsKm[stepsKm.length - 1];
}

async function fetchPois(geo) {
  // V4.4: nur zwei kombinierte Overpass-Runden statt separater Requests pro Kategorie.
  // Dadurch sinkt die Zahl externer Requests massiv und eine einzelne leere Instanz
  // blockiert Einkauf/Schule/Autobahn nicht mehr.
  const first = await overpassCombined(geo, 5, 4200);
  const missing = ["shopping", "school", "motorway"].filter((kind) => first[`${kind}Meters`] == null);
  let second = { shoppingMeters: null, schoolMeters: null, motorwayMeters: null };
  if (missing.length) second = await overpassCombined(geo, 20, 4500);

  const shoppingMeters = first.shoppingMeters ?? second.shoppingMeters;
  const schoolMeters = first.schoolMeters ?? second.schoolMeters;
  let motorwayMeters = first.motorwayMeters ?? second.motorwayMeters;

  // Autobahn darf weiter entfernt sein. Nur falls nach 20 km noch nichts vorliegt,
  // folgt eine einzelne fokussierte 50-km-Abfrage.
  if (motorwayMeters == null) {
    const query = `[out:json][timeout:4];nwr(around:50000,${geo.lat},${geo.lon})[highway=motorway_junction];out center tags qt 500;`;
    const settled = await Promise.allSettled(OVERPASS_ENDPOINTS.map((endpoint) => fetchJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }).toString(),
    }, 4300)));
    let nearest = Infinity;
    for (const entry of settled) {
      if (entry.status !== "fulfilled") continue;
      for (const element of entry.value.elements || []) {
        const lat = Number(element.lat ?? element.center?.lat);
        const lon = Number(element.lon ?? element.center?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        nearest = Math.min(nearest, haversine({ lat: geo.lat, lon: geo.lon }, { lat, lon }));
      }
    }
    motorwayMeters = Number.isFinite(nearest) ? Math.round(nearest) : null;
  }

  return {
    shoppingMeters,
    schoolMeters,
    motorwayMeters,
    categoryRadiusKm: {
      shopping: radiusBucket(shoppingMeters, [1, 2.5, 5, 10, 15, 20]),
      school: radiusBucket(schoolMeters, [1, 2.5, 5, 10, 15, 20]),
      motorway: radiusBucket(motorwayMeters, [5, 10, 15, 20, 35, 50]),
    },
  };
}

async function fetchVacancyRate(municipalityBfs, municipalityName) {
  try {
    if (!vacancyMetadataCache) vacancyMetadataCache = await fetchJson(PXWEB_VACANCY, {}, 4500);
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
    const data = await fetchJson(PXWEB_VACANCY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 4500);
    const value = Array.isArray(data.value) ? Number(data.value[0]) : null;
    return Number.isFinite(value) ? { value, year: String(latestYear) } : null;
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
    const geo = await geocodeAddress(street, postalCode, city);
    const [gwrR, municipalityR, transitClassR, roadNoiseR, railNoiseR, transitR, poisR, vacancyR] = await Promise.allSettled([
      fetchGwr(geo),
      identifyLayer("ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill", geo, 6),
      identifyLayer("ch.are.gueteklassen_oev", geo, 8),
      identifyLayer("ch.bafu.laerm-strassenlaerm_tag", geo, 10),
      identifyLayer("ch.bafu.laerm-bahnlaerm_tag", geo, 10),
      fetchNearestTransit(geo),
      fetchPois(geo),
      fetchVacancyRate(null, city),
    ]);

    const unwrap = (r, fallback = null) => r.status === "fulfilled" ? r.value : fallback;
    const gwr = unwrap(gwrR);
    const municipalityProps = unwrap(municipalityR);
    const municipalityParsed = parseMunicipality(municipalityProps, gwr?.municipality || city);
    const municipalityName = gwr?.municipality || municipalityParsed.municipality || city;
    const municipalityBfs = gwr?.municipalityBfs || municipalityParsed.municipalityBfs;

    let vacancy = unwrap(vacancyR);
    if (!vacancy && municipalityBfs) vacancy = await fetchVacancyRate(municipalityBfs, municipalityName);
    const transitClass = parseTransitClass(unwrap(transitClassR));
    const roadNoiseDb = parseNoiseDb(unwrap(roadNoiseR));
    const railNoiseDb = parseNoiseDb(unwrap(railNoiseR));
    const maxNoiseDb = Math.max(roadNoiseDb || 0, railNoiseDb || 0) || null;
    const nearestPublicTransportMeters = unwrap(transitR);
    const pois = unwrap(poisR, { shoppingMeters: null, schoolMeters: null, motorwayMeters: null, categoryRadiusKm: { shopping: null, school: null, motorway: null } });
    const market = {
      pricePerSqm: null, rentPerSqm: null, priceSource: null, rentSource: null, confidence: "eingeschränkt", radiusKm: null,
      discoveredDatasets: [], tiers: [], note: "Marktdaten werden von der separaten Markt-Pipeline geladen.",
    };

    const actual = {
      publicTransportMinutes: walkingMinutes(nearestPublicTransportMeters),
      shoppingMinutes: walkingMinutes(pois.shoppingMeters),
      schoolMinutes: walkingMinutes(pois.schoolMeters),
      motorwayMinutes: drivingMinutes(pois.motorwayMeters),
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

    // Numeric fields remain neutral for the legacy score engine. Raw evidence transparently exposes missing values.
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
    if (pois.shoppingMeters == null) missing.push("Einkauf");
    if (pois.schoolMeters == null) missing.push("Schule/Betreuung");
    if (pois.motorwayMeters == null) missing.push("Autobahnanschluss");
    const foundCount = 6 - missing.length;

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
        nearestShoppingMeters: pois.shoppingMeters,
        nearestSchoolMeters: pois.schoolMeters,
        nearestMotorwayJunctionMeters: pois.motorwayMeters,
        searchRadiusKm: Math.max(10, pois.categoryRadiusKm?.shopping || 0, pois.categoryRadiusKm?.school || 0, pois.categoryRadiusKm?.motorway || 0),
        categoryRadiusKm: {
          transit: nearestPublicTransportMeters == null ? null : Math.max(1, Math.ceil(nearestPublicTransportMeters / 1000)),
          shopping: pois.categoryRadiusKm?.shopping ?? null,
          school: pois.categoryRadiusKm?.school ?? null,
          motorway: pois.categoryRadiusKm?.motorway ?? null,
        },
      },
      market,
      quality: foundCount >= 5 ? "hoch" : foundCount >= 3 ? "mittel" : "eingeschränkt",
      missing,
      loadedAt: new Date().toISOString(),
      sources: [
        { name: "swisstopo / GeoAdmin", detail: "Amtliche Adresse, Gemeinde und Gebäudeverknüpfung" },
        { name: "Bundesamt für Statistik BFS", detail: "GWR und Leerwohnungszählung" },
        { name: "Bundesamt für Raumentwicklung ARE", detail: "ÖV-Güteklasse" },
        { name: "Bundesamt für Umwelt BAFU", detail: "Strassen- und Bahnlärm" },
        { name: "OpenTransportData / transport.opendata.ch", detail: "Nächster ÖV-Servicepunkt" },
        { name: "OpenStreetMap", detail: "Einkauf, Schulen/Betreuung und Autobahnanschlüsse; kombinierte Fallback-Abfrage" },
        { name: "opendata.swiss", detail: "Automatische Suche nach kantonalen und kommunalen Markt- und Mietdatensätzen" },
      ],
    };

    memoryCache.set(cacheKey, { at: Date.now(), value: body });
    return json(res, 200, body);
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "Standort- und Marktdaten konnten nicht geladen werden." });
  }
}
