import { FileSearch, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { deleteAnalysis, loadAnalyses } from "../lib/storage";
import { calculateAnalysis } from "../lib/calculations";
import { money, percent } from "../lib/format";

type SortKey = "date" | "score" | "purchasePrice" | "netYield" | "grossYield" | "cashflow";
type SortDirection = "desc" | "asc";

export function Analyses() {
  const [items, setItems] = useState(loadAnalyses());
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const remove = (id: string) => {
    if (!window.confirm("Diese Analyse wirklich löschen?")) return;
    deleteAnalysis(id);
    setItems(loadAnalyses());
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const ar = calculateAnalysis(a);
      const br = calculateAnalysis(b);
      const values: Record<SortKey, [number, number]> = {
        date: [new Date(a.createdAt).getTime(), new Date(b.createdAt).getTime()],
        score: [ar.score, br.score],
        purchasePrice: [a.purchasePrice, b.purchasePrice],
        netYield: [ar.netYield, br.netYield],
        grossYield: [ar.grossYield, br.grossYield],
        cashflow: [ar.monthlyCashflow, br.monthlyCashflow],
      };
      const [av, bv] = values[sortKey];
      return direction === "desc" ? bv - av : av - bv;
    });
  }, [items, sortKey, direction]);

  return (
    <div className="page-stack">
      <div className="portfolio-heading-row">
        <div className="page-heading">
          <span className="eyebrow">PORTFOLIO</span>
          <h1>Gespeicherte Analysen</h1>
          <p>Analysen öffnen, bearbeiten, vergleichen und sortieren.</p>
        </div>
        {items.length > 0 && (
          <div className="analysis-sort" aria-label="Analysen sortieren">
            <label>
              Sortieren nach
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="date">Datum</option>
                <option value="score">Score</option>
                <option value="purchasePrice">Kaufpreis</option>
                <option value="netYield">Nettorendite</option>
                <option value="grossYield">Bruttorendite</option>
                <option value="cashflow">Cashflow</option>
              </select>
            </label>
            <button className="button secondary" onClick={() => setDirection(direction === "desc" ? "asc" : "desc")}>
              {direction === "desc" ? "Absteigend" : "Aufsteigend"}
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <section className="empty-state">
          <div className="empty-icon"><FileSearch size={30} /></div>
          <h2>Noch keine Analysen vorhanden</h2>
          <p>Erstelle deine erste Analyse und vergleiche Rendite, Lage und Investitionsqualität.</p>
          <Link className="button primary" to="/analyse"><Plus size={18} /> Erste Analyse erstellen</Link>
        </section>
      ) : (
        <div className="analysis-list">
          {sortedItems.map((item) => {
            const result = calculateAnalysis(item);
            return (
              <article className="analysis-card" key={item.id}>
                <Link className="analysis-main-link" to={`/ergebnis/${item.id}`}>
                  <span className="eyebrow">{new Date(item.createdAt).toLocaleDateString("de-CH")}</span>
                  <h2>{item.title}</h2>
                  <p>{item.postalCode} {item.city}</p>
                </Link>
                <div className="analysis-stats">
                  <div><span>Score</span><strong>{result.score}/100</strong></div>
                  <div><span>Kaufpreis</span><strong>{money(item.purchasePrice)}</strong></div>
                  <div><span>Nettorendite</span><strong>{percent(result.netYield)}</strong></div>
                  <div><span>Bruttorendite</span><strong>{percent(result.grossYield)}</strong></div>
                  <div><span>Cashflow</span><strong>{money(result.monthlyCashflow)}</strong></div>
                </div>
                <div className="analysis-card-actions">
                  <Link className="button secondary compact-button" to={`/analyse/${item.id}`}>
                    <Pencil size={16} /> Bearbeiten
                  </Link>
                  <button className="icon-button danger" onClick={() => remove(item.id)} aria-label="Analyse löschen">
                    <Trash2 size={18} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
