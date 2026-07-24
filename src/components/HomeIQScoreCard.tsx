import { Building2, CircleDollarSign, MapPin, PieChart, Sofa } from "lucide-react";
import logo from "../assets/homeiq-logo.jpg";
import { scoreColor } from "../lib/scoreColor";

type Props = { score: number; rating: string; compact?: boolean; print?: boolean };

export function HomeIQScoreCard({ score, rating, compact = false, print = false }: Props) {
  const color = scoreColor(score);
  return (
    <div className={`homeiq-score-card ${compact ? "compact" : ""} ${print ? "print-mode" : ""}`}>
      <div className="homeiq-score-ring" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(194,234,216,.25) 0deg)` }}>
        <div className="homeiq-score-ring-inner">
          <img src={logo} alt="HomeIQ" />
          <strong>{score}</strong>
          <span>/ 100</span>
        </div>
      </div>
      <div className="homeiq-score-title"><i /> HOMEIQ SCORE <i /></div>
      <div className="homeiq-score-rating"><b style={{ background: color }} />{rating}</div>
      {!compact && !print && (
        <div className="homeiq-score-factors">
          <div><CircleDollarSign /><span>Nettorendite</span></div>
          <div><PieChart /><span>Eigenkapital-<br/>rendite</span></div>
          <div><MapPin /><span>Lage</span></div>
          <div><Building2 /><span>Objektqualität</span></div>
          <div><Sofa /><span>Marktfähigkeit</span></div>
        </div>
      )}
    </div>
  );
}
