import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { loadAnalyses } from "../lib/storage";
import { HomeIQScoreCard } from "../components/HomeIQScoreCard";

const weights = [["Nettorendite","35 %"],["Lage","25 %"],["Eigenkapitalrendite","20 %"],["Objektqualität","12 %"],["Marktfähigkeit","8 %"]];

export function Dashboard() {
  const remainingFreeAnalyses = Math.max(0, 3 - loadAnalyses().length);
  return (
    <div className="page-stack dashboard-page">
      <section className="hero">
        <div>
          <span className="eyebrow">HOMEIQ INVEST</span>
          <h1>Immobilien analysieren</h1>
          <p>Die smarte Immobilienanalyse für Investoren. Schnell. Objektiv. Verständlich.</p>
          <div className="hero-actions">
            <Link className="button primary" to="/analyse"><Plus size={18}/>Neue Analyse</Link>
            <Link className="button secondary" to="/analysen">Gespeicherte Analysen <ArrowRight size={18}/></Link>
          </div>
          <small className="free-note">{remainingFreeAnalyses} kostenlose {remainingFreeAnalyses === 1 ? "Analyse" : "Analysen"} übrig</small>
        </div>
        <HomeIQScoreCard score={78} rating="Gute Investitionsmöglichkeit" compact />
      </section>

      <section className="panel dashboard-wide-panel score-model-panel">
        <span className="eyebrow">SCORE-MODELL</span>
        <h2>Transparent gewichtet</h2>
        <div className="weight-list">{weights.map(([name,weight]) => <div key={name}><span>{name}</span><strong>{weight}</strong></div>)}</div>
      </section>

      <section className="dashboard-premium-card">
        <div>
          <span className="premium-plan-title"><Sparkles size={17}/> PREMIUM – CHF 9.90 / MONAT</span>
          <h2>Mehr aus jeder Analyse</h2>
          <p>Alle Premium-Funktionen für eine fundierte und professionelle Immobilienentscheidung.</p>
        </div>
        <ul>
          <li>Unbegrenzte Analysen</li>
          <li>Professioneller PDF-Bericht</li>
          <li>Geräteübergreifender Zugriff auf alle Analysen</li>
          <li>Automatische Marktmiete berechnen</li>
          <li>Optimale Kaufpreisberechnung</li>
        </ul>
        <button className="premium-unlock-button dashboard-premium-button">Premium freischalten</button>
      </section>
    </div>
  );
}
