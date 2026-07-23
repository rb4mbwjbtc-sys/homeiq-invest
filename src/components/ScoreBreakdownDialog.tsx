import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SCORE_WEIGHTS } from "@/lib/homeiq/config";
import type { AnalysisResult } from "@/lib/homeiq/types";

const FACTORS: {
  key: keyof AnalysisResult["subscores"];
  label: string;
  weightKey: keyof typeof SCORE_WEIGHTS;
}[] = [
  { key: "yield", label: "Nettorendite", weightKey: "yield" },
  { key: "equityReturn", label: "Eigenkapitalrendite", weightKey: "equityReturn" },
  { key: "location", label: "Lagequalität", weightKey: "location" },
  { key: "condition", label: "Zustand", weightKey: "condition" },
  { key: "features", label: "Ausstattung", weightKey: "features" },
];

const LOCATION_ORDER: {
  key: keyof AnalysisResult["locationDetail"]["subscores"];
  label: string;
}[] = [
  { key: "vacancy", label: "Leerstandsrisiko" },
  { key: "priceTrend", label: "Preis-/Mietentwicklung" },
  { key: "population", label: "Bevölkerungsentwicklung" },
  { key: "tax", label: "Steuern" },
  { key: "noise", label: "Lärm" },
  { key: "transport", label: "ÖV" },
  { key: "shopping", label: "Einkauf" },
  { key: "schools", label: "Schule" },
];

import { scoreBarBg } from "@/lib/homeiq/colors";

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
      <div
        className={`h-full ${scoreBarBg(value)}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function ScoreBreakdownDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: AnalysisResult;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            HomeIQ Score — Aufschlüsselung
          </DialogTitle>
          <DialogDescription>
            Fünf gewichtete Faktoren ergeben den Gesamt-Score {result.score}/100.
            Die Finanzierung wird separat ausgewiesen und beeinflusst den Score nicht.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-4 py-2">
          {FACTORS.map((f) => {
            const val = result.subscores[f.key];
            const weight = SCORE_WEIGHTS[f.weightKey];
            const reason = result.subscoreReasons?.[f.key];
            return (
              <li key={f.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-[color:var(--navy-dark)]">
                    {f.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {val}/100 · Gewicht {Math.round(weight * 100)} %
                  </span>
                </div>
                <Bar value={val} />
                {reason && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {reason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {result.locationDetail && (
          <div className="mt-2 rounded-xl border border-black/5 bg-[color:var(--navy-wash)]/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
              Lage im Detail
            </p>
            <ul className="mt-3 space-y-2.5 text-[12px] text-[color:var(--navy-dark)]">
              {LOCATION_ORDER.map(({ key, label }) => {
                const val = result.locationDetail.subscores[key];
                const expl = result.locationDetail.explanations[key];
                const available = val !== null && val !== undefined;
                return (
                  <li key={key} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {available ? `${val}/100` : "Nicht verfügbar"}
                      </span>
                    </div>
                    {available ? (
                      <Bar value={val as number} />
                    ) : (
                      <div className="h-1.5 w-full rounded-full bg-black/5" />
                    )}
                    {expl && (
                      <p className="text-[11px] text-muted-foreground">{expl}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
