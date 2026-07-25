import { Building2, CircleDollarSign, MapPin, PieChart, Sofa } from "lucide-react";
import { scoreColor } from "../lib/scoreColor";

type Props = {
  score: number;
  rating: string;
  compact?: boolean;
  print?: boolean;
};

const factors = [
  { label: "Nettorendite", icon: CircleDollarSign },
  { label: "Eigenkapital-\nrendite", icon: PieChart },
  { label: "Lage", icon: MapPin },
  { label: "Objektqualität", icon: Building2 },
  { label: "Marktfähigkeit", icon: Sofa },
];

export function HomeIQScoreCard({ score, rating, compact = false, print = false }: Props) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const color = scoreColor(safeScore);
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const progress = (safeScore / 100) * circumference;

  return (
    <section
      className={`homeiq-score-card ${compact ? "compact" : ""} ${print ? "print-mode" : ""}`}
      aria-label={`HomeIQ Score ${safeScore} von 100 – ${rating}`}
    >
      <div className="homeiq-score-gauge">
        <svg viewBox="0 0 200 200" role="img" aria-hidden="true">
          <circle className="score-track" cx="100" cy="100" r={radius} />
          <circle
            className="score-progress"
            cx="100"
            cy="100"
            r={radius}
            style={{
              stroke: color,
              strokeDasharray: `${progress} ${circumference - progress}`,
            }}
          />
        </svg>
        <div className="homeiq-score-center">
          <div className="homeiq-score-value">
            <strong>{safeScore}</strong>
            <span>/ 100</span>
          </div>
        </div>
      </div>

      <div className="homeiq-score-title"><i /> HOMEIQ SCORE <i /></div>
      <div className="homeiq-score-rating">
        <b style={{ background: color, boxShadow: `0 0 14px ${color}` }} />
        {rating}
      </div>

      <div className="homeiq-score-factors">
        {factors.map(({ label, icon: Icon }) => (
          <div key={label}>
            <Icon aria-hidden="true" />
            <span>{label.split("\n").map((part, index) => (
              <span key={`${part}-${index}`}>{part}{index === 0 && label.includes("\n") ? <br /> : null}</span>
            ))}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
