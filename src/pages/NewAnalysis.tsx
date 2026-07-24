import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Check,
  Home,
  Landmark,
  Loader2,
  MapPin,
  Plus,
  Rows3,
  Sparkles,
  Trash2,
  Warehouse,
} from "lucide-react";
import type { AnalysisInput, PropertyType, RentalUnit } from "../types";
import { saveAnalysis } from "../lib/storage";
import { analyseLocation, analyseMarket } from "../lib/market";
import { money } from "../lib/format";

const objectTypes = [
  { id: "wohnung", label: "Eigentumswohnung", icon: Building2 },
  { id: "efh", label: "Einfamilienhaus", icon: Home },
  { id: "doppelhaus", label: "Doppelhaushälfte", icon: Warehouse },
  { id: "reihenhaus", label: "Reihenhaus", icon: Rows3 },
  { id: "mfh", label: "Mehrfamilienhaus", icon: Landmark },
] as const;

const features = [
  "Balkon",
  "Terrasse",
  "Garten",
  "Lift",
  "Keller",
  "Reduit",
  "Pool",
  "Whirlpool",
  "Sauna",
  "Waschmaschine",
  "Tumbler",
  "Aussicht",
  "Minergie",
];

const newUnit = (index: number): RentalUnit => ({
  id: crypto.randomUUID(),
  label: `Wohnung ${index}`,
  rooms: 3.5,
  livingArea: 75,
  floor: "1. OG",
  condition: "gepflegt",
  quality: "durchschnittlich",
  currentMonthlyRent: 0,
  marketRentPerSqm: 0,
  parkingMonthlyRent: 0,
  features: ["Balkon", "Keller"],
});

const initial: AnalysisInput = {
  id: "",
  createdAt: "",
  propertyType: "wohnung",
  title: "",
  street: "",
  postalCode: "",
  city: "",
  purchasePrice: 0,
  ancillaryCosts: 0,
  equity: 0,
  interestRate: 1.5,
  amortizationRate: 1,
  monthlyRent: 0,
  annualOperatingCosts: 0,
  annualMaintenance: 0,
  livingArea: 0,
  landArea: 0,
  yearBuilt: 0,
  renovatedYear: 0,
  rooms: 0,
  bathrooms: 1,
  floor: "1. OG",
  locationScore: 0,
  location: {
    publicTransportMinutes: 0,
    shoppingMinutes: 0,
    schoolMinutes: 0,
    motorwayMinutes: 0,
    noiseLevel: 0,
    municipalityDemand: 0,
    vacancyRisk: 0,
    microLocation: 0,
  },
  condition: "gepflegt",
  quality: "durchschnittlich",
  features: ["Balkon", "Keller"],
  parkingSpaces: 0,
  regionalMarketPricePerSqm: 0,
  regionalMarketRentPerSqm: 0,
  marketDataRadiusKm: 5,
  rentalUnits: [newUnit(1), newUnit(2), newUnit(3)],
};

export function NewAnalysis() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<AnalysisInput>(initial);
  const [locationLoaded, setLocationLoaded] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [marketValueGenerated, setMarketValueGenerated] = useState<number | null>(null);
  const [marketRentGenerated, setMarketRentGenerated] = useState<number | null>(null);
  const navigate = useNavigate();

  const selectedLabel = useMemo(
    () => objectTypes.find((item) => item.id === form.propertyType)?.label,
    [form.propertyType],
  );

  const set = <K extends keyof AnalysisInput>(key: K, value: AnalysisInput[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const setLocation = (
    key: keyof AnalysisInput["location"],
    value: number,
  ) => {
    setForm((previous) => ({
      ...previous,
      location: { ...previous.location, [key]: value },
    }));
  };

  const toggleFeature = (feature: string) => {
    set(
      "features",
      form.features.includes(feature)
        ? form.features.filter((item) => item !== feature)
        : [...form.features, feature],
    );
  };

  const setUnit = <K extends keyof RentalUnit>(
    id: string,
    key: K,
    value: RentalUnit[K],
  ) => {
    setForm((previous) => ({
      ...previous,
      rentalUnits: previous.rentalUnits.map((unit) =>
        unit.id === id ? { ...unit, [key]: value } : unit,
      ),
    }));
  };

  const addUnit = () => {
    setForm((previous) => ({
      ...previous,
      rentalUnits: [...previous.rentalUnits, newUnit(previous.rentalUnits.length + 1)],
    }));
  };

  const removeUnit = (id: string) => {
    setForm((previous) => ({
      ...previous,
      rentalUnits: previous.rentalUnits.filter((unit) => unit.id !== id),
    }));
  };

  const loadLocation = () => {
    if (!form.postalCode || !form.city) return;
    setLoadingLocation(true);

    window.setTimeout(() => {
      const seed = Number(form.postalCode.slice(-2)) || 50;
      const priceBenchmark = 6200 + seed * 24;
      const rentBenchmark = 20 + (seed % 8) * 0.55;

      setForm((previous) => ({
        ...previous,
        location: {
          publicTransportMinutes: 6,
          shoppingMinutes: 8,
          schoolMinutes: 10,
          motorwayMinutes: 12,
          noiseLevel: 28,
          municipalityDemand: 72,
          vacancyRisk: 18,
          microLocation: 74,
        },
        regionalMarketPricePerSqm: Math.round(priceBenchmark / 50) * 50,
        regionalMarketRentPerSqm: Math.round(rentBenchmark * 2) / 2,
        rentalUnits: previous.rentalUnits.map((unit) => ({
          ...unit,
          marketRentPerSqm: Math.round(rentBenchmark * 2) / 2,
        })),
      }));
      setLocationLoaded(true);
      setLoadingLocation(false);
      setMarketValueGenerated(null);
      setMarketRentGenerated(null);
    }, 450);
  };

  const generateMarketValue = () => {
    if (!locationLoaded || form.regionalMarketPricePerSqm <= 0) return;
    const market = analyseMarket(form, analyseLocation(form));
    setMarketValueGenerated(market.estimatedMarketValue);
  };

  const generateMarketRent = () => {
    if (!locationLoaded || form.regionalMarketRentPerSqm <= 0) return;
    const market = analyseMarket(form, analyseLocation(form));
    setMarketRentGenerated(market.estimatedMonthlyMarketRent);
  };

  const submit = () => {
    const id = crypto.randomUUID();
    const title = form.title.trim() || `${selectedLabel} ${form.city || "ohne Ort"}`;
    const monthlyRent =
      form.propertyType === "mfh"
        ? form.rentalUnits.reduce((sum, unit) => sum + unit.currentMonthlyRent, 0)
        : form.monthlyRent;
    const livingArea =
      form.propertyType === "mfh"
        ? form.rentalUnits.reduce((sum, unit) => sum + unit.livingArea, 0)
        : form.livingArea;

    saveAnalysis({
      ...form,
      id,
      title,
      monthlyRent,
      livingArea,
      createdAt: new Date().toISOString(),
    });
    navigate(`/ergebnis/${id}`);
  };

  const steps = ["Objektart", "Objektdaten", "Lage & Markt", "Finanzierung", "Prüfen"];

  return (
    <div className="page-stack narrow">
      <div className="page-heading">
        <span className="eyebrow">NEUE ANALYSE · V2</span>
        <h1>Immobilie erfassen</h1>
        <p>Mit Lageanalyse, Marktwert- und Marktmietschätzung.</p>
      </div>

      <div className="steps five">
        {steps.map((label, index) => (
          <button
            key={label}
            className={`step ${step === index + 1 ? "active" : ""}`}
            onClick={() => setStep(index + 1)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section className="panel">
          <div className="object-grid">
            {objectTypes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`object-card ${form.propertyType === id ? "selected" : ""}`}
                onClick={() => set("propertyType", id as PropertyType)}
              >
                <Icon size={26} />
                <span>{label}</span>
                {form.propertyType === id && <Check className="check" size={18} />}
              </button>
            ))}
          </div>
          <div className="form-footer">
            <span>
              Ausgewählt: <strong>{selectedLabel}</strong>
            </span>
            <button className="button primary" onClick={() => setStep(2)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="panel form-panel">
          <h2>Objekt und Ausstattung</h2>
          <div className="form-grid">
            <label className="full">
              Bezeichnung
              <input
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="z. B. 3.5-Zimmer-Wohnung Bern"
              />
            </label>
            <label className="full">
              Strasse und Nr.
              <input value={form.street} onChange={(event) => set("street", event.target.value)} />
            </label>
            <label>
              PLZ
              <input
                value={form.postalCode}
                onChange={(event) => {
                  set("postalCode", event.target.value);
                  setLocationLoaded(false);
                }}
              />
            </label>
            <label>
              Ort
              <input
                value={form.city}
                onChange={(event) => {
                  set("city", event.target.value);
                  setLocationLoaded(false);
                }}
              />
            </label>
          </div>

          <div className={`location-loader ${locationLoaded ? "loaded" : ""}`}>
            <MapPin size={23} />
            <div>
              <strong>Standortdaten automatisch laden</strong>
              <span>
                Die Lage- und Marktwerte bleiben leer, bis sie aktiv geladen werden.
              </span>
              {locationLoaded && (
                <small>
                  ✓ {form.city || form.postalCode} · Datenradius {form.marketDataRadiusKm} km
                </small>
              )}
            </div>
            <button
              className="button secondary"
              onClick={loadLocation}
              disabled={!form.postalCode || !form.city || loadingLocation}
            >
              {loadingLocation ? (
                <>
                  <Loader2 className="spin" size={16} /> Lädt
                </>
              ) : locationLoaded ? (
                "Neu laden"
              ) : (
                "Laden"
              )}
            </button>
          </div>

          <div className="form-grid">
            {form.propertyType !== "mfh" && (
              <>
                <label>
                  Wohnfläche (m²)
                  <input
                    type="number"
                    value={form.livingArea || ""}
                    onChange={(event) => set("livingArea", Number(event.target.value))}
                  />
                </label>
                <label>
                  Zimmer
                  <input
                    type="number"
                    step="0.5"
                    value={form.rooms || ""}
                    onChange={(event) => set("rooms", Number(event.target.value))}
                  />
                </label>
              </>
            )}
            <label>
              Landfläche (m²)
              <input
                type="number"
                value={form.landArea || ""}
                onChange={(event) => set("landArea", Number(event.target.value))}
              />
            </label>
            <label>
              Baujahr
              <input
                type="number"
                value={form.yearBuilt || ""}
                onChange={(event) => set("yearBuilt", Number(event.target.value))}
              />
            </label>
            <label>
              Letzte Renovation
              <input
                type="number"
                value={form.renovatedYear || ""}
                onChange={(event) => set("renovatedYear", Number(event.target.value))}
              />
            </label>
            <label>
              Zustand
              <select
                value={form.condition}
                onChange={(event) => set("condition", event.target.value as AnalysisInput["condition"])}
              >
                <option value="sanierungsbeduerftig">Sanierungsbedürftig</option>
                <option value="renovationsbeduerftig">Renovationsbedürftig</option>
                <option value="gepflegt">Gepflegt</option>
                <option value="modernisiert">Modernisiert</option>
                <option value="neuwertig">Neuwertig</option>
              </select>
            </label>
            <label>
              Ausbaustandard
              <select
                value={form.quality}
                onChange={(event) => set("quality", event.target.value as AnalysisInput["quality"])}
              >
                <option value="einfach">Einfach</option>
                <option value="durchschnittlich">Durchschnittlich</option>
                <option value="gehoben">Gehoben</option>
                <option value="luxus">Luxus</option>
              </select>
            </label>
            {form.propertyType !== "mfh" && (
              <>
                <label>
                  Stockwerk
                  <select value={form.floor} onChange={(event) => set("floor", event.target.value)}>
                    <option>EG</option>
                    <option>1. OG</option>
                    <option>2. OG</option>
                    <option>3. OG</option>
                    <option>Attika / PH</option>
                    <option>Dachgeschoss</option>
                  </select>
                </label>
                <label>
                  Badezimmer
                  <input
                    type="number"
                    value={form.bathrooms}
                    onChange={(event) => set("bathrooms", Number(event.target.value))}
                  />
                </label>
              </>
            )}
            <label>
              Parkplätze total
              <input
                type="number"
                min="0"
                value={form.parkingSpaces}
                onChange={(event) => set("parkingSpaces", Number(event.target.value))}
              />
            </label>
          </div>

          <h3>Ausstattung</h3>
          <div className="chip-grid">
            {features.map((feature) => (
              <button
                type="button"
                key={feature}
                className={`chip ${form.features.includes(feature) ? "selected" : ""}`}
                onClick={() => toggleFeature(feature)}
              >
                {feature}
              </button>
            ))}
          </div>

          {form.propertyType === "mfh" && (
            <div className="units-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">WOHNEINHEITEN</span>
                  <h3>Wohnungen separat erfassen</h3>
                </div>
                <button className="button secondary" onClick={addUnit}>
                  <Plus size={16} /> Wohnung hinzufügen
                </button>
              </div>
              {form.rentalUnits.map((unit, index) => (
                <article className="unit-card" key={unit.id}>
                  <div className="unit-card-head">
                    <strong>{index + 1}. Wohneinheit</strong>
                    <button
                      className="icon-button danger"
                      onClick={() => removeUnit(unit.id)}
                      aria-label="Wohnung löschen"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="form-grid compact">
                    <label>
                      Bezeichnung
                      <input
                        value={unit.label}
                        onChange={(event) => setUnit(unit.id, "label", event.target.value)}
                      />
                    </label>
                    <label>
                      Zimmer
                      <input
                        type="number"
                        step="0.5"
                        value={unit.rooms}
                        onChange={(event) => setUnit(unit.id, "rooms", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Wohnfläche (m²)
                      <input
                        type="number"
                        value={unit.livingArea}
                        onChange={(event) => setUnit(unit.id, "livingArea", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Stockwerk
                      <select
                        value={unit.floor}
                        onChange={(event) => setUnit(unit.id, "floor", event.target.value)}
                      >
                        <option>EG</option>
                        <option>1. OG</option>
                        <option>2. OG</option>
                        <option>3. OG</option>
                        <option>Attika / PH</option>
                      </select>
                    </label>
                    <label>
                      Aktuelle Nettomiete / Monat
                      <input
                        type="number"
                        value={unit.currentMonthlyRent || ""}
                        onChange={(event) =>
                          setUnit(unit.id, "currentMonthlyRent", Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      Parkplatzmiete / Monat
                      <input
                        type="number"
                        value={unit.parkingMonthlyRent || ""}
                        onChange={(event) =>
                          setUnit(unit.id, "parkingMonthlyRent", Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      Zustand
                      <select
                        value={unit.condition}
                        onChange={(event) =>
                          setUnit(
                            unit.id,
                            "condition",
                            event.target.value as RentalUnit["condition"],
                          )
                        }
                      >
                        <option value="sanierungsbeduerftig">Sanierungsbedürftig</option>
                        <option value="renovationsbeduerftig">Renovationsbedürftig</option>
                        <option value="gepflegt">Gepflegt</option>
                        <option value="modernisiert">Modernisiert</option>
                        <option value="neuwertig">Neuwertig</option>
                      </select>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="form-footer">
            <button className="button secondary" onClick={() => setStep(1)}>
              Zurück
            </button>
            <button className="button primary" onClick={() => setStep(3)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="panel form-panel">
          <h2>Lage- und Marktdaten</h2>
          {!locationLoaded ? (
            <div className="empty-data">
              <MapPin size={28} />
              <h3>Noch keine Standortdaten geladen</h3>
              <p>
                Gehe zu den Objektdaten zurück und klicke auf «Laden». Bis dahin bleiben
                sämtliche Standort- und Benchmarkfelder leer.
              </p>
              <button className="button secondary" onClick={() => setStep(2)}>
                Zu den Objektdaten
              </button>
            </div>
          ) : (
            <div className="form-grid">
              <label>
                ÖV zu Fuss (Min.)
                <input
                  type="number"
                  value={form.location.publicTransportMinutes}
                  onChange={(event) =>
                    setLocation("publicTransportMinutes", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Einkauf (Min.)
                <input
                  type="number"
                  value={form.location.shoppingMinutes}
                  onChange={(event) => setLocation("shoppingMinutes", Number(event.target.value))}
                />
              </label>
              <label>
                Schule / Betreuung (Min.)
                <input
                  type="number"
                  value={form.location.schoolMinutes}
                  onChange={(event) => setLocation("schoolMinutes", Number(event.target.value))}
                />
              </label>
              <label>
                Autobahnanschluss (Min.)
                <input
                  type="number"
                  value={form.location.motorwayMinutes}
                  onChange={(event) => setLocation("motorwayMinutes", Number(event.target.value))}
                />
              </label>
              <label>
                Lärmbelastung (0–100)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.location.noiseLevel}
                  onChange={(event) => setLocation("noiseLevel", Number(event.target.value))}
                />
              </label>
              <label>
                Nachfrage Gemeinde (0–100)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.location.municipalityDemand}
                  onChange={(event) =>
                    setLocation("municipalityDemand", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Leerstandsrisiko (0–100)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.location.vacancyRisk}
                  onChange={(event) => setLocation("vacancyRisk", Number(event.target.value))}
                />
              </label>
              <label>
                Mikrolage (0–100)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.location.microLocation}
                  onChange={(event) => setLocation("microLocation", Number(event.target.value))}
                />
              </label>
              <label>
                Regionaler Marktpreis (CHF/m²)
                <input
                  type="number"
                  value={form.regionalMarketPricePerSqm}
                  onChange={(event) =>
                    set("regionalMarketPricePerSqm", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Regionale Marktmiete (CHF/m²/Monat)
                <input
                  type="number"
                  step="0.5"
                  value={form.regionalMarketRentPerSqm}
                  onChange={(event) =>
                    set("regionalMarketRentPerSqm", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Datenradius (km, max. 10)
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={form.marketDataRadiusKm}
                  onChange={(event) =>
                    set("marketDataRadiusKm", Math.min(10, Number(event.target.value)))
                  }
                />
              </label>
            </div>
          )}
          <div className="form-footer">
            <button className="button secondary" onClick={() => setStep(2)}>
              Zurück
            </button>
            <button
              className="button primary"
              onClick={() => setStep(4)}
              disabled={!locationLoaded}
            >
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="panel form-panel">
          <h2>Finanzierung und Ertrag</h2>
          <div className="form-grid finance-grid">
            <label>
              Kaufpreis (CHF)
              <input
                type="number"
                value={form.purchasePrice || ""}
                onChange={(event) => {
                  set("purchasePrice", Number(event.target.value));
                  setMarketValueGenerated(null);
                }}
              />
            </label>
            <label>
              Kaufnebenkosten (CHF)
              <input
                type="number"
                value={form.ancillaryCosts || ""}
                onChange={(event) => set("ancillaryCosts", Number(event.target.value))}
              />
            </label>

            <div className="full premium-action">
              <span className="premium-kicker">PREMIUM</span>
              <strong>Optimalen Kaufpreis berechnen</strong>
              <p>
                HomeIQ nutzt Objekt-, Lage- und Ausstattungsdaten, um den Marktwert
                unabhängig vom eingegebenen Kaufpreis zu schätzen.
              </p>
              <button
                className="market-action-button"
                onClick={generateMarketValue}
                disabled={!locationLoaded}
              >
                <Sparkles size={20} /> Optimalen Kaufpreis berechnen (Premium)
              </button>
              {marketValueGenerated !== null && (
                <div className="generated-result">
                  <span>Geschätzter Marktwert</span>
                  <strong>{money(marketValueGenerated)}</strong>
                </div>
              )}
            </div>

            <label>
              Eigenkapital (CHF)
              <input
                type="number"
                value={form.equity || ""}
                onChange={(event) => set("equity", Number(event.target.value))}
              />
            </label>
            <label>
              Hypothekarzins (%)
              <input
                type="number"
                step="0.1"
                value={form.interestRate}
                onChange={(event) => set("interestRate", Number(event.target.value))}
              />
            </label>
            <label>
              Amortisation (%)
              <input
                type="number"
                step="0.1"
                value={form.amortizationRate}
                onChange={(event) => set("amortizationRate", Number(event.target.value))}
              />
            </label>

            {form.propertyType !== "mfh" ? (
              <label className="full">
                Nettomiete Wohnung / Monat
                <input
                  type="number"
                  value={form.monthlyRent || ""}
                  onChange={(event) => {
                    set("monthlyRent", Number(event.target.value));
                    setMarketRentGenerated(null);
                  }}
                />
              </label>
            ) : (
              <div className="full rent-total">
                <span>Aktuelle Nettomiete MFH / Monat</span>
                <strong>
                  {money(
                    form.rentalUnits.reduce(
                      (sum, unit) => sum + unit.currentMonthlyRent,
                      0,
                    ),
                  )}
                </strong>
                <small>Summe aller separat erfassten Wohnungen</small>
              </div>
            )}

            <div className="full market-rent-action">
              <button
                className="market-action-button"
                onClick={generateMarketRent}
                disabled={!locationLoaded}
              >
                <Sparkles size={20} /> Marktmiete automatisch schätzen (Premium)
              </button>
              {marketRentGenerated !== null && (
                <div className="generated-result">
                  <span>Geschätzte Marktmiete / Monat</span>
                  <strong>{money(marketRentGenerated)}</strong>
                </div>
              )}
            </div>

            <label>
              Betriebskosten / Jahr
              <input
                type="number"
                value={form.annualOperatingCosts || ""}
                onChange={(event) => set("annualOperatingCosts", Number(event.target.value))}
              />
            </label>
            <label>
              Unterhalt / Rückstellungen / Jahr
              <input
                type="number"
                value={form.annualMaintenance || ""}
                onChange={(event) => set("annualMaintenance", Number(event.target.value))}
              />
            </label>
          </div>
          <div className="form-footer">
            <button className="button secondary" onClick={() => setStep(3)}>
              Zurück
            </button>
            <button className="button primary" onClick={() => setStep(5)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="panel review">
          <h2>Analyse prüfen</h2>
          <div className="review-grid">
            <div>
              <span>Objekt</span>
              <strong>{selectedLabel}</strong>
            </div>
            <div>
              <span>Ort</span>
              <strong>
                {form.postalCode} {form.city}
              </strong>
            </div>
            <div>
              <span>Kaufpreis</span>
              <strong>CHF {form.purchasePrice.toLocaleString("de-CH")}</strong>
            </div>
            <div>
              <span>Marktpreis-Benchmark</span>
              <strong>CHF {form.regionalMarketPricePerSqm.toLocaleString("de-CH")} / m²</strong>
            </div>
            <div>
              <span>Marktmiete-Benchmark</span>
              <strong>CHF {form.regionalMarketRentPerSqm} / m²</strong>
            </div>
            <div>
              <span>Datenradius</span>
              <strong>{form.marketDataRadiusKm} km</strong>
            </div>
            {form.propertyType === "mfh" && (
              <div>
                <span>Wohneinheiten</span>
                <strong>{form.rentalUnits.length}</strong>
              </div>
            )}
          </div>
          <div className="form-footer">
            <button className="button secondary" onClick={() => setStep(4)}>
              Zurück
            </button>
            <button className="button primary" onClick={submit}>
              Analyse berechnen
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
