import type { AnalysisInput } from "../types";
const KEY = "homeiq-analyses-v1";
export const loadAnalyses = (): AnalysisInput[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};
export const saveAnalysis = (analysis: AnalysisInput) => {
  const items = loadAnalyses().filter(item => item.id !== analysis.id);
  localStorage.setItem(KEY, JSON.stringify([analysis, ...items]));
};
export const deleteAnalysis = (id: string) => {
  localStorage.setItem(KEY, JSON.stringify(loadAnalyses().filter(item => item.id !== id)));
};
export const findAnalysis = (id: string) => loadAnalyses().find(item => item.id === id);
