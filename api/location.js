const GEOADMIN_SEARCH = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";
const GEOADMIN_LOCATION_SEARCH = "https://api3.geo.admin.ch/rest/services/api/SearchServer";
const GEOADMIN_IDENTIFY = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
const GEOADMIN_WMS = "https://wms.geo.admin.ch/";
const PXWEB_VACANCY = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0902020300_101/px-x-0902020300_101/px-x-0902020300_101.px";
const TRANSPORT_LOCATIONS = "https://transport.opendata.ch/v1/locations";
const OPENDATA_SEARCH = "https://ckan.opendata.swiss/api/3/action/package_search";
const PHOTON_API = "https://photon.komoot.io";
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const LAYERS = {
  municipality: "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill",
  gwr: "ch.bfs.gebaeude_wohnungs_register",
  transitClass: "ch.are.gueteklassen_oev",
  roadNoiseDay: "ch.bafu.laerm-strassenlaerm_tag",
  roadNoiseNight: "ch.bafu.laerm-strassenlaerm_nacht",
  railNoiseDay: "ch.bafu.laerm-bahnlaerm_tag",
  railNoiseNight: "ch.bafu.laerm-bahnlaerm_nacht",
  railNoiseEffectiveDay: "ch.bav.laermbelastung-eisenbahn_effektive_immissionen_tag",
  railNoiseEffectiveNight: "ch.bav.laermbelastung-eisenbahn_effektive_immissionen_nacht",
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
        "User-Agent": "HomeIQ-Invest/5.1 (hybrid official-data + OSM POI Swiss real-estate analysis)",
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
        "User-Agent": "HomeIQ-Invest/5.1 (hybrid official-data + OSM POI Swiss real-estate analysis)",
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

async function lookupCityByPostalCode(postalCode) {
  const value = String(postalCode || "").trim();
  if (!/^\d{4}$/.test(value)) return null;
  const params = new URLSearchParams({
    searchText: value,
    type: "locations",
    origins: "zipcode",
    sr: "2056",
    limit: "20",
  });
  const payload = await fetchJson(`${GEOADMIN_LOCATION_SEARCH}?${params}`, {}, 4200);
  const candidates = payload.results || [];
  const exact = candidates.find((item) => {
    const label = cleanLabel(item.attrs?.label || "");
    return new RegExp(`(^|\\s)${value}(\\s|$)`).test(label);
  }) || candidates[0];
  if (!exact) return null;
  const label = cleanLabel(exact.attrs?.label || "");
  // GeoAdmin ZIP-origin labels normally contain “PLZ Ort”. Remove the PLZ
  // and optional canton/markup suffixes, while preserving multi-word place names.
  let city = label.replace(new RegExp(`^.*?${value}\\s*`), "").trim();
  city = city.replace(/\s*[-–|].*$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!city) {
    const detail = cleanLabel(exact.attrs?.detail || "");
    city = detail.replace(new RegExp(`^.*?${value}\\s*`), "").trim();
  }
  return city || null;
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

async function identifyNoisePoint(layerIds, geo, radiusMeters = 0) {
  const radius = Math.max(0, Number(radiusMeters) || 0);
  // GeoAdmin tolerance is expressed in pixels. We deliberately configure
  // mapExtent/imageDisplay at 1 LV95 metre per pixel, so tolerance == metres.
  const extentRadius = Math.max(50, radius, 250);
  const sizePx = Math.max(100, Math.round(extentRadius * 2));
  const params = new URLSearchParams({
    geometry: `${geo.easting},${geo.northing}`,
    geometryType: "esriGeometryPoint",
    geometryFormat: "geojson",
    sr: "2056",
    layers: `all:${layerIds.join(",")}`,
    returnGeometry: "true",
    lang: "de",
    limit: "200",
    tolerance: String(Math.round(radius)),
  });
  if (radius > 0) {
    params.set("mapExtent", `${geo.easting - extentRadius},${geo.northing - extentRadius},${geo.easting + extentRadius},${geo.northing + extentRadius}`);
    params.set("imageDisplay", `${sizePx},${sizePx},96`);
  } else {
    params.set("mapExtent", "0,0,0,0");
    params.set("imageDisplay", "0,0,0");
  }
  const payload = await fetchJson(`${GEOADMIN_IDENTIFY}?${params}`, {}, 4200);
  return payload.results || [];
}

async function identifyNoiseEnvelope(layerIds, geo, radiusMeters) {
  const r = Math.max(1, Number(radiusMeters) || 1);
  const minX = geo.easting - r;
  const minY = geo.northing - r;
  const maxX = geo.easting + r;
  const maxY = geo.northing + r;
  const params = new URLSearchParams({
    geometry: `${minX},${minY},${maxX},${maxY}`,
    geometryType: "esriGeometryEnvelope",
    geometryFormat: "geojson",
    sr: "2056",
    imageDisplay: "0,0,0",
    mapExtent: "0,0,0,0",
    tolerance: "0",
    layers: `all:${layerIds.join(",")}`,
    returnGeometry: "true",
    lang: "de",
    limit: "200",
  });
  const payload = await fetchJson(`${GEOADMIN_IDENTIFY}?${params}`, {}, 4200);
  return payload.results || [];
}


function parseNoiseDbFromText(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  const preferred = [];
  const fallback = [];
  for (const line of lines) {
    const normalized = line.toLowerCase();
    const matches = line.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/g) || [];
    for (const token of matches) {
      const value = Number(token);
      if (!Number.isFinite(value) || value < 30 || value > 100) continue;
      if (["gray", "value", "wert", "lr", "db", "pixel", "band", "immission", "noise", "laerm", "lärm"].some((key) => normalized.includes(key))) preferred.push(value);
      else fallback.push(value);
    }
  }
  const values = preferred.length ? preferred : fallback;
  return values.length ? Math.max(...values) : null;
}

function parseWmsNoiseText(text, layerIds, distanceMeters, method) {
  const candidates = [];
  const raw = String(text || "");
  for (const layer of layerIds) {
    const meta = noiseKeyForLayer(layer);
    if (!meta) continue;
    const quoted = `Layer '${layer}'`;
    const start = raw.indexOf(quoted);
    const next = start >= 0 ? raw.indexOf("Layer '", start + quoted.length) : -1;
    // GeoAdmin WMS does not always include a layer header in text/plain.
    // If this request contains one layer only, the entire response belongs to it.
    const segment = start >= 0 ? raw.slice(start, next >= 0 ? next : raw.length) : (layerIds.length === 1 ? raw : "");
    const db = parseNoiseDbFromText(segment);
    if (db == null) continue;
    candidates.push({
      ...meta,
      db,
      distanceMeters: Math.round(distanceMeters),
      radiusMeters: Math.round(distanceMeters),
      burden: noiseBurden(db, distanceMeters),
      layer,
      method,
    });
  }
  return candidates;
}

async function wmsNoiseAt(geo, layerIds, easting, northing, distanceMeters, method) {
  const half = 50;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: layerIds.join(","),
    QUERY_LAYERS: layerIds.join(","),
    STYLES: "",
    CRS: "EPSG:2056",
    BBOX: `${easting - half},${northing - half},${easting + half},${northing + half}`,
    WIDTH: "101",
    HEIGHT: "101",
    I: "50",
    J: "50",
    INFO_FORMAT: "text/plain",
    FEATURE_COUNT: "20",
    LANG: "de",
  });
  const text = await fetchText(`${GEOADMIN_WMS}?${params}`, {}, 3000);
  return parseWmsNoiseText(text, layerIds, distanceMeters, method);
}

async function wmsSingleNoiseAt(geo, layer, easting, northing, distanceMeters, method) {
  // Query every raster layer independently. This is intentional: road-noise
  // responses can differ from railway responses and some WMS text/plain
  // payloads omit the "Layer '…'" header when only one layer is queried.
  return wmsNoiseAt(geo, [layer], easting, northing, distanceMeters, method);
}

function samplePointsAround(geo, radiusMeters) {
  if (radiusMeters <= 0) return [{ easting: geo.easting, northing: geo.northing, distanceMeters: 0, label: "Objektpunkt" }];
  const points = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    points.push({
      easting: geo.easting + Math.cos(angle) * radiusMeters,
      northing: geo.northing + Math.sin(angle) * radiusMeters,
      distanceMeters: radiusMeters,
      label: `${radiusMeters} m`,
    });
  }
  return points;
}

async function fetchBafuRasterNoise(geo) {
  const rasterLayers = [LAYERS.roadNoiseDay, LAYERS.roadNoiseNight, LAYERS.railNoiseDay, LAYERS.railNoiseNight];
  const found = {};
  const diagnostics = [];

  const accept = (candidate) => {
    if (!candidate?.key) return;
    const current = found[candidate.key];
    // Nearest raster evidence wins. At the same search distance, keep the
    // higher dB value to remain conservative.
    if (!current || candidate.distanceMeters < current.distanceMeters || (candidate.distanceMeters === current.distanceMeters && candidate.db > current.db)) {
      found[candidate.key] = candidate;
    }
  };

  const queryLayerAtPoints = async (layer, points, radius) => {
    const meta = noiseKeyForLayer(layer);
    const settled = await Promise.allSettled(points.map((point) => wmsSingleNoiseAt(
      geo, layer, point.easting, point.northing, point.distanceMeters,
      `${meta?.type || "Lärm"} ${meta?.period || ""} · ${point.label}`,
    )));
    let loaded = 0;
    let errors = 0;
    for (const result of settled) {
      if (result.status === "fulfilled") {
        for (const candidate of result.value) { accept(candidate); loaded += 1; }
      } else errors += 1;
    }
    diagnostics.push({
      radius,
      method: `wms-${meta?.key || layer}`,
      status: loaded ? "loaded" : errors === settled.length ? "error" : "not_found",
      count: loaded,
    });
  };

  // Query all four official raster layers independently at the object point.
  await Promise.all(rasterLayers.map((layer) => queryLayerAtPoints(layer, samplePointsAround(geo, 0), 0)));

  // Only missing categories are expanded spatially. Existing road/rail values
  // are frozen so a more distant, louder raster cell cannot replace a nearer one.
  for (const radius of [25, 50, 100, 250]) {
    const missingLayers = rasterLayers.filter((layer) => {
      const meta = noiseKeyForLayer(layer);
      return meta && !found[meta.key];
    });
    if (!missingLayers.length) break;
    const points = samplePointsAround(geo, radius);
    await Promise.all(missingLayers.map((layer) => queryLayerAtPoints(layer, points, radius)));
  }
  return { found, diagnostics };
}

async function fetchBavVectorNoise(geo) {
  const layers = [LAYERS.railNoiseEffectiveDay, LAYERS.railNoiseEffectiveNight];
  const found = {};
  const diagnostics = [];
  const addCandidates = (results, radius, method) => {
    const candidates = (results || []).map((result) => parseNoiseCandidate(result, geo, radius)).filter(Boolean);
    for (const candidate of candidates) candidate.method = method;
    for (const key of ["railDay", "railNight"]) {
      const options = candidates.filter((candidate) => candidate.key === key);
      if (!options.length) continue;
      options.sort((a, b) => (b.priority - a.priority) || (b.burden - a.burden) || (a.distanceMeters - b.distanceMeters));
      const candidate = options[0];
      if (!found[key] || candidate.distanceMeters < found[key].distanceMeters || candidate.priority > found[key].priority) found[key] = candidate;
    }
  };

  for (const radius of [0, 25, 50, 100, 250]) {
    try {
      const results = radius === 0 ? await identifyNoisePoint(layers, geo, 0) : await identifyNoiseEnvelope(layers, geo, radius);
      addCandidates(results, radius, radius === 0 ? "BAV Objektpunkt" : `BAV Fläche ±${radius} m`);
      diagnostics.push({ radius, method: "bav-identify", status: results.length ? "loaded" : "not_found", count: results.length });
    } catch (error) {
      diagnostics.push({ radius, method: "bav-identify", status: errorStatus(error) });
    }
    if (found.railDay && found.railNight) break;
  }
  return { found, diagnostics };
}

function minDistanceToBboxMeters(bbox, geo) {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const [minX, minY, maxX, maxY] = bbox.map(Number);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const dx = geo.easting < minX ? minX - geo.easting : geo.easting > maxX ? geo.easting - maxX : 0;
  const dy = geo.northing < minY ? minY - geo.northing : geo.northing > maxY ? geo.northing - maxY : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

function flattenCoordinates(value, out = []) {
  if (!Array.isArray(value)) return out;
  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    out.push([Number(value[0]), Number(value[1])]);
    return out;
  }
  for (const child of value) flattenCoordinates(child, out);
  return out;
}

function distanceToNoiseFeatureMeters(result, geo, fallbackRadius) {
  const bboxDistance = minDistanceToBboxMeters(result?.bbox, geo);
  if (bboxDistance != null) return Math.round(bboxDistance);
  const geometry = result?.geometry;
  const coords = flattenCoordinates(geometry?.coordinates || geometry?.rings || geometry?.paths || []);
  if (coords.length) {
    let nearest = Infinity;
    for (const [x, y] of coords) nearest = Math.min(nearest, Math.hypot(x - geo.easting, y - geo.northing));
    if (Number.isFinite(nearest)) return Math.round(nearest);
  }
  return Math.round(fallbackRadius);
}

function noiseDistanceWeight(distanceMeters) {
  if (distanceMeters <= 25) return 1;
  if (distanceMeters <= 50) return 0.90;
  if (distanceMeters <= 100) return 0.70;
  if (distanceMeters <= 250) return 0.40;
  return 0;
}

function noiseBaseScore(db) {
  if (db <= 45) return 100;
  if (db <= 50) return 100 - (db - 45) * 2;
  if (db <= 55) return 90 - (db - 50) * 3;
  if (db <= 60) return 75 - (db - 55) * 4;
  if (db <= 65) return 55 - (db - 60) * 5;
  if (db <= 70) return 30 - (db - 65) * 4;
  return 10;
}

function noiseBurden(db, distanceMeters) {
  if (db == null) return null;
  // Distance reduces only the negative impact of fallback evidence. The dB
  // measurement itself is never artificially reduced.
  const baseScore = clamp(noiseBaseScore(db));
  const confidence = noiseDistanceWeight(distanceMeters);
  const effectiveScore = 100 - (100 - baseScore) * confidence;
  return Math.round(clamp(100 - effectiveScore));
}

function noiseKeyForLayer(layer) {
  if (layer === LAYERS.roadNoiseDay) return { key: "roadDay", type: "Strasse", period: "Tag", source: "BAFU / GeoAdmin", priority: 1 };
  if (layer === LAYERS.roadNoiseNight) return { key: "roadNight", type: "Strasse", period: "Nacht", source: "BAFU / GeoAdmin", priority: 1 };
  if (layer === LAYERS.railNoiseEffectiveDay) return { key: "railDay", type: "Bahn", period: "Tag", source: "BAV / GeoAdmin", priority: 2 };
  if (layer === LAYERS.railNoiseEffectiveNight) return { key: "railNight", type: "Bahn", period: "Nacht", source: "BAV / GeoAdmin", priority: 2 };
  if (layer === LAYERS.railNoiseDay) return { key: "railDay", type: "Bahn", period: "Tag", source: "BAFU / GeoAdmin", priority: 1 };
  if (layer === LAYERS.railNoiseNight) return { key: "railNight", type: "Bahn", period: "Nacht", source: "BAFU / GeoAdmin", priority: 1 };
  return null;
}

function parseNoiseCandidate(result, geo, radiusMeters) {
  const meta = noiseKeyForLayer(result?.layerBodId || result?.layerId);
  if (!meta) return null;
  const properties = result?.properties || result?.attributes || {};
  const db = parseNoiseDb({ ...properties, __label: result?.layerName || "" });
  if (db == null) return null;
  const distanceMeters = distanceToNoiseFeatureMeters(result, geo, radiusMeters);
  return {
    ...meta,
    db,
    distanceMeters,
    radiusMeters,
    burden: noiseBurden(db, distanceMeters),
    layer: result?.layerBodId || result?.layerId,
  };
}

async function fetchNoiseBundle(geo) {
  // Important: the BAFU road/rail noise maps are raster layers (LayersTable:
  // WMTS, not MapServer-queryable). Query them through WMS GetFeatureInfo.
  // BAV railway actual-immissions are vector/queryable and remain on identify.
  const [raster, bav] = await Promise.all([
    fetchBafuRasterNoise(geo),
    fetchBavVectorNoise(geo),
  ]);

  const found = { ...(raster?.found || {}) };
  // BAV actual railway immissions are legally stronger/more specific than the
  // BAFU modelled railway raster, so prefer them when they are available.
  for (const key of ["railDay", "railNight"]) {
    if (bav?.found?.[key]) found[key] = bav.found[key];
  }

  const diagnostics = [...(raster?.diagnostics || []), ...(bav?.diagnostics || [])];
  const all = Object.values(found);
  if (!all.length) return { noData: true, diagnostics };
  const strongest = [...all].sort((a, b) => (b.burden - a.burden) || (b.db - a.db))[0];
  const roadItems = [found.roadDay, found.roadNight].filter(Boolean);
  const railItems = [found.railDay, found.railNight].filter(Boolean);
  const roadStrongest = [...roadItems].sort((a, b) => (b.burden - a.burden) || (b.db - a.db))[0] || null;
  const railStrongest = [...railItems].sort((a, b) => (b.burden - a.burden) || (b.db - a.db))[0] || null;
  const sources = [...new Set(all.map((item) => item.source))];
  return {
    ...found,
    strongest,
    roadStrongest,
    railStrongest,
    burden: strongest?.burden ?? 0,
    source: sources.join(" + "),
    diagnostics,
  };
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
  if (!properties) return null;
  const values = [];
  for (const [key, raw] of Object.entries(properties)) {
    const normalized = key.toLowerCase();
    if (!["db", "lr", "laerm", "lärm", "value", "wert", "label", "immission"].some((pattern) => normalized.includes(pattern))) continue;
    const matches = String(raw ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) || [];
    for (const token of matches) {
      const value = Number(token);
      if (Number.isFinite(value) && value >= 30 && value <= 100) values.push(value);
    }
  }
  return values.length ? Math.max(...values) : null;
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
  // transport.opendata.ch dokumentiert `type=station` nur für Textsuche.
  // Bei Koordinatensuche werden deshalb bewusst nur x/y gesendet. Zudem
  // dürfen sehr nahe Haltestellen (<20 m) nicht herausgefiltert werden.
  try {
    const params = new URLSearchParams({ x: String(geo.lat), y: String(geo.lon) });
    const payload = await fetchJson(`${TRANSPORT_LOCATIONS}?${params}`, {}, 4200);
    const stations = Array.isArray(payload.stations) ? payload.stations : [];
    let nearest = Infinity;
    for (const station of stations) {
      const apiDistance = Number(station.distance);
      if (Number.isFinite(apiDistance) && apiDistance >= 0) {
        nearest = Math.min(nearest, apiDistance);
        continue;
      }
      const lat = Number(station.coordinate?.x ?? station.coordinates?.x);
      const lon = Number(station.coordinate?.y ?? station.coordinates?.y);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const distance = haversine({ lat: geo.lat, lon: geo.lon }, { lat, lon });
      nearest = Math.min(nearest, distance);
    }
    if (Number.isFinite(nearest)) return Math.round(nearest);
  } catch (_) {
    // Fallback folgt unten. Die Standortanalyse soll bei einem temporären
    // Ausfall der inoffiziellen Transport-API nicht ohne ÖV-Distanz bleiben.
  }

  const transitQuery = (r) => `
    nwr(around:${r},{{LAT}},{{LON}})[public_transport=platform];
    nwr(around:${r},{{LAT}},{{LON}})[highway=bus_stop];
    nwr(around:${r},{{LAT}},{{LON}})[railway~"station|halt|tram_stop"];`;
  const fallback = await nearestWithOsmFallback(geo, transitQuery, [
    "public_transport:platform", "highway:bus_stop", "railway:station", "railway:halt", "railway:tram_stop"
  ], [2, 5, 10]);
  return fallback?.meters ?? null;
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

async function photonNearestByTags(geo, tags, radiusKm, timeoutMs = 5200) {
  const requests = tags.map((tag) => {
    const params = new URLSearchParams({
      lon: String(geo.lon),
      lat: String(geo.lat),
      radius: String(radiusKm),
      limit: "10",
      lang: "de",
      osm_tag: tag,
    });
    return fetchJson(`${PHOTON_API}/reverse?${params}`, {}, timeoutMs);
  });
  const settled = await Promise.allSettled(requests);
  let nearest = Infinity;
  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    for (const feature of entry.value.features || []) {
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const distance = haversine({ lat: geo.lat, lon: geo.lon }, { lat, lon });
      if (distance <= radiusKm * 1000) nearest = Math.min(nearest, distance);
    }
  }
  return Number.isFinite(nearest) ? Math.round(nearest) : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryNullable(fn, attempts = 2, delayMs = 180) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await fn();
      if (value != null) return { value, hadSuccessfulRequest: true, lastError: null };
      if (attempt < attempts - 1) await sleep(delayMs * (attempt + 1));
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(delayMs * (attempt + 1));
    }
  }
  return { value: null, hadSuccessfulRequest: lastError == null, lastError };
}

function plausiblePoiDistance(meters, minimumMeters = 25) {
  if (meters == null || !Number.isFinite(Number(meters))) return null;
  // OSM point/centroid coordinates can coincide with a building entrance and
  // produce artificial 0–5 m distances. For walkable POIs we report a
  // conservative minimum distance without changing the “very close” score.
  return Math.max(minimumMeters, Math.round(Number(meters)));
}

async function nearestWithOsmFallback(geo, overpassBuilder, photonTags, radiiKm, options = {}) {
  const minimumMeters = Number(options.minimumMeters || 0);
  let technicalFailures = 0;
  let successfulEmptyRequests = 0;
  for (const radiusKm of radiiKm) {
    const photon = await retryNullable(() => photonNearestByTags(geo, photonTags, radiusKm, 5200), 2, 160);
    if (photon.value != null) return { meters: minimumMeters ? plausiblePoiDistance(photon.value, minimumMeters) : photon.value, source: `OpenStreetMap / Photon${minimumMeters && photon.value < minimumMeters ? " · Plausibilitätsfilter" : ""}` };
    if (photon.hadSuccessfulRequest) successfulEmptyRequests += 1; else technicalFailures += 1;

    const overpass = await retryNullable(() => overpassNearest(geo, withCoords(overpassBuilder, geo), radiusKm * 1000, 7200), 2, 220);
    if (overpass.value != null) return { meters: minimumMeters ? plausiblePoiDistance(overpass.value, minimumMeters) : overpass.value, source: `OpenStreetMap / Overpass${minimumMeters && overpass.value < minimumMeters ? " · Plausibilitätsfilter" : ""}` };
    if (overpass.hadSuccessfulRequest) successfulEmptyRequests += 1; else technicalFailures += 1;
  }
  if (technicalFailures > 0 && successfulEmptyRequests === 0) {
    const err = new Error("Alle OSM-Zugriffswege waren technisch nicht verfügbar.");
    err.name = "OsmSourcesUnavailable";
    throw err;
  }
  return null;
}

const retailQuery = (r) => `
  nwr(around:${r},{{LAT}},{{LON}})[shop~"supermarket|convenience|grocery|general|department_store|mall"];
  nwr(around:${r},{{LAT}},{{LON}})[amenity=marketplace];`;
const schoolQuery = (r) => `
  nwr(around:${r},{{LAT}},{{LON}})[amenity~"school|kindergarten|childcare"];
  nwr(around:${r},{{LAT}},{{LON}})[social_facility~"childcare|day_care"];
  nwr(around:${r},{{LAT}},{{LON}})[office=educational_institution];
  nwr(around:${r},{{LAT}},{{LON}})[amenity=college];`;
const motorwayQuery = (r) => `nwr(around:${r},{{LAT}},{{LON}})[highway=motorway_junction];`;

const microLocationQuery = (r) => `
  nwr(around:${r},{{LAT}},{{LON}})[leisure~"park|garden|playground|sports_centre|pitch|recreation_ground|swimming_pool"];
  nwr(around:${r},{{LAT}},{{LON}})[natural~"wood|water|heath|scrub"];
  nwr(around:${r},{{LAT}},{{LON}})[landuse~"forest|grass|meadow|recreation_ground|village_green|residential|industrial|commercial"];
  nwr(around:${r},{{LAT}},{{LON}})[waterway~"river|stream|canal"];
  nwr(around:${r},{{LAT}},{{LON}})[amenity~"restaurant|cafe|pharmacy|library|community_centre|doctors|clinic"];
  nwr(around:${r},{{LAT}},{{LON}})[shop=bakery];
  nwr(around:${r},{{LAT}},{{LON}})[highway~"motorway|trunk|primary"];`;

function elementPoint(element) {
  const lat = Number(element?.lat ?? element?.center?.lat);
  const lon = Number(element?.lon ?? element?.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function overpassElements(geo, queryBody, radiusMeters, timeoutMs = 7600) {
  const query = `[out:json][timeout:6];(${queryBody(radiusMeters)});out center tags qt 6000;`;
  const requests = OVERPASS_ENDPOINTS.map((endpoint) => fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString(),
  }, timeoutMs));
  const settled = await Promise.allSettled(requests);
  const dedup = new Map();
  let successful = 0;
  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    successful += 1;
    for (const element of entry.value.elements || []) {
      const point = elementPoint(element);
      if (!point) continue;
      const distance = haversine({ lat: geo.lat, lon: geo.lon }, point);
      if (distance > radiusMeters) continue;
      const key = `${element.type || "x"}:${element.id || `${point.lat}:${point.lon}`}`;
      if (!dedup.has(key) || distance < dedup.get(key).distanceMeters) {
        dedup.set(key, { ...element, distanceMeters: Math.round(distance) });
      }
    }
  }
  if (!successful) {
    const error = new Error("OpenStreetMap-Mikrolage konnte technisch nicht geladen werden.");
    error.name = "OsmMicroLocationUnavailable";
    throw error;
  }
  return [...dedup.values()];
}

function nearestDistance(items) {
  const values = items.map((item) => Number(item.distanceMeters)).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function countWithin(items, meters) {
  return items.filter((item) => Number(item.distanceMeters) <= meters).length;
}

function curveScore(distance, points, fallback) {
  if (distance == null) return fallback;
  for (const [limit, score] of points) if (distance <= limit) return score;
  return points[points.length - 1][1];
}

function microLocationFromElements(elements) {
  const green = [];
  const water = [];
  const family = [];
  const residential = [];
  const industrial = [];
  const majorRoad = [];
  const urban = [];

  for (const element of elements) {
    const tags = element.tags || {};
    const leisure = tags.leisure || "";
    const natural = tags.natural || "";
    const landuse = tags.landuse || "";
    const waterway = tags.waterway || "";
    const amenity = tags.amenity || "";
    const shop = tags.shop || "";
    const highway = tags.highway || "";

    if (/park|garden|recreation_ground/.test(leisure) || /wood|heath|scrub/.test(natural) || /forest|grass|meadow|recreation_ground|village_green/.test(landuse)) green.push(element);
    if (natural === "water" || /river|stream|canal/.test(waterway)) water.push(element);
    if (/playground|sports_centre|pitch|swimming_pool|recreation_ground/.test(leisure)) family.push(element);
    if (landuse === "residential") residential.push(element);
    if (/industrial|commercial/.test(landuse)) industrial.push(element);
    if (/motorway|trunk|primary/.test(highway)) majorRoad.push(element);
    if (/restaurant|cafe|pharmacy|library|community_centre|doctors|clinic/.test(amenity) || shop === "bakery") urban.push(element);
  }

  const greenDistance = nearestDistance(green);
  const waterDistance = nearestDistance(water);
  const familyDistance = nearestDistance(family);
  const residentialDistance = nearestDistance(residential);
  const industrialDistance = nearestDistance(industrial);
  const majorRoadDistance = nearestDistance(majorRoad);
  const urbanDistance = nearestDistance(urban);

  const greenBase = curveScore(greenDistance, [[250,100],[500,90],[1000,70],[2000,40]], 45);
  const greenDensityBonus = Math.min(15, countWithin(green, 1000) * 3);
  const greenScore = clamp(greenBase + greenDensityBonus);

  // Gewässer sind ein Bonus, kein Muss. Ohne Gewässer bleibt der Faktor neutral.
  const waterScore = curveScore(waterDistance, [[300,100],[750,85],[1500,65],[2000,50]], 65);

  const familyBase = curveScore(familyDistance, [[250,100],[500,90],[1000,75],[2000,55]], 45);
  const familyDensityBonus = Math.min(12, countWithin(family, 1000) * 3);
  const familyScore = clamp(familyBase + familyDensityBonus);

  let residentialScore = 70;
  if (residentialDistance != null) residentialScore += residentialDistance <= 500 ? 12 : residentialDistance <= 1000 ? 6 : 2;
  if (industrialDistance != null) residentialScore -= industrialDistance <= 250 ? 30 : industrialDistance <= 500 ? 20 : industrialDistance <= 1000 ? 10 : 4;
  if (majorRoadDistance != null) residentialScore -= majorRoadDistance <= 100 ? 20 : majorRoadDistance <= 250 ? 12 : majorRoadDistance <= 500 ? 6 : 2;
  residentialScore = clamp(residentialScore);

  let urbanScore = 45;
  if (urbanDistance != null) urbanScore += urbanDistance <= 250 ? 20 : urbanDistance <= 500 ? 15 : urbanDistance <= 1000 ? 10 : 4;
  urbanScore += Math.min(25, countWithin(urban, 1000) * 4);
  urbanScore = clamp(urbanScore);

  const score = Math.round(clamp(
    greenScore * 0.30 +
    waterScore * 0.15 +
    familyScore * 0.20 +
    residentialScore * 0.25 +
    urbanScore * 0.10
  ));

  const summaryParts = [];
  if (greenDistance != null) summaryParts.push(`Grün/Natur ${Math.round(greenDistance)} m`);
  if (waterDistance != null) summaryParts.push(`Gewässer ${Math.round(waterDistance)} m`);
  if (familyDistance != null) summaryParts.push(`Freizeit ${Math.round(familyDistance)} m`);
  if (industrialDistance != null && industrialDistance <= 1000) summaryParts.push(`Gewerbe/Industrie ${Math.round(industrialDistance)} m`);
  else if (residentialDistance != null && residentialDistance <= 1000) summaryParts.push("Wohngebiet im Umfeld");
  if (majorRoadDistance != null && majorRoadDistance <= 500) summaryParts.push(`Hauptverkehrsachse ${Math.round(majorRoadDistance)} m`);

  return {
    score,
    summary: summaryParts.slice(0, 4).join(" · ") || "Unmittelbares Wohnumfeld analysiert",
    components: {
      green: { score: Math.round(greenScore), nearestMeters: greenDistance, count500m: countWithin(green, 500), count1000m: countWithin(green, 1000) },
      water: { score: Math.round(waterScore), nearestMeters: waterDistance, count1000m: countWithin(water, 1000) },
      family: { score: Math.round(familyScore), nearestMeters: familyDistance, count500m: countWithin(family, 500), count1000m: countWithin(family, 1000) },
      residential: { score: Math.round(residentialScore), nearestResidentialMeters: residentialDistance, nearestIndustrialMeters: industrialDistance, nearestMajorRoadMeters: majorRoadDistance },
      urbanity: { score: Math.round(urbanScore), nearestMeters: urbanDistance, count1000m: countWithin(urban, 1000) },
    },
  };
}

async function fetchMicroLocationProfile(geo) {
  const elements = await overpassElements(geo, withCoords(microLocationQuery, geo), 2000, 7600);
  if (!elements.length) return null;
  return microLocationFromElements(elements);
}

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

function swissGridToWgs84(easting, northing) {
  // swisstopo approximate formulas. Accept both LV95 (2.6m/1.2m) and LV03 (600k/200k).
  let y = Number(easting);
  let x = Number(northing);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
  if (y > 2000000) y -= 2000000;
  if (x > 1000000) x -= 1000000;
  const yAux = (y - 600000) / 1000000;
  const xAux = (x - 200000) / 1000000;
  const latSec = 16.9023892 + 3.238272 * xAux - 0.270978 * yAux ** 2 - 0.002528 * xAux ** 2 - 0.0447 * yAux ** 2 * xAux - 0.0140 * xAux ** 3;
  const lonSec = 2.6779094 + 4.728982 * yAux + 0.791484 * yAux * xAux + 0.1306 * yAux * xAux ** 2 - 0.0436 * yAux ** 3;
  const lat = latSec * 100 / 36;
  const lon = lonSec * 100 / 36;
  return lat >= 45 && lat <= 48.5 && lon >= 5 && lon <= 11 ? { lat, lon } : null;
}

function coordFromRecord(record) {
  let lat = null;
  let lon = null;
  let easting = null;
  let northing = null;
  for (const [key, raw] of Object.entries(record || {})) {
    const k = key.toLowerCase();
    const n = Number(String(raw).replace(/[’']/g, "").replace(",", "."));
    if (!Number.isFinite(n)) continue;
    if (lat == null && /(^|_)(lat|latitude|breite|y_wgs)/.test(k) && n >= 45 && n <= 48.5) lat = n;
    if (lon == null && /(^|_)(lon|lng|longitude|laenge|länge|x_wgs)/.test(k) && n >= 5 && n <= 11) lon = n;
    if (easting == null && /(easting|ostwert|rechtswert|koord[_ -]?x|(^|_)x($|_))/i.test(k) && ((n >= 400000 && n <= 900000) || (n >= 2400000 && n <= 2900000))) easting = n;
    if (northing == null && /(northing|nordwert|hochwert|koord[_ -]?y|(^|_)y($|_))/i.test(k) && ((n >= 0 && n <= 400000) || (n >= 1000000 && n <= 1400000))) northing = n;
  }
  if (lat != null && lon != null) return { lat, lon };
  if (easting != null && northing != null) return swissGridToWgs84(easting, northing);
  return null;
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

  const lookupPostalCode = String(req.query.lookupPostalCode || "").trim();
  if (lookupPostalCode) {
    try {
      const city = await lookupCityByPostalCode(lookupPostalCode);
      return city
        ? json(res, 200, { postalCode: lookupPostalCode, city })
        : json(res, 404, { error: "Für diese PLZ wurde kein Ort gefunden." });
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : "PLZ konnte nicht aufgelöst werden." });
    }
  }
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

    const [transitD, noiseD, vacancyD, officialSchoolD, shoppingD, osmSchoolD, motorwayD] = await Promise.all([
      runDiagnostic("Nächster ÖV-Punkt", "OpenTransportData", () => fetchNearestTransit(geo)),
      runDiagnostic("Lärm Strasse/Bahn Tag+Nacht", "BAFU / BAV via GeoAdmin", () => fetchNoiseBundle(geo)),
      runDiagnostic("Leerwohnungsziffer", "BFS / opendata.swiss", () => fetchVacancyRate(municipalityBfs, municipalityName)),
      runDiagnostic("Schule / Betreuung (offiziell)", "opendata.swiss", () => fetchOfficialEducationPoi(geo, municipalityName)),
      runDiagnostic("Einkauf", "OpenStreetMap / Photon + Overpass", () => nearestWithOsmFallback(geo, retailQuery, [
        "shop:supermarket", "shop:convenience", "shop:department_store", "shop:mall", "amenity:marketplace"
      ], [3, 8, 20], { minimumMeters: 25 })),
      runDiagnostic("Schule / Betreuung (OSM)", "OpenStreetMap / Photon + Overpass", () => nearestWithOsmFallback(geo, schoolQuery, [
        "amenity:school", "amenity:kindergarten", "amenity:childcare", "amenity:college"
      ], [3, 8, 20], { minimumMeters: 25 })),
      runDiagnostic("Autobahnanschluss", "OpenStreetMap / Photon + Overpass", () => nearestWithOsmFallback(geo, motorwayQuery, ["highway:motorway_junction"], [10, 25, 50])),
    ]);

    const nearestPublicTransportMeters = transitD.value;
    const noise = noiseD.value;
    if (noise?.noData && noiseD?.diagnostic) {
      noiseD.diagnostic.status = "not_found";
      noiseD.diagnostic.detail = `GeoAdmin WMS/Identify-Lärmsuche ohne Treffer: ${noise.diagnostics?.map((d) => `${d.method}:${d.radius}m=${d.status}`).join(", ") || "keine Treffer"}`;
    }
    const roadNoiseDayDb = noise?.roadDay?.db ?? null;
    const roadNoiseNightDb = noise?.roadNight?.db ?? null;
    const railNoiseDayDb = noise?.railDay?.db ?? null;
    const railNoiseNightDb = noise?.railNight?.db ?? null;
    const roadNoiseDb = Math.max(roadNoiseDayDb || 0, roadNoiseNightDb || 0) || null;
    const railNoiseDb = Math.max(railNoiseDayDb || 0, railNoiseNightDb || 0) || null;
    const maxNoiseDb = Math.max(roadNoiseDb || 0, railNoiseDb || 0) || null;
    const noiseBurdenPercent = noise?.noData ? null : (noise?.burden ?? null);
    const vacancy = vacancyD.value;
    const schoolOsmResult = osmSchoolD.value;
    const schoolMetersRaw = officialSchoolD.value ?? schoolOsmResult?.meters ?? null;
    const schoolMeters = schoolMetersRaw == null ? null : plausiblePoiDistance(schoolMetersRaw, 25);
    const shoppingMeters = shoppingD.value?.meters ?? null;
    const motorwayMeters = motorwayD.value?.meters ?? null;

    const actual = {
      publicTransportMinutes: walkingMinutes(nearestPublicTransportMeters),
      shoppingMinutes: walkingMinutes(shoppingMeters),
      schoolMinutes: walkingMinutes(schoolMeters),
      motorwayMinutes: drivingMinutes(motorwayMeters),
      noiseLevel: noiseBurdenPercent,
      vacancyRisk: vacancy?.value == null ? null : Math.round(vacancyRiskScore(vacancy.value)),
    };

    const transitClassScore = { A: 95, B: 82, C: 68, D: 54 }[transitClass] || null;
    const vacancyRiskForScore = actual.vacancyRisk ?? 50;
    const municipalityDemand = Math.round(clamp(100 - vacancyRiskForScore * 0.78 + (transitClassScore ? (transitClassScore - 50) * 0.22 : 0)));
    // V5.6: Mikrolage als reiner Informationswert aus denselben bereits
    // vorhandenen Distanz-Scores wie die sichtbaren Lagefaktoren. Keine
    // zusätzliche Datenquelle und keine zweite Bewertungslogik.
    const piecewiseDistanceScore = (meters, points) => {
      if (meters == null || !Number.isFinite(meters)) return null;
      if (meters <= points[0][0]) return points[0][1];
      for (let i = 1; i < points.length; i += 1) {
        const [x1, y1] = points[i - 1];
        const [x2, y2] = points[i];
        if (meters <= x2) {
          const t = (meters - x1) / Math.max(x2 - x1, 1e-9);
          return Math.round(clamp(y1 + (y2 - y1) * t));
        }
      }
      return points[points.length - 1][1];
    };
    const microComponents = [
      { key: "transit", label: "ÖV", weight: 0.25, meters: nearestPublicTransportMeters, score: piecewiseDistanceScore(nearestPublicTransportMeters, [[150,100],[300,95],[500,90],[750,82],[1000,75],[1500,62],[2500,45],[4000,25],[6000,10]]) },
      { key: "shopping", label: "Einkauf", weight: 0.30, meters: shoppingMeters, score: piecewiseDistanceScore(shoppingMeters, [[300,100],[500,95],[800,85],[1200,72],[2000,55],[3000,40],[5000,20],[10000,5]]) },
      { key: "school", label: "Schule/Betreuung", weight: 0.25, meters: schoolMeters, score: piecewiseDistanceScore(schoolMeters, [[300,100],[500,95],[800,85],[1200,75],[2000,60],[3000,45],[5000,25],[10000,10]]) },
      { key: "motorway", label: "Verkehr", weight: 0.20, meters: motorwayMeters, score: piecewiseDistanceScore(motorwayMeters, [[1000,100],[2000,90],[3000,80],[5000,65],[7000,50],[10000,35],[15000,20],[25000,10]]) },
    ];
    const availableMicro = microComponents.filter((c) => c.score != null);
    const microWeight = availableMicro.reduce((sum, c) => sum + c.weight, 0);
    const microLocation = microWeight > 0 ? Math.round(availableMicro.reduce((sum, c) => sum + c.score * c.weight, 0) / microWeight) : 50;
    const microLocationAvailable = microWeight >= 0.5;
    const microLocationCoverage = Math.round(microWeight * 100);
    const microLocationSummary = microLocationAvailable ? `Aus ÖV, Einkauf, Schule und Verkehr abgeleitet · Datenabdeckung ${microLocationCoverage}%` : null;

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
      noiseD.diagnostic,
      officialSchoolD.diagnostic,
      shoppingD.diagnostic,
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
        roadNoiseDayDb,
        roadNoiseNightDb,
        railNoiseDayDb,
        railNoiseNightDb,
        roadNoiseDistanceMeters: noise?.roadDay?.distanceMeters ?? noise?.roadNight?.distanceMeters ?? null,
        railNoiseDistanceMeters: noise?.railDay?.distanceMeters ?? noise?.railNight?.distanceMeters ?? null,
        noiseImpactPercent: noiseBurdenPercent,
        noiseStrongestType: noise?.strongest?.type ?? null,
        noiseStrongestPeriod: noise?.strongest?.period ?? null,
        roadNoiseImpactPercent: noise?.roadStrongest?.burden ?? null,
        railNoiseImpactPercent: noise?.railStrongest?.burden ?? null,
        roadNoiseSource: noise?.roadStrongest?.source ?? null,
        railNoiseSource: noise?.railStrongest?.source ?? null,
        roadNoiseMethod: noise?.roadStrongest?.method ?? null,
        railNoiseMethod: noise?.railStrongest?.method ?? null,
        nearestPublicTransportMeters,
        nearestShoppingMeters: shoppingMeters,
        nearestSchoolMeters: schoolMeters,
        nearestMotorwayJunctionMeters: motorwayMeters,
        microLocationAvailable,
        microLocationSummary,
        microLocationProfile: microLocationAvailable ? {
          score: microLocation,
          summary: microLocationSummary,
          coverage: microLocationCoverage,
          components: Object.fromEntries(microComponents.map((c) => [c.key, { score: c.score, nearestMeters: c.meters, weight: c.weight }]))
        } : null,
        searchRadiusKm: Math.max(10, radiusBucket(shoppingMeters, [1, 2.5, 5, 10, 15, 20]) || 0, radiusBucket(schoolMeters, [1, 2.5, 5, 10, 15, 20]) || 0, radiusBucket(motorwayMeters, [5, 10, 20, 35, 50]) || 0),
        categoryRadiusKm: {
          transit: nearestPublicTransportMeters == null ? null : Math.max(1, Math.ceil(nearestPublicTransportMeters / 1000)),
          shopping: radiusBucket(shoppingMeters, [1, 2.5, 5, 10, 15, 20]),
          school: radiusBucket(schoolMeters, [1, 2.5, 5, 10, 15, 20]),
          motorway: radiusBucket(motorwayMeters, [5, 10, 20, 35, 50]),
        },
        educationSource: officialSchoolD.value != null
          ? `opendata.swiss${schoolMetersRaw != null && schoolMetersRaw < 25 ? " · Plausibilitätsfilter" : ""}`
          : schoolOsmResult?.source ?? null,
        shoppingSource: shoppingD.value?.source ?? null,
        motorwaySource: motorwayD.value?.source ?? null,
        noiseSource: noise?.source ?? null,
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
        { name: "BAFU / BAV via GeoAdmin", detail: "Strassen- und Bahnlärm werden getrennt für Tag/Nacht abgefragt. Jeder BAFU-Rasterlayer läuft unabhängig über GeoAdmin WMS GetFeatureInfo; BAV-Eisenbahn-Immissionen zusätzlich über GeoAdmin Identify. Suche am Objekt sowie 25/50/100/250 m. Entfernung reduziert nur den negativen Einfluss, nicht den dB-Wert." },
        { name: "OpenTransportData / transport.opendata.ch", detail: "Nächster ÖV-Servicepunkt; OpenStreetMap-Fallback bei fehlender oder temporär nicht verfügbarer Koordinatenantwort" },
        { name: "opendata.swiss", detail: "Offizielle kantonale/kommunale Schul-, Betreuungs- und Leerstandsdaten, sofern maschinenlesbar verfügbar" },
        { name: "OpenStreetMap", detail: "Einkauf, Schule/Betreuung und Autobahnanschlüsse über Photon/Overpass. Mikrolage wird ohne zusätzliche Abfrage aus den bereits geladenen Distanzen zu Einkauf, Schule/Betreuung, ÖV und Autobahn berechnet." },
      ],
    };

    memoryCache.set(cacheKey, { at: Date.now(), value: body });
    return json(res, 200, body);
  } catch (error) {
    // If this serverless instance still has an older successful result, prefer a
    // transparent stale result over making the user lose all already-known data.
    if (cached && Date.now() - cached.at < 7 * 24 * 60 * 60 * 1000) {
      return json(res, 200, { ...cached.value, cache: { stale: true, reason: error instanceof Error ? error.message : "Quellenfehler" } });
    }
    return json(res, 502, { error: error instanceof Error ? error.message : "Standortdaten konnten nicht geladen werden." });
  }
}
