import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { findAnalysis, saveAnalysis } from "../lib/storage";
import { analyseLocation, analyseMarket } from "../lib/market";
import { money } from "../lib/format";
import { loadSwissOpenDataLocation } from "../lib/locationOpenData";

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
  parkingMonthlyRent: 0,
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
  openDataLocation: null,
};

export function NewAnalysis() {
  const { id: editId } = useParams();
  const existingAnalysis = editId ? findAnalysis(editId) : undefined;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<AnalysisInput>(() => existingAnalysis ? structuredClone(existingAnalysis) : structuredClone(initial));
  const [locationLoaded, setLocationLoaded] = useState(() => Boolean(existingAnalysis?.openDataLocation));
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [marketValueGenerated, setMarketValueGenerated] = useState<number | null>(null);
  const [marketRentGenerated, setMarketRentGenerated] = useState<number | null>(null);
  const navigate = useNavigate();

  const selectedLabel = useMemo(
    () => objectTypes.find((item) => item.id === form.propertyType)?.label,
    [form.propertyType],
  );

  const calculationInput = useMemo(() => {
    if (form.propertyType !== "mfh") return form;
    return {
      ...form,
      livingArea: form.rentalUnits.reduce((sum, unit) => sum + unit.livingArea, 0),
      monthlyRent: form.rentalUnits.reduce(
        (sum, unit) => sum + unit.currentMonthlyRent + (unit.parkingMonthlyRent || 0),
        0,
      ),
    };
  }, [form]);

  const generatedMarket = useMemo(() => {
    if (!locationLoaded) return null;
    return analyseMarket(calculationInput, analyseLocation(calculationInput));
  }, [calculationInput, locationLoaded]);

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

  const loadLocation = async () => {
    if (!form.postalCode || !form.city) return;
    setLoadingLocation(true);
    setLocationError(null);
    try {
      const report = await loadSwissOpenDataLocation(form);
      setForm((previous) => ({
        ...previous,
        location: report.metrics,
        marketDataRadiusKm: Math.min(10, Math.max(previous.marketDataRadiusKm, report.evidence.searchRadiusKm || 1)),
        openDataLocation: {
          address: report.address,
          building: report.building,
          evidence: report.evidence,
          quality: report.quality,
          missing: report.missing,
          loadedAt: report.loadedAt,
          sources: report.sources,
        },
      }));
      setLocationLoaded(true);
      setMarketValueGenerated(null);
      setMarketRentGenerated(null);
    } catch (error) {
      setLocationLoaded(false);
      setLocationError(error instanceof Error ? error.message : "Standortdaten konnten nicht geladen werden.");
    } finally {
      setLoadingLocation(false);
    }
  };

  const generateMarketValue = () => {
    if (!generatedMarket || form.regionalMarketPricePerSqm <= 0) return;
    setMarketValueGenerated(generatedMarket.estimatedMarketValue);
  };

  const generateMarketRent = () => {
    if (!generatedMarket || form.regionalMarketRentPerSqm <= 0) return;
    setMarketRentGenerated(generatedMarket.estimatedMonthlyMarketRent);
  };

  const useAttractivePurchasePrice = (factor: number) => {
    if (!generatedMarket) return;
    set("purchasePrice", Math.round((generatedMarket.estimatedMarketValue * factor) / 5000) * 5000);
  };

  const useMarketRent = () => {
    if (!generatedMarket) return;
    if (form.propertyType === "mfh") {
      const byId = new Map<string, (typeof generatedMarket.units)[number]>(generatedMarket.units.map((unit) => [unit.id, unit]));
      setForm((previous) => ({
        ...previous,
        rentalUnits: previous.rentalUnits.map((unit) => {
          const result = byId.get(unit.id);
          return result ? { ...unit, currentMonthlyRent: Math.round(result.estimatedMonthlyMarketRent) } : unit;
        }),
      }));
      return;
    }
    set("monthlyRent", Math.max(0, Math.round(generatedMarket.estimatedMonthlyMarketRent - (form.parkingMonthlyRent || 0))));
  };

  const submit = () => {
    const id = editId || crypto.randomUUID();
    const title = form.title.trim() || `${selectedLabel} ${form.city || "ohne Ort"}`;
    const monthlyRent =
      form.propertyType === "mfh"
        ? form.rentalUnits.reduce((sum, unit) => sum + unit.currentMonthlyRent, 0)
        : form.monthlyRent + (form.parkingMonthlyRent || 0);
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
      createdAt: existingAnalysis?.createdAt || new Date().toISOString(),
    });
    navigate(`/ergebnis/${id}`);
  };

  const steps = ["Objektart", "Objektdaten", "Lage & Markt", "Finanzierung", "Prüfen"];

  return (
    <div className="page-stack narrow">
      <div className="page-heading">
        <span className="eyebrow">{editId ? "ANALYSE BEARBEITEN" : "NEUE ANALYSE"} · V3.2</span>
        <h1>{editId ? "Analyse bearbeiten" : "Immobilie erfassen"}</h1>
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
              <input value={form.street} onChange={(event) => { set("street", event.target.value); setLocationLoaded(false); set("openDataLocation", null); }} />
            </label>
            <label>
              PLZ
              <input
                value={form.postalCode}
                onChange={(event) => {
                  set("postalCode", event.target.value);
                  setLocationLoaded(false);
                  set("openDataLocation", null);
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
                  set("openDataLocation", null);
                }}
              />
            </label>
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

          <div className={`location-loader ${locationLoaded ? "loaded" : ""}`}>
            <MapPin size={23} />
            <div>
              <strong>Standortdaten automatisch laden</strong>
              <span>
                Amtliche Adresse, GWR, ÖV-Güteklasse, Leerstand, Lärm und Distanzen werden aus echten offenen Daten geladen.
              </span>
              {locationLoaded && (
                <small>
                  ✓ Echte Open-Data-Analyse · Datenqualität {form.openDataLocation?.quality || "mittel"}
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

          {locationError && <div className="open-data-error">{locationError}</div>}

          {!locationLoaded ? (
            <div className="empty-data compact-empty">
              <MapPin size={28} />
              <h3>Noch keine Standortdaten geladen</h3>
              <p>Die Werte werden nicht simuliert. Sie erscheinen erst, nachdem die amtlichen und offenen Daten erfolgreich geladen wurden.</p>
            </div>
          ) : (
            <>
              {form.openDataLocation && (
                <section className="open-data-report">
                  <div className="open-data-report-head">
                    <div>
                      <span className="eyebrow">SCHWEIZER OPEN DATA</span>
                      <h3>{form.openDataLocation.address.formatted}</h3>
                      <p>Automatisch ausgewertet aus offiziellen Bundesdaten und OpenStreetMap-Distanzen.</p>
                    </div>
                    <span className={`data-quality quality-${form.openDataLocation.quality}`}>Datenqualität: {form.openDataLocation.quality}</span>
                  </div>
                  <div className="open-data-evidence-grid">
                    <div><span>ÖV-Güteklasse</span><strong>{form.openDataLocation.evidence.transitClass || "nicht verfügbar"}</strong></div>
                    <div><span>Leerwohnungsziffer</span><strong>{form.openDataLocation.evidence.vacancyRate !== null ? `${form.openDataLocation.evidence.vacancyRate.toFixed(2)} %` : "nicht verfügbar"}</strong></div>
                    <div><span>Nächster ÖV-Punkt</span><strong>{form.openDataLocation.evidence.nearestPublicTransportMeters !== null ? `${form.openDataLocation.evidence.nearestPublicTransportMeters} m · Radius ${form.openDataLocation.evidence.categoryRadiusKm?.transit || 1} km` : "nicht verfügbar"}</strong></div>
                    <div><span>Einkauf</span><strong>{form.openDataLocation.evidence.nearestShoppingMeters !== null ? `${form.openDataLocation.evidence.nearestShoppingMeters} m · Radius ${form.openDataLocation.evidence.categoryRadiusKm?.shopping || 1} km` : "nicht verfügbar"}</strong></div>
                    <div><span>Schule / Betreuung</span><strong>{form.openDataLocation.evidence.nearestSchoolMeters !== null ? `${form.openDataLocation.evidence.nearestSchoolMeters} m · Radius ${form.openDataLocation.evidence.categoryRadiusKm?.school || 1} km` : "nicht verfügbar"}</strong></div>
                    <div><span>Autobahnanschluss</span><strong>{form.openDataLocation.evidence.nearestMotorwayJunctionMeters !== null ? `${form.openDataLocation.evidence.nearestMotorwayJunctionMeters} m · Radius ${form.openDataLocation.evidence.categoryRadiusKm?.motorway || 1} km` : "nicht verfügbar"}</strong></div>
                    <div><span>Strassen-/Bahnlärm</span><strong>{Math.max(form.openDataLocation.evidence.roadNoiseDb || 0, form.openDataLocation.evidence.railNoiseDb || 0) || "nicht verfügbar"}{Math.max(form.openDataLocation.evidence.roadNoiseDb || 0, form.openDataLocation.evidence.railNoiseDb || 0) ? " dB" : ""}</strong></div>
                    {form.openDataLocation.building?.egid && <div><span>EGID</span><strong>{form.openDataLocation.building.egid}</strong></div>}
                    {form.openDataLocation.building?.constructionYear && <div><span>GWR-Baujahr</span><strong>{form.openDataLocation.building.constructionYear}</strong></div>}
                  </div>
                  <p className="open-data-radius">Automatische Umkreissuche: bis {form.openDataLocation.evidence.searchRadiusKm || 10} km. Der Radius wurde je Datenkategorie schrittweise erweitert.</p>
                  {form.openDataLocation.missing.length > 0 && (
                    <p className="open-data-missing">Nicht verfügbare Teilwerte: {form.openDataLocation.missing.join(", ")}. Für diese Faktoren werden keine erfundenen Distanzen angezeigt; im Score werden sie neutral gewichtet.</p>
                  )}
                  <details className="open-data-sources">
                    <summary>Datenquellen und Datenstand</summary>
                    {form.openDataLocation.sources.map((source) => <div key={source.name}><strong>{source.name}</strong><span>{source.detail}</span></div>)}
                    <small>Geladen am {new Date(form.openDataLocation.loadedAt).toLocaleString("de-CH")}</small>
                  </details>
                </section>
              )}
              <div className="form-grid">
              <label>
                ÖV zu Fuss (Min.)
                <input
                  type="number"
                  placeholder="nicht verfügbar"
                  value={form.openDataLocation?.evidence.nearestPublicTransportMeters !== null ? form.location.publicTransportMinutes : ""}
                  onChange={(event) =>
                    setLocation("publicTransportMinutes", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Einkauf (Min.)
                <input
                  type="number"
                  placeholder="nicht verfügbar"
                  value={form.openDataLocation?.evidence.nearestShoppingMeters !== null ? form.location.shoppingMinutes : ""}
                  onChange={(event) => setLocation("shoppingMinutes", Number(event.target.value))}
                />
              </label>
              <label>
                Schule / Betreuung (Min.)
                <input
                  type="number"
                  placeholder="nicht verfügbar"
                  value={form.openDataLocation?.evidence.nearestSchoolMeters !== null ? form.location.schoolMinutes : ""}
                  onChange={(event) => setLocation("schoolMinutes", Number(event.target.value))}
                />
              </label>
              <label>
                Autobahnanschluss (Min.)
                <input
                  type="number"
                  placeholder="nicht verfügbar"
                  value={form.openDataLocation?.evidence.nearestMotorwayJunctionMeters !== null ? form.location.motorwayMinutes : ""}
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
            </>
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
              {marketValueGenerated !== null && generatedMarket && (
                <div className="market-calculation-card">
                  <div className="market-card-heading">
                    <span className="eyebrow">MARKTWERTANALYSE</span>
                    <h3>Geschätzter Marktwert</h3>
                    <p>
                      Unabhängige Schätzung auf Basis von Lage, Zustand, Ausstattung und
                      regionalem Vergleichswert. Der eingegebene Kaufpreis fliesst nicht
                      in die Marktwertberechnung ein.
                    </p>
                  </div>
                  <div className="market-main-value">
                    <span>GESCHÄTZTER MARKTWERT</span>
                    <strong>{money(generatedMarket.estimatedMarketValue)}</strong>
                    <small>
                      Marktwertspanne: {money(generatedMarket.marketValueLow)} – {money(generatedMarket.marketValueHigh)}
                    </small>
                  </div>
                  <div className="market-comparison-row">
                    <div>
                      <span>IHR EINGETRAGENER KAUFPREIS</span>
                      <strong>{money(form.purchasePrice)}</strong>
                    </div>
                    <b className={generatedMarket.priceDifferencePercent >= 0 ? "positive-text" : "negative-text"}>
                      {generatedMarket.priceDifferencePercent >= 0 ? "+" : ""}{generatedMarket.priceDifferencePercent.toFixed(1)} %
                    </b>
                  </div>
                  <div className="market-offer-row attractive">
                    <div>
                      <span>ATTRAKTIVER KAUFPREIS</span>
                      <strong>{money(generatedMarket.estimatedMarketValue * 0.94)}</strong>
                    </div>
                    <button type="button" className="button secondary" onClick={() => useAttractivePurchasePrice(0.94)}>Übernehmen</button>
                  </div>
                  <div className="market-offer-row very-attractive">
                    <div>
                      <span>SEHR ATTRAKTIVER KAUFPREIS</span>
                      <strong>{money(generatedMarket.estimatedMarketValue * 0.88)}</strong>
                    </div>
                    <button type="button" className="button secondary" onClick={() => useAttractivePurchasePrice(0.88)}>Übernehmen</button>
                  </div>
                  <p className="market-explanation">
                    Die Schätzung berücksichtigt den regionalen Quadratmeterpreis, die
                    Lagequalität, den Objektzustand, den Ausbaustandard und vorhandene
                    Ausstattungsmerkmale.
                  </p>
                  <small className="market-source">
                    Modellbasierte Vergleichswerte im Umkreis von {form.marketDataRadiusKm} km · Datenqualität: {generatedMarket.confidence}
                  </small>
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
              <>
                <label>
                  Nettomiete Objekt / Monat
                  <input
                    type="number"
                    value={form.monthlyRent || ""}
                    onChange={(event) => {
                      set("monthlyRent", Number(event.target.value));
                      setMarketRentGenerated(null);
                    }}
                  />
                </label>
                <label>
                  Parkplatzmiete gesamt / Monat
                  <input
                    type="number"
                    value={form.parkingMonthlyRent || ""}
                    onChange={(event) => set("parkingMonthlyRent", Number(event.target.value))}
                  />
                </label>
              </>
            ) : (
              <div className="full rent-total">
                <span>Aktuelle Nettomiete MFH / Monat</span>
                <strong>
                  {money(
                    form.rentalUnits.reduce(
                      (sum, unit) => sum + unit.currentMonthlyRent + (unit.parkingMonthlyRent || 0),
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
                <Sparkles size={20} /> Marktmiete automatisch berechnen (Premium)
              </button>
              {marketRentGenerated !== null && generatedMarket && (
                <div className="market-calculation-card rent-card">
                  <div className="market-card-heading">
                    <span className="eyebrow">MARKTMIETANALYSE</span>
                    <h3>Geschätzte Marktmiete</h3>
                    <p>
                      Unabhängige Schätzung auf Basis von Lage, Objektdaten und regionalen
                      Marktinformationen. Die eingegebene Miete fliesst nicht in die
                      Berechnung ein.
                    </p>
                  </div>
                  <div className="market-main-value">
                    <span>GESCHÄTZTE MARKTMIETE</span>
                    <strong>{money(generatedMarket.estimatedMonthlyMarketRent)} <em>/ Monat</em></strong>
                    <small>
                      Marktspanne: {money(generatedMarket.estimatedMonthlyMarketRent * 0.90)} – {money(generatedMarket.estimatedMonthlyMarketRent * 1.10)} / Monat
                    </small>
                  </div>
                  <div className="market-comparison-row">
                    <div>
                      <span>IHRE EINGETRAGENE NETTOMIETE</span>
                      <strong>{money(generatedMarket.currentMonthlyRent)} / Mt.</strong>
                    </div>
                    <b className={generatedMarket.rentDifferencePercent >= 0 ? "positive-text" : "negative-text"}>
                      {generatedMarket.rentDifferencePercent >= 0 ? "+" : ""}{generatedMarket.rentDifferencePercent.toFixed(1)} %
                    </b>
                  </div>
                  <p className="market-explanation">
                    Die Schätzung berücksichtigt Lagequalität, Wohnfläche, Stockwerk,
                    Zustand, Ausbaustandard, Ausstattung und Parkierung.
                  </p>
                  <small className="market-source">
                    Modellbasierte Vergleichswerte im Umkreis von {form.marketDataRadiusKm} km · Datenqualität: {generatedMarket.confidence}
                  </small>
                  {form.propertyType === "mfh" && (
                    <div className="unit-market-rent-preview">
                      {generatedMarket.units.map((unit) => (
                        <div key={unit.id}>
                          <span>{unit.label}</span>
                          <strong>{money(unit.estimatedMonthlyMarketRent)} / Monat</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="market-choice-actions">
                    <button type="button" className="button market-accept" onClick={useMarketRent}>
                      {form.propertyType === "mfh" ? "Marktmieten für alle Wohnungen übernehmen" : "Marktmiete übernehmen"}
                    </button>
                    <button type="button" className="button text-choice" onClick={() => setMarketRentGenerated(null)}>Eigene Miete verwenden</button>
                  </div>
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

          {(() => {
            const totalInvestment = form.purchasePrice + form.ancillaryCosts;
            const equityRatio = totalInvestment > 0 ? (form.equity / totalInvestment) * 100 : 0;
            const status =
              equityRatio >= 40
                ? { tone: "strong", title: "Komfortable Eigenkapitalbasis", text: "Die Eigenkapitalquote liegt deutlich über der üblichen Mindestanforderung für Renditeobjekte." }
                : equityRatio >= 30
                  ? { tone: "good", title: "Solide Finanzierungsbasis", text: "Die Eigenkapitalquote liegt über der banküblichen Mindestfinanzierung und bietet einen zusätzlichen Puffer." }
                  : equityRatio >= 25
                    ? { tone: "minimum", title: "Bankübliche Mindestfinanzierung", text: "Die Eigenkapitalquote erfüllt grundsätzlich die übliche Mindestanforderung für Renditeobjekte. Die definitive Finanzierung hängt jedoch von Belehnungswert, Ertrag, Tragbarkeit und Bankprüfung ab." }
                    : { tone: "critical", title: "Eigenkapitalquote voraussichtlich zu tief", text: "Für Renditeobjekte verlangen Banken häufig mindestens rund 25 % Eigenkapital. Eine höhere Eigenkapitalquote oder ein tieferer Kaufpreis kann erforderlich sein." };

            return (
              <div className={`affordability-card ${status.tone}`}>
                <span className="affordability-ratio">EIGENKAPITALQUOTE {equityRatio.toFixed(1)} %</span>
                <strong>{status.title}</strong>
                <p>{status.text}</p>
                <small>Hinweis: Die tatsächliche Kreditentscheidung liegt bei der finanzierenden Bank.</small>
              </div>
            );
          })()}

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
              {editId ? "Änderungen speichern" : "Analyse berechnen"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
