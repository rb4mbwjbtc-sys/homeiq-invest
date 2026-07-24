import type { AnalysisInput, AnalysisResult, ScoreBreakdown } from "../types";
import { analyseLocation, analyseMarket } from "./market";
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
function yieldScore(value: number){if(value>=5)return 100;if(value>=4)return 80+(value-4)*20;if(value>=3.5)return 60+(value-3.5)*40;if(value>=3)return 40+(value-3)*40;if(value>=2)return 20+(value-2)*20;return clamp(value*10)}
function equityScore(value:number){if(value>=10)return 100;if(value>=8)return 85+(value-8)*7.5;if(value>=6)return 65+(value-6)*10;if(value>=4)return 45+(value-4)*10;if(value>=2)return 25+(value-2)*10;return clamp(value*12.5)}
function conditionScore(input:AnalysisInput){return {sanierungsbeduerftig:20,renovationsbeduerftig:42,gepflegt:68,modernisiert:86,neuwertig:100}[input.condition]}
function featureScore(input:AnalysisInput){return clamp(35+Math.min(input.features.length*8,48)+Math.min(input.parkingSpaces*6,18))}
export function calculateAnalysis(input:AnalysisInput):AnalysisResult{
 const locationAnalysis=analyseLocation(input); const marketAnalysis=analyseMarket(input,locationAnalysis);
 const totalInvestment=input.purchasePrice+input.ancillaryCosts; const mortgage=Math.max(totalInvestment-input.equity,0);
 const annualRent=(input.propertyType==="mfh"&&input.rentalUnits.length?input.rentalUnits.reduce((s,u)=>s+u.currentMonthlyRent,0):input.monthlyRent)*12;
 const grossYield=totalInvestment>0?annualRent/totalInvestment*100:0; const netIncomeBeforeFinancing=annualRent-input.annualOperatingCosts-input.annualMaintenance;
 const netYield=totalInvestment>0?netIncomeBeforeFinancing/totalInvestment*100:0; const annualInterest=mortgage*input.interestRate/100; const annualAmortization=mortgage*input.amortizationRate/100;
 const annualCashflow=netIncomeBeforeFinancing-annualInterest-annualAmortization; const monthlyCashflow=annualCashflow/12; const equityReturn=input.equity>0?annualCashflow/input.equity*100:0;
 const ltv=totalInvestment>0?mortgage/totalInvestment*100:0; const pricePerSqm=input.livingArea>0?input.purchasePrice/input.livingArea:0;
 const scoreBreakdown:ScoreBreakdown={netYield:Math.round(yieldScore(netYield)),equityReturn:Math.round(equityScore(equityReturn)),location:locationAnalysis.score,condition:conditionScore(input),features:featureScore(input)};
 const score=Math.round(scoreBreakdown.netYield*.35+scoreBreakdown.equityReturn*.20+scoreBreakdown.location*.25+scoreBreakdown.condition*.12+scoreBreakdown.features*.08);
 const rating=score>=80?"Attraktives Investment":score>=65?"Solides Investment":score>=50?"Neutral – genauer prüfen":"Kritisches Investment";
 const recommendation=score>=75&&netYield>=3.4&&marketAnalysis.priceDifferencePercent>-8?"Kauf empfehlenswert":score>=55?"Kauf interessant nach Preisverhandlung":"Kauf aktuell nicht empfohlen";
 const positives:string[]=[]; const negatives:string[]=[];
 if(netYield>=4)positives.push(`Attraktive Nettorendite (${netYield.toFixed(1)} %)`);else if(netYield>=3.3)positives.push(`Solide Nettorendite (${netYield.toFixed(1)} %)`);else negatives.push(`Tiefe Nettorendite (${netYield.toFixed(1)} %)`);
 if(equityReturn>=8)positives.push(`Starke Eigenkapitalrendite (${equityReturn.toFixed(1)} %)`);else if(equityReturn<4)negatives.push(`Schwache Eigenkapitalrendite (${equityReturn.toFixed(1)} %)`);
 if(monthlyCashflow>500)positives.push("Deutlich positiver monatlicher Cashflow");else if(monthlyCashflow<0)negatives.push("Negativer monatlicher Cashflow");
 if(locationAnalysis.score>=75)positives.push(locationAnalysis.rating);else if(locationAnalysis.score<50)negatives.push(locationAnalysis.rating);
 if(marketAnalysis.priceDifferencePercent>=8)positives.push("Kaufpreis unter geschätztem Marktwert");else if(marketAnalysis.priceDifferencePercent<=-8)negatives.push("Kaufpreis über geschätztem Marktwert");
 if(marketAnalysis.rentDifferencePercent>=6)positives.push("Erkennbares Marktmietpotenzial");
 if(ltv>80)negatives.push("Hohe Belehnung"); if(scoreBreakdown.condition<50)negatives.push("Erhöhter Renovationsbedarf möglich");
 return {input,totalInvestment,mortgage,annualRent,grossYield,netYield,annualInterest,annualAmortization,annualCashflow,monthlyCashflow,equityReturn,ltv,pricePerSqm,score,scoreBreakdown,rating,recommendation,positives,negatives,locationAnalysis,marketAnalysis};
}
