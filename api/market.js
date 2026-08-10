const OPENDATA_SEARCH = "https://ckan.opendata.swiss/api/3/action/package_search";

const cleanLabel = (value = "") => String(value).replace(/<[^>]+>/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=21600, stale-while-revalidate=604800" : "no-store");
  res.end(JSON.stringify(body));
};

async function fetchJson(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HomeIQ-Invest/4.8 (Swiss market data gateway)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "text/csv,text/plain,*/*",
        "User-Agent": "HomeIQ-Invest/4.8 (Swiss market data gateway)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function inferKind(text) {
  const value = text.toLowerCase();
  if (/miet|rent/.test(value)) return "rent";
  if (/immobilienpreis|verkaufspreis|transaktion|eigentumswohnung|einfamilienhaus/.test(value)) return "price";
  return "other";
}

function displayName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.de || value.en || value.fr || Object.values(value)[0] || "";
  return "";
}

async function discoverOpenData(city) {
  const searches = [`mietpreise ${city}`, `immobilienpreise ${city}`, `verkaufspreise ${city}`];
  const out = [];
  await Promise.all(searches.map(async (q) => {
    try {
      const params = new URLSearchParams({ q, rows: "5" });
      const payload = await fetchJson(`${OPENDATA_SEARCH}?${params}`, {}, 3500);
      for (const pkg of payload.result?.results || []) {
        const title = cleanLabel(displayName(pkg.title) || pkg.name || "Open-Data-Datensatz");
        const publisher = cleanLabel(displayName(pkg.organization?.title) || pkg.organization?.display_name || "opendata.swiss");
        const resource = (pkg.resources || []).find((r) => /csv|json/i.test(String(r.format || ""))) || (pkg.resources || [])[0];
        const url = resource?.url || pkg.url || `https://opendata.swiss/de/dataset/${pkg.name}`;
        if (!out.some((item) => item.url === url)) out.push({ title, publisher, url, kind: inferKind(`${title} ${pkg.notes || ""}`) });
      }
    } catch {
      // Metadata discovery is optional and never blocks the location result.
    }
  }));
  return out.slice(0, 8);
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (line) => line.split(delimiter).map((v) => v.replace(/^"|"$/g, "").trim());
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((value, i) => [headers[i] || `c${i}`, value])));
}

function numberFromRecord(record, keyPatterns, min, max) {
  for (const [key, raw] of Object.entries(record)) {
    const k = key.toLowerCase();
    if (!keyPatterns.some((p) => k.includes(p))) continue;
    const n = Number(String(raw).replace(/[^0-9,.-]/g, "").replace(/'/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= min && n <= max) return n;
  }
  return null;
}

async function tryZurichRentBenchmark(city, rooms) {
  if (!/^zürich$/i.test(city.trim())) return null;
  try {
    const search = await fetchJson(`${OPENDATA_SEARCH}?${new URLSearchParams({ q: "Mietpreise in der Stadt Zürich MPE", rows: "5" })}`, {}, 3500);
    const pkg = (search.result?.results || []).find((p) => /mietpreise/i.test(displayName(p.title)));
    const resource = (pkg?.resources || []).find((r) => /csv/i.test(String(r.format || "")));
    if (!resource?.url) return null;
    const rows = parseCsv(await fetchText(resource.url, {}, 4000));
    if (!rows.length) return null;
    const roomRounded = Math.max(1, Math.round(Number(rooms) || 3));
    const candidates = rows.filter((row) => {
      const blob = Object.values(row).join(" ").toLowerCase();
      const roomMatch = blob.match(/(?:^|\D)([1-6])(?:\.?0)?\s*(?:zimmer|zi|z)?(?:\D|$)/i);
      return !roomMatch || Number(roomMatch[1]) === roomRounded;
    });
    let best = null;
    for (const row of candidates.length ? candidates : rows) {
      const n = numberFromRecord(row, ["median", "m2", "m²", "qm", "quadratmeter"], 5, 100);
      if (n != null) { best = n; break; }
    }
    if (best == null) return null;
    return { value: best, source: "Open Data Zürich – Mietpreiserhebung", confidence: "hoch" };
  } catch {
    return null;
  }
}

async function tryZurichPriceBenchmark(city, propertyType) {
  if (!/^zürich$/i.test(city.trim()) && !/zh/i.test(city)) return null;
  try {
    const search = await fetchJson(`${OPENDATA_SEARCH}?${new URLSearchParams({ q: "Immobilienpreise im Kanton Zürich", rows: "5" })}`, {}, 3500);
    const pkg = (search.result?.results || []).find((p) => /immobilienpreise/i.test(displayName(p.title)));
    if (!pkg) return null;
    const wanted = propertyType === "wohnung" ? /eigentumswohnung.*gemeinde/i : /einfamilienhaus.*gemeinde/i;
    const resource = (pkg.resources || []).find((r) => /json/i.test(String(r.format || "")) && wanted.test(`${r.name || ""} ${r.description || ""}`));
    if (!resource?.url) return null;
    const payload = await fetchJson(resource.url, {}, 4000);
    const records = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [];
    const cityRows = records.filter((row) => Object.values(row || {}).some((v) => String(v).toLowerCase().includes(city.toLowerCase())));
    let best = null;
    for (const row of cityRows.length ? cityRows : records) {
      const n = numberFromRecord(row, ["m2", "m²", "qm", "quadratmeter", "preis_m"], 1000, 40000);
      if (n != null) { best = n; break; }
    }
    if (best == null) return null;
    return { value: best, source: "Kanton Zürich – offene Transaktionsdaten", confidence: "hoch" };
  } catch {
    return null;
  }
}

async function fetchMarketLayers(city, propertyType, rooms) {
  const [discovered, rent, price] = await Promise.all([
    discoverOpenData(city),
    tryZurichRentBenchmark(city, rooms),
    tryZurichPriceBenchmark(city, propertyType),
  ]);

  const tiers = [
    {
      tier: 1,
      name: "Bundesdaten / schweizweite Open Data",
      status: "verwendet",
      detail: "GeoAdmin, GWR, BFS, ARE, BAFU und OpenTransportData bilden das stabile Grundgerüst.",
    },
    {
      tier: 2,
      name: "Kantonale und kommunale Open Data",
      status: discovered.length ? "gefunden" : "nicht_verfuegbar",
      detail: discovered.length ? `${discovered.length} potenziell passende offene Marktdatensätze im Katalog gefunden.` : "Für diesen Ort wurde aktuell kein direkt passender lokaler Marktdatensatz gefunden.",
    },
    {
      tier: 3,
      name: "Kommerzielle Marktdaten",
      status: "vorbereitet",
      detail: "Adapter für Raiffeisen Gemeindeinfo, ImmoScout24/SMG und Comparis sind architektonisch vorgesehen, bleiben ohne offiziellen API-/Lizenzzugang deaktiviert.",
    },
  ];

  const confidence = price?.value && rent?.value ? "hoch" : price?.value || rent?.value ? "mittel" : "eingeschränkt";
  return {
    pricePerSqm: price?.value ?? null,
    rentPerSqm: rent?.value ?? null,
    priceSource: price?.source ?? null,
    rentSource: rent?.source ?? null,
    confidence,
    radiusKm: null,
    discoveredDatasets: discovered,
    tiers,
    note: price?.value || rent?.value
      ? "Mindestens ein belastbarer öffentlicher Marktbenchmark wurde automatisch übernommen. Fehlende Werte werden nicht erfunden."
      : "Es wurden keine automatisch auslesbaren lokalen Marktbenchmarks gefunden. HomeIQ zeigt deshalb keinen erfundenen Marktwert bzw. keine erfundene Marktmiete. Ebene 3 bleibt bis zu einem offiziellen Datenzugang deaktiviert.",
  };
}


export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const city = String(req.query.city || "").trim();
  const propertyType = String(req.query.propertyType || "wohnung").trim();
  const rooms = Number(req.query.rooms || 0);
  if (!city) return json(res, 400, { error: "Ort ist erforderlich." });
  try {
    const result = await fetchMarketLayers(city, propertyType, rooms);
    return json(res, 200, result);
  } catch {
    return json(res, 200, {
      pricePerSqm: null, rentPerSqm: null, priceSource: null, rentSource: null,
      confidence: "eingeschränkt", radiusKm: null, discoveredDatasets: [], tiers: [],
      note: "Die Marktquellen konnten nicht rechtzeitig geladen werden. Es werden keine Ersatzwerte verwendet.",
    });
  }
}
