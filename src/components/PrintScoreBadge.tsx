import { Building2, CircleDollarSign, MapPin, PieChart, Sofa } from "lucide-react";
import { scoreColor } from "../lib/scoreColor";

type Props = { score: number; rating: string };

export function PrintScoreBadge({ score, rating }: Props) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const color = scoreColor(safeScore);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeScore / 100) * circumference;
  return (
    <section className="print-score-badge" aria-label={`HomeIQ Score ${safeScore} von 100 – ${rating}`}>
      <div className="print-score-ring-fixed">
        <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
          <circle cx="52" cy="52" r={radius} fill="none" stroke="rgba(173,220,198,.22)" strokeWidth="9" />
          <circle cx="52" cy="52" r={radius} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`} transform="rotate(-90 52 52)" />
        </svg>
        <div className="print-score-ring-center"><strong>{safeScore}</strong><span>/ 100</span></div>
      </div>
      <div className="print-score-name">HOMEIQ SCORE</div>
      <div className="print-score-rating-fixed"><i style={{ background: color }} />{rating}</div>
      <div className="print-score-factors-fixed" aria-label="HomeIQ Score Faktoren">
        <div title="Nettorendite"><CircleDollarSign aria-hidden="true" /></div>
        <div title="Eigenkapitalrendite"><PieChart aria-hidden="true" /></div>
        <div title="Lage"><MapPin aria-hidden="true" /></div>
        <div title="Objektqualität"><Building2 aria-hidden="true" /></div>
        <div title="Marktfähigkeit"><Sofa aria-hidden="true" /></div>
      </div>
    </section>
  );
}
