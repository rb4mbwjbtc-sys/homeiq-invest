import { ArrowLeft, Download, MapPin, TrendingUp } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { calculateAnalysis } from "../lib/calculations";
import { findAnalysis } from "../lib/storage";
import { money, number, percent } from "../lib/format";
import { scoreColor } from "../lib/scoreColor";
import { HomeIQScoreCard } from "../components/HomeIQScoreCard";
import { PrintScoreBadge } from "../components/PrintScoreBadge";
import { OpenStreetMapCard } from "../components/OpenStreetMapCard";
import homeIqLogo from "../assets/homeiq-logo.jpg";

const factorLabels = {
  netYield: "Nettorendite",
  equityReturn: "Eigenkapitalrendite",
  location: "Lagequalität",
  objectQuality: "Objektqualität",
  marketability: "Marktfähigkeit",
};

const factorWeights = {
  netYield: "35 %",
  equityReturn: "20 %",
  location: "25 %",
  objectQuality: "12 %",
  marketability: "8 %",
};

const signedMoney = (value: number) =>
  `${value >= 0 ? "+ " : "− "}${money(Math.abs(value))}`;

const propertyTypeLabels: Record<string, string> = {
  wohnung: "Eigentumswohnung",
  efh: "Einfamilienhaus",
  doppelhaus: "Doppelhaushälfte",
  reihenhaus: "Reihenhaus",
  mfh: "Mehrfamilienhaus",
};

const formatDisplayRooms = (rooms: number) => {
  if (!rooms || rooms <= 0) return "";
  return `${Number.isInteger(rooms) ? rooms.toFixed(0) : rooms.toFixed(1)} Zimmer`;
};

export function Result() {
  const { id } = useParams();
  const input = id ? findAnalysis(id) : undefined;

  if (!input) {
    return (
      <div className="empty-state">
        <h2>Analyse nicht gefunden</h2>
        <Link className="button primary" to="/analyse">
          Neue Analyse
        </Link>
      </div>
    );
  }

  const result = calculateAnalysis(input);
  const market = result.marketAnalysis;
  const location = result.locationAnalysis;
  const dynamicScoreColor = scoreColor(result.score);
  const displayTitle = [
    propertyTypeLabels[input.propertyType] || "Immobilie",
    input.city,
    input.propertyType === "mfh" ? "" : formatDisplayRooms(input.rooms),
  ].filter(Boolean).join(" · ");


  const exportPdf = async () => {
    const element = document.querySelector<HTMLElement>(".print-report");
    if (!element) return;
    element.classList.add("pdf-capture");
    try {
      const startedAt = Date.now();
      while (
        element.querySelector('[data-map-ready="false"]') &&
        Date.now() - startedAt < 6000
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      const mapImages = Array.from(element.querySelectorAll<HTMLImageElement>(".osm-map-card img"));
      await Promise.all(
        mapImages.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = 210;
      const pageHeight = 297;
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      const x = (pageWidth - width) / 2;
      const y = (pageHeight - height) / 2;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", x, y, width, height, undefined, "FAST");
      const safeTitle = input.title.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "-");
      pdf.save(`HomeIQ_${safeTitle}.pdf`);
    } finally {
      element.classList.remove("pdf-capture");
    }
  };
  const scoreStyle = {
    borderColor: dynamicScoreColor,
    boxShadow: `inset 0 0 0 1px rgba(255,255,255,.18), 0 0 0 4px ${dynamicScoreColor}22`,
  };

  return (
    <div className="page-stack result-page">
      <div className="result-actions">
        <Link className="text-link" to="/analysen">
          <ArrowLeft size={17} /> Analysen
        </Link>
        <button className="button secondary" onClick={exportPdf}>
          <Download size={17} /> PDF exportieren
        </button>
      </div>

      <div className="screen-report">
        <section className="result-hero report-cover">
          <div>
            <span className="eyebrow">HOMEIQ INVEST · ANALYSEBERICHT V5.7.21</span>
            <h1>{displayTitle}</h1>
            <p>
              {input.street} · {input.postalCode} {input.city}
            </p>
            <span className="recommendation">{result.recommendation}</span>
          </div>
          <HomeIQScoreCard score={result.score} rating={result.rating} compact />
        </section>

        <section className="kpi-grid">
          {[
            ["Nettorendite", percent(result.netYield)],
            ["Eigenkapitalrendite", percent(result.equityReturn)],
            ["Cashflow / Monat", money(result.monthlyCashflow)],
            ["Marktwert", market.marketValueAvailable ? money(market.estimatedMarketValue) : "Nicht verfügbar"],
            ["Marktmiete / Monat", market.marketRentAvailable ? money(market.estimatedMonthlyMarketRent) : "Nicht verfügbar"],
            ["Lage", `${location.score}/100 · ${location.dataCoverage}% Daten`],
          ].map(([label, value]) => (
            <article className="kpi" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <section className="two-column result-columns">
          <article className="panel">
            <span className="eyebrow">HOMEIQ SCORE</span>
            <h2>Aufschlüsselung</h2>
            <div className="score-list">
              {Object.entries(result.scoreBreakdown).map(([key, value]) => (
                <div key={key}>
                  <div>
                    <span>{factorLabels[key as keyof typeof factorLabels]}</span>
                    <small>Gewicht {factorWeights[key as keyof typeof factorWeights]} · {key === "objectQuality" ? "Alter/Renovation, Grundriss, Standard, Ausstattung, Bad und Parkierung" : key === "marketability" ? "Zimmersegment, Flächenpassung, Objekttyp und Stockwerk/Zugänglichkeit" : key === "location" ? "ÖV, Einkauf, Schule, Verkehr, Lärm und Leerstand" : key === "netYield" ? "Nettoertrag im Verhältnis zur Gesamtinvestition" : "Nettoertrag nach Zins im Verhältnis zum Eigenkapital"}</small>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${value}%`, background: scoreColor(value) }} />
                  </div>
                  <strong>{value}/100</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <span className="eyebrow">GESAMTBEURTEILUNG</span>
            <h2>{result.rating}</h2>
            {location.dataCoverage < 50 && <p className="coverage-warning"><strong>Lage-Datenabdeckung nur {location.dataCoverage}%.</strong> Die Lagebeurteilung ist deshalb nur eingeschränkt belastbar.</p>}
            <p>
              Die Analyse kombiniert Rendite, Finanzierung und Lagequalität. {market.marketValueAvailable ? <>Der belastbar geschätzte Marktwert liegt bei <strong>{money(market.estimatedMarketValue)}</strong>. </> : <>Für den Marktwert liegen aktuell keine ausreichend belastbaren Vergleichsdaten vor. </>}{market.marketRentAvailable ? <>Die aktuelle Miete weicht um <strong>{percent(market.rentDifferencePercent)}</strong> vom geschätzten Marktniveau ab.</> : <>Eine Marktmietschätzung wird ohne belastbaren Benchmark bewusst nicht ausgegeben.</>}
            </p>
            <div className="pros-cons">
              <div>
                <h3>Positiv</h3>
                {result.positives.length ? (
                  result.positives.map((item) => <p key={item}>• {item}</p>)
                ) : (
                  <p>—</p>
                )}
              </div>
              <div>
                <h3>Risiken</h3>
                {result.negatives.length ? (
                  result.negatives.map((item) => <p key={item}>• {item}</p>)
                ) : (
                  <p>—</p>
                )}
              </div>
            </div>
          </article>
        </section>

        <section className="panel report-section">
          <div className="section-heading"><div><span className="eyebrow">MARKTPREISANALYSE</span><h2>Marktwert und Kaufpreis</h2></div><TrendingUp size={24} /></div>
          {market.marketValueAvailable ? <>
            <div className="market-summary"><div className="market-highlight"><span>Geschätzter Marktwert</span><strong>{money(market.estimatedMarketValue)}</strong><small>Bandbreite {money(market.marketValueLow)} – {money(market.marketValueHigh)}</small></div><div className={`market-verdict ${market.priceDifference >= 0 ? "positive" : "negative"}`}><span>{market.priceRating}</span><strong>{signedMoney(market.priceDifference)}</strong><small>{percent(market.priceDifferencePercent)} gegenüber Kaufpreis</small></div></div>
            <div className="detail-grid"><div><span>Regionaler Benchmark</span><strong>{money(market.benchmarkPricePerSqm)} / m²</strong></div><div><span>Angepasster Objektwert</span><strong>{money(market.adjustedPricePerSqm)} / m²</strong></div><div><span>Kaufpreis / m²</span><strong>{money(result.pricePerSqm)} / m²</strong></div><div><span>Modellsicherheit</span><strong className="capitalize">{market.confidence}</strong></div></div>
          </> : <div className="market-unavailable-panel"><strong>Marktwert derzeit nicht verfügbar</strong><p>Für diesen Standort wurden keine ausreichend belastbaren öffentlichen Preisbenchmarks gefunden. HomeIQ zeigt deshalb bewusst keinen modellierten Ersatzwert.</p></div>}
        </section>

        <section className="panel report-section">
          <div className="section-heading"><div><span className="eyebrow">MARKTMIETANALYSE</span><h2>Ist-Miete und Mietpotenzial</h2></div><TrendingUp size={24} /></div>
          {market.marketRentAvailable ? <>
            <div className="market-summary"><div className="market-highlight"><span>Geschätzte Marktmiete / Monat</span><strong>{money(market.estimatedMonthlyMarketRent)}</strong><small>Benchmark {money(market.benchmarkRentPerSqm)} / m²</small></div><div className={`market-verdict ${market.rentDifferenceMonthly >= 0 ? "positive" : "negative"}`}><span>{market.rentRating}</span><strong>{signedMoney(market.rentDifferenceMonthly)} / Monat</strong><small>{percent(market.rentDifferencePercent)} zur aktuellen Miete</small></div></div>
            {market.units.length > 0 && <div className="table-wrap"><table className="market-table"><thead><tr><th>Wohnung</th><th>Zimmer</th><th>Fläche</th><th>Ist-Miete</th><th>Marktmiete</th><th>Differenz</th></tr></thead><tbody>{market.units.map((unit)=><tr key={unit.id}><td><strong>{unit.label}</strong><small>{unit.floor}</small></td><td>{unit.rooms}</td><td>{number(unit.livingArea)} m²</td><td>{money(unit.currentMonthlyRent)}</td><td>{money(unit.estimatedMonthlyMarketRent)}</td><td className={unit.differenceMonthly >= 0 ? "positive-text" : "negative-text"}>{signedMoney(unit.differenceMonthly)}<small>{percent(unit.differencePercent)}</small></td></tr>)}</tbody></table></div>}
          </> : <div className="market-unavailable-panel"><strong>Marktmiete derzeit nicht verfügbar</strong><p>Für diesen Standort wurden keine ausreichend belastbaren öffentlichen Mietbenchmarks gefunden. Die eingegebene Ist-Miete wird nicht als Marktwert interpretiert.</p></div>}
        </section>

        <section className="panel report-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LAGEANALYSE</span>
              <h2>{location.rating}</h2>
            </div>
            <div className="location-badge">
              <MapPin size={18} /> {location.score}/100 · Datenabdeckung {location.dataCoverage}%
            </div>
          </div>
          <div className="location-grid">
            {location.factors.map((factor) => (
              <div className="location-factor" key={factor.label}>
                <div>
                  <span>{factor.label}</span>
                  <strong>{factor.detail === "Nicht verfügbar" ? "—" : `${factor.score}/100`}</strong>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: factor.detail === "Nicht verfügbar" ? "0%" : `${factor.score}%`,
                      background: scoreColor(factor.score),
                    }}
                  />
                </div>
                <small>{factor.detail}{["Mikrolage", "Nachfrage"].includes(factor.label) ? " · Informationswert, nicht zusätzlich gewichtet" : ""}</small>
              </div>
            ))}
          </div>
          {input.openDataLocation && (
            <div className="result-open-data">
              <div className="result-open-data-head">
                <div><span className="eyebrow">ECHTE SCHWEIZER OPEN DATA</span><strong>Datenqualität: {input.openDataLocation.quality}</strong></div>
                <small>Geladen am {new Date(input.openDataLocation.loadedAt).toLocaleDateString("de-CH")}</small>
              </div>
              <div className="result-open-data-grid">
                <div><span>ÖV-Güteklasse</span><strong>{input.openDataLocation.evidence.transitClass || "—"}</strong></div>
                <div><span>Leerwohnungsziffer</span><strong>{input.openDataLocation.evidence.vacancyRate !== null ? `${input.openDataLocation.evidence.vacancyRate.toFixed(2)} %` : "—"}</strong></div>
                <div><span>Nächster ÖV-Punkt</span><strong>{input.openDataLocation.evidence.nearestPublicTransportMeters !== null ? `${input.openDataLocation.evidence.nearestPublicTransportMeters} m` : "—"}</strong></div>
                <div><span>Einkauf</span><strong>{input.openDataLocation.evidence.nearestShoppingMeters !== null ? `${input.openDataLocation.evidence.nearestShoppingMeters} m` : "—"}</strong></div>
                <div><span>Schule / Betreuung</span><strong>{input.openDataLocation.evidence.nearestSchoolMeters !== null ? `${input.openDataLocation.evidence.nearestSchoolMeters} m` : "—"}</strong></div>
                <div><span>Baujahr</span><strong>{input.yearBuilt || input.openDataLocation.building?.constructionYear || "—"}</strong></div>
                <div><span>EGID</span><strong>{input.openDataLocation.building?.egid || "—"}</strong></div>
              </div>
              <details><summary>Verwendete Quellen</summary>{input.openDataLocation.sources.map((source) => <p key={source.name}><strong>{source.name}:</strong> {source.detail}</p>)}</details>
            </div>
          )}
          <div className="analysis-map-block">
            <div className="section-heading map-heading">
              <div>
                <span className="eyebrow">OPENSTREETMAP</span>
                <h3>Standort der Immobilie</h3>
              </div>
              <MapPin size={22} />
            </div>
            <OpenStreetMapCard street={input.street} postalCode={input.postalCode} city={input.city} coordinates={input.openDataLocation?.address ?? null} />
          </div>
        </section>

        <section className="panel report-section">
          <span className="eyebrow">KENNZAHLEN & FINANZIERUNG</span>
          <div className="detail-grid">
            {[
              ["Kaufpreis", money(input.purchasePrice)],
              ["Investition total", money(result.totalInvestment)],
              ["Eigenkapital", money(input.equity)],
              ["Hypothek", money(result.mortgage)],
              ["Belehnung", percent(result.ltv)],
              ["Zinskosten / Jahr", money(result.annualInterest)],
              ["Amortisation / Jahr", money(result.annualAmortization)],
              ["Jahresmietertrag", money(result.annualRent)],
              ["Parkplatzmiete / Monat", money(input.propertyType === "mfh" ? input.rentalUnits.reduce((sum, unit) => sum + (unit.parkingMonthlyRent || 0), 0) : (input.parkingMonthlyRent || 0))],
              ["Bruttorendite (Kaufpreis)", percent(result.grossYield)],
              ["Nettorendite (Gesamtinvest.)", percent(result.netYield)],
              ["Eigenkapitalrendite", percent(result.equityReturn)],
              ["Cash-on-Cash-Rendite", percent(result.cashOnCashReturn)],
              ["Wohnfläche", `${number(input.livingArea)} m²`],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <footer className="report-footer">
          <strong>HomeIQ Invest</strong>
          <span>Erstellt am {new Date(input.createdAt).toLocaleDateString("de-CH")}</span>
        </footer>
        <p className="disclaimer">
          Lageanalyse auf Basis amtlicher Schweizer Open Data und OpenStreetMap. Marktwerte und Marktmieten werden nur bei ausreichend belastbaren Benchmarks ausgegeben. Keine
          Anlage-, Steuer-, Rechts- oder Verkehrswertberatung.
        </p>
      </div>

      <article className="print-report">
        <header className="print-header">
          <div>
            <div className="print-brand"><img src={homeIqLogo} alt="HomeIQ"/><span>HOMEIQ INVEST · ANALYSE-BERICHT V5.7.21</span></div>
            <h1>{displayTitle}</h1>
            <p>
              {input.street} {input.postalCode} {input.city}
            </p>
          </div>
          <PrintScoreBadge score={result.score} rating={result.rating} />
        </header>

        <div className="print-recommendation">{result.recommendation}</div>

        <section className="print-section print-finance">
          <h2>KENNZAHLEN & FINANZIERUNG</h2>
          <div className="print-metrics">
            {[
              ["Bruttorendite (Kaufpreis)", percent(result.grossYield)],
              ["Nettorendite (Gesamtinvest.)", percent(result.netYield)],
              ["Eigenkapitalrendite", percent(result.equityReturn)],
              ["Cash-on-Cash-Rendite", percent(result.cashOnCashReturn)],
              ["Cashflow / Monat", money(result.monthlyCashflow)],
              ["Cashflow / Jahr", money(result.annualCashflow)],
              ["Belehnung (LTV)", percent(result.ltv)],
              ["Preis / m²", money(result.pricePerSqm)],
              ["Kaufpreis", money(input.purchasePrice)],
              ["Eigenkapital", money(input.equity)],
              ["Hypothek", money(result.mortgage)],
              ["Zinssatz", percent(input.interestRate)],
              ["Investition total", money(result.totalInvestment)],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="print-section">
          <h2>HOMEIQ SCORE — AUFSCHLÜSSELUNG</h2>
          <div className="print-score-breakdown">
            {Object.entries(result.scoreBreakdown).map(([key, value]) => (
              <div key={key}>
                <span>{factorLabels[key as keyof typeof factorLabels]}</span>
                <small>Gewicht {factorWeights[key as keyof typeof factorWeights]}</small>
                <i style={{ width: `${value}%`, background: scoreColor(value) }} />
                <strong>{value}/100</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="print-section print-market">
          <h2>PREMIUM-MARKTANALYSE</h2>
          <div className="print-market-columns">
            <div className={!market.marketValueAvailable ? "print-unavailable" : ""}><span>OPTIMALER KAUFPREIS</span>{market.marketValueAvailable ? <><h3>{money(market.estimatedMarketValue)}</h3><p>Marktwertspanne {money(market.marketValueLow)} – {money(market.marketValueHigh)}</p><p>Eingabe {money(input.purchasePrice)} · Abweichung {percent(market.priceDifferencePercent)}</p></> : <><h3>Nicht verfügbar</h3><p>Kein ausreichend belastbarer öffentlicher Preisbenchmark gefunden.</p></>}</div>
            <div className={!market.marketRentAvailable ? "print-unavailable" : ""}><span>MARKTMIETE</span>{market.marketRentAvailable ? <><h3>{money(market.estimatedMonthlyMarketRent)} / Monat</h3><p>Benchmark {money(market.benchmarkRentPerSqm)} / m²</p><p>Ist-Miete {money(market.currentMonthlyRent)} · Abweichung {percent(market.rentDifferencePercent)}</p></> : <><h3>Nicht verfügbar</h3><p>Kein ausreichend belastbarer öffentlicher Mietbenchmark gefunden.</p></>}</div>
          </div>
          {market.marketRentAvailable && market.units.length > 0 && <table className="print-unit-table"><thead><tr><th>Wohnung</th><th>m²</th><th>Ist</th><th>Markt</th></tr></thead><tbody>{market.units.slice(0,8).map((unit)=><tr key={unit.id}><td>{unit.label}</td><td>{number(unit.livingArea)}</td><td>{money(unit.currentMonthlyRent)}</td><td>{money(unit.estimatedMonthlyMarketRent)}</td></tr>)}</tbody></table>}
        </section>

        <section className="print-section print-bottom-grid">
          <div>
            <h2>KURZFAZIT</h2>
            <p>
              {result.rating}. Nettorendite {percent(result.netYield)}, monatlicher Cashflow{" "}
              {money(result.monthlyCashflow)} und Eigenkapitalrendite{" "}
              {percent(result.equityReturn)}.
            </p>
            <strong>{result.recommendation}</strong>
            <div className="print-pros-cons">
              <div>
                <span>POSITIV</span>
                {result.positives.slice(0, 3).map((item) => (
                  <p key={item}>· {item}</p>
                ))}
              </div>
              <div>
                <span>NEGATIV</span>
                {(result.negatives.length ? result.negatives : ["—"])
                  .slice(0, 3)
                  .map((item) => <p key={item}>· {item}</p>)}
              </div>
            </div>
          </div>
          <div>
            <h2>OBJEKTDATEN</h2>
            <p>Objekttyp {propertyTypeLabels[input.propertyType] || input.propertyType}</p>
            <p>Baujahr {input.yearBuilt || input.openDataLocation?.building?.constructionYear || "—"}{!input.yearBuilt && input.openDataLocation?.building?.constructionYear ? " (Open Data)" : ""}</p>
            <p>Letzte Renovation {input.renovatedYear || "—"}</p>
            <p>Wohnfläche {number(input.livingArea)} m²</p>
            <p>Zimmer {input.rooms || "—"}</p>
            <p>Parkplätze {input.parkingSpaces}</p>
            <p>Ausstattung {input.features.join(", ") || "—"}</p>
          </div>
          <div className="print-location-column">
            <h2>LAGE</h2>
            <div className="print-location-score">{location.score}/100 · {location.rating}<small>Datenabdeckung {location.dataCoverage}%</small></div>
            <div className="print-location-details">
              <div><span>ÖV-Anbindung</span><strong>{location.subscores.transit}/100</strong></div>
              <div><span>Einkauf</span><strong>{location.subscores.shopping}/100</strong></div>
              <div><span>Schule / Betreuung</span><strong>{location.subscores.school}/100</strong></div>
              <div><span>Verkehr</span><strong>{location.subscores.motorway}/100</strong></div>
              <div><span>Lärm</span><strong>{location.subscores.noise}/100</strong></div>
              <div><span>Leerstand</span><strong>{location.subscores.vacancy}/100</strong></div>
              <div><span>Nachfrage</span><strong>{location.subscores.demand}/100</strong></div>
              <div><span>Mikrolage</span><strong>{location.subscores.microLocation}/100</strong></div>
            </div>
            <OpenStreetMapCard street={input.street} postalCode={input.postalCode} city={input.city} coordinates={input.openDataLocation?.address ?? null} print />
          </div>
        </section>

        <footer className="print-footer">
          HomeIQ Invest · Executive Summary · Keine Anlage-, Steuer- oder Rechtsberatung.
          <span>Seite 1 / 1</span>
        </footer>
      </article>
    </div>
  );
}
