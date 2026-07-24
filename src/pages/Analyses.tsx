import { FileSearch, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { deleteAnalysis, loadAnalyses } from "../lib/storage";
import { calculateAnalysis } from "../lib/calculations";
import { money, percent } from "../lib/format";

export function Analyses() {
  const [items,setItems]=useState(loadAnalyses());
  const remove=(id:string)=>{deleteAnalysis(id);setItems(loadAnalyses());};
  return <div className="page-stack"><div className="page-heading"><span className="eyebrow">PORTFOLIO</span><h1>Gespeicherte Analysen</h1><p>Alle Analysen werden in dieser Version lokal im Browser gespeichert.</p></div>{items.length===0?<section className="empty-state"><div className="empty-icon"><FileSearch size={30}/></div><h2>Noch keine Analysen vorhanden</h2><p>Erstelle deine erste Analyse und vergleiche Rendite, Lage und Investitionsqualität.</p><Link className="button primary" to="/analyse"><Plus size={18}/>Erste Analyse erstellen</Link></section>:<div className="analysis-list">{items.map(item=>{const r=calculateAnalysis(item);return <article className="analysis-card" key={item.id}><div><span className="eyebrow">{new Date(item.createdAt).toLocaleDateString("de-CH")}</span><h2><Link to={`/ergebnis/${item.id}`}>{item.title}</Link></h2><p>{item.postalCode} {item.city}</p></div><div className="analysis-stats"><div><span>Score</span><strong>{r.score}/100</strong></div><div><span>Nettorendite</span><strong>{percent(r.netYield)}</strong></div><div><span>Cashflow</span><strong>{money(r.monthlyCashflow)}</strong></div></div><button className="icon-button danger" onClick={()=>remove(item.id)} aria-label="Analyse löschen"><Trash2 size={18}/></button></article>})}</div>}</div>;
}
