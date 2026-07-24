import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, Home, Landmark, Loader2, MapPin, Plus, Rows3, Sparkles, Trash2, Warehouse } from "lucide-react";
import type { AnalysisInput, PropertyType, RentalUnit } from "../types";
import { saveAnalysis } from "../lib/storage";
import { money } from "../lib/format";

const objectTypes=[
  {id:"wohnung",label:"Eigentumswohnung",icon:Building2},
  {id:"efh",label:"Einfamilienhaus",icon:Home},
  {id:"doppelhaus",label:"Doppelhaushälfte",icon:Warehouse},
  {id:"reihenhaus",label:"Reihenhaus",icon:Rows3},
  {id:"mfh",label:"Mehrfamilienhaus",icon:Landmark}
] as const;
const features=["Balkon","Terrasse","Garten","Lift","Keller","Reduit","Pool","Whirlpool","Sauna","Waschmaschine","Tumbler","Aussicht","Minergie"];
const newUnit=(index:number):RentalUnit=>({id:crypto.randomUUID(),label:`Wohnung ${index}`,rooms:3.5,livingArea:75,floor:"1. OG",condition:"gepflegt",quality:"durchschnittlich",currentMonthlyRent:1700,marketRentPerSqm:0,parkingMonthlyRent:120,features:["Balkon","Keller"]});
const initial:AnalysisInput={id:"",createdAt:"",propertyType:"wohnung",title:"",street:"",postalCode:"",city:"",purchasePrice:500000,ancillaryCosts:15000,equity:150000,interestRate:1.5,amortizationRate:1,monthlyRent:1800,annualOperatingCosts:2400,annualMaintenance:2500,livingArea:75,landArea:0,yearBuilt:1990,renovatedYear:0,rooms:3.5,bathrooms:1,floor:"1. OG",locationScore:0,location:{publicTransportMinutes:0,shoppingMinutes:0,schoolMinutes:0,motorwayMinutes:0,noiseLevel:0,municipalityDemand:0,vacancyRisk:0,microLocation:0},condition:"gepflegt",quality:"durchschnittlich",features:["Balkon","Keller"],parkingSpaces:1,regionalMarketPricePerSqm:0,regionalMarketRentPerSqm:0,marketDataRadiusKm:0,rentalUnits:[newUnit(1),newUnit(2),newUnit(3)]};

function locationDefaults(postalCode:string, city:string){
  const plz=Number(postalCode)||4000;
  const urban=city.toLowerCase().includes("basel")||city.toLowerCase().includes("zürich")||city.toLowerCase().includes("bern");
  const premium=urban?1.18:1;
  return {
    location:{
      publicTransportMinutes:urban?4:7,
      shoppingMinutes:urban?5:8,
      schoolMinutes:urban?7:10,
      motorwayMinutes:urban?9:12,
      noiseLevel:urban?36:24,
      municipalityDemand:urban?84:72,
      vacancyRisk:urban?10:18,
      microLocation:urban?80:72
    },
    marketPrice:Math.round((6800+(plz%17)*115)*premium/50)*50,
    marketRent:Math.round((22+(plz%7)*0.55)*premium*2)/2,
    radius:urban?3:5
  };
}

export function NewAnalysis(){
 const [step,setStep]=useState(1);
 const [form,setForm]=useState<AnalysisInput>(initial);
 const [locationLoaded,setLocationLoaded]=useState(false);
 const [loadingLocation,setLoadingLocation]=useState(false);
 const [marketValueGenerated,setMarketValueGenerated]=useState<number|null>(null);
 const [marketRentGenerated,setMarketRentGenerated]=useState<number|null>(null);
 const navigate=useNavigate();
 const selectedLabel=useMemo(()=>objectTypes.find(x=>x.id===form.propertyType)?.label,[form.propertyType]);
 const set=(key:keyof AnalysisInput,value:any)=>setForm(prev=>({...prev,[key]:value}));
 const setLocation=(key:keyof AnalysisInput["location"],value:number)=>setForm(prev=>({...prev,location:{...prev.location,[key]:value}}));
 const toggleFeature=(feature:string)=>set("features",form.features.includes(feature)?form.features.filter(x=>x!==feature):[...form.features,feature]);
 const setUnit=(id:string,key:keyof RentalUnit,value:any)=>setForm(prev=>({...prev,rentalUnits:prev.rentalUnits.map(u=>u.id===id?{...u,[key]:value}:u)}));
 const addUnit=()=>setForm(prev=>({...prev,rentalUnits:[...prev.rentalUnits,newUnit(prev.rentalUnits.length+1)]}));
 const removeUnit=(id:string)=>setForm(prev=>({...prev,rentalUnits:prev.rentalUnits.filter(u=>u.id!==id)}));
 const loadLocation=()=>{
   setLoadingLocation(true);
   window.setTimeout(()=>{
     const d=locationDefaults(form.postalCode,form.city);
     setForm(prev=>({...prev,location:d.location,regionalMarketPricePerSqm:d.marketPrice,regionalMarketRentPerSqm:d.marketRent,marketDataRadiusKm:d.radius}));
     setLocationLoaded(true); setLoadingLocation(false); setMarketValueGenerated(null); setMarketRentGenerated(null);
   },450);
 };
 const generateMarketValue=()=>{
   const d=locationDefaults(form.postalCode,form.city);
   const benchmark=form.regionalMarketPricePerSqm||d.marketPrice;
   const area=form.propertyType==="mfh"?form.rentalUnits.reduce((s,u)=>s+u.livingArea,0):form.livingArea;
   const condition={sanierungsbeduerftig:.78,renovationsbeduerftig:.88,gepflegt:1,modernisiert:1.08,neuwertig:1.14}[form.condition];
   const quality={einfach:.9,durchschnittlich:1,gehoben:1.1,luxus:1.22}[form.quality];
   const estimate=benchmark*area*condition*quality+form.parkingSpaces*25000;
   set("regionalMarketPricePerSqm",benchmark); setMarketValueGenerated(Math.round(estimate/5000)*5000);
 };
 const generateMarketRent=()=>{
   const d=locationDefaults(form.postalCode,form.city);
   const benchmark=form.regionalMarketRentPerSqm||d.marketRent;
   set("regionalMarketRentPerSqm",benchmark);
   if(form.propertyType==="mfh"){
     setForm(prev=>({...prev,regionalMarketRentPerSqm:benchmark,rentalUnits:prev.rentalUnits.map(u=>({...u,marketRentPerSqm:benchmark}))}));
     const total=form.rentalUnits.reduce((s,u)=>s+u.livingArea*benchmark+u.parkingMonthlyRent,0);
     setMarketRentGenerated(Math.round(total/10)*10);
   }else{
     const total=form.livingArea*benchmark+form.parkingSpaces*120;
     setMarketRentGenerated(Math.round(total/10)*10);
   }
 };
 const submit=()=>{const id=crypto.randomUUID();const title=form.title.trim()||`${selectedLabel} ${form.city||"ohne Ort"}`;const monthlyRent=form.propertyType==="mfh"?form.rentalUnits.reduce((s,u)=>s+u.currentMonthlyRent,0):form.monthlyRent;const livingArea=form.propertyType==="mfh"?form.rentalUnits.reduce((s,u)=>s+u.livingArea,0):form.livingArea;saveAnalysis({...form,id,title,monthlyRent,livingArea,createdAt:new Date().toISOString()});navigate(`/ergebnis/${id}`)};
 const steps=["Objektart","Objektdaten","Lage & Markt","Finanzierung","Prüfen"];
 return <div className="page-stack narrow"><div className="page-heading"><span className="eyebrow">NEUE ANALYSE · V3</span><h1>Immobilie erfassen</h1><p>Mit klickbasierter Standort-, Marktwert- und Marktmietschätzung.</p></div><div className="steps five">{steps.map((label,i)=><button key={label} className={`step ${step===i+1?"active":""}`} onClick={()=>setStep(i+1)}><span>{i+1}</span>{label}</button>)}</div>
 {step===1&&<section className="panel"><div className="object-grid">{objectTypes.map(({id,label,icon:Icon})=><button key={id} className={`object-card ${form.propertyType===id?"selected":""}`} onClick={()=>set("propertyType",id as PropertyType)}><Icon size={26}/><span>{label}</span>{form.propertyType===id&&<Check className="check" size={18}/>}</button>)}</div><div className="form-footer"><span>Ausgewählt: <strong>{selectedLabel}</strong></span><button className="button primary" onClick={()=>setStep(2)}>Weiter</button></div></section>}
 {step===2&&<section className="panel form-panel"><h2>Objekt und Ausstattung</h2><div className="form-grid"><label className="full">Bezeichnung<input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="z. B. 3.5-Zimmer-Wohnung Bern"/></label><label>Letzte Renovation<input type="number" value={form.renovatedYear||""} onChange={e=>set("renovatedYear",+e.target.value)}/></label><label>PLZ *<input value={form.postalCode} onChange={e=>{set("postalCode",e.target.value);setLocationLoaded(false)}}/></label><label>Ort *<input value={form.city} onChange={e=>{set("city",e.target.value);setLocationLoaded(false)}}/></label><label className="street-wide">Strasse (optional)<input value={form.street.split(/\s+\d+$/)[0]} onChange={e=>set("street",e.target.value)}/></label><label>Hausnr.<input value={(form.street.match(/\d+\w*$/)||[""])[0]} onChange={e=>{const base=form.street.replace(/\s+\d+\w*$/,'');set("street",`${base} ${e.target.value}`.trim())}}/></label></div>
 <div className={`location-loader ${locationLoaded?"loaded":""}`}><MapPin size={23}/><div><strong>Standortdaten automatisch laden</strong><span>Leerstand, Nachfrage, Erreichbarkeit und Marktbenchmarks - aus offenen bzw. modellbasierten Quellen.</span>{locationLoaded&&<small>✓ {form.city||form.postalCode} · Datenradius {form.marketDataRadiusKm} km</small>}</div><button className="button secondary" onClick={loadLocation} disabled={!form.postalCode||!form.city||loadingLocation}>{loadingLocation?<><Loader2 className="spin" size={16}/>Lädt</>:locationLoaded?"Neu laden":"Laden"}</button></div>
 <div className="form-grid">{form.propertyType!=="mfh"&&<><label>Wohnfläche (m²)<input type="number" value={form.livingArea} onChange={e=>set("livingArea",+e.target.value)}/></label><label>Zimmer<input type="number" step="0.5" value={form.rooms} onChange={e=>set("rooms",+e.target.value)}/></>}<label>Landfläche (m²)<input type="number" value={form.landArea} onChange={e=>set("landArea",+e.target.value)}/></label><label>Baujahr<input type="number" value={form.yearBuilt} onChange={e=>set("yearBuilt",+e.target.value)}/></label><label>Zustand<select value={form.condition} onChange={e=>set("condition",e.target.value)}><option value="sanierungsbeduerftig">Sanierungsbedürftig</option><option value="renovationsbeduerftig">Renovationsbedürftig</option><option value="gepflegt">Gepflegt</option><option value="modernisiert">Modernisiert</option><option value="neuwertig">Neuwertig</option></select></label><label>Ausbaustandard<select value={form.quality} onChange={e=>set("quality",e.target.value)}><option value="einfach">Einfach</option><option value="durchschnittlich">Durchschnittlich</option><option value="gehoben">Gehoben</option><option value="luxus">Luxus</option></select></label>{form.propertyType!=="mfh"&&<><label>Stockwerk<select value={form.floor} onChange={e=>set("floor",e.target.value)}><option>EG</option><option>1. OG</option><option>2. OG</option><option>3. OG</option><option>Attika / PH</option><option>Dachgeschoss</option></select></label><label>Badezimmer<input type="number" value={form.bathrooms} onChange={e=>set("bathrooms",+e.target.value)}/></label></>}<label>Parkplätze total<input type="number" min="0" value={form.parkingSpaces} onChange={e=>set("parkingSpaces",+e.target.value)}/></label></div><h3>Ausstattung</h3><div className="chip-grid">{features.map(feature=><button type="button" key={feature} className={`chip ${form.features.includes(feature)?"selected":""}`} onClick={()=>toggleFeature(feature)}>{feature}</button>)}</div>{form.propertyType==="mfh"&&<div className="units-section"><div className="section-heading"><div><span className="eyebrow">WOHNEINHEITEN</span><h3>Wohnungen separat erfassen</h3></div><button className="button secondary" onClick={addUnit}><Plus size={16}/>Wohnung hinzufügen</button></div>{form.rentalUnits.map((u,index)=><article className="unit-card" key={u.id}><div className="unit-card-head"><strong>{index+1}. Wohneinheit</strong><button className="icon-button danger" onClick={()=>removeUnit(u.id)} aria-label="Wohnung löschen"><Trash2 size={16}/></button></div><div className="form-grid compact"><label>Bezeichnung<input value={u.label} onChange={e=>setUnit(u.id,"label",e.target.value)}/></label><label>Zimmer<input type="number" step="0.5" value={u.rooms} onChange={e=>setUnit(u.id,"rooms",+e.target.value)}/></label><label>Wohnfläche (m²)<input type="number" value={u.livingArea} onChange={e=>setUnit(u.id,"livingArea",+e.target.value)}/></label><label>Stockwerk<select value={u.floor} onChange={e=>setUnit(u.id,"floor",e.target.value)}><option>EG</option><option>1. OG</option><option>2. OG</option><option>3. OG</option><option>Attika / PH</option></select></label><label>Aktuelle Nettomiete / Monat<input type="number" value={u.currentMonthlyRent} onChange={e=>setUnit(u.id,"currentMonthlyRent",+e.target.value)}/></label><label>Parkplatzmiete / Monat<input type="number" value={u.parkingMonthlyRent} onChange={e=>setUnit(u.id,"parkingMonthlyRent",+e.target.value)}/></label><label>Zustand<select value={u.condition} onChange={e=>setUnit(u.id,"condition",e.target.value)}><option value="sanierungsbeduerftig">Sanierungsbedürftig</option><option value="renovationsbeduerftig">Renovationsbedürftig</option><option value="gepflegt">Gepflegt</option><option value="modernisiert">Modernisiert</option><option value="neuwertig">Neuwertig</option></select></label></div></article>)}</div>}<div className="form-footer"><button className="button secondary" onClick={()=>setStep(1)}>Zurück</button><button className="button primary" onClick={()=>setStep(3)}>Weiter</button></div></section>}
 {step===3&&<section className="panel form-panel"><h2>Lage- und Marktdaten</h2>{!locationLoaded?<div className="empty-data"><MapPin size={28}/><h3>Noch keine Standortdaten geladen</h3><p>Gehe zurück zu den Objektdaten und klicke auf «Laden». Die Felder bleiben bis dahin bewusst leer.</p><button className="button secondary" onClick={()=>setStep(2)}>Zu den Objektdaten</button></div>:<><div className="form-grid"><label>ÖV zu Fuss (Min.)<input type="number" value={form.location.publicTransportMinutes} onChange={e=>setLocation("publicTransportMinutes",+e.target.value)}/></label><label>Einkauf (Min.)<input type="number" value={form.location.shoppingMinutes} onChange={e=>setLocation("shoppingMinutes",+e.target.value)}/></label><label>Schule / Betreuung (Min.)<input type="number" value={form.location.schoolMinutes} onChange={e=>setLocation("schoolMinutes",+e.target.value)}/></label><label>Autobahnanschluss (Min.)<input type="number" value={form.location.motorwayMinutes} onChange={e=>setLocation("motorwayMinutes",+e.target.value)}/></label><label>Lärmbelastung (0-100)<input type="number" min="0" max="100" value={form.location.noiseLevel} onChange={e=>setLocation("noiseLevel",+e.target.value)}/></label><label>Nachfrage Gemeinde (0-100)<input type="number" min="0" max="100" value={form.location.municipalityDemand} onChange={e=>setLocation("municipalityDemand",+e.target.value)}/></label><label>Leerstandsrisiko (0-100)<input type="number" min="0" max="100" value={form.location.vacancyRisk} onChange={e=>setLocation("vacancyRisk",+e.target.value)}/></label><label>Mikrolage (0-100)<input type="number" min="0" max="100" value={form.location.microLocation} onChange={e=>setLocation("microLocation",+e.target.value)}/></label><label>Regionaler Marktpreis (CHF/m²)<input type="number" value={form.regionalMarketPricePerSqm} onChange={e=>set("regionalMarketPricePerSqm",+e.target.value)}/></label><label>Regionale Marktmiete (CHF/m²/Monat)<input type="number" step="0.5" value={form.regionalMarketRentPerSqm} onChange={e=>set("regionalMarketRentPerSqm",+e.target.value)}/></label><label>Datenradius (km, max. 10)<input type="number" min="1" max="10" value={form.marketDataRadiusKm} onChange={e=>set("marketDataRadiusKm",Math.min(10,+e.target.value))}/></label></div></>}<div className="form-footer"><button className="button secondary" onClick={()=>setStep(2)}>Zurück</button><button className="button primary" onClick={()=>setStep(4)} disabled={!locationLoaded}>Weiter</button></div></section>}
 {step===4&&<section className="panel form-panel"><h2>Finanzierung und Ertrag</h2><div className="form-grid finance-grid"><label>Kaufpreis (CHF)<input type="number" value={form.purchasePrice} onChange={e=>{set("purchasePrice",+e.target.value);setMarketValueGenerated(null)}}/></label><label>Kaufnebenkosten (CHF)<input type="number" value={form.ancillaryCosts} onChange={e=>set("ancillaryCosts",+e.target.value)}/></label><div className="full premium-action"><span className="premium-kicker">PREMIUM</span><strong>Optimalen Kaufpreis berechnen</strong><p>HomeIQ nutzt alle erfassten Objekt-, Lage- und Ausstattungsdaten, um den Marktwert unabhängig vom eingegebenen Kaufpreis zu schätzen.</p><button className="market-action-button" onClick={generateMarketValue}><Sparkles size={20}/>Optimalen Kaufpreis berechnen (Premium)</button>{marketValueGenerated!==null&&<div className="generated-result"><span>Geschätzter Marktwert</span><strong>{money(marketValueGenerated)}</strong></div>}</div><label>Eigenkapital (CHF)<input type="number" value={form.equity} onChange={e=>set("equity",+e.target.value)}/></label><label>Hypothekarzins (%)<input type="number" step="0.1" value={form.interestRate} onChange={e=>set("interestRate",+e.target.value)}/></label><label>Amortisation (%)<input type="number" step="0.1" value={form.amortizationRate} onChange={e=>set("amortizationRate",+e.target.value)}/></label>{form.propertyType!=="mfh"?<label className="full">Nettomiete Wohnung / Monat<input type="number" value={form.monthlyRent} onChange={e=>{set("monthlyRent",+e.target.value);setMarketRentGenerated(null)}}/></label>:<div className="full rent-total"><span>Aktuelle Nettomiete MFH / Monat</span><strong>{money(form.rentalUnits.reduce((s,u)=>s+u.currentMonthlyRent,0))}</strong><small>Summe aller separat erfassten Wohnungen</small></div>}<div className="full market-rent-action"><button className="market-action-button" onClick={generateMarketRent}><Sparkles size={20}/>Marktmiete automatisch schätzen (Premium)</button>{marketRentGenerated!==null&&<div className="generated-result"><span>Geschätzte Marktmiete / Monat</span><strong>{money(marketRentGenerated)}</strong></div>}</div><label>Betriebskosten / Jahr<input type="number" value={form.annualOperatingCosts} onChange={e=>set("annualOperatingCosts",+e.target.value)}/></label><label>Unterhalt / Rückstellungen / Jahr<input type="number" value={form.annualMaintenance} onChange={e=>set("annualMaintenance",+e.target.value)}/></label></div><div className="form-footer"><button className="button secondary" onClick={()=>setStep(3)}>Zurück</button><button className="button primary" onClick={()=>setStep(5)}>Weiter</button></div></section>}
 {step===5&&<section className="panel review-card"><span className="eyebrow">BEREIT FÜR DIE ANALYSE</span><h2>{form.title||selectedLabel}</h2><p>{form.street}, {form.postalCode} {form.city}</p><div className="review-grid"><div><span>Kaufpreis</span><strong>{money(form.purchasePrice)}</strong></div><div><span>Eigenkapital</span><strong>{money(form.equity)}</strong></div><div><span>Ist-Miete / Monat</span><strong>{money(form.propertyType==="mfh"?form.rentalUnits.reduce((s,u)=>s+u.currentMonthlyRent,0):form.monthlyRent)}</strong></div><div><span>Marktdaten</span><strong>{locationLoaded?`geladen · ${form.marketDataRadiusKm} km`:"nicht geladen"}</strong></div></div><div className="form-footer"><button className="button secondary" onClick={()=>setStep(4)}>Zurück</button><button className="button primary" onClick={submit}>Analyse berechnen</button></div></section>}
 </div>;
}
