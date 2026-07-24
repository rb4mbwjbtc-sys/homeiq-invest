import { ArrowRight, BarChart3, Building2, FileText, Plus, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { HomeIQScoreCard } from "../components/HomeIQScoreCard";
import { loadAnalyses } from "../lib/storage";

export function Dashboard() {
  const count = loadAnalyses().length;
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
      <section className="metrics-grid">
        <MetricCard label="Analysen" value={String(count)} detail="Lokal gespeichert" icon={BarChart3}/>
        <MetricCard label="Objekte" value="5 Typen" detail="Wohnung, Haus und MFH" icon={Building2}/>
        <MetricCard label="PDF-Berichte" value="Bereit" detail="Professioneller PDF-Export" icon={FileText}/>
        <MetricCard label="Unabhängigkeit" value="100 %" detail="Keine Lovable-Abhängigkeit" icon={ShieldCheck}/>
      </section>
      <section className="two-column">
        <article className="panel"><span className="eyebrow">SCHNELLSTART</span><h2>Neue Immobilienanalyse</h2><p>Erfasse Objekt, Finanzierung und Ertrag. HomeIQ bewertet Rendite, Risiko und langfristiges Potenzial.</p><Link className="text-link" to="/analyse">Analyse starten <ArrowRight size={17}/></Link></article>
        <article className="panel"><span className="eyebrow">SCORE-MODELL</span><h2>Transparent gewichtet</h2><div className="weight-list">{[["Nettorendite","35 %"],["Lage","25 %"],["Eigenkapitalrendite","20 %"],["Objektqualität","12 %"],["Marktfähigkeit","8 %"]].map(([n,w])=><div key={n}><span>{n}</span><strong>{w}</strong></div>)}</div></article>
      </section>
    </div>
  );
}
