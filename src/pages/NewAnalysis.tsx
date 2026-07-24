import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, Home, Landmark, Rows3, Warehouse } from "lucide-react";
import type { AnalysisInput, PropertyType } from "../types";
import { saveAnalysis } from "../lib/storage";

const objectTypes = [
  { id: "wohnung", label: "Eigentumswohnung", icon: Building2 },
  { id: "efh", label: "Einfamilienhaus", icon: Home },
  { id: "doppelhaus", label: "Doppelhaushälfte", icon: Warehouse },
  { id: "reihenhaus", label: "Reihenhaus", icon: Rows3 },
  { id: "mfh", label: "Mehrfamilienhaus", icon: Landmark }
] as const;

const initial: AnalysisInput = {
  id: "", createdAt: "", propertyType: "wohnung", title: "", street: "", postalCode: "", city: "",
  purchasePrice: 500000, ancillaryCosts: 15000, equity: 150000, interestRate: 1.5, amortizationRate: 1,
  monthlyRent: 1800, annualOperatingCosts: 2400, annualMaintenance: 2500, livingArea: 75, landArea: 0,
  yearBuilt: 1990, renovatedYear: 2015, rooms: 3.5, bathrooms: 1, floor: "1. OG", locationScore: 70,
  features: ["Balkon", "Keller"], parkingSpaces: 1
};

const features = ["Balkon", "Terrasse", "Garten", "Lift", "Keller", "Reduit", "Pool", "Whirlpool", "Sauna", "Waschmaschine", "Tumbler"];

export function NewAnalysis() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<AnalysisInput>(initial);
  const navigate = useNavigate();
  const selectedLabel = useMemo(() => objectTypes.find(x => x.id === form.propertyType)?.label, [form.propertyType]);
  const set = (key: keyof AnalysisInput, value: string | number | string[]) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleFeature = (feature: string) => set("features", form.features.includes(feature) ? form.features.filter(x => x !== feature) : [...form.features, feature]);
  const submit = () => {
    const id = crypto.randomUUID();
    const title = form.title.trim() || `${selectedLabel} ${form.city || "ohne Ort"}`;
    saveAnalysis({ ...form, id, title, createdAt: new Date().toISOString() });
    navigate(`/ergebnis/${id}`);
  };

  return <div className="page-stack narrow">
    <div className="page-heading"><span className="eyebrow">NEUE ANALYSE</span><h1>Immobilie erfassen</h1><p>In vier Schritten zur transparenten Investmentanalyse.</p></div>
    <div className="steps">{["Objektart","Objektdaten","Finanzierung","Prüfen"].map((label,i)=><button key={label} className={`step ${step===i+1?"active":""}`} onClick={()=>setStep(i+1)}><span>{i+1}</span>{label}</button>)}</div>

    {step===1 && <section className="panel"><div className="object-grid">{objectTypes.map(({id,label,icon:Icon})=><button key={id} className={`object-card ${form.propertyType===id?"selected":""}`} onClick={()=>set("propertyType",id as PropertyType)}><Icon size={26}/><span>{label}</span>{form.propertyType===id&&<Check className="check" size={18}/>}</button>)}</div><div className="form-footer"><span>Ausgewählt: <strong>{selectedLabel}</strong></span><button className="button primary" onClick={()=>setStep(2)}>Weiter</button></div></section>}

    {step===2 && <section className="panel form-panel"><h2>Objekt und Lage</h2><div className="form-grid">
      <label className="full">Bezeichnung<input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="z. B. 3.5-Zimmer-Wohnung Bern"/></label>
      <label className="full">Strasse und Nr.<input value={form.street} onChange={e=>set("street",e.target.value)}/></label>
      <label>PLZ<input value={form.postalCode} onChange={e=>set("postalCode",e.target.value)}/></label><label>Ort<input value={form.city} onChange={e=>set("city",e.target.value)}/></label>
      <label>Wohnfläche (m²)<input type="number" value={form.livingArea} onChange={e=>set("livingArea",+e.target.value)}/></label><label>Landfläche (m²)<input type="number" value={form.landArea} onChange={e=>set("landArea",+e.target.value)}/></label>
      <label>Baujahr<input type="number" value={form.yearBuilt} onChange={e=>set("yearBuilt",+e.target.value)}/></label><label>Letzte Renovation<input type="number" value={form.renovatedYear} onChange={e=>set("renovatedYear",+e.target.value)}/></label>
      <label>Zimmer<input type="number" step="0.5" value={form.rooms} onChange={e=>set("rooms",+e.target.value)}/></label><label>Badezimmer<input type="number" value={form.bathrooms} onChange={e=>set("bathrooms",+e.target.value)}/></label>
      <label>Stockwerk<select value={form.floor} onChange={e=>set("floor",e.target.value)}><option>EG</option><option>1. OG</option><option>2. OG</option><option>3. OG</option><option>Attika / PH</option><option>Dachgeschoss</option></select></label>
      <label>Lagequalität (0–100)<input type="number" min="0" max="100" value={form.locationScore} onChange={e=>set("locationScore",+e.target.value)}/></label>
      <label>Parkplätze<input type="number" min="0" value={form.parkingSpaces} onChange={e=>set("parkingSpaces",+e.target.value)}/></label>
    </div><h3>Ausstattung</h3><div className="chip-grid">{features.map(feature=><button key={feature} className={`chip ${form.features.includes(feature)?"selected":""}`} onClick={()=>toggleFeature(feature)}>{feature}</button>)}</div><div className="form-footer"><button className="button secondary" onClick={()=>setStep(1)}>Zurück</button><button className="button primary" onClick={()=>setStep(3)}>Weiter</button></div></section>}

    {step===3 && <section className="panel form-panel"><h2>Finanzierung und Ertrag</h2><div className="form-grid">
      <label>Kaufpreis (CHF)<input type="number" value={form.purchasePrice} onChange={e=>set("purchasePrice",+e.target.value)}/></label><label>Kaufnebenkosten (CHF)<input type="number" value={form.ancillaryCosts} onChange={e=>set("ancillaryCosts",+e.target.value)}/></label>
      <label>Eigenkapital (CHF)<input type="number" value={form.equity} onChange={e=>set("equity",+e.target.value)}/></label><label>Hypothekarzins (%)<input type="number" step="0.1" value={form.interestRate} onChange={e=>set("interestRate",+e.target.value)}/></label>
      <label>Amortisation (%)<input type="number" step="0.1" value={form.amortizationRate} onChange={e=>set("amortizationRate",+e.target.value)}/></label><label>Monatliche Nettomiete (CHF)<input type="number" value={form.monthlyRent} onChange={e=>set("monthlyRent",+e.target.value)}/></label>
      <label>Betriebskosten / Jahr (CHF)<input type="number" value={form.annualOperatingCosts} onChange={e=>set("annualOperatingCosts",+e.target.value)}/></label><label>Unterhalt / Rückstellungen pro Jahr (CHF)<input type="number" value={form.annualMaintenance} onChange={e=>set("annualMaintenance",+e.target.value)}/></label>
    </div><div className="form-footer"><button className="button secondary" onClick={()=>setStep(2)}>Zurück</button><button className="button primary" onClick={()=>setStep(4)}>Weiter</button></div></section>}

    {step===4 && <section className="panel review"><h2>Analyse prüfen</h2><div className="review-grid"><div><span>Objekt</span><strong>{selectedLabel}</strong></div><div><span>Ort</span><strong>{form.postalCode} {form.city}</strong></div><div><span>Kaufpreis</span><strong>CHF {form.purchasePrice.toLocaleString("de-CH")}</strong></div><div><span>Nettomiete</span><strong>CHF {form.monthlyRent.toLocaleString("de-CH")} / Monat</strong></div><div><span>Eigenkapital</span><strong>CHF {form.equity.toLocaleString("de-CH")}</strong></div><div><span>Lagequalität</span><strong>{form.locationScore}/100</strong></div></div><div className="form-footer"><button className="button secondary" onClick={()=>setStep(3)}>Zurück</button><button className="button primary" onClick={submit}>Analyse berechnen</button></div></section>}
  </div>;
}
