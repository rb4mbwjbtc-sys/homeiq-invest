// Einheitliche Farbskala für alle Score-Anzeigen (0-100).
// 90-100 Dunkelgrün · 80-89 Grün · 70-79 Gelb · 60-69 Orange · 0-59 Rot

export type ScoreTier = "excellent" | "good" | "ok" | "weak" | "poor";

export function scoreTier(v: number): ScoreTier {
  if (v >= 90) return "excellent";
  if (v >= 80) return "good";
  if (v >= 70) return "ok";
  if (v >= 60) return "weak";
  return "poor";
}

// Tailwind bg classes for bars
export function scoreBarBg(v: number): string {
  switch (scoreTier(v)) {
    case "excellent": return "bg-emerald-700";
    case "good": return "bg-emerald-500";
    case "ok": return "bg-yellow-500";
    case "weak": return "bg-orange-500";
    case "poor": return "bg-red-500";
  }
}

// Tailwind chip (ring + text + bg-tint) for badges
export function scoreChip(v: number): string {
  switch (scoreTier(v)) {
    case "excellent": return "bg-emerald-100 text-emerald-800 ring-emerald-700/20";
    case "good": return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
    case "ok": return "bg-yellow-50 text-yellow-800 ring-yellow-600/20";
    case "weak": return "bg-orange-50 text-orange-700 ring-orange-600/10";
    case "poor": return "bg-red-50 text-red-700 ring-red-600/10";
  }
}

// Emoji + Label für Dashboard-Kacheln
export function scoreDashboardLabel(v: number): { emoji: string; label: string } {
  if (v >= 90) return { emoji: "🟢", label: "Sehr gutes Investment" };
  if (v >= 80) return { emoji: "🟢", label: "Gutes Investment" };
  if (v >= 65) return { emoji: "🟡", label: "Solides Investment" };
  if (v >= 50) return { emoji: "🟠", label: "Durchschnittliches Investment" };
  return { emoji: "🔴", label: "Kritisches Investment" };
}

// RGB (für PDF/jsPDF)
export function scoreRgb(v: number): [number, number, number] {
  switch (scoreTier(v)) {
    case "excellent": return [4, 120, 87];   // emerald-700
    case "good": return [16, 185, 129];       // emerald-500
    case "ok": return [234, 179, 8];          // yellow-500
    case "weak": return [249, 115, 22];       // orange-500
    case "poor": return [220, 38, 38];        // red-600
  }
}
