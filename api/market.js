const OPENDATA_SEARCH = "https://ckan.opendata.swiss/api/3/action/package_search";
const GEOADMIN_SEARCH = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";
const GEOADMIN_IDENTIFY = "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";
const CANTON_LAYER = "ch.swisstopo.swissboundaries3d-kanton-flaeche.fill";
const BFS_RENT_XLS = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36398447/master";
const BFS_RENT_YEAR = 2024;

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
        "User-Agent": "HomeIQ-Invest/5.0 (Swiss market data gateway)",
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
        "User-Agent": "HomeIQ-Invest/5.0 (Swiss market data gateway)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchArrayBuffer(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
        "User-Agent": "HomeIQ-Invest/5.8 (official Swiss market-rent data)",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.arrayBuffer();
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


const normalizeText = (value = "") =>
  cleanLabel(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

const qualityForTier = (tier) => ({1:"sehr hoch",2:"hoch",3:"mittel-hoch",4:"mittel"}[tier] || null);
const uncertaintyForTier = (tier) => ({1:0.05,2:0.07,3:0.10,4:0.15}[tier] ?? 0.15);

function interpolateRoomBenchmark(valuesByRoom, rooms) {
  const entries = Object.entries(valuesByRoom)
    .map(([room,value]) => [Number(room),Number(value)])
    .filter(([room,value]) => Number.isFinite(room) && Number.isFinite(value) && value >= 5 && value <= 100)
    .sort((a,b) => a[0]-b[0]);
  if (!entries.length) return null;
  const target = Number(rooms) || 0;
  if (!target) return entries[Math.floor(entries.length/2)][1];
  const exact = entries.find(([room]) => Math.abs(room-target) < 0.001);
  if (exact) return exact[1];
  const lower = [...entries].reverse().find(([room]) => room < target);
  const upper = entries.find(([room]) => room > target);
  if (lower && upper) {
    const ratio = (target-lower[0])/(upper[0]-lower[0]);
    return lower[1] + ratio*(upper[1]-lower[1]);
  }
  return lower?.[1] ?? upper?.[1] ?? null;
}

function resultRent(value, tier, source, rentType, sourceYear, geographyLevel, geographyName) {
  if (!Number.isFinite(value) || value < 5 || value > 100) return null;
  return {
    value: Math.round(value*100)/100,
    tier, source, rentType, sourceYear, geographyLevel, geographyName,
    uncertaintyPct: uncertaintyForTier(tier),
    dataQuality: qualityForTier(tier),
  };
}

function explicitSqmRentFromRow(row) {
  return numberFromRecord(
    row,
    ["mietpreis pro m", "miete pro m", "m2", "m²", "quadratmeter", "qm"],
    5, 100,
  );
}

function roomFromBlob(blob) {
  const text = normalizeText(blob);
  const m = text.match(/(?:^|\s)([1-6])(?:[.,]0)?\s*(?:zimmer|zi|room|piece|locali)?(?:\s|$)/);
  return m ? Number(m[1]) : null;
}

function roomValuesFromRows(rows, requireAsking = false) {
  const values = {};
  for (const row of rows) {
    const blob = Object.values(row).join(" ");
    const normalized = normalizeText(blob);
    if (requireAsking && !/(angebot|asking|inserat)/.test(normalized)) continue;
    const room = roomFromBlob(blob);
    if (!room) continue;
    const value = explicitSqmRentFromRow(row);
    if (value != null && values[room] == null) values[room] = value;
  }
  return values;
}

async function tryWinterthurAskingRentBenchmark(city, rooms) {
  if (!/^winterthur$/i.test(city.trim())) return null;
  try {
    const search = await fetchJson(`${OPENDATA_SEARCH}?${new URLSearchParams({q:"Angebots- und Bestandesmieten Winterthur",rows:"10"})}`, {}, 3500);
    const pkg = (search.result?.results || []).find((x) => /angebots.*bestandesmieten/i.test(displayName(x.title)));
    const resource = (pkg?.resources || []).find((r) => /csv/i.test(String(r.format || "")));
    if (!resource?.url) return null;
    const rows = parseCsv(await fetchText(resource.url, {}, 4500));
    const value = interpolateRoomBenchmark(roomValuesFromRows(rows, true), rooms);
    return value == null ? null : resultRent(value, 1, "Stadt Winterthur – Angebotsmieten", "ASKING", 2026, "city", "Winterthur");
  } catch { return null; }
}

async function tryGenericOfficialRentBenchmark(city, rooms, discovered) {
  for (const item of (discovered || []).filter((x) => x.kind === "rent").slice(0,3)) {
    if (!/\.csv(?:$|\?)/i.test(item.url || "") && !/csv/i.test(item.title || "")) continue;
    try {
      const rows = parseCsv(await fetchText(item.url, {}, 3500));
      const value = interpolateRoomBenchmark(roomValuesFromRows(rows, false), rooms);
      if (value != null) return resultRent(value, 3, `${item.publisher} – ${item.title}`, "EXISTING", null, "municipality", city);
    } catch {}
  }
  return null;
}

const CANTON_NAMES = {
  AG:"Aargau",AI:"Appenzell Innerrhoden",AR:"Appenzell Ausserrhoden",BE:"Bern",BL:"Basel-Landschaft",BS:"Basel-Stadt",
  FR:"Fribourg",GE:"Genève",GL:"Glarus",GR:"Graubünden",JU:"Jura",LU:"Luzern",NE:"Neuchâtel",NW:"Nidwalden",
  OW:"Obwalden",SG:"St. Gallen",SH:"Schaffhausen",SO:"Solothurn",SZ:"Schwyz",TG:"Thurgau",TI:"Ticino",UR:"Uri",
  VD:"Vaud",VS:"Valais",ZG:"Zug",ZH:"Zürich"
};

// Gebündelte, öffentlich verifizierte Kantons-Basiswerte.
// Diese Werte dienen AUSSCHLIESSLICH als Notfall-Fallback, falls die
// aktuelle BFS-XLS-Ressource im Serverless-Umfeld nicht abrufbar ist.
// Es werden keine erfundenen Werte verwendet.
//
// ZH / FR: BFS Strukturerhebung 2024, publiziert 05.03.2026.
// AG: öffentlich publiziertes Mietpreisniveau Kanton Aargau 2023
//     (Angebotsmiete, Wüest & Partner, publiziert durch Kanton Aargau).
//
// Sobald ein belastbarer Zimmer-spezifischer BFS-Wert geladen werden kann,
// hat dieser IMMER Vorrang.
const BUNDLED_CANTON_RENT_FALLBACK = {
  ZH: {
    value: 21.3,
    source: "BFS – durchschnittlicher Mietpreis pro m², Kanton Zürich",
    rentType: "EXISTING",
    sourceYear: 2024,
  },
  FR: {
    value: 15.8,
    source: "BFS – durchschnittlicher Mietpreis pro m², Kanton Freiburg",
    rentType: "EXISTING",
    sourceYear: 2024,
  },
  AG: {
    value: 17.3,
    source: "Kanton Aargau – veröffentlichtes Mietpreisniveau",
    rentType: "ASKING",
    sourceYear: 2023,
  },
};

function bundledCantonRentFallback(canton) {
  if (!canton?.code) return null;
  const row = BUNDLED_CANTON_RENT_FALLBACK[canton.code];
  if (!row) return null;

  return {
    value: row.value,
    tier: 4,
    source: row.source,
    rentType: row.rentType,
    sourceYear: row.sourceYear,
    geographyLevel: "canton",
    geographyName: canton.name,
    uncertaintyPct: 0.15,
    dataQuality: "mittel",
    fallbackMode: "bundled-canton-average",
  };
}

function cantonCodeFromProps(props={}) {
  const blob = normalizeText(Object.values(props).join(" "));
  for (const [code,name] of Object.entries(CANTON_NAMES)) {
    if (blob.includes(normalizeText(name)) || new RegExp(`(^|\\s)${code.toLowerCase()}(\\s|$)`).test(blob)) return code;
  }
  return null;
}

async function resolveCanton(postalCode, city) {
  const parseCantonCode = (raw = "") => {
    const text = cleanLabel(raw);
    const paren = text.match(/\(([A-Z]{2})\)/);
    if (paren && CANTON_NAMES[paren[1]]) return paren[1];

    const tokens = normalizeText(text).split(" ");
    for (const token of tokens) {
      const upper = token.toUpperCase();
      if (CANTON_NAMES[upper]) return upper;
    }
    return null;
  };

  // 1. Bevorzugt: Gemeinde-Suche. GeoAdmin liefert bei Gemeinden das
  // Kantonskürzel typischerweise im Label/Detail, z.B. "(AG)".
  try {
    const municipalityParams = new URLSearchParams({
      searchText: city || postalCode,
      type: "locations",
      origins: "gg25",
      sr: "2056",
      limit: "10",
    });
    const municipality = await fetchJson(`${GEOADMIN_SEARCH}?${municipalityParams}`, {}, 3500);

    for (const hit of municipality.results || []) {
      const code =
        parseCantonCode(hit.attrs?.label || "") ||
        parseCantonCode(hit.attrs?.detail || "");
      if (code) return { code, name: CANTON_NAMES[code] };
    }
  } catch {
    // Räumlicher Fallback unten.
  }

  // 2. Bestehender räumlicher Fallback über Koordinaten + Kantonslayer.
  try {
    const searchText = [postalCode, city].filter(Boolean).join(" ");
    const params = new URLSearchParams({
      searchText,
      type: "locations",
      origins: postalCode ? "zipcode" : "gg25",
      sr: "2056",
      limit: "10",
    });
    const found = await fetchJson(`${GEOADMIN_SEARCH}?${params}`, {}, 3500);
    const attrs = found.results?.[0]?.attrs || {};
    const easting = Number(attrs.y);
    const northing = Number(attrs.x);

    if (![easting, northing].every(Number.isFinite)) return null;

    const d = 1000;
    const identify = new URLSearchParams({
      geometry: `${easting},${northing}`,
      geometryType: "esriGeometryPoint",
      geometryFormat: "geojson",
      sr: "2056",
      imageDisplay: "1000,1000,96",
      mapExtent: `${easting-d},${northing-d},${easting+d},${northing+d}`,
      tolerance: "2",
      layers: `all:${CANTON_LAYER}`,
      returnGeometry: "false",
      lang: "de",
      limit: "10",
    });

    const payload = await fetchJson(`${GEOADMIN_IDENTIFY}?${identify}`, {}, 3500);
    const props =
      payload.results?.[0]?.properties ||
      payload.results?.[0]?.attributes ||
      {};

    const directCode =
      parseCantonCode(props.name || "") ||
      parseCantonCode(props.bez || "") ||
      parseCantonCode(props.displayname || "") ||
      parseCantonCode(JSON.stringify(props));

    const code = directCode || cantonCodeFromProps(props);
    return code ? { code, name: CANTON_NAMES[code] } : null;
  } catch {
    return null;
  }
}

function fillMerged(matrix, merges=[]) {
  for (const merge of merges) {
    const value = matrix[merge.s.r]?.[merge.s.c];
    if (value == null || value === "") continue;
    for (let r=merge.s.r;r<=merge.e.r;r++) {
      matrix[r] ||= [];
      for (let c=merge.s.c;c<=merge.e.c;c++) if (matrix[r][c] == null || matrix[r][c] === "") matrix[r][c]=value;
    }
  }
  return matrix;
}

function bfsRoomValues(matrix, cantonName, cantonCode) {
  const values={};
  const cantonTokens=[normalizeText(cantonName),normalizeText(cantonCode)];
  for (let r=0;r<matrix.length;r++) {
    const row=matrix[r]||[];
    const rowText=normalizeText(row.join(" "));
    for (let c=0;c<row.length;c++) {
      const n=Number(String(row[c]??"").replace(/[^0-9,.-]/g,"").replace(",","."));
      if (!Number.isFinite(n)||n<5||n>100) continue;
      const colText=normalizeText(matrix.slice(0,r+1).map((x)=>x?.[c]).filter(Boolean).join(" "));
      const context=`${rowText} ${colText}`;
      if (!cantonTokens.some((t)=>t && context.includes(t))) continue;
      let room=null;
      for (let k=1;k<=6;k++) if (new RegExp(`(^|\\s)${k}(?: 0)? (?:zimmer|piece|locali)(\\s|$)`).test(context)) {room=k;break;}
      if (!room) continue;
      const years=context.match(/20\d{2}/g)||[];
      if (years.length && !years.includes(String(BFS_RENT_YEAR))) continue;
      if (values[room] == null) values[room]=n;
    }
  }
  return values;
}

async function tryBfsRentBenchmark(postalCode, city, rooms) {
  const canton = await resolveCanton(postalCode, city);
  if (!canton) return null;

  // 1) Bevorzugt: exakter BFS-Wert nach Kanton + Zimmerzahl.
  //    Halbe Zimmer werden wie definiert linear interpoliert.
  try {
    const XLSX = await import("xlsx");
    const buffer = await fetchArrayBuffer(BFS_RENT_XLS, {}, 10000);
    const workbook = XLSX.read(buffer, { type: "array" });
    const values = {};

    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      let matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      matrix = fillMerged(matrix, sheet["!merges"] || []);
      Object.assign(values, bfsRoomValues(matrix, canton.name, canton.code));
    }

    const value = interpolateRoomBenchmark(values, rooms);
    if (value != null) {
      return resultRent(
        value,
        4,
        "BFS – Mietpreis pro m² nach Zimmerzahl und Kanton",
        "EXISTING",
        BFS_RENT_YEAR,
        "canton",
        canton.name,
      );
    }
  } catch {
    // Der DAM-XLS-Endpunkt ist in Serverless-Umgebungen nicht immer
    // zuverlässig erreichbar. Daher deterministischer lokaler Fallback.
  }

  // 2) Deterministischer Notfall-Fallback aus verifizierten öffentlichen
  //    Kantonswerten. Keine Netzwerkanfrage, keine Excel-Auswertung.
  return bundledCantonRentFallback(canton);
}

async function tryZurichRentBenchmark(city, rooms) {
  if (!/^zürich$/i.test(city.trim())) return null;
  try {
    const search = await fetchJson(`${OPENDATA_SEARCH}?${new URLSearchParams({q:"Mietpreise in der Stadt Zürich MPE",rows:"5"})}`, {}, 3500);
    const pkg = (search.result?.results || []).find((x) => /mietpreise/i.test(displayName(x.title)));
    const resource = (pkg?.resources || []).find((r) => /csv/i.test(String(r.format || "")));
    if (!resource?.url) return null;
    const rows=parseCsv(await fetchText(resource.url,{},4500));
    const value=interpolateRoomBenchmark(roomValuesFromRows(rows,false),rooms);
    return value==null?null:resultRent(value,2,"Open Data Zürich – Mietpreiserhebung","EXISTING",2024,"city","Zürich");
  } catch { return null; }
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

async function fetchMarketLayers(city, propertyType, rooms, postalCode) {
  const discoveredPromise=discoverOpenData(city);
  const pricePromise=tryZurichPriceBenchmark(city,propertyType);

  let rent=await tryWinterthurAskingRentBenchmark(city,rooms);
  if (!rent) rent=await tryZurichRentBenchmark(city,rooms);
  const discovered=await discoveredPromise;
  if (!rent) rent=await tryGenericOfficialRentBenchmark(city,rooms,discovered);
  if (!rent) rent=await tryBfsRentBenchmark(postalCode,city,rooms);

  const price=await pricePromise;
  const used=rent?.tier??null;
  const tiers=[
    {tier:1,name:"Lokale öffentliche Angebotsmieten",status:used===1?"verwendet":"nicht_verfuegbar",detail:used===1?`Verwendet: ${rent.source}.`:"Keine belastbare lokale Angebotsmietquelle gefunden."},
    {tier:2,name:"Offizielle lokale Mietstatistik",status:used===2?"verwendet":"nicht_verfuegbar",detail:used===2?`Verwendet: ${rent.source}.`:"Keine unterstützte lokale Mietstatistik verfügbar."},
    {tier:3,name:"Offizielle Gemeinde-/Städtestatistik",status:used===3?"verwendet":discovered.some((d)=>d.kind==="rent")?"gefunden":"nicht_verfuegbar",detail:used===3?`Verwendet: ${rent.source}.`:"Nur explizite CHF/m²-Datensätze mit Zimmerbezug werden akzeptiert."},
    {tier:4,name:"BFS Kanton × Zimmerzahl",status:used===4?"verwendet":"nicht_verfuegbar",detail:used===4?`BFS-Fallback ${rent.geographyName}; Zimmerzahl wird linear interpoliert.`:used?"Nicht benötigt, weil eine präzisere Quelle verwendet wurde.":"BFS-Fallback konnte nicht geladen werden."},
  ];
  const confidence=price?.value&&rent?.value?"hoch":price?.value||rent?.value?"mittel":"eingeschränkt";
  return {
    pricePerSqm:price?.value??null,rentPerSqm:rent?.value??null,
    priceSource:price?.source??null,rentSource:rent?.source??null,
    rentSourceTier:rent?.tier??null,rentType:rent?.rentType??null,rentSourceYear:rent?.sourceYear??null,
    rentGeographyLevel:rent?.geographyLevel??null,rentGeographyName:rent?.geographyName??null,
    rentUncertaintyPct:rent?.uncertaintyPct??null,rentDataQuality:rent?.dataQuality??null,
    confidence,radiusKm:null,discoveredDatasets:discovered,tiers,
    note:rent?.value?`Marktmiete V1: ${rent.value.toFixed(2)} CHF/m² · Stufe ${rent.tier} · ${rent.geographyName || city}${rent.fallbackMode === "bundled-canton-average" ? " · gebündelter Kantons-Fallback" : ""} · ohne Objekt-Zu-/Abschläge.`:
      "Kein belastbarer öffentlicher CHF/m²-Mietbenchmark gefunden. HomeIQ erfindet keinen Ersatzwert."
  };
}


export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const city = String(req.query.city || "").trim();
  const postalCode = String(req.query.postalCode || "").trim();
  const propertyType = String(req.query.propertyType || "wohnung").trim();
  const rooms = Number(req.query.rooms || 0);
  if (!city) return json(res, 400, { error: "Ort ist erforderlich." });
  try {
    const result = await fetchMarketLayers(city, propertyType, rooms, postalCode);
    return json(res, 200, result);
  } catch {
    return json(res, 200, {
      pricePerSqm: null, rentPerSqm: null, priceSource: null, rentSource: null,
      rentSourceTier: null, rentType: null, rentSourceYear: null,
      rentGeographyLevel: null, rentGeographyName: null, rentUncertaintyPct: null, rentDataQuality: null,
      confidence: "eingeschränkt", radiusKm: null, discoveredDatasets: [], tiers: [],
      note: "Die Marktquellen konnten nicht rechtzeitig geladen werden. Es werden keine Ersatzwerte verwendet.",
    });
  }
}
