import { ArrowRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { HomeIQScoreCard } from "../components/HomeIQScoreCard";

export function Dashboard() {
  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <span className="eyebrow">HOMEIQ INVEST</span>
          <h1>Immobilien analysieren</h1>
          <p>Die smarte Immobilienanalyse für Investoren. Schnell. Objektiv. Verständlich.</p>
          <div className="hero-actions">
            <Link className="button primary" to="/analyse"><Plus size={18}/>Neue Analyse</Link>
            <Link className="button secondary" to="/analysen">Gespeicherte Analysen <ArrowRight size={18}/></Link>
          </div>
          <small className="free-note">3 Analysen gratis pro Tag</small>
        </div>
        <HomeIQScoreCard score={78} rating="Gute Investitionsmöglichkeit" compact />
      </section>

      <section className="panel dashboard-score-model">
        <span className="eyebrow">SCORE-MODELL</span>
        <h2>Transparent gewichtet</h2>
        <div className="weight-list">
          {[
            ["Nettorendite", "35 %"],
            ["Lage", "25 %"],
            ["Eigenkapitalrendite", "20 %"],
            ["Objektqualität", "12 %"],
            ["Marktfähigkeit", "8 %"],
          ].map(([name, weight]) => (
            <div key={name}><span>{name}</span><strong>{weight}</strong></div>
          ))}
        </div>
      </section>
    </div>
  );
}
