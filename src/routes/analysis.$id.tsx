import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  Pencil,
  Save,
  Info,
  MapPin,
  Download,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ScoreBreakdownDialog } from "@/components/ScoreBreakdownDialog";
import { getAnalysis } from "@/lib/homeiq/storage";
import type { StoredAnalysis } from "@/lib/homeiq/types";
import { chf, pct } from "@/lib/homeiq/format";
import { deliverPdf, generateAnalysisPdf, buildPdfFilename } from "@/lib/homeiq/pdf";
import { financingStatus } from "@/lib/homeiq/financingStatus";
import { scoreChip, scoreRgb } from "@/lib/homeiq/colors";
import { useAuth } from "@/hooks/useAuth";
import { getUserQuota } from "@/lib/homeiq/quota.functions";

export const Route = createFileRoute("/analysis/$id")({
  component: AnalysisPage,
});

function gaugeGradient(score: number) {
  const [r, g, b] = scoreRgb(score);
  return `conic-gradient(rgb(${r} ${g} ${b}) ${score}%, var(--navy-wash) 0)`;
}

function recommendationTone(rec: string) {
  switch (rec) {
    case "kauf_empfehlenswert":
      return "bg-emerald-50 text-emerald-800 ring-emerald-700/20";
    case "kauf_interessant_nach_verhandlung":
      return "bg-amber-50 text-amber-800 ring-amber-700/20";
    case "bedingt_geeignet":
      return "bg-orange-50 text-orange-800 ring-orange-700/20";
    case "nicht_empfehlenswert":
      return "bg-red-50 text-red-800 ring-red-700/20";
    default:
      return "bg-neutral-50 text-neutral-800 ring-neutral-500/20";
  }
}

function DQBadge({ q }: { q: "hoch" | "mittel" | "niedrig" }) {
  const map = {
    hoch: {
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
      dot: "bg-emerald-500",
      label: "Hohe Datenqualität",
    },
    mittel: {
      cls: "bg-amber-50 text-amber-700 ring-amber-600/10",
      dot: "bg-amber-500",
      label: "Mittlere Datenqualität",
    },
    niedrig: {
      cls: "bg-red-50 text-red-700 ring-red-600/10",
      dot: "bg-red-500",
      label: "Niedrige Datenqualität",
    },
  }[q];
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${map.cls}`}>
      <span className={`size-1.5 rounded-full ${map.dot}`} />
      <span className="text-[10px] font-medium uppercase tracking-tight">{map.label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--navy-light)]">
        {label}
      </p>
      <p className="font-display text-lg font-semibold text-[color:var(--navy-dark)]">
        {value}
      </p>
    </div>
  );
}

function AnalysisPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [a, setA] = useState<StoredAnalysis | null | undefined>(undefined);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pdfBlobRef = useRef<Blob | null>(null);
  const fetchUserQuota = useServerFn(getUserQuota);

  useEffect(() => {
    getAnalysis(id).then(setA);
  }, [id]);

  useEffect(() => {
    // Cache invalidieren, wenn Analyse wechselt
    pdfBlobRef.current = null;
  }, [id]);

  useEffect(() => {
    if (!user) { setIsPremium(false); return; }
    fetchUserQuota().then((q) => setIsPremium(q.isPremium)).catch(() => {});
  }, [user, fetchUserQuota]);

  async function handleExportPdf() {
    if (!a) return;
    if (!isPremium) {
      toast.info("PDF-Export ist Premium-Nutzern vorbehalten.");
      navigate({ to: user ? "/subscribe" : "/auth" });
      return;
    }
    const filename = buildPdfFilename(a);
    // Bereits erzeugtes PDF wiederverwenden, wenn erneut ausgelöst wird.
    if (pdfBlobRef.current) {
      try {
        await deliverPdf(pdfBlobRef.current, filename);
        return;
      } catch (e) {
        console.error(e);
      }
    }
    setExporting(true);
    const loadingId = toast.loading("PDF wird erstellt …");
    try {
      const doc = await generateAnalysisPdf(a);
      const blob = doc.output("blob");
      pdfBlobRef.current = blob;
      await deliverPdf(blob, filename);
      toast.success("PDF bereit", { id: loadingId });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`PDF konnte nicht erstellt werden: ${msg}`, { id: loadingId });
    } finally {
      setExporting(false);
    }
  }


  const finStatus = useMemo(() => (a ? financingStatus(a.inputs) : null), [a]);


  if (a === undefined) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Lade …</p>
      </AppShell>
    );
  }
  if (!a) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Analyse nicht gefunden.</p>
        <Button asChild className="mt-4">
          <Link to="/">Zum Dashboard</Link>
        </Button>
      </AppShell>
    );
  }

  const r = a.result;
  const vs = r.verdictStructured ?? {
    overall: r.verdict ?? "",
    positives: r.strengths ?? [],
    negatives: r.risks ?? [],
    recommendation: "bedingt_geeignet" as const,
    recommendationLabel: "Prüfung empfohlen",
    recommendationReason:
      "Diese Analyse wurde vor einem Update erstellt. Für eine aktualisierte Empfehlung bitte neu berechnen.",
  };
  const cashflowColor =
    r.monthlyCashflow >= 0 ? "text-emerald-700" : "text-red-700";

  return (
    <AppShell>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs text-[color:var(--navy-light)]"
      >
        <ArrowLeft className="size-3" /> Dashboard
      </Link>

      <header className="mt-4 mb-8">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy-light)]">
            Analyse-Ergebnis
          </span>
          <DQBadge q={r.dataQuality} />
        </div>
        <h1 className="font-display text-3xl font-semibold leading-tight text-[color:var(--navy-dark)]">
          {a.name}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--navy-light)]">
          {[a.inputs.street, a.inputs.zip, a.inputs.city].filter(Boolean).join(", ")}
        </p>
      </header>

      {/* Score Gauge */}
      <section className="mb-12 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          aria-label="Score-Aufschlüsselung anzeigen"
          className="relative flex size-48 items-center justify-center rounded-full bg-white p-4 ring-1 ring-black/5 transition hover:ring-2 hover:ring-[color:var(--navy-mid)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--navy-mid)]"
        >
          <div
            className="absolute inset-0 rounded-full opacity-20"
            style={{ background: gaugeGradient(r.score) }}
          />
          <div
            className="absolute inset-2 rounded-full"
            style={{ background: gaugeGradient(r.score) }}
          />
          <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
            <span className="font-display text-6xl font-semibold tracking-tighter text-[color:var(--navy-dark)]">
              {r.score}
            </span>
            <span className="text-xs font-medium uppercase tracking-widest text-[color:var(--navy-light)]">
              Score
            </span>
          </div>
        </button>
        <div
          className={`mt-6 rounded-full px-4 py-1.5 text-sm font-semibold uppercase tracking-wide ring-1 ${scoreChip(r.score)}`}
        >
          {r.categoryLabel}
        </div>
        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[color:var(--navy-mid)] underline-offset-4 hover:underline"
        >
          <Info className="size-3" /> Aufschlüsselung anzeigen
        </button>
      </section>


      {/* Metrics 3-up */}
      <section className="mb-10 grid grid-cols-3 gap-3">
        <Metric label="Bruttorendite" value={pct(r.grossYield)} />
        <Metric label="Nettorendite" value={pct(r.netYield)} />
        <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--navy-light)]">
            Cashflow / Mo.
          </p>
          <p className={`font-display text-lg font-semibold ${cashflowColor}`}>
            {chf(Math.round(r.monthlyCashflow))}
          </p>
        </div>
        <Metric label="EK-Rendite" value={pct(r.equityReturn)} />
        <Metric label="Preis / m²" value={chf(Math.round(r.pricePerSqm))} />
        <Metric label="Fremdfinanz." value={pct(r.ltv, 0)} />
      </section>

      {/* Verdict — strukturiert */}
      <section className="mb-10 space-y-5 max-w-[64ch]">
        <div>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
            Gesamtbeurteilung
          </h2>
          <p className="text-base leading-relaxed text-[color:var(--navy-mid)]">
            {vs.overall}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <h3 className="mb-3 font-display text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
              Warum dieser Score? — Positiv
            </h3>
            <ul className="space-y-2">
              {vs.positives.length === 0 && (
                <li className="text-sm text-muted-foreground">Keine ausgeprägten Stärken.</li>
              )}
              {vs.positives.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-[color:var(--navy-dark)]">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <h3 className="mb-3 font-display text-[11px] font-semibold uppercase tracking-widest text-orange-700">
              Warum dieser Score? — Negativ
            </h3>
            <ul className="space-y-2">
              {vs.negatives.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  Keine wesentlichen Risiken erkannt.
                </li>
              )}
              {vs.negatives.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-[color:var(--navy-dark)]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`rounded-2xl p-5 ring-1 ${recommendationTone(vs.recommendation)}`}>
          <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
            Empfehlung
          </p>
          <p className="mt-1 font-display text-lg font-semibold">
            {vs.recommendationLabel}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {vs.recommendationReason}
          </p>
        </div>
      </section>

      {/* Lage-Sektion mit Karte */}
      {r.locationDetail && (
        <section className="mb-10 rounded-2xl bg-white p-5 ring-1 ring-black/5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-[color:var(--navy-light)]" />
              <h3 className="font-display text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-mid)]">
                Lage
              </h3>
            </div>
            <span className="font-display text-lg font-semibold text-[color:var(--navy-dark)]">
              {r.locationDetail.score}
              <span className="text-xs text-[color:var(--navy-light)]">/100</span>
            </span>
          </div>
          <p className="mb-3 text-sm text-[color:var(--navy-dark)]">
            {[a.inputs.street, a.inputs.zip, a.inputs.city].filter(Boolean).join(", ")}
          </p>
          {a.inputs.location?.latitude && a.inputs.location?.longitude ? (
            <div className="overflow-hidden rounded-xl ring-1 ring-black/5">
              <iframe
                title="Standort-Karte"
                loading="lazy"
                className="h-56 w-full border-0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${a.inputs.location.longitude - 0.006},${a.inputs.location.latitude - 0.003},${a.inputs.location.longitude + 0.006},${a.inputs.location.latitude + 0.003}&layer=mapnik&marker=${a.inputs.location.latitude},${a.inputs.location.longitude}`}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Keine Koordinaten verfügbar — Karte nicht ladbar.
            </p>
          )}
        </section>
      )}


      {finStatus && finStatus.investment > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="size-4 text-[color:var(--navy-light)]" />
            <h3 className="font-display text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-mid)]">
              Finanzierung
            </h3>
          </div>
          <div
            className={`rounded-2xl p-5 ring-1 ${
              finStatus.level === "insufficient"
                ? "bg-red-50 text-red-800 ring-red-700/20"
                : finStatus.level === "minimum"
                  ? "bg-amber-50 text-amber-800 ring-amber-700/20"
                  : "bg-emerald-50 text-emerald-800 ring-emerald-700/20"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
              Eigenkapitalquote {finStatus.equityPct.toFixed(1)} %
            </p>
            <p className="mt-1 font-display text-lg font-semibold">
              {finStatus.label}
            </p>
            <p className="mt-1 text-sm opacity-90">{finStatus.hint}</p>
            <p className="mt-3 text-[11px] opacity-70">
              Hinweis: Die tatsächliche Kreditentscheidung liegt bei der
              finanzierenden Bank. Diese Bewertung dient lediglich der Orientierung
              und ersetzt keine Bankprüfung.
            </p>
          </div>
        </section>
      )}

      {r.dataQualityMissing.length > 0 && (
        <section className="mb-10 rounded-2xl bg-white p-5 ring-1 ring-black/5">
          <div className="mb-2 flex items-center gap-2">
            <Info className="size-4 text-[color:var(--navy-light)]" />
            <h3 className="font-display text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-mid)]">
              Hinweis zur Datenqualität
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Fehlende Angaben:{" "}
            <span className="text-[color:var(--navy-dark)]">
              {r.dataQualityMissing.join(", ")}
            </span>
            . Ergänzen Sie diese für eine präzisere Analyse.
          </p>
        </section>
      )}

      <div className="mb-10 flex flex-col gap-3">
        <Button
          className="bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
          onClick={handleExportPdf}
          disabled={exporting}
        >
          {isPremium ? (
            <>
              <Download className="mr-2 size-4" />
              {exporting ? "PDF wird erstellt …" : "PDF-Bericht herunterladen"}
            </>
          ) : (
            <>
              <Lock className="mr-2 size-4" /> PDF-Bericht (Premium)
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            toast.success("Analyse ist bereits gespeichert.");
          }}
        >
          <Save className="mr-2 size-4" /> Analyse gespeichert
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/new", search: { id: a.id } })}
        >
          <Pencil className="mr-2 size-4" /> Eingaben bearbeiten
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-[color:var(--navy-dark)]">Rechtlicher Hinweis:</strong>{" "}
        Die Analyse von HomeIQ Invest basiert auf den vom Nutzer eingegebenen Daten und
        allgemeinen Berechnungsmodellen. Sie stellt keine Anlage-, Steuer-, Rechts-,
        Finanzierungs- oder Kaufberatung dar. Vor einem Immobilienkauf sind die Angaben
        durch qualifizierte Fachpersonen zu prüfen. Die Eigenkapitalrendite berücksichtigt
        keine Wertsteigerungen, Steuern oder Verkaufskosten.
      </p>

      <ScoreBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        result={r}
      />
    </AppShell>
  );
}
