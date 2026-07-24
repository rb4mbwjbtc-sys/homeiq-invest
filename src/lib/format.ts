export const money = (value: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(value);
export const percent = (value: number) => `${value.toFixed(1)} %`;
export const number = (value: number) => new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(value);
