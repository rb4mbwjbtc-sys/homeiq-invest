import { jsPDF } from "jspdf";
import type { StoredAnalysis, AnalysisResult } from "./types";
import { FLOOR_OPTIONS } from "./types";
import { chf, num, pct, dateShort } from "./format";
import { scoreRgb, scoreTier } from "./colors";
import { SCORE_WEIGHTS } from "./config";

// Farbpalette
const NAVY_DARK: [number, number, number] = [15, 27, 61];
const NAVY_LIGHT: [number, number, number] = [59, 111, 160];
const WASH: [number, number, number] = [244, 247, 251];
const BORDER: [number, number, number] = [222, 228, 238];
const MUTED: [number, number, number] = [110, 118, 135];
const INK: [number, number, number] = [24, 32, 54];
const GREEN: [number, number, number] = [16, 122, 90];
const RED: [number, number, number] = [176, 60, 44];

// ---------------- Map (OSM tile stitching) ----------------
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("tile load failed"));
    img.src = src;
  });
}

async function fetchStaticMapDataUrl(
  lat: number,
  lon: number,
  width = 600,
  height = 400,
  zoom = 15,
): Promise<string | null> {
  try {
    const n = Math.pow(2, zoom);
    const xTile = ((lon + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const yTile =
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n;

    const centerPxX = xTile * 256;
    const centerPxY = yTile * 256;
    const left = centerPxX - width / 2;
    const top = centerPxY - height / 2;

    const startTileX = Math.floor(left / 256);
    const startTileY = Math.floor(top / 256);
    const endTileX = Math.floor((left + width) / 256);
    const endTileY = Math.floor((top + height) / 256);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Hintergrund (falls Tiles fehlen)
    ctx.fillStyle = "#e8ecf1";
    ctx.fillRect(0, 0, width, height);

    const subdomains = ["a", "b", "c"];
    const tasks: Promise<void>[] = [];
    let idx = 0;
    for (let tx = startTileX; tx <= endTileX; tx++) {
      for (let ty = startTileY; ty <= endTileY; ty++) {
        const maxTile = Math.pow(2, zoom);
        if (ty < 0 || ty >= maxTile) continue;
        const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
        const sub = subdomains[idx++ % subdomains.length];
        const url = `https://${sub}.tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`;
        const dx = tx * 256 - left;
        const dy = ty * 256 - top;
        tasks.push(
          loadImage(url)
            .then((img) => {
              ctx.drawImage(img, dx, dy);
            })
            .catch(() => {
              /* fehlendes Tile: Hintergrund bleibt */
            }),
        );
      }
    }
    await Promise.all(tasks);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// ---------------- Reason-Text ----------------
type SubKey = keyof AnalysisResult["subscores"];

const FACTOR_LABEL: Record<SubKey, string> = {
  yield: "Nettorendite",
  equityReturn: "Eigenkapitalrendite",
  location: "Lagequalität",
  condition: "Zustand",
  features: "Ausstattung",
};

function tierMark(score: number): { color: [number, number, number]; word: string } {
  const t = scoreTier(score);
  const rgb = scoreRgb(score);
  const word =
    t === "excellent" ? "Sehr gut"
    : t === "good" ? "Gut"
    : t === "ok" ? "Solide"
    : t === "weak" ? "Durchschnittlich"
    : "Kritisch";
  return { color: rgb, word };
}

function friendlyReason(a: StoredAnalysis, key: SubKey): string {
  const r = a.result;
  const i = a.inputs;
  const v = r.subscores[key];
  switch (key) {
    case "yield": {
      const above = r.netYield >= 3.5;
      const solid = r.netYield >= 2.5;
      if (v >= 80) return `Attraktive Nettorendite von ${pct(r.netYield)} — überdurchschnittlich für die Region.`;
      if (v >= 65) return `Solide Nettorendite von ${pct(r.netYield)}${above ? " über regionalem Schnitt." : "."}`;
      if (v >= 50) return `Nettorendite von ${pct(r.netYield)} — im Durchschnitt, aber ohne Puffer.`;
      return `Tiefe Nettorendite von ${pct(r.netYield)}${solid ? "" : " — deutlich unter Marktniveau."}`;
    }
    case "equityReturn": {
      if (v >= 85) return `Sehr hohe Eigenkapitalrendite von ${pct(r.equityReturn)}.`;
      if (v >= 65) return `Gute Eigenkapitalrendite von ${pct(r.equityReturn)}.`;
      if (v >= 45) return `Eigenkapitalrendite von ${pct(r.equityReturn)} — akzeptabel, aber ausbaufähig.`;
      return `Tiefe Eigenkapitalrendite von ${pct(r.equityReturn)}.`;
    }
    case "location": {
      const parts: string[] = [];
      const vac = r.locationDetail?.vacancyRisk;
      if (vac === "sehr_tief" || vac === "tief") parts.push("niedriges Leerstandsrisiko");
      else if (vac === "erhöht" || vac === "hoch") parts.push("erhöhtes Leerstandsrisiko");
      const stop = i.location?.nearestStopMeters;
      if (stop != null && stop <= 400) parts.push("sehr gute ÖV-Anbindung");
      else if (stop != null && stop <= 800) parts.push("gute ÖV-Anbindung");
      const supermarket = i.location?.supermarketMeters;
      if (supermarket != null && supermarket <= 800) parts.push("Einkauf in der Nähe");
      const school = i.location?.schoolMeters;
      if (school != null && school <= 1000) parts.push("Schule in der Nähe");
      const summary = parts.length ? parts.join(", ") : "Mikrolage im Durchschnitt";
      if (v >= 80) return `Sehr gute Lage — ${summary}.`;
      if (v >= 65) return `Gute Lage — ${summary}.`;
      if (v >= 50) return `Durchschnittliche Lage — ${summary}.`;
      return `Schwache Lage — ${summary}.`;
    }
    case "condition": {
      const age = new Date().getFullYear() - (i.lastRenovation || i.yearBuilt || 0);
      const renov = i.lastRenovation ? `letzte Renovation ${i.lastRenovation}` : `Baujahr ${i.yearBuilt || "unbekannt"}`;
      if (v >= 85) return `Sehr guter Zustand (${renov}).`;
      if (v >= 65) return `Guter Zustand — ${renov}, effektives Alter rund ${age} Jahre.`;
      if (v >= 45) return `Renovationsbedarf mittelfristig absehbar (${renov}).`;
      return `Deutlicher Renovationsbedarf — ${renov}.`;
    }
    case "features": {
      const f = i.features;
      const items: string[] = [];
      if (f.balcony) items.push("Balkon");
      if (f.terrace) items.push("Terrasse");
      if (f.garden) items.push("Garten");
      if (f.elevator || i.hasElevator) items.push("Lift");
      if (f.pool) items.push("Pool");
      if (f.sauna) items.push("Sauna");
      if (f.whirlpool) items.push("Whirlpool");
      const parking = (f.garage || 0) + (f.doubleGarage || 0) + (f.undergroundParking || 0) + (f.outdoorParking || 0) + (f.carport || 0);
      if (parking > 0) items.push(`${parking} Parkplatz${parking > 1 ? "e" : ""}`);
      const list = items.slice(0, 4).join(", ");
      if (v >= 80) return list ? `Sehr gute Ausstattung: ${list}.` : "Hochwertige Ausstattung vorhanden.";
      if (v >= 65) return list ? `Gute Ausstattung: ${list}.` : "Solide Ausstattung.";
      if (v >= 50) return list ? `Grundausstattung: ${list}.` : "Grundausstattung ohne besondere Extras.";
      return "Einfache Ausstattung, wenig Zusatznutzen.";
    }
  }
}

function floorLabel(code?: string): string | null {
  if (!code) return null;
  return FLOOR_OPTIONS.find((f) => f.value === code)?.label ?? code;
}

// ---------------- PDF ----------------
export async function generateAnalysisPdf(a: StoredAnalysis): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();   // 595
  const H = doc.internal.pageSize.getHeight();  // 842
  const M = 28;

  const r = a.result;
  const i = a.inputs;
  const vs = structuredVerdict(a);
  const address = [i.street, i.houseNumber, i.zip, i.city].filter(Boolean).join(" ");
  const [sr, sg, sb] = scoreRgb(r.score);

  // ============ Header ============
  doc.setFillColor(...NAVY_DARK);
  doc.rect(0, 0, W, 62, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(220, 228, 240);
  doc.text("HOMEIQ INVEST · ANALYSE-BERICHT", M, 20);
  doc.setFont("helvetica", "normal");
  doc.text(dateShort(a.updatedAt), W - M, 20, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text((a.name || "Analyse").slice(0, 70), M, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 202, 220);
  doc.text(address || "—", M, 55);

  const contentW = W - 2 * M;

  // ============ Row A: Score-Karte + Kennzahlen ============
  const rowATop = 74;
  const rowAHeight = 176;
  const leftW = 200;
  const rightX = M + leftW + 10;
  const rightW = contentW - leftW - 10;

  // Score-Karte (links)
  doc.setFillColor(...WASH);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, rowATop, leftW, rowAHeight, 8, 8, "FD");

  const cx = M + leftW / 2;
  const cy = rowATop + 58;
  // Aussenring farbig, Innenkreis weiss – grösser, damit Text nicht schneidet
  doc.setFillColor(sr, sg, sb);
  doc.circle(cx, cy, 46, "F");
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, 38, "F");
  doc.setTextColor(...NAVY_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(String(r.score), cx, cy + 3, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text("HOMEIQ SCORE / 100", cx, cy + 18, { align: "center" });

  // Kategorie
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY_DARK);
  doc.text(r.categoryLabel, cx, rowATop + 122, { align: "center" });

  // Empfehlungs-Chip (dynamische Höhe / Umbruch)
  const recLabel = vs.recommendationLabel.toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const chipMaxW = leftW - 20;
  const recLines = doc.splitTextToSize(recLabel, chipMaxW - 16) as string[];
  const chipLineH = 10;
  const chipH = 8 + recLines.length * chipLineH + 4;
  const widestLine = recLines.reduce(
    (max, ln) => Math.max(max, doc.getTextWidth(ln)),
    0,
  );
  const chipW = Math.min(chipMaxW, Math.max(60, widestLine + 20));
  const chipX = cx - chipW / 2;
  const chipY = rowATop + rowAHeight - chipH - 10;
  doc.setFillColor(sr, sg, sb);
  doc.roundedRect(chipX, chipY, chipW, chipH, chipH / 2, chipH / 2, "F");
  doc.setTextColor(255, 255, 255);
  recLines.forEach((ln, idx) => {
    doc.text(ln, cx, chipY + 12 + idx * chipLineH, { align: "center" });
  });

  // Kennzahlen (rechts) — 2-Spalten-Grid
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(rightX, rowATop, rightW, rowAHeight, 8, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_LIGHT);
  doc.text("KENNZAHLEN & FINANZIERUNG", rightX + 12, rowATop + 14);

  const metrics: [string, string, [number, number, number]?][] = [
    ["Bruttorendite", pct(r.grossYield)],
    ["Nettorendite", pct(r.netYield), tintForYield(r.netYield)],
    ["Eigenkapitalrendite", pct(r.equityReturn), tintForEquity(r.equityReturn)],
    ["Cashflow / Monat", chf(Math.round(r.monthlyCashflow)), r.monthlyCashflow >= 0 ? GREEN : RED],
    ["Cashflow / Jahr", chf(Math.round(r.annualCashflow)), r.annualCashflow >= 0 ? GREEN : RED],
    ["Belehnung (LTV)", pct(r.ltv, 0)],
    ["Preis / m²", chf(Math.round(r.pricePerSqm))],
    ["Kaufpreis", chf(i.purchasePrice ?? 0)],
    ["Eigenkapital", chf(i.equity ?? 0)],
    ["Hypothek", chf(Math.round(r.mortgage))],
    ["Zinssatz", pct(i.interestRate ?? 0, 2)],
    ["Investition total", chf(Math.round(r.investment))],
  ];
  const cols = 2;
  const colW = (rightW - 24) / cols;
  const rowH = 22;
  const startY = rowATop + 28;
  metrics.forEach((m, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = rightX + 12 + col * colW;
    const y = startY + row * rowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(m[0], x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...(m[2] ?? INK));
    doc.text(m[1], x, y + 11);
  });

  // ============ Row B: Score-Aufschlüsselung ============
  const rowBTop = rowATop + rowAHeight + 8;
  const factors: SubKey[] = ["yield", "equityReturn", "location", "condition", "features"];
  const barRowH = 30;
  const rowBHeight = 18 + factors.length * barRowH + 6;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, rowBTop, contentW, rowBHeight, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_LIGHT);
  doc.text("HOMEIQ SCORE — AUFSCHLÜSSELUNG", M + 12, rowBTop + 13);

  factors.forEach((k, idx) => {
    const y = rowBTop + 22 + idx * barRowH;
    const val = r.subscores[k];
    const tier = tierMark(val);
    const weight = SCORE_WEIGHTS[k];

    doc.setFillColor(...tier.color);
    doc.circle(M + 18, y + 6, 3.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY_DARK);
    doc.text(FACTOR_LABEL[k], M + 28, y + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Gewicht ${Math.round(weight * 100)} %`, M + 138, y + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...tier.color);
    doc.text(`${val}/100 · ${tier.word}`, W - M - 12, y + 8, { align: "right" });

    const barX = M + 28;
    const barW = contentW - 40;
    doc.setFillColor(238, 241, 246);
    doc.roundedRect(barX, y + 12, barW, 4, 2, 2, "F");
    doc.setFillColor(...tier.color);
    const fillW = Math.max(2, Math.min(barW, (val / 100) * barW));
    doc.roundedRect(barX, y + 12, fillW, 4, 2, 2, "F");

    // Beschreibung: mehr Weissraum, kleinere Schrift für ruhige Optik
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const reason = friendlyReason(a, k);
    const wrapped = doc.splitTextToSize(reason, barW) as string[];
    doc.text(wrapped[0] ?? "", barX, y + 26);
  });

  // ============ Row P: Premium-Marktanalyse (zweispaltig, vor Fazit) ============
  const premium = i.premiumInsights;
  const hasPremiumBlock = !!(premium?.marketRent || premium?.purchasePrice);
  let rowPBottom = rowBTop + rowBHeight;
  if (hasPremiumBlock) {
    const rowPTop = rowBTop + rowBHeight + 8;
    const rowPHeight = 116;
    doc.setFillColor(250, 246, 235);
    doc.setDrawColor(214, 189, 138);
    doc.roundedRect(M, rowPTop, contentW, rowPHeight, 8, 8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(140, 100, 30);
    doc.text("PREMIUM-MARKTANALYSE", M + 12, rowPTop + 13);

    const colGap = 12;
    const innerX = M + 12;
    const innerW = contentW - 24;
    const colW = (innerW - colGap) / 2;
    const colTop = rowPTop + 22;

    type Line = { label: string; value: string; strong?: boolean; tone?: [number, number, number] };
    type Col = {
      title: string;
      main: { label: string; value: string };
      lines: Line[];
      note: string;
    };

    const buildPurchase = (): Col | null => {
      if (!premium?.purchasePrice) return null;
      const p = premium.purchasePrice;
      const lines: Line[] = [];
      if (p.low && p.high) {
        lines.push({
          label: "Marktwertspanne",
          value: `${chf(Math.round(p.low))} – ${chf(Math.round(p.high))}`,
        });
      }
      lines.push({ label: "Attraktiver Kaufpreis", value: chf(Math.round(p.attractivePrice)) });
      lines.push({ label: "Sehr attraktiver Kaufpreis", value: chf(Math.round(p.veryAttractivePrice)) });

      let note = "";
      if (i.purchasePrice && i.purchasePrice > 0) {
        const uv = Math.round(i.purchasePrice);
        const d = ((uv - p.marketValue) / p.marketValue) * 100;
        const sign = d > 0 ? "+" : "";
        const tone: [number, number, number] =
          Math.abs(d) < 5 ? GREEN : Math.abs(d) > 10 ? RED : NAVY_LIGHT;
        lines.push({ label: "Eingegebener Kaufpreis", value: chf(uv) });
        lines.push({ label: "Abweichung", value: `${sign}${d.toFixed(1)} %`, strong: true, tone });
        if (d > 10) note = "Angebotspreis deutlich über Marktwert — Verhandlung empfohlen.";
        else if (d > 3) note = "Angebotspreis leicht über Marktwert.";
        else if (d < -3) note = "Angebotspreis unter Marktwert — attraktiv.";
        else note = "Angebotspreis liegt im Marktbereich.";
      }
      return {
        title: "OPTIMALER KAUFPREIS",
        main: { label: "Geschätzter Marktwert", value: chf(Math.round(p.marketValue)) },
        lines,
        note,
      };
    };

    const buildRent = (): Col | null => {
      if (!premium?.marketRent) return null;
      const p = premium.marketRent;
      const lines: Line[] = [];
      lines.push({
        label: "Marktspanne",
        value: `${chf(Math.round(p.low))} – ${chf(Math.round(p.high))} / Monat`,
      });

      let note = "";
      if (i.monthlyRent && i.monthlyRent > 0) {
        const uv = Math.round(i.monthlyRent);
        const d = ((uv - p.estimatedRent) / p.estimatedRent) * 100;
        const sign = d > 0 ? "+" : "";
        const tone: [number, number, number] =
          Math.abs(d) < 5 ? GREEN : Math.abs(d) > 10 ? RED : NAVY_LIGHT;
        lines.push({ label: "Eingegebene Nettomiete", value: `${chf(uv)} / Monat` });
        lines.push({ label: "Abweichung", value: `${sign}${d.toFixed(1)} %`, strong: true, tone });
        if (Math.abs(d) < 5) note = "Miete liegt innerhalb der geschätzten Marktspanne.";
        else if (d > 0) note = "Miete über Marktniveau.";
        else note = "Miete unter Marktniveau — Potenzial für Anpassung.";
      }
      return {
        title: "MARKTMIETE",
        main: { label: "Geschätzte Marktmiete", value: `${chf(Math.round(p.estimatedRent))} / Monat` },
        lines,
        note,
      };
    };

    const renderCol = (c: Col, x: number, w: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(140, 100, 30);
      doc.text(c.title, x, colTop);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.6);
      doc.setTextColor(...MUTED);
      doc.text(c.main.label.toUpperCase(), x, colTop + 10);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...NAVY_DARK);
      doc.text(c.main.value, x, colTop + 22);

      let y = colTop + 32;
      const lineH = 10;
      c.lines.forEach((ln) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(ln.label, x, y);
        doc.setFont("helvetica", ln.strong ? "bold" : "bold");
        doc.setFontSize(ln.strong ? 9 : 8);
        doc.setTextColor(...(ln.tone ?? INK));
        doc.text(ln.value, x + w, y, { align: "right" });
        y += lineH;
      });

      if (c.note) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.6);
        doc.setTextColor(...MUTED);
        const noteLines = doc.splitTextToSize(c.note, w) as string[];
        doc.text(noteLines.slice(0, 2), x, rowPTop + rowPHeight - 22);
      }
    };

    const purchaseCol = buildPurchase();
    const rentCol = buildRent();

    if (purchaseCol && rentCol) {
      renderCol(purchaseCol, innerX, colW);
      renderCol(rentCol, innerX + colW + colGap, colW);
    } else if (purchaseCol) {
      renderCol(purchaseCol, innerX, innerW);
    } else if (rentCol) {
      renderCol(rentCol, innerX, innerW);
    }

    // Datenqualität ganz unten
    const dqBits: string[] = [];
    const q = premium?.marketRent?.dataQuality ?? premium?.purchasePrice?.dataQuality;
    const cc =
      premium?.marketRent?.comparableCount ??
      premium?.purchasePrice?.comparableCount;
    const rk =
      premium?.marketRent?.radiusKm ?? premium?.purchasePrice?.radiusKm;
    if (typeof cc === "number" && cc > 0)
      dqBits.push(
        `Basierend auf ${cc} Vergleichsobjekten${rk ? ` im Umkreis von ${rk} km` : ""}`,
      );
    if (q) dqBits.push(`Datenqualität: ${q[0].toUpperCase()}${q.slice(1)}`);
    if (dqBits.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...MUTED);
      doc.text(dqBits.join(" · "), M + 12, rowPTop + rowPHeight - 5);
    }

    rowPBottom = rowPTop + rowPHeight;
  }

  // ============ Row C: Fazit (links) + Pro/Contra vertikal (rechts) ============
  const rowCTop = rowPBottom + 8;
  const rowCHeight = 140;
  const halfW = (contentW - 8) / 2;

  // Fazit (links)
  doc.setFillColor(...WASH);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, rowCTop, halfW, rowCHeight, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_LIGHT);
  doc.text("KURZFAZIT", M + 12, rowCTop + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  const overallLines = doc.splitTextToSize(vs.overall, halfW - 24) as string[];
  doc.text(overallLines.slice(0, 7), M + 12, rowCTop + 28, { lineHeightFactor: 1.35 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_DARK);
  const recY = rowCTop + rowCHeight - 32;
  doc.text("Empfehlung:", M + 12, recY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(sr, sg, sb);
  doc.text(vs.recommendationLabel, M + 62, recY);
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  const reasonLines = doc.splitTextToSize(vs.recommendationReason, halfW - 24) as string[];
  doc.text(reasonLines.slice(0, 2), M + 12, recY + 12);

  // Pro/Contra (rechts, gestapelt)
  const proX = M + halfW + 8;
  const boxH = (rowCHeight - 6) / 2;

  // Positiv (oben)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(proX, rowCTop, halfW, boxH, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GREEN);
  doc.text("POSITIV", proX + 12, rowCTop + 14);
  drawBullets(doc, vs.positives, proX + 12, rowCTop + 26, halfW - 24, INK, boxH - 30);

  // Negativ (unten)
  const negY = rowCTop + boxH + 6;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(proX, negY, halfW, boxH, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...RED);
  doc.text("NEGATIV", proX + 12, negY + 14);
  drawBullets(doc, vs.negatives, proX + 12, negY + 26, halfW - 24, INK, boxH - 30);

  const rowCBottom = rowCTop + rowCHeight;



  // ============ Row D: Objektdaten + Karte ============
  const rowDTop = rowCBottom + 8;
  const rowDBottom = H - 26;
  const rowDHeight = rowDBottom - rowDTop;
  const mapW = 240;
  const objW = contentW - mapW - 8;

  // Objektdaten (links)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, rowDTop, objW, rowDHeight, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_LIGHT);
  doc.text("OBJEKTDATEN", M + 12, rowDTop + 13);

  const f = i.features;
  // Doppelgarage zählt als 2 Parkplätze in der Gesamtzahl
  const parkTotal =
    (f.garage || 0) +
    (f.doubleGarage || 0) * 2 +
    (f.undergroundParking || 0) +
    (f.outdoorParking || 0) +
    (f.carport || 0);

  const isMfh = i.objectType === "mfh";
  const objRows: [string, string][] = [];
  objRows.push(["Objekttyp", labelObjectType(i.objectType)]);
  objRows.push(["Baujahr", i.yearBuilt ? String(i.yearBuilt) : "—"]);
  objRows.push(["Letzte Renovation", i.lastRenovation ? String(i.lastRenovation) : "—"]);

  if (isMfh) {
    // MFH-spezifische Aufstellung
    const units = i.mfhUnits ?? [];
    const commUnits = i.mfhCommercialUnits ?? [];
    const totalArea = units.reduce((s, u) => s + (u.area ?? 0), 0);
    const commArea = commUnits.reduce((s, u) => s + (u.area ?? 0), 0);
    const monthlyRentUnits = units.filter((u) => !u.vacant).reduce((s, u) => s + (u.monthlyRent ?? 0), 0);
    const monthlyRentComm = commUnits.filter((u) => !u.vacant).reduce((s, u) => s + (u.monthlyRent ?? 0), 0);
    const monthlyParking =
      (f.garage + f.doubleGarage) * (i.garageRentPerUnit ?? 0) +
      f.undergroundParking * (i.undergroundRentPerUnit ?? 0) +
      f.outdoorParking * (i.outdoorRentPerUnit ?? 0) +
      f.carport * (i.carportRentPerUnit ?? 0);
    const annualUnits = monthlyRentUnits * 12;
    const annualComm = monthlyRentComm * 12;
    const annualParking = monthlyParking * 12;
    const annualTotal = annualUnits + annualComm + annualParking;

    objRows.push(["Anzahl Wohnungen", String(units.length)]);
    if (commUnits.length > 0) objRows.push(["Anzahl Gewerbeeinheiten", String(commUnits.length)]);
    objRows.push(["Gesamtwohnfläche", totalArea ? `${num(totalArea)} m²` : "—"]);
    if (commArea > 0) objRows.push(["Gewerbefläche", `${num(commArea)} m²`]);
    objRows.push(["Jahresmietertrag Wohnungen", chf(Math.round(annualUnits))]);
    if (annualComm > 0) objRows.push(["Jahresmietertrag Gewerbe", chf(Math.round(annualComm))]);
    if (annualParking > 0) objRows.push(["Parkplatzerträge / Jahr", chf(Math.round(annualParking))]);
    objRows.push(["Gesamter Jahresmietertrag", chf(Math.round(annualTotal))]);
    objRows.push(["Garagen", String(f.garage || 0)]);
    objRows.push(["Doppelgaragen", String(f.doubleGarage || 0)]);
    objRows.push(["Tiefgaragenplätze", String(f.undergroundParking || 0)]);
    objRows.push(["Aussenparkplätze", String(f.outdoorParking || 0)]);
    objRows.push(["Carports", String(f.carport || 0)]);
    objRows.push(["Gesamtzahl Parkplätze", String(parkTotal)]);
    if (f.elevator || i.hasElevator) objRows.push(["Lift", "Ja"]);
    if (f.balcony) objRows.push(["Balkon", "Ja"]);
    if (f.terrace) objRows.push(["Terrasse", "Ja"]);
    if (f.garden) objRows.push(["Garten", "Ja"]);
    if (f.cellar) objRows.push(["Keller", "Ja"]);
    if (f.storage) objRows.push(["Reduit", "Ja"]);
    if (f.pool) objRows.push(["Pool", "Ja"]);
    if (f.whirlpool) objRows.push(["Whirlpool", "Ja"]);
    if (f.sauna) objRows.push(["Sauna", "Ja"]);
    if (f.washingMachine) objRows.push(["Waschmaschine", "Ja"]);
    if (f.tumbler) objRows.push(["Tumbler", "Ja"]);
  } else {
    objRows.push(["Wohnfläche", i.livingArea ? `${num(i.livingArea)} m²` : "—"]);
    if (i.landArea && i.landArea > 0) objRows.push(["Landfläche", `${num(i.landArea)} m²`]);
    objRows.push(["Zimmer", i.rooms ? String(i.rooms) : "—"]);
    objRows.push(["Badezimmer", i.bathrooms != null ? String(i.bathrooms) : "—"]);
    const flr = floorLabel(i.floor);
    if (flr) objRows.push(["Stockwerk", flr]);
    const areaSuffix = (yes: boolean, area?: number) =>
      yes ? (area && area > 0 ? `Ja · ${num(area)} m²` : "Ja") : "Nein";
    objRows.push(["Balkon", areaSuffix(f.balcony, i.balconyArea)]);
    objRows.push(["Terrasse", areaSuffix(f.terrace, i.terraceArea)]);
    objRows.push(["Garten", areaSuffix(f.garden, i.gardenArea)]);
    objRows.push(["Lift", (f.elevator || i.hasElevator) ? "Ja" : "Nein"]);
    objRows.push(["Keller", f.cellar ? "Ja" : "Nein"]);
    objRows.push(["Reduit", f.storage ? "Ja" : "Nein"]);
    objRows.push(["Pool", f.pool ? "Ja" : "Nein"]);
    objRows.push(["Whirlpool", f.whirlpool ? "Ja" : "Nein"]);
    objRows.push(["Sauna", f.sauna ? "Ja" : "Nein"]);
    objRows.push(["Waschmaschine", f.washingMachine ? "Ja" : "Nein"]);
    objRows.push(["Tumbler", f.tumbler ? "Ja" : "Nein"]);
    objRows.push(["Garage", String(f.garage || 0)]);
    objRows.push(["Doppelgarage", String(f.doubleGarage || 0)]);
    objRows.push(["Tiefgaragenplatz", String(f.undergroundParking || 0)]);
    objRows.push(["Aussenparkplatz", String(f.outdoorParking || 0)]);
    objRows.push(["Carport", String(f.carport || 0)]);
    objRows.push(["Gesamtzahl Parkplätze", String(parkTotal)]);
  }

  const objCols = 2;
  const objColW = (objW - 24) / objCols;
  const objRowsPerCol = Math.ceil(objRows.length / objCols);
  const availH = rowDHeight - 26;
  const objRowH = Math.min(18, availH / objRowsPerCol);
  objRows.forEach((row, idx) => {
    const c = Math.floor(idx / objRowsPerCol);
    const rw = idx % objRowsPerCol;
    const x = M + 12 + c * objColW;
    const y = rowDTop + 26 + rw * objRowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(row[0], x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY_DARK);
    doc.text(row[1], x + objColW - 4, y, { align: "right", maxWidth: objColW - 60 });
  });

  // Karte (rechts)
  const mapX = M + objW + 8;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(mapX, rowDTop, mapW, rowDHeight, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_LIGHT);
  doc.text("LAGE", mapX + 12, rowDTop + 13);

  const lat = i.location?.latitude;
  const lon = i.location?.longitude;
  const mapImgX = mapX + 10;
  const mapImgY = rowDTop + 20;
  const mapImgW = mapW - 20;
  const mapImgH = rowDHeight - 40;

  if (lat && lon) {
    const mapUrl = await fetchStaticMapDataUrl(lat, lon, 640, 420, 15);
    if (mapUrl) {
      try {
        doc.addImage(mapUrl, "PNG", mapImgX, mapImgY, mapImgW, mapImgH);
        const mx = mapImgX + mapImgW / 2;
        const my = mapImgY + mapImgH / 2;
        // Pin: Ring + Kern
        doc.setFillColor(255, 255, 255);
        doc.circle(mx, my, 7, "F");
        doc.setFillColor(220, 38, 38);
        doc.circle(mx, my, 5, "F");
        doc.setFillColor(255, 255, 255);
        doc.circle(mx, my, 1.8, "F");
      } catch {
        drawMapFallback(doc, mapImgX, mapImgY, mapImgW, mapImgH, lat, lon);
      }
    } else {
      drawMapFallback(doc, mapImgX, mapImgY, mapImgW, mapImgH, lat, lon);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      "© OpenStreetMap-Mitwirkende",
      mapX + 12,
      rowDTop + rowDHeight - 8,
    );
  } else {
    drawMapFallback(doc, mapImgX, mapImgY, mapImgW, mapImgH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("Keine Koordinaten verfügbar", mapX + 12, rowDTop + rowDHeight - 8);
  }

  // ============ Footer ============
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(
    "HomeIQ Invest · Executive Summary · Keine Anlage-, Steuer- oder Rechtsberatung.",
    M,
    H - 12,
  );
  doc.text("Seite 1 / 1", W - M, H - 12, { align: "right" });

  return doc;
}

function drawBullets(
  doc: jsPDF,
  items: string[],
  x: number,
  y: number,
  w: number,
  ink: [number, number, number],
  maxH: number,
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  if (!items || items.length === 0) {
    doc.setTextColor(...MUTED);
    doc.text("—", x, y);
    return;
  }
  let cy = y;
  const lineH = 10;
  for (const it of items.slice(0, 5)) {
    const lines = doc.splitTextToSize(`· ${it}`, w) as string[];
    const take = lines.slice(0, 3);
    doc.setTextColor(...ink);
    doc.text(take, x, cy, { lineHeightFactor: 1.25 });
    cy += take.length * lineH + 3;
    if (cy > y + maxH - lineH) break;
  }
}

function drawMapFallback(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  lat?: number,
  lon?: number,
) {
  doc.setFillColor(...WASH);
  doc.rect(x, y, w, h, "F");
  doc.setDrawColor(...BORDER);
  doc.rect(x, y, w, h);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY_DARK);
  doc.text("Statische Karte nicht verfügbar", x + w / 2, y + h / 2 - 6, { align: "center" });
  if (lat != null && lon != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Koordinaten: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, x + w / 2, y + h / 2 + 8, { align: "center" });
  }
}

function tintForYield(v: number): [number, number, number] {
  if (v >= 4) return GREEN;
  if (v >= 2.5) return NAVY_DARK;
  return RED;
}
function tintForEquity(v: number): [number, number, number] {
  if (v >= 7) return GREEN;
  if (v >= 3) return NAVY_DARK;
  return RED;
}

function labelObjectType(t: string): string {
  const map: Record<string, string> = {
    eigentumswohnung: "Eigentumswohnung",
    einfamilienhaus: "Einfamilienhaus",
    doppelhaus: "Doppelhaushälfte",
    reihenhaus: "Reihenhaus",
    mfh: "Mehrfamilienhaus",
  };
  return map[t] ?? t;
}

function structuredVerdict(a: StoredAnalysis) {
  const r = a.result;
  return r.verdictStructured ?? {
    overall: r.verdict || "Analyse aus einer früheren Version — für ein vollständiges Fazit bitte neu berechnen.",
    positives: r.strengths ?? [],
    negatives: r.risks ?? [],
    recommendation: "bedingt_geeignet" as const,
    recommendationLabel: "Prüfung empfohlen",
    recommendationReason: "Aktualisierte Empfehlung: bitte Analyse neu speichern.",
  };
}

// ---------------- Dateiname & Auslieferung ----------------
export function slugifyFilename(input: string): string {
  const map: Record<string, string> = {
    ä: "ae", ö: "oe", ü: "ue",
    Ä: "Ae", Ö: "Oe", Ü: "Ue",
    ß: "ss",
    é: "e", è: "e", ê: "e", ë: "e",
    à: "a", â: "a", á: "a",
    ç: "c", ñ: "n",
    í: "i", ì: "i", î: "i",
    ó: "o", ò: "o", ô: "o",
    ú: "u", ù: "u", û: "u",
  };
  const replaced = input.replace(/[äöüÄÖÜßéèêëàâáçñíìîóòôúùû]/g, (ch) => map[ch] ?? ch);
  const ascii = replaced.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "HomeIQ-Analyse";
}

export function buildPdfFilename(a: StoredAnalysis): string {
  const city = (a.inputs.city ?? "").trim();
  const typeLabel: Record<string, string> = {
    eigentumswohnung: "Wohnung",
    einfamilienhaus: "Einfamilienhaus",
    doppelhaus: "Doppelhaushaelfte",
    reihenhaus: "Reihenhaus",
    mfh: "Mehrfamilienhaus",
  };
  const t = typeLabel[a.inputs.objectType] ?? "Objekt";
  const right =
    a.inputs.objectType === "eigentumswohnung" && a.inputs.rooms
      ? `${String(a.inputs.rooms).replace(",", ".")}-Zimmer-Wohnung`
      : t;
  const parts = ["HomeIQ", city, right].filter(Boolean).map(slugifyFilename);
  return `${parts.join("_")}.pdf`;
}

export async function deliverPdf(blob: Blob, filename: string): Promise<void> {
  const pdfBlob = blob.type === "application/pdf"
    ? blob
    : new Blob([blob], { type: "application/pdf" });

  try {
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (typeof File !== "undefined" && nav.canShare && nav.share) {
      const file = new File([pdfBlob], filename, { type: "application/pdf" });
      if (nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: filename });
          return;
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") return;
        }
      }
    }
  } catch { /* ignore */ }

  const url = URL.createObjectURL(pdfBlob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    try { window.location.href = url; } catch { /* ignore */ }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function downloadAnalysisPdf(a: StoredAnalysis): Promise<void> {
  const doc = await generateAnalysisPdf(a);
  const blob = doc.output("blob");
  await deliverPdf(blob, buildPdfFilename(a));
}
