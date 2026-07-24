import { ArrowLeft, Download, Save } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { calculateAnalysis } from "../lib/calculations";
import { findAnalysis } from "../lib/storage";
import { money, number, percent } from "../lib/format";

const factorLabels = { netYield: "Nettorendite", equityReturn: "Eigenkapitalrendite", location: "Lagequalität", condition: "Zustand", features: "Ausstattung" };
const factorWeights = { netYield: "35 %", equityReturn: "20 %", location: "25 %", condition: "12 %", features: "8 %" };

export function Result() {
  const { id } = useParams();
  const input = id ? findAnalysis(id) : undefined;
  if (!input) return <div className="empty-state"><h2>Analyse nicht gefunden</h2><Link className="button primary" to="/analyse">Neue Analyse</Link></div>;
  const r = calculateAnalysis(input);
  return <div className="page-stack result-page">
    <div className="result-actions"><Link className="text-link" to="/analysen"><ArrowLeft size={17}/>Analysen</Link><button className="button secondary" onClick={()=>window.print()}><Download size={17}/>PDF / Drucken</button></div>
    <section className="result-hero"><div><span className="eyebrow">HOMEIQ INVEST · ANALYSE</span><h1>{input.title}</h1><p>{input.street} · {input.postalCode} {input.city}</p><span className="recommendation">{r.recommendation}</span></div><div className="result-score"><strong>{r.score}</strong><span>/100</span><small>{r.rating}</small></div></section>
    <section className="kpi-grid">{[
      ["Bruttorendite",percent(r.grossYield)],["Nettorendite",percent(r.netYield)],["Eigenkapitalrendite",percent(r.equityReturn)],["Cashflow / Monat",money(r.monthlyCashflow)],["Belehnung",percent(r.ltv)],["Preis / m²",money(r.pricePerSqm)]
    ].map(([label,value])=><article className="kpi" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="two-column result-columns"><article className="panel"><span className="eyebrow">HOMEIQ SCORE</span><h2>Aufschlüsselung</h2><div className="score-list">{Object.entries(r.scoreBreakdown).map(([key,val])=><div key={key}><div><span>{factorLabels[key as keyof typeof factorLabels]}</span><small>Gewicht {factorWeights[key as keyof typeof factorWeights]}</small></div><div className="bar"><i style={{width:`${val}%`}}/></div><strong>{val}/100</strong></div>)}</div></article><article className="panel"><span className="eyebrow">KURZFAZIT</span><h2>{r.rating}</h2><p>Das Objekt erzielt eine Nettorendite von {percent(r.netYield)} und einen monatlichen Cashflow von {money(r.monthlyCashflow)}. Die Gesamtbewertung berücksichtigt Rendite, Eigenkapitalrendite, Lage, Zustand und Ausstattung.</p><div className="pros-cons"><div><h3>Positiv</h3>{r.positives.length?r.positives.map(x=><p key={x}>• {x}</p>):<p>—</p>}</div><div><h3>Negativ</h3>{r.negatives.length?r.negatives.map(x=><p key={x}>• {x}</p>):<p>—</p>}</div></div></article></section>
    <section className="panel"><span className="eyebrow">KENNZAHLEN & FINANZIERUNG</span><div className="detail-grid">{[
      ["Kaufpreis",money(input.purchasePrice)],["Investition total",money(r.totalInvestment)],["Eigenkapital",money(input.equity)],["Hypothek",money(r.mortgage)],["Zinssatz",percent(input.interestRate)],["Zinskosten / Jahr",money(r.annualInterest)],["Amortisation / Jahr",money(r.annualAmortization)],["Jahresmietertrag",money(r.annualRent)],["Wohnfläche",`${number(input.livingArea)} m²`],["Baujahr",String(input.yearBuilt)]
    ].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <p className="disclaimer">Keine Anlage-, Steuer- oder Rechtsberatung. Berechnungen basieren auf den eingegebenen Daten.</p>
  </div>;
}
