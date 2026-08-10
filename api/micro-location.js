const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const cache = new Map();
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=21600, stale-while-revalidate=604800" : "no-store");
  res.end(JSON.stringify(body));
};

async function fetchJson(url, options = {}, timeoutMs = 3600) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HomeIQ-Invest/5.3 (isolated optional OSM micro-location)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pointOf(element) {
  const lat = Number(element?.lat ?? element?.center?.lat);
  const lon = Number(element?.lon ?? element?.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function nearest(items) {
  const values = items.map((x) => x.distanceMeters).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function distanceScore(distance, points, fallback) {
  if (distance == null) return fallback;
  for (const [limit, score] of points) if (distance <= limit) return score;
  return points[points.length - 1][1];
}

async function loadEnvironment(lat, lon) {
  const radius = 2000;
  // One compact request only. The core location pipeline never waits for this endpoint.
  const body = `
    nwr(around:${radius},${lat},${lon})[leisure~"park|garden|playground|sports_centre|pitch|recreation_ground|swimming_pool"];
    nwr(around:${radius},${lat},${lon})[natural~"wood|water"];
    nwr(around:${radius},${lat},${lon})[landuse~"forest|grass|meadow|recreation_ground|village_green"];
    nwr(around:${radius},${lat},${lon})[waterway~"river|stream|canal"];
    nwr(around:${radius},${lat},${lon})[amenity~"pharmacy|cafe|restaurant|library|community_centre"];
    nwr(around:${radius},${lat},${lon})[shop~"supermarket|convenience|bakery"];
  `;
  const query = `[out:json][timeout:4];(${body});out center tags qt 2500;`;
  const requests = OVERPASS_ENDPOINTS.map((endpoint) => fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString(),
  }, 3600));
  const settled = await Promise.allSettled(requests);
  const successful = settled.filter((x) => x.status === "fulfilled");
  if (!successful.length) throw new Error("Mikrolage konnte momentan nicht geladen werden.");

  const dedup = new Map();
  for (const entry of successful) {
    for (const element of entry.value.elements || []) {
      const point = pointOf(element);
      if (!point) continue;
      let d = haversine({ lat, lon }, point);
      // Overpass around guarantees that large ways/relations intersect the search area.
      // Their centre can lie outside it, so cap the display distance conservatively.
      if (d > radius) d = radius;
      const key = `${element.type}:${element.id}`;
      if (!dedup.has(key) || d < dedup.get(key).distanceMeters) dedup.set(key, { ...element, distanceMeters: Math.round(d) });
    }
  }
  return [...dedup.values()];
}

function analyse(elements) {
  const green = [];
  const water = [];
  const family = [];
  const convenience = [];

  for (const element of elements) {
    const t = element.tags || {};
    if (/park|garden|recreation_ground/.test(t.leisure || "") || /wood/.test(t.natural || "") || /forest|grass|meadow|recreation_ground|village_green/.test(t.landuse || "")) green.push(element);
    if (t.natural === "water" || /river|stream|canal/.test(t.waterway || "")) water.push(element);
    if (/playground|sports_centre|pitch|recreation_ground|swimming_pool/.test(t.leisure || "")) family.push(element);
    if (/pharmacy|cafe|restaurant|library|community_centre/.test(t.amenity || "") || /supermarket|convenience|bakery/.test(t.shop || "")) convenience.push(element);
  }

  const greenD = nearest(green);
  const waterD = nearest(water);
  const familyD = nearest(family);
  const convenienceD = nearest(convenience);

  const components = {
    green: { available: true, score: distanceScore(greenD, [[250,100],[500,90],[1000,75],[2000,60]], 45), nearestMeters: greenD },
    water: { available: waterD != null, score: waterD == null ? null : distanceScore(waterD, [[300,100],[750,85],[1500,65],[2000,50]], 50), nearestMeters: waterD },
    family: { available: true, score: distanceScore(familyD, [[300,100],[600,90],[1000,75],[2000,60]], 45), nearestMeters: familyD },
    convenience: { available: true, score: distanceScore(convenienceD, [[300,100],[600,90],[1000,75],[2000,55]], 35), nearestMeters: convenienceD },
  };

  const weights = { green: 30, water: 20, family: 25, convenience: 25 };
  const active = Object.entries(components).filter(([, c]) => c.available && c.score != null);
  const totalWeight = active.reduce((sum, [key]) => sum + weights[key], 0);
  const score = totalWeight ? Math.round(active.reduce((sum, [key, c]) => sum + c.score * weights[key], 0) / totalWeight) : null;
  const dataCoverage = Math.round(totalWeight);

  const summary = [
    greenD != null ? `Grün/Natur ${Math.round(greenD)} m` : null,
    waterD != null ? `Gewässer ${Math.round(waterD)} m` : null,
    familyD != null ? `Freizeit ${Math.round(familyD)} m` : null,
    convenienceD != null ? `Nahversorgung ${Math.round(convenienceD)} m` : null,
  ].filter(Boolean).join(" · ");

  return { score, dataCoverage, summary: summary || "Unmittelbares Wohnumfeld analysiert", components };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { error: "Koordinaten fehlen." });

  const key = `${lat.toFixed(5)}|${lon.toFixed(5)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return json(res, 200, cached.value);

  try {
    const elements = await loadEnvironment(lat, lon);
    const profile = analyse(elements);
    const value = { available: profile.score != null, profile, loadedAt: new Date().toISOString(), source: "OpenStreetMap / Overpass" };
    cache.set(key, { at: Date.now(), value });
    return json(res, 200, value);
  } catch (error) {
    return json(res, 503, { available: false, profile: null, error: error instanceof Error ? error.message : "Mikrolage nicht verfügbar." });
  }
}
