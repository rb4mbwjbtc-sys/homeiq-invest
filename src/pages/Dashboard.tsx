import { ArrowRight, Building2, CircleDollarSign, MapPin, PieChart, Plus, Sofa, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { loadAnalyses } from "../lib/storage";
import { HomeIQScoreCard } from "../components/HomeIQScoreCard";

const weights = [
  { name: "Nettorendite", weight: "35 %", icon: CircleDollarSign },
  { name: "Eigenkapitalrendite", weight: "20 %", icon: PieChart },
  { name: "Lage", weight: "25 %", icon: MapPin },
  { name: "Objektqualität", weight: "12 %", icon: Building2 },
  { name: "Marktfähigkeit", weight: "8 %", icon: Sofa },
];

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
        <HomeIQScoreCard score={85} rating="Kauf empfehlenswert" compact />
      </section>

      <section className="panel dashboard-wide-panel score-model-panel">
        <span className="eyebrow">HOMEIQ SCORE</span>
        <h2>Transparent gewichtet</h2>
        <div className="weight-list">
          {weights.map(({ name, weight, icon: Icon }) => (
            <div key={name}>
              <span className="weight-name"><Icon size={19} aria-hidden="true"/>{name}</span>
              <strong>{weight}</strong>
            </div>
          ))}
        </div>
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
