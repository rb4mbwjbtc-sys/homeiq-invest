import { Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  MarketRentResult,
  PurchasePriceResult,
} from "@/lib/homeiq/premium.functions";
import { chf } from "@/lib/homeiq/format";

function DataQualityLine({
  quality,
  comparableCount,
  radiusKm,
  sources,
}: {
  quality?: "hoch" | "mittel" | "tief";
  comparableCount?: number;
  radiusKm?: number;
  sources?: string[];
}) {
  const parts: string[] = [];
  if (typeof comparableCount === "number" && comparableCount > 0) {
    parts.push(
      `Basierend auf ${comparableCount} vergleichbaren Objekten${
        radiusKm ? ` im Umkreis von ${radiusKm} km` : ""
      }`,
    );
  } else if (radiusKm) {
    parts.push(`Suchradius ${radiusKm} km`);
  }
  if (quality) {
    parts.push(`Datenqualität: ${quality[0].toUpperCase()}${quality.slice(1)}`);
  }
  const text = parts.join(" · ");
  return (
    <div className="space-y-1 pt-1">
      {text ? (
        <p className="text-[11px] text-muted-foreground">{text}</p>
      ) : null}
      {sources && sources.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Quellen: {sources.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function deviationLabel(user: number, market: number): {
  pct: number;
  text: string;
  tone: "good" | "neutral" | "warn";
} {
  const pct = ((user - market) / market) * 100;
  const abs = Math.abs(pct);
  let tone: "good" | "neutral" | "warn" = "neutral";
  if (abs < 5) tone = "good";
  else if (abs > 10) tone = "warn";
  const sign = pct > 0 ? "+" : "";
  return { pct, text: `${sign}${pct.toFixed(1)} %`, tone };
}

function CompareRow({
  label,
  user,
  market,
  suffix,
}: {
  label: string;
  user: number;
  market: number;
  suffix?: string;
}) {
  if (!user || !market) return null;
  const d = deviationLabel(user, market);
  const toneCls =
    d.tone === "good"
      ? "text-emerald-700"
      : d.tone === "warn"
        ? "text-amber-700"
        : "text-[color:var(--navy-dark)]";
  return (
    <div className="flex items-center justify-between rounded-xl bg-white p-3 text-xs ring-1 ring-black/5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
          {label}
        </p>
        <p className="font-display text-sm font-semibold text-[color:var(--navy-dark)]">
          {chf(user)}
          {suffix ? <span className="text-[11px] font-normal text-muted-foreground"> {suffix}</span> : null}
        </p>
      </div>
      <p className={`text-sm font-semibold ${toneCls}`}>{d.text}</p>
    </div>
  );
}

export function MarketRentDialog({
  open,
  onOpenChange,
  loading,
  result,
  userRent,
  onAccept,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  result: MarketRentResult | null;
  userRent?: number;
  onAccept: (rent: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-[color:var(--navy-mid)]" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
              Premium — Marktmiete
            </span>
          </div>
          <DialogTitle className="font-display text-xl">
            Geschätzte Marktmiete
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs">
            Unabhängige Schätzung auf Basis von Lage, Objektdaten und regionalen
            Marktinformationen — Ihre eingetragene Miete fliesst nicht in die
            Berechnung ein.
          </DialogDescription>
        </DialogHeader>

        {loading || !result ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-[color:var(--navy-mid)]" />
            HomeIQ analysiert den Markt …
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="rounded-2xl bg-[color:var(--navy-wash)]/60 p-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
                Geschätzte Marktmiete
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-[color:var(--navy-dark)]">
                {chf(result.estimatedRent)}{" "}
                <span className="text-xs font-normal text-muted-foreground">/ Monat</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Marktspanne: {chf(result.low)} – {chf(result.high)} / Monat
              </p>
            </div>
            {userRent && userRent > 0 ? (
              <CompareRow
                label="Ihre eingetragene Nettomiete"
                user={userRent}
                market={result.estimatedRent}
                suffix="/ Mt."
              />
            ) : null}
            <p className="text-xs text-[color:var(--navy-dark)]">{result.reasoning}</p>
            <DataQualityLine
              quality={result.dataQuality}
              comparableCount={result.comparableCount}
              radiusKm={result.radiusKm}
              sources={result.sources}
            />
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            disabled={!result || loading}
            onClick={() => result && onAccept(result.estimatedRent)}
            className="w-full bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
          >
            Marktmiete übernehmen
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Eigene Miete verwenden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurchasePriceDialog({
  open,
  onOpenChange,
  loading,
  result,
  userPrice,
  onAccept,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loading: boolean;
  result: PurchasePriceResult | null;
  userPrice?: number;
  onAccept: (price: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-[color:var(--navy-mid)]" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
              Premium — Kaufpreisanalyse
            </span>
          </div>
          <DialogTitle className="font-display text-xl">
            HomeIQ Kaufpreisanalyse
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs">
            Unabhängige Marktwertschätzung auf Basis von Lage, Zustand,
            Ausstattung und vergleichbaren Verkäufen — Ihr eingetragener Kaufpreis
            fliesst nicht in die Berechnung ein.
          </DialogDescription>
        </DialogHeader>

        {loading || !result ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-[color:var(--navy-mid)]" />
            HomeIQ analysiert den Markt …
          </div>
        ) : (
          <div className="space-y-2 py-2 text-sm">
            <div className="rounded-2xl bg-[color:var(--navy-wash)]/60 p-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
                Geschätzter Marktwert
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-[color:var(--navy-dark)]">
                {chf(result.marketValue)}
              </p>
              {result.low && result.high ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Marktwertspanne: {chf(result.low)} – {chf(result.high)}
                </p>
              ) : null}
            </div>
            {userPrice && userPrice > 0 ? (
              <CompareRow
                label="Ihr eingetragener Kaufpreis"
                user={userPrice}
                market={result.marketValue}
              />
            ) : null}
            <PriceRow
              label="Attraktiver Kaufpreis"
              value={result.attractivePrice}
              tone="good"
              onUse={() => onAccept(result.attractivePrice)}
            />
            <PriceRow
              label="Sehr attraktiver Kaufpreis"
              value={result.veryAttractivePrice}
              tone="great"
              onUse={() => onAccept(result.veryAttractivePrice)}
            />
            <p className="pt-2 text-xs text-[color:var(--navy-dark)]">
              {result.reasoning}
            </p>
            <DataQualityLine
              quality={result.dataQuality}
              comparableCount={result.comparableCount}
              radiusKm={result.radiusKm}
              sources={result.sources}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceRow({
  label,
  value,
  tone,
  onUse,
}: {
  label: string;
  value: number;
  tone?: "good" | "great";
  onUse?: () => void;
}) {
  const toneCls =
    tone === "great"
      ? "bg-emerald-50 ring-emerald-700/20"
      : tone === "good"
        ? "bg-emerald-50/60 ring-emerald-700/10"
        : "bg-white ring-black/5";
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl p-3 ring-1 ${toneCls}`}>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--navy-light)]">
          {label}
        </p>
        <p className="font-display text-base font-semibold text-[color:var(--navy-dark)]">
          {chf(value)}
        </p>
      </div>
      {onUse && (
        <Button
          size="sm"
          variant="outline"
          onClick={onUse}
          className="shrink-0 border-[color:var(--navy-mid)]/30 text-[color:var(--navy-dark)]"
        >
          Übernehmen
        </Button>
      )}
    </div>
  );
}
