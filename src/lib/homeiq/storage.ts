import { supabase } from "@/integrations/supabase/client";
import { computeAnalysis } from "./score";
import type { AnalysisInputs, StoredAnalysis } from "./types";

const LS_KEY = "homeiq.analyses.v1";

function readLocal(): StoredAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredAnalysis[];
  } catch {
    return [];
  }
}

function writeLocal(list: StoredAnalysis[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(list));
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function listAnalyses(): Promise<StoredAnalysis[]> {
  const uid = await getUserId();
  if (uid) {
    const { data, error } = await supabase
      .from("analyses")
      .select("id, name, data, result, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      inputs: r.data as unknown as AnalysisInputs,
      result: r.result as unknown as StoredAnalysis["result"],
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  }
  return readLocal().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getAnalysis(id: string): Promise<StoredAnalysis | null> {
  const uid = await getUserId();
  if (uid) {
    const { data, error } = await supabase
      .from("analyses")
      .select("id, name, data, result, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.name as string,
      inputs: data.data as unknown as AnalysisInputs,
      result: data.result as unknown as StoredAnalysis["result"],
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
  return readLocal().find((a) => a.id === id) ?? null;
}

function makeId() {
  return (
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)) as string
  );
}

function autoName(inputs: AnalysisInputs): string {
  const city = (inputs.city ?? "").trim();
  const typeLabel: Record<string, string> = {
    eigentumswohnung: "Wohnung",
    einfamilienhaus: "Einfamilienhaus",
    doppelhaus: "Doppelhaushälfte",
    reihenhaus: "Reihenhaus",
    mfh: "Mehrfamilienhaus",
  };
  const t = typeLabel[inputs.objectType] ?? "Objekt";
  // Regeln:
  // - Eigentumswohnung: Zimmerzahl im Titel
  // - EFH/RH/DH: Ort + Objektart
  // - MFH: Ort + "Mehrfamilienhaus"
  const rightSide =
    inputs.objectType === "eigentumswohnung" && inputs.rooms
      ? `${String(inputs.rooms).replace(".", ",")}-Zimmer-Wohnung`
      : t;
  if (city) return `${city} – ${rightSide}`;
  return rightSide;
}

export async function saveAnalysis(
  inputs: AnalysisInputs,
  existingId?: string,
): Promise<StoredAnalysis> {
  inputs = { ...inputs, name: autoName(inputs) };
  const result = computeAnalysis(inputs);
  const now = new Date().toISOString();
  const uid = await getUserId();
  if (uid) {
    if (existingId) {
      const { data, error } = await supabase
        .from("analyses")
        .update({
          name: inputs.name,
          data: inputs as any,
          result: result as any,
          score: result.score,
          category: result.category,
          purchase_price: inputs.purchasePrice,
          location: [inputs.zip, inputs.city].filter(Boolean).join(" "),
        })
        .eq("id", existingId)
        .select("id, created_at, updated_at")
        .single();
      if (error) throw error;
      return {
        id: data.id as string,
        name: inputs.name,
        inputs,
        result,
        createdAt: data.created_at as string,
        updatedAt: data.updated_at as string,
      };
    }
    const { data, error } = await supabase
      .from("analyses")
      .insert({
        user_id: uid,
        name: inputs.name,
        data: inputs as any,
        result: result as any,
        score: result.score,
        category: result.category,
        purchase_price: inputs.purchasePrice,
        location: [inputs.zip, inputs.city].filter(Boolean).join(" "),
      })
      .select("id, created_at, updated_at")
      .single();
    if (error) throw error;
    return {
      id: data.id as string,
      name: inputs.name,
      inputs,
      result,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
  // Gast
  const list = readLocal();
  const id = existingId ?? makeId();
  const existing = list.find((a) => a.id === id);
  const record: StoredAnalysis = {
    id,
    name: inputs.name,
    inputs,
    result,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = existing
    ? list.map((a) => (a.id === id ? record : a))
    : [record, ...list];
  writeLocal(next);
  return record;
}

export async function deleteAnalysis(id: string): Promise<void> {
  const uid = await getUserId();
  if (uid) {
    const { error } = await supabase.from("analyses").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  writeLocal(readLocal().filter((a) => a.id !== id));
}

export async function duplicateAnalysis(id: string): Promise<StoredAnalysis | null> {
  const a = await getAnalysis(id);
  if (!a) return null;
  const copy: AnalysisInputs = { ...a.inputs, name: a.inputs.name + " (Kopie)" };
  return saveAnalysis(copy);
}
