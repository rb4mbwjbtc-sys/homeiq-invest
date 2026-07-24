import { ArrowLeft, Download, MapPin } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { calculateAnalysis } from "../lib/calculations";
import { findAnalysis } from "../lib/storage";
import { money, number, percent } from "../lib/format";

const factorLabels={netYield:"Nettorendite",equityReturn:"Eigenkapitalrendite",location:"Lagequalität",condition:"Zustand",features:"Ausstattung"};
const factorWeights={netYield:"35 %",equityReturn:"20 %",location:"25 %",condition:"12 %",features:"8 %"};
const signedMoney=(v:number)=>`${v>=0?"+ ":"- "}${money(Math.abs(v))}`;
const scoreColor=(score:number)=>`hsl(${Math.max(0,Math.min(120,score*1.2))} 66% ${score>=75?38:43}%)`;

export function Result(){
 const{id}=useParams();
 const input=id?findAnalysis(id):undefined;
 if(!input)return <div className="empty-state"><h2>Analyse nicht gefunden</h2><Link className="button primary" to="/analyse">Neue Analyse</Link></div>;
 const r=calculateAnalysis(input); const m=r.marketAnalysis; const l=r.locationAnalysis; const color=scoreColor(r.score);
 const optimalPrice=m.estimatedMarketValue*.93; const veryAttractive=m.estimatedMarketValue*.86;
 return <div className="page-stack result-page">
  <div className="result-actions"><Link className="text-link" to="/analysen"><ArrowLeft size={17}/>Analysen</Link><button className="button secondary" onClick={()=>window.print()}><Download size={17}/>PDF exportieren</button></div>
  <article className="pdf-sheet">
   <header className="pdf-header"><div><span className="eyebrow">HOMEIQ INVEST · ANALYSE-BERICHT {new Date(input.createdAt).toLocaleDateString("de-CH")}</span><h1>{input.title}</h1><p>{input.street} {input.postalCode} {input.city}</p></div><div className="pdf-score" style={{borderColor:color,boxShadow:`inset 0 0 0 7px color-mix(in srgb, ${color} 22%, white)`}}><strong style={{color}}>{r.score}</strong><span>HOMEIQ SCORE / 100</span><small>{r.rating}</small></div></header>
   <div className="pdf-recommendation" style={{borderLeftColor:color}}><strong>{r.recommendation.toUpperCase()}</strong><span>{r.rating}</span></div>
   <section className="pdf-kpis"><h2>KENNZAHLEN & FINANZIERUNG</h2><div>{[["Bruttorendite",percent(r.grossYield)],["Nettorendite",percent(r.netYield)],["Eigenkapitalrendite",percent(r.equityReturn)],["Cashflow / Monat",money(r.monthlyCashflow)],["Cashflow / Jahr",money(r.annualCashflow)],["Belehnung (LTV)",percent(r.ltv)],["Preis / m²",money(r.pricePerSqm)],["Kaufpreis",money(input.purchasePrice)],["Eigenkapital",money(input.equity)],["Hypothek",money(r.mortgage)],["Zinssatz",percent(input.interestRate)],["Investition total",money(r.totalInvestment)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
   <div className="pdf-main-grid">
    <section className="pdf-block score-block"><h2>HOMEIQ SCORE - AUFSCHLÜSSELUNG</h2>{Object.entries(r.scoreBreakdown).map(([key,val])=><div className="pdf-score-row" key={key}><div><strong>{factorLabels[key as keyof typeof factorLabels]}</strong><small>Gewicht {factorWeights[key as keyof typeof factorWeights]}</small></div><div className="bar"><i style={{width:`${val}%`,background:scoreColor(Number(val))}}/></div><b>{val}/100</b></div>)}</section>
    <section className="pdf-block premium-block"><h2>PREMIUM-MARKTANALYSE</h2><div className="premium-columns"><div><span>OPTIMALER KAUFPREIS</span><strong>{money(m.estimatedMarketValue)}</strong><small>Marktwertspanne {money(m.marketValueLow)} - {money(m.marketValueHigh)}</small><small>Attraktiver Kaufpreis {money(optimalPrice)}</small><small>Sehr attraktiver Kaufpreis {money(veryAttractive)}</small><small>Eingegebener Kaufpreis {money(input.purchasePrice)}</small><b className={m.priceDifference>=0?"positive-text":"negative-text"}>{m.priceRating}: {percent(m.priceDifferencePercent)}</b></div><div><span>MARKTMIETE</span><strong>{money(m.estimatedMonthlyMarketRent)} / Monat</strong><small>Benchmark {money(m.benchmarkRentPerSqm)} / m²</small><small>Eingegebene Nettomiete {money(m.currentMonthlyRent)} / Monat</small><small>Abweichung {percent(m.rentDifferencePercent)}</small><b className={m.rentDifferenceMonthly>=0?"positive-text":"negative-text"}>{m.rentRating}</b></div></div>{m.units.length>0&&<table className="pdf-units"><thead><tr><th>Wohnung</th><th>Ist</th><th>Markt</th><th>Diff.</th></tr></thead><tbody>{m.units.map(u=><tr key={u.id}><td>{u.label} · {u.rooms} Zi. · {number(u.livingArea)} m²</td><td>{money(u.currentMonthlyRent)}</td><td>{money(u.estimatedMonthlyMarketRent)}</td><td>{signedMoney(u.differenceMonthly)}</td></tr>)}</tbody></table>}</section>
    <section className="pdf-block conclusion-block"><h2>KURZFAZIT</h2><p>Das Objekt präsentiert sich als <strong>{r.rating.toLowerCase()}</strong>. Es kombiniert eine Nettorendite von <strong>{percent(r.netYield)}</strong>, einen monatlichen Cashflow von <strong>{money(r.monthlyCashflow)}</strong> und eine Eigenkapitalrendite von <strong>{percent(r.equityReturn)}</strong>. Der geschätzte Marktwert beträgt <strong>{money(m.estimatedMarketValue)}</strong>.</p><strong>Empfehlung: {r.recommendation}</strong><div className="pros-cons compact"><div><h3>POSITIV</h3>{r.positives.length?r.positives.slice(0,4).map(x=><p key={x}>· {x}</p>):<p>-</p>}</div><div><h3>NEGATIV</h3>{r.negatives.length?r.negatives.slice(0,4).map(x=><p key={x}>· {x}</p>):<p>-</p>}</div></div></section>
    <section className="pdf-block object-block"><h2>OBJEKTDATEN</h2><div className="object-data">{[["Objekttyp",input.propertyType],["Baujahr",input.yearBuilt],["Letzte Renovation",input.renovatedYear||"-"],["Wohnfläche",`${number(input.livingArea)} m²`],["Zimmer",input.propertyType==="mfh"?`${input.rentalUnits.length} Wohnungen`:input.rooms],["Badezimmer",input.bathrooms],["Stockwerk",input.floor],["Parkplätze",input.parkingSpaces],["Zustand",input.condition],["Ausstattung",input.features.join(", ")||"-"]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <section className="pdf-block location-block"><div className="block-title"><h2>LAGE</h2><span><MapPin size={13}/>{l.score}/100 · {l.rating}</span></div><div className="location-mini">{l.factors.map(f=><div key={f.label}><span>{f.label}</span><div className="bar"><i style={{width:`${f.score}%`,background:scoreColor(f.score)}}/></div><strong>{f.score}</strong></div>)}</div></section>
   </div>
   <footer className="pdf-footer">HomeIQ Invest · Executive Summary · Keine Anlage-, Steuer- oder Rechtsberatung. · Seite 1 / 1</footer>
  </article>
 </div>;
}
