const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

/** Continuous red → amber → light green → dark green scale for scores 0–100. */
export function scoreColor(score: number): string {
  const value = clamp(score);
  const stops = [
    { at: 0, rgb: [196, 55, 45] },
    { at: 45, rgb: [224, 144, 52] },
    { at: 70, rgb: [119, 190, 135] },
    { at: 100, rgb: [32, 128, 89] },
  ];

  const upperIndex = stops.findIndex((stop) => value <= stop.at);
  if (upperIndex <= 0) return `rgb(${stops[0].rgb.join(",")})`;

  const lower = stops[upperIndex - 1];
  const upper = stops[upperIndex];
  const ratio = (value - lower.at) / (upper.at - lower.at);
  const rgb = lower.rgb.map((channel, index) =>
    Math.round(channel + (upper.rgb[index] - channel) * ratio),
  );
  return `rgb(${rgb.join(",")})`;
}
