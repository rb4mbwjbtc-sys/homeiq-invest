export const chf = (v: number, digits = 0) =>
  "CHF " +
  v.toLocaleString("de-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const pct = (v: number, digits = 1) =>
  v.toLocaleString("de-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + " %";

export const num = (v: number, digits = 0) =>
  v.toLocaleString("de-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
