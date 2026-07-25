const GEOADMIN_SEARCH = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";
const GEOADMIN_IDENTIFY = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
const PXWEB_VACANCY = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0902020300_101/px-x-0902020300_101/px-x-0902020300_101.px";
const OVERPASS = "https://overpass-api.de/api/interpreter";

let vacancyMetadataCache = null;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=86400, stale-while-revalidate=604800" : "no-store");
  res.end(JSON.stringify(body));
};

const cleanLabel = (value = "") => value.replace(/<[^>]+>/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: "application/json", ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeAddress(street, postalCode, city) {
  const query = [street, postalCode, city].filter(Boolean).join(" ");
  const params = new URLSearchParams({ searchText: query, type: "locations", origins: "address", sr: "2056", limit: "10" });
  const payload = await fetchJson(`${GEOADMIN_SEARCH}?${params}`);
  const candidates = payload.results || [];
  if (!candidates.length) throw new Error("Die Adresse wurde im amtlichen Schweizer Adressverzeichnis nicht gefunden.");
  const normalizedStreet = street.toLowerCase().replace(/\s+/g, " ");
  const best = candidates.find((item) => String(item.attrs?.detail || "").toLowerCase().includes(normalizedStreet.split(" ")[0])) || candidates[0];
  const attrs = best.attrs || {};
  return {
    formattedAddress: cleanLabel(attrs.label) || query,
    lat: Number(attrs.lat),
    lon: Number(attrs.lon),
    easting: Number(attrs.y),
    northing: Number(attrs.x),
    featureId: attrs.featureId || null,
    links: best.links || [],
  };
}

async function fetchGwr(geo) {
  const gwrLink = geo.links.find((link) => link.title === "ch.bfs.gebaeude_wohnungs_register");
  if (!gwrLink?.href) return null;
  try {
    const payload = await fetchJson(`https://api3.geo.admin.ch${gwrLink.href}?sr=2056`);
    const a = payload.feature?.attributes || {};
    return {
      egid: a.egid || a.EGID || a.gwr_egid || null,
      buildingCategory: a.gkat_de || a.GKAT || a.gebaeudekategorie || null,
      constructionYear: Number(a.gbauj || a.GBAUJ || a.baujahr || 0) || null,
      municipality: a.gdename || a.GDENAME || a.gemeinde || null,
      municipalityBfs: String(a.gdenr || a.GDENR || a.bfs_nummer || "") || null,
      sourceUpdatedAt: a.datenstand || a.DATENSTAND || null,
    };
  } catch {
    return null;
  }
}

async function identifyLayer(layer, geo, tolerance = 6) {
  const d = 70;
  const extent = `${geo.easting - d},${geo.northing - d},${geo.easting + d},${geo.northing + d}`;
  const params = new URLSearchParams({
    geometry: `${geo.easting},${geo.northing}`,
    geometryType: "esriGeometryPoint",
    geometryFormat: "geojson",
    sr: "2056",
    imageDisplay: "800,600,96",
    mapExtent: extent,
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
  if (raw === null) return null;
  const match = String(raw).toUpperCase().match(/\b([A-D])\b/);
  return match ? match[1] : null;
}

function parseNoiseDb(properties) {
  const raw = findValue(properties, ["db", "lr_tag", "laerm", "lärm", "value", "wert"]);
  if (raw === null) return null;
  const match = String(raw).replace(",", ".").match(/\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : NaN;
  return Number.isFinite(value) && value >= 30 && value <= 100 ? value : null;
}

const haversine = (a, b) => {
  const R = 6371000;
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

async function fetchAmenities(geo) {
  const query = `[out:json][timeout:12];(
    nwr(around:5000,${geo.lat},${geo.lon})[public_transport=platform];
    nwr(around:5000,${geo.lat},${geo.lon})[railway=station];
    nwr(around:5000,${geo.lat},${geo.lon})[highway=bus_stop];
    nwr(around:5000,${geo.lat},${geo.lon})[shop~"supermarket|convenience"];
    nwr(around:5000,${geo.lat},${geo.lon})[amenity~"school|kindergarten|childcare"];
    nwr(around:12000,${geo.lat},${geo.lon})[highway=motorway_junction];
  );out center tags;`;
  try {
    const payload = await fetchJson(OVERPASS, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }).toString() }, 16000);
    const origin = { lat: geo.lat, lon: geo.lon };
    const groups = { transit: [], shopping: [], school: [], motorway: [] };
    for (const element of payload.elements || []) {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const tags = element.tags || {};
      const distance = haversine(origin, { lat, lon });
      if (tags.highway === "motorway_junction") groups.motorway.push(distance);
      else if (tags.shop === "supermarket" || tags.shop === "convenience") groups.shopping.push(distance);
      else if (["school", "kindergarten", "childcare"].includes(tags.amenity)) groups.school.push(distance);
      else groups.transit.push(distance);
    }
    const nearest = (values) => values.length ? Math.round(Math.min(...values)) : null;
    return {
      publicTransportMeters: nearest(groups.transit),
      shoppingMeters: nearest(groups.shopping),
      schoolMeters: nearest(groups.school),
      motorwayMeters: nearest(groups.motorway),
    };
  } catch {
    return { publicTransportMeters: null, shoppingMeters: null, schoolMeters: null, motorwayMeters: null };
  }
}

async function fetchVacancyRate(municipalityBfs, municipalityName) {
  try {
    if (!vacancyMetadataCache) vacancyMetadataCache = await fetchJson(PXWEB_VACANCY, {}, 20000);
    const variables = vacancyMetadataCache.variables || [];
    if (variables.length < 5) return null;
    const region = variables[0];
    const rooms = variables[1];
    const type = variables[2];
    const metric = variables[3];
    const year = variables[4];
    const labels = region.valueTexts || [];
    const values = region.values || [];
    const bfs = municipalityBfs ? String(municipalityBfs) : "";
    let regionIndex = labels.findIndex((label) => bfs && String(label).includes(bfs));
    if (regionIndex < 0) regionIndex = labels.findIndex((label) => municipalityName && String(label).toLowerCase().includes(municipalityName.toLowerCase()));
    if (regionIndex < 0) return null;
    const pickTotal = (variable) => {
      const texts = variable.valueTexts || [];
      const idx = texts.findIndex((text) => /total|insgesamt|alle/i.test(String(text)));
      return variable.values[idx >= 0 ? idx : 0];
    };
    const metricTexts = metric.valueTexts || [];
    const metricIndex = metricTexts.findIndex((text) => /ziffer|anteil/i.test(String(text)));
    const latestYear = year.values[year.values.length - 1];
    const body = {
      query: [
        { code: region.code, selection: { filter: "item", values: [values[regionIndex]] } },
        { code: rooms.code, selection: { filter: "item", values: [pickTotal(rooms)] } },
        { code: type.code, selection: { filter: "item", values: [pickTotal(type)] } },
        { code: metric.code, selection: { filter: "item", values: [metric.values[metricIndex >= 0 ? metricIndex : metric.values.length - 1]] } },
        { code: year.code, selection: { filter: "item", values: [latestYear] } },
      ],
      response: { format: "json-stat2" },
    };
    const result = await fetchJson(PXWEB_VACANCY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 20000);
    const value = Array.isArray(result.value) ? Number(result.value[0]) : null;
    return Number.isFinite(value) ? { value, year: String(latestYear) } : null;
  } catch {
    return null;
  }
}

function vacancyRiskScore(rate) {
  if (rate === null) return 45;
  if (rate <= 0.5) return 8;
  if (rate <= 1) return 18 + (rate - 0.5) * 24;
  if (rate <= 2) return 30 + (rate - 1) * 30;
  if (rate <= 3) return 60 + (rate - 2) * 25;
  return clamp(85 + (rate - 3) * 5);
}

function walkingMinutes(meters, fallback) {
  return meters === null ? fallback : Math.max(1, Math.round(meters / 80));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const street = String(req.query.street || "").trim();
  const postalCode = String(req.query.postalCode || "").trim();
  const city = String(req.query.city || "").trim();
  if (!postalCode || !city) return json(res, 400, { error: "PLZ und Ort sind erforderlich." });

  try {
    const geo = await geocodeAddress(street, postalCode, city);
    const [gwr, transitProps, roadNoiseProps, railNoiseProps, amenities] = await Promise.all([
      fetchGwr(geo),
      identifyLayer("ch.are.gueteklassen_oev", geo, 2),
      identifyLayer("ch.bafu.laerm-strassenlaerm_tag", geo, 3),
      identifyLayer("ch.bafu.laerm-bahnlaerm_tag", geo, 3),
      fetchAmenities(geo),
    ]);
    const municipalityName = gwr?.municipality || city;
    const vacancy = await fetchVacancyRate(gwr?.municipalityBfs, municipalityName);
    const transitClass = parseTransitClass(transitProps);
    const roadNoiseDb = parseNoiseDb(roadNoiseProps);
    const railNoiseDb = parseNoiseDb(railNoiseProps);
    const maxNoiseDb = Math.max(roadNoiseDb || 0, railNoiseDb || 0) || null;
    const vacancyRisk = Math.round(vacancyRiskScore(vacancy?.value ?? null));
    const transitClassBoost = { A: 95, B: 82, C: 68, D: 54 }[transitClass] || null;
    const publicTransportMinutes = walkingMinutes(amenities.publicTransportMeters, transitClass ? ({ A: 3, B: 6, C: 10, D: 15 }[transitClass]) : 15);
    const shoppingMinutes = walkingMinutes(amenities.shoppingMeters, 18);
    const schoolMinutes = walkingMinutes(amenities.schoolMeters, 20);
    const motorwayMinutes = amenities.motorwayMeters === null ? 18 : Math.max(2, Math.round(amenities.motorwayMeters / 700));
    const noiseLevel = maxNoiseDb === null ? 45 : Math.round(clamp((maxNoiseDb - 35) * 2.1));
    const municipalityDemand = Math.round(clamp(100 - vacancyRisk * 0.78 + (transitClassBoost ? (transitClassBoost - 50) * 0.22 : 0)));
    const accessibility = clamp(100 - publicTransportMinutes * 3 - shoppingMinutes * 1.2 - schoolMinutes * 0.8);
    const microLocation = Math.round(clamp(accessibility * 0.55 + (100 - noiseLevel) * 0.25 + municipalityDemand * 0.20));

    const missing = [];
    if (!transitClass) missing.push("ÖV-Güteklasse");
    if (vacancy?.value == null) missing.push("Leerwohnungsziffer");
    if (maxNoiseDb === null) missing.push("Lärmdaten");
    if (amenities.shoppingMeters === null) missing.push("Einkauf");
    if (amenities.schoolMeters === null) missing.push("Schule/Betreuung");

    return json(res, 200, {
      address: { formatted: geo.formattedAddress, lat: geo.lat, lon: geo.lon, easting: geo.easting, northing: geo.northing },
      building: gwr,
      metrics: {
        publicTransportMinutes,
        shoppingMinutes,
        schoolMinutes,
        motorwayMinutes,
        noiseLevel,
        municipalityDemand,
        vacancyRisk,
        microLocation,
      },
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
      },
      quality: missing.length === 0 ? "hoch" : missing.length <= 2 ? "mittel" : "eingeschränkt",
      missing,
      loadedAt: new Date().toISOString(),
      sources: [
        { name: "swisstopo / GeoAdmin", detail: "Amtliches Gebäudeadressverzeichnis und Geokodierung" },
        { name: "Bundesamt für Raumentwicklung ARE", detail: "ÖV-Güteklassen" },
        { name: "Bundesamt für Umwelt BAFU", detail: "Strassen- und Bahnlärm" },
        { name: "Bundesamt für Statistik BFS", detail: "Gebäude- und Wohnungsregister sowie Leerwohnungszählung" },
        { name: "OpenStreetMap", detail: "Distanzen zu ÖV, Einkauf, Schulen und Autobahnanschlüssen" },
      ],
    });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : "Standortdaten konnten nicht geladen werden." });
  }
}
