import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Save, MapPin, Loader2, Plus, Trash2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OBJECT_TYPES,
  FLOOR_OPTIONS,
  ROOM_OPTIONS,
  BATHROOM_OPTIONS,
  COMMERCIAL_USAGE_OPTIONS,
  emptyInputs,
} from "@/lib/homeiq/types";
import type {
  AnalysisInputs,
  MfhUnit,
  MfhCommercialUnit,
  CommercialUsage,
  ObjectType,
} from "@/lib/homeiq/types";
import { computeMortgage } from "@/lib/homeiq/calc";
import { financingStatus } from "@/lib/homeiq/financingStatus";
import { getAnalysis, saveAnalysis } from "@/lib/homeiq/storage";
import { enrichLocation } from "@/lib/homeiq/location.functions";
import {
  consumeGuestQuota,
  consumeUserQuota,
  getGuestQuota,
  getUserQuota,
} from "@/lib/homeiq/quota.functions";
import { getDeviceId } from "@/lib/homeiq/deviceId";
import { useAuth } from "@/hooks/useAuth";
import { PaywallDialog } from "@/components/PaywallDialog";
import {
  MarketRentDialog,
  PurchasePriceDialog,
} from "@/components/PremiumAiDialogs";
import {
  estimateMarketRent,
  estimateOptimalPrice,
  type MarketRentResult,
  type PurchasePriceResult,
} from "@/lib/homeiq/premium.functions";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/new")({
  validateSearch: searchSchema,
  component: NewAnalysis,
});

const STEPS = [
  "Objektart",
  "Objektdaten",
  "Finanzierung",
  "Einnahmen",
] as const;

function num(v: string): number | undefined {
  if (v === "") return undefined;
  const n = Number(v.replace(/[' ]/g, ""));
  return isNaN(n) ? undefined : n;
}

function makeUnitId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function NumberInput({
  value,
  onChange,
  suffix,
  placeholder,
  min,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  placeholder?: string;
  min?: number;
}) {
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={value === undefined || value === 0 ? "" : String(value)}
        placeholder={placeholder}
        onChange={(e) => {
          const n = num(e.target.value);
          if (n === undefined) onChange(undefined);
          else if (min !== undefined && n < min) onChange(min);
          else onChange(n);
        }}
        className={suffix ? "pr-14" : ""}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-[color:var(--navy-dark)]">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NewAnalysis() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState<AnalysisInputs>(() => emptyInputs());
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  // Premium AI: Marktmiete
  const [rentOpen, setRentOpen] = useState(false);
  const [rentLoading, setRentLoading] = useState(false);
  const [rentResult, setRentResult] = useState<MarketRentResult | null>(null);

  // Premium AI: Kaufpreis
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceResult, setPriceResult] = useState<PurchasePriceResult | null>(null);

  const enrichFn = useServerFn(enrichLocation);
  const getGuest = useServerFn(getGuestQuota);
  const consumeGuest = useServerFn(consumeGuestQuota);
  const getUser = useServerFn(getUserQuota);
  const consumeUser = useServerFn(consumeUserQuota);
  const rentFn = useServerFn(estimateMarketRent);
  const priceFn = useServerFn(estimateOptimalPrice);

  // Premium-Status laden (nur eingeloggt möglich)
  useEffect(() => {
    if (!user) {
      setIsPremium(false);
      return;
    }
    getUser()
      .then((q) => setIsPremium(!!q.isPremium))
      .catch(() => setIsPremium(false));
  }, [user, getUser]);

  useEffect(() => {
    if (!id) return;
    getAnalysis(id).then((a) => {
      if (a) setInputs(a.inputs);
    });
  }, [id]);

  const update = <K extends keyof AnalysisInputs>(k: K, v: AnalysisInputs[K]) =>
    setInputs((s) => ({ ...s, [k]: v }));

  const isApartment = inputs.objectType === "eigentumswohnung";
  const isMfh = inputs.objectType === "mfh";
  const isHouse = !isApartment && !isMfh;

  const autoMortgage = useMemo(() => computeMortgage(inputs), [inputs]);
  const finStatus = useMemo(() => financingStatus(inputs), [inputs]);

  const unitsSummary = useMemo(() => {
    const units = inputs.mfhUnits ?? [];
    const occupied = units.filter((u) => !u.vacant);
    const totalRent = occupied.reduce((s, u) => s + (u.monthlyRent ?? 0), 0);
    const totalArea = units.reduce((s, u) => s + (u.area ?? 0), 0);
    const avgRoomsSrc = units.filter((u) => typeof u.rooms === "number");
    const avgRooms =
      avgRoomsSrc.length > 0
        ? avgRoomsSrc.reduce((s, u) => s + (u.rooms ?? 0), 0) / avgRoomsSrc.length
        : 0;
    const rentPerSqm = totalArea > 0 ? totalRent / totalArea : 0;
    const vacancy = units.length > 0 ? (units.length - occupied.length) / units.length : 0;
    return {
      count: units.length,
      occupied: occupied.length,
      vacant: units.length - occupied.length,
      totalRent,
      totalArea,
      avgRooms,
      rentPerSqm,
      vacancyPct: vacancy * 100,
    };
  }, [inputs.mfhUnits]);

  // MFH: Gesamtwohnfläche automatisch aus Wohneinheiten synchronisieren.
  useEffect(() => {
    if (inputs.objectType !== "mfh") return;
    const total = (inputs.mfhUnits ?? []).reduce((s, u) => s + (u.area ?? 0), 0);
    if (total !== inputs.livingArea) {
      setInputs((s) => ({ ...s, livingArea: total }));
    }
  }, [inputs.objectType, inputs.mfhUnits, inputs.livingArea]);

  const parking = useMemo(() => {
    const f = inputs.features;
    const items = [
      { key: "garageRentPerUnit" as const, label: "Garage", count: f.garage + f.doubleGarage, rent: inputs.garageRentPerUnit ?? 0 },
      { key: "undergroundRentPerUnit" as const, label: "Tiefgaragenplatz", count: f.undergroundParking, rent: inputs.undergroundRentPerUnit ?? 0 },
      { key: "outdoorRentPerUnit" as const, label: "Aussenparkplatz", count: f.outdoorParking, rent: inputs.outdoorRentPerUnit ?? 0 },
      { key: "carportRentPerUnit" as const, label: "Carport", count: f.carport, rent: inputs.carportRentPerUnit ?? 0 },
    ];
    const totalUnits = items.reduce((s, x) => s + x.count, 0);
    const totalMonthly = items.reduce((s, x) => s + x.count * x.rent, 0);
    return { items, totalUnits, totalMonthly };
  }, [inputs.features, inputs.garageRentPerUnit, inputs.undergroundRentPerUnit, inputs.outdoorRentPerUnit, inputs.carportRentPerUnit]);

  const commercialSummary = useMemo(() => {
    const units = inputs.mfhCommercialUnits ?? [];
    const occupied = units.filter((u) => !u.vacant);
    const totalRent = occupied.reduce((s, u) => s + (u.monthlyRent ?? 0), 0);
    const totalArea = units.reduce((s, u) => s + (u.area ?? 0), 0);
    return {
      count: units.length,
      occupied: occupied.length,
      vacant: units.length - occupied.length,
      totalRent,
      totalArea,
    };
  }, [inputs.mfhCommercialUnits]);


  function validateStep(s: number): string | null {
    if (s === 1) {
      // Allgemein
      if (!(inputs.purchasePrice > 0)) return "Kaufpreis muss grösser als 0 sein.";
      const year = new Date().getFullYear();
      if (inputs.yearBuilt < 1700 || inputs.yearBuilt > year + 5)
        return "Baujahr unplausibel.";
      if (!/^\d{4}$/.test(inputs.zip)) return "PLZ muss vierstellig sein.";
      if (!inputs.city.trim()) return "Ort ist erforderlich.";
      // Details
      if (!isMfh && !(inputs.livingArea > 0))
        return "Wohnfläche muss grösser als 0 sein.";
      if (isMfh) {
        const units = inputs.mfhUnits ?? [];
        if (units.length === 0)
          return "Bitte mindestens eine Wohneinheit erfassen.";
        const totalArea = units.reduce((sum, u) => sum + (u.area ?? 0), 0);
        if (totalArea <= 0)
          return "Bitte für die Einheiten eine Wohnfläche erfassen.";
      }
    }
    if (s === 2) {
      if (!(inputs.equity > 0)) return "Eigenkapital muss angegeben werden.";
      if (inputs.interestRate < 0) return "Hypothekarzins darf nicht negativ sein.";
    }
    if (s === 3) {
      if (isMfh) {
        if (unitsSummary.totalRent <= 0)
          return "Bitte mindestens eine belegte Einheit mit Nettomiete erfassen.";
      } else {
        if (!(inputs.monthlyRent > 0)) return "Nettomiete pro Monat ist erforderlich.";
      }
    }
    return null;
  }

  function requirePremiumOrPaywall(): boolean {
    if (isPremium) return true;
    setPaywallOpen(true);
    return false;
  }

  async function handleEstimateRent() {
    if (!requirePremiumOrPaywall()) return;
    if (!/^\d{4}$/.test(inputs.zip) || !inputs.city.trim()) {
      toast.error("PLZ und Ort werden für die Marktmiete-Schätzung benötigt.");
      return;
    }
    setRentResult(null);
    setRentOpen(true);
    setRentLoading(true);
    try {
      const res = await rentFn({
        data: {
          objectType: inputs.objectType,
          zip: inputs.zip,
          city: inputs.city,
          street: inputs.street || undefined,
          houseNumber: inputs.houseNumber || undefined,
          gemeinde: inputs.location?.gemeinde,
          kanton: inputs.location?.kanton,
          livingArea: inputs.livingArea || undefined,
          rooms: inputs.rooms || undefined,
          bathrooms: inputs.bathrooms || undefined,
          yearBuilt: inputs.yearBuilt || undefined,
          lastRenovation: inputs.lastRenovation,
          floor: inputs.floor,
          features: inputs.features as unknown as Record<
            string,
            boolean | number
          >,
          refPricePerSqm: inputs.location?.refPricePerSqm,
        },
      });
      setRentResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("PREMIUM_REQUIRED")) {
        setRentOpen(false);
        setPaywallOpen(true);
      } else if (msg.includes("AI_CREDITS_EXHAUSTED")) {
        toast.error("AI-Guthaben aufgebraucht — bitte später erneut versuchen.");
        setRentOpen(false);
      } else if (msg.includes("AI_RATE_LIMIT")) {
        toast.error("Zu viele Anfragen — bitte kurz warten.");
        setRentOpen(false);
      } else {
        console.error(e);
        toast.error("Marktmiete konnte nicht geschätzt werden.");
        setRentOpen(false);
      }
    } finally {
      setRentLoading(false);
    }
  }

  async function handleEstimatePrice() {
    if (!requirePremiumOrPaywall()) return;
    if (!(inputs.purchasePrice > 0)) {
      toast.error("Bitte zuerst einen Kaufpreis eingeben.");
      return;
    }
    if (!/^\d{4}$/.test(inputs.zip) || !inputs.city.trim()) {
      toast.error("PLZ und Ort werden für die Kaufpreisanalyse benötigt.");
      return;
    }
    setPriceResult(null);
    setPriceOpen(true);
    setPriceLoading(true);
    try {
      const res = await priceFn({
        data: {
          objectType: inputs.objectType,
          zip: inputs.zip,
          city: inputs.city,
          street: inputs.street || undefined,
          houseNumber: inputs.houseNumber || undefined,
          gemeinde: inputs.location?.gemeinde,
          kanton: inputs.location?.kanton,
          livingArea: inputs.livingArea || undefined,
          rooms: inputs.rooms || undefined,
          bathrooms: inputs.bathrooms || undefined,
          yearBuilt: inputs.yearBuilt || undefined,
          lastRenovation: inputs.lastRenovation,
          floor: inputs.floor,
          // Bewusst KEIN currentAskingPrice und KEINE monthlyRent — Marktwert
          // muss unabhängig von der Nutzereingabe geschätzt werden.
          features: inputs.features as unknown as Record<
            string,
            boolean | number
          >,
          refPricePerSqm: inputs.location?.refPricePerSqm,
        },
      });
      setPriceResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("PREMIUM_REQUIRED")) {
        setPriceOpen(false);
        setPaywallOpen(true);
      } else if (msg.includes("AI_CREDITS_EXHAUSTED")) {
        toast.error("AI-Guthaben aufgebraucht — bitte später erneut versuchen.");
        setPriceOpen(false);
      } else if (msg.includes("AI_RATE_LIMIT")) {
        toast.error("Zu viele Anfragen — bitte kurz warten.");
        setPriceOpen(false);
      } else {
        console.error(e);
        toast.error("Kaufpreisanalyse konnte nicht erstellt werden.");
        setPriceOpen(false);
      }
    } finally {
      setPriceLoading(false);
    }
  }

  async function handleEnrich() {
    if (!/^\d{4}$/.test(inputs.zip) || !inputs.city.trim()) {
      toast.error("PLZ und Ort werden für die Anreicherung benötigt.");
      return;
    }
    setEnriching(true);
    try {
      const loc = await enrichFn({
        data: {
          zip: inputs.zip,
          city: inputs.city,
          street: inputs.street,
          houseNumber: inputs.houseNumber,
        },
      });
      setInputs((s) => ({ ...s, location: loc }));
      if (loc.geocodingFailed) {
        toast.warning("Adresse nicht gefunden — Berechnung mit Standardwerten.");
      } else {
        toast.success(
          loc.gemeinde
            ? `Standortdaten geladen: ${loc.gemeinde}${loc.kanton ? ", " + loc.kanton : ""}`
            : "Standort geladen (keine Gemeindedaten).",
        );
      }
    } catch (e) {
      console.error(e);
      toast.error("Standortdaten konnten nicht geladen werden.");
    } finally {
      setEnriching(false);
    }
  }

  async function checkQuota(): Promise<boolean> {
    if (id) return true;
    try {
      if (user) {
        const q = await getUser();
        if (!q.isPremium && q.remaining <= 0) return false;
      } else {
        const q = await getGuest({ data: { deviceId: getDeviceId() } });
        if (q.remaining <= 0) return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      return true;
    }
  }

  async function handleSave() {
    for (let s = 1; s <= 3; s++) {
      const err = validateStep(s);
      if (err) {
        toast.error(err);
        setStep(s);
        return;
      }
    }
    if (!(await checkQuota())) {
      setPaywallOpen(true);
      return;
    }
    setSaving(true);
    try {
      let finalInputs = inputs;
      if (!inputs.location) {
        try {
          const loc = await enrichFn({
            data: {
              zip: inputs.zip,
              city: inputs.city,
              street: inputs.street,
              houseNumber: inputs.houseNumber,
            },
          });
          finalInputs = { ...inputs, location: loc };
          setInputs(finalInputs);
        } catch (e) {
          console.error("Enrich failed on save", e);
        }
      }
      const rec = await saveAnalysis(finalInputs, id);
      if (!id) {
        try {
          if (user) await consumeUser();
          else await consumeGuest({ data: { deviceId: getDeviceId() } });
        } catch (e: unknown) {
          if (e instanceof Error && e.message.includes("QUOTA_EXCEEDED")) {
            setPaywallOpen(true);
            return;
          }
          console.error(e);
        }
      }
      toast.success("Analyse gespeichert");
      navigate({ to: "/analysis/$id", params: { id: rec.id } });
    } catch (e) {
      console.error(e);
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else void handleSave();
  }

  function addUnit() {
    const list = inputs.mfhUnits ?? [];
    const nextLabel = `Wohnung ${list.length + 1}`;
    const unit: MfhUnit = {
      id: makeUnitId(),
      label: nextLabel,
      rooms: 3.5,
      bathrooms: 1,
      vacant: false,
    };
    update("mfhUnits", [...list, unit]);
  }

  function patchUnit(id: string, patch: Partial<MfhUnit>) {
    const list = (inputs.mfhUnits ?? []).map((u) =>
      u.id === id ? { ...u, ...patch } : u,
    );
    update("mfhUnits", list);
  }

  function removeUnit(id: string) {
    update("mfhUnits", (inputs.mfhUnits ?? []).filter((u) => u.id !== id));
  }

  function addCommercial() {
    const list = inputs.mfhCommercialUnits ?? [];
    const unit: MfhCommercialUnit = {
      id: makeUnitId(),
      label: `Gewerbe ${list.length + 1}`,
      vacant: false,
    };
    update("mfhCommercialUnits", [...list, unit]);
  }

  function patchCommercial(id: string, patch: Partial<MfhCommercialUnit>) {
    const list = (inputs.mfhCommercialUnits ?? []).map((u) =>
      u.id === id ? { ...u, ...patch } : u,
    );
    update("mfhCommercialUnits", list);
  }

  function removeCommercial(id: string) {
    update(
      "mfhCommercialUnits",
      (inputs.mfhCommercialUnits ?? []).filter((u) => u.id !== id),
    );
  }

  const finToneCls: Record<string, string> = {
    insufficient: "bg-red-50 text-red-800 ring-red-700/20",
    minimum: "bg-amber-50 text-amber-800 ring-amber-700/20",
    solid: "bg-emerald-50 text-emerald-800 ring-emerald-700/20",
    very_solid: "bg-emerald-50 text-emerald-800 ring-emerald-700/20",
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-[color:var(--navy-light)]"
        >
          <ArrowLeft className="size-3" /> Zurück zum Dashboard
        </Link>
        <div className="mt-4 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
            Schritt {step + 1} / {STEPS.length}
          </p>
          <p className="text-xs text-muted-foreground">{STEPS[step]}</p>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="mt-2 h-1" />
      </div>

      <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold">Objektart wählen</h2>
            <p className="text-sm text-muted-foreground">
              Wählen Sie den Typ der Immobilie. Nur passende Felder werden angezeigt.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OBJECT_TYPES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("objectType", o.value as ObjectType)}
                  className={`rounded-xl border p-4 text-left transition ${
                    inputs.objectType === o.value
                      ? "border-[color:var(--navy-mid)] bg-[color:var(--navy-wash)]/60 ring-1 ring-[color:var(--navy-mid)]"
                      : "border-black/5 bg-white hover:border-black/20"
                  }`}
                >
                  <p className="font-display text-sm font-semibold text-[color:var(--navy-dark)]">
                    {o.label}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold">
              {isMfh ? "Gebäudedaten" : "Allgemeine Objektdaten"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Der Titel der Analyse wird automatisch aus Ort, Zimmerzahl und Objektart
              generiert.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Kaufpreis" required>
                  <NumberInput
                    value={inputs.purchasePrice}
                    onChange={(v) => update("purchasePrice", v ?? 0)}
                    suffix="CHF"
                    min={0}
                  />
                </Field>
              </div>
              {!isMfh && (
                <Field label="Wohnfläche" required>
                  <NumberInput
                    value={inputs.livingArea}
                    onChange={(v) => update("livingArea", v ?? 0)}
                    suffix="m²"
                    min={0}
                  />
                </Field>
              )}

              {!isMfh && (
                <>
                  <Field label="Anzahl Zimmer" required>
                    <Select
                      value={String(inputs.rooms)}
                      onValueChange={(v) => update("rooms", Number(v))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROOM_OPTIONS.map((r) => (
                          <SelectItem key={r} value={String(r)}>
                            {r === 10 ? "10 oder mehr" : r.toString().replace(".", ",")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Anzahl Badezimmer" required>
                    <Select
                      value={String(inputs.bathrooms)}
                      onValueChange={(v) => update("bathrooms", Number(v))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BATHROOM_OPTIONS.map((b) => (
                          <SelectItem key={b} value={String(b)}>
                            {b === 6 ? "6 oder mehr" : String(b)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              {isMfh && inputs.livingArea > 0 && (
                <div className="col-span-2 rounded-lg bg-[color:var(--navy-wash)]/40 px-3 py-2 text-[11px] text-[color:var(--navy-mid)]">
                  Gesamtwohnfläche automatisch: {inputs.livingArea} m² (Summe der Einheiten)
                </div>
              )}



              <Field label="Baujahr" required>
                <NumberInput
                  value={inputs.yearBuilt}
                  onChange={(v) => update("yearBuilt", v ?? new Date().getFullYear())}
                />
              </Field>
              <Field label="Letzte Renovation">
                <NumberInput
                  value={inputs.lastRenovation}
                  onChange={(v) => update("lastRenovation", v)}
                />
              </Field>
              <Field label="PLZ" required>
                <Input
                  value={inputs.zip}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) =>
                    update("zip", e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                />
              </Field>
              <Field label="Ort" required>
                <Input
                  value={inputs.city}
                  onChange={(e) => update("city", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Strasse (optional)">
                <Input
                  value={inputs.street ?? ""}
                  onChange={(e) => update("street", e.target.value)}
                />
              </Field>
              <Field label="Hausnr.">
                <Input
                  value={inputs.houseNumber ?? ""}
                  onChange={(e) => update("houseNumber", e.target.value)}
                />
              </Field>
            </div>
            <div className="rounded-xl border border-dashed border-[color:var(--navy-mid)]/40 bg-[color:var(--navy-wash)]/40 p-3">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 text-[color:var(--navy-mid)]" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[color:var(--navy-dark)]">
                    Standortdaten automatisch laden
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Leerstand, Steuern, Bevölkerung, Geo-Koordinaten — direkt aus offenen
                    Quellen (OSM, BFS).
                  </p>
                  {inputs.location && !inputs.location.geocodingFailed && (
                    <p className="mt-1 text-[11px] text-[color:var(--navy-mid)]">
                      ✓ {inputs.location.gemeinde ?? inputs.location.address.city}
                      {inputs.location.kanton ? `, ${inputs.location.kanton}` : ""}
                      {typeof inputs.location.vacancyPct === "number"
                        ? ` · Leerstand ${inputs.location.vacancyPct.toFixed(2)} %`
                        : ""}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleEnrich}
                  disabled={enriching}
                >
                  {enriching ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : inputs.location ? (
                    "Neu laden"
                  ) : (
                    "Laden"
                  )}
                </Button>
              </div>
            </div>

            {isHouse && (
              <Field label="Grundstücksfläche (optional)">
                <NumberInput
                  value={inputs.landArea}
                  onChange={(v) => update("landArea", v)}
                  suffix="m²"
                />
              </Field>
            )}
            <Field label="Notiz (optional)">
              <Textarea
                value={inputs.note ?? ""}
                onChange={(e) => update("note", e.target.value)}
                rows={2}
              />
            </Field>

            <div className="pt-2">
              <h3 className="font-display text-base font-semibold text-[color:var(--navy-dark)]">
                {isMfh ? "Wohn- und Gewerbeeinheiten" : "Details"}
              </h3>
            </div>

            {isMfh && (
              <>
                <div>
                  <h3 className="font-display text-sm font-semibold text-[color:var(--navy-dark)]">
                    Wohneinheiten
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Erfassen Sie jede Wohneinheit einzeln. Gesamtmiete, Wohnfläche und
                    Leerstandsquote werden automatisch summiert.
                  </p>
                </div>

                <div className="space-y-3">
                  {(inputs.mfhUnits ?? []).map((u, idx) => (
                    <div
                      key={u.id}
                      className="rounded-xl border border-black/5 bg-[color:var(--navy-wash)]/30 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Input
                          value={u.label}
                          onChange={(e) => patchUnit(u.id, { label: e.target.value })}
                          placeholder={`Wohnung ${idx + 1}`}
                          className="h-8 max-w-[60%] text-sm"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeUnit(u.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Zimmer">
                          <Select
                            value={u.rooms !== undefined ? String(u.rooms) : ""}
                            onValueChange={(v) => patchUnit(u.id, { rooms: Number(v) })}
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {ROOM_OPTIONS.map((r) => (
                                <SelectItem key={r} value={String(r)}>
                                  {r === 10 ? "10+" : r.toString().replace(".", ",")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Fläche">
                          <NumberInput
                            value={u.area}
                            onChange={(v) => patchUnit(u.id, { area: v })}
                            suffix="m²"
                          />
                        </Field>
                        <Field label="Badezimmer">
                          <Select
                            value={u.bathrooms !== undefined ? String(u.bathrooms) : ""}
                            onValueChange={(v) => patchUnit(u.id, { bathrooms: Number(v) })}
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {BATHROOM_OPTIONS.map((b) => (
                                <SelectItem key={b} value={String(b)}>
                                  {b === 6 ? "6+" : String(b)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Nettomiete / Mo.">
                          <NumberInput
                            value={u.monthlyRent}
                            onChange={(v) => patchUnit(u.id, { monthlyRent: v })}
                            suffix="CHF"
                          />
                        </Field>
                        <Field label="Stockwerk">
                          <Select
                            value={u.floor ?? ""}
                            onValueChange={(v) =>
                              patchUnit(u.id, { floor: (v || undefined) as MfhUnit["floor"] })
                            }
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {FLOOR_OPTIONS.map((f) => (
                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-xs text-[color:var(--navy-dark)]">
                        <Checkbox
                          checked={!!u.vacant}
                          onCheckedChange={(v) => patchUnit(u.id, { vacant: !!v })}
                        />
                        Leerstehend / nicht vermietet
                      </label>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addUnit}
                    className="w-full"
                  >
                    <Plus className="mr-2 size-4" />
                    Weitere Wohneinheit hinzufügen
                  </Button>
                </div>

                {unitsSummary.count > 0 && (
                  <div className="mt-2 rounded-xl bg-[color:var(--navy-wash)]/50 p-3 text-xs text-[color:var(--navy-dark)]">
                    <p className="font-semibold">Zusammenfassung</p>
                    <p className="mt-1 text-[color:var(--navy-mid)]">
                      {unitsSummary.count} Einheit(en) · {unitsSummary.occupied} belegt ·{" "}
                      {unitsSummary.vacant} leer · Leerstand{" "}
                      {unitsSummary.vacancyPct.toFixed(0)} %
                    </p>
                    <p className="text-[color:var(--navy-mid)]">
                      Miete gesamt CHF{" "}
                      {Math.round(unitsSummary.totalRent).toLocaleString("de-CH")} / Mo.
                      {unitsSummary.rentPerSqm > 0 &&
                        ` · Ø CHF ${unitsSummary.rentPerSqm.toFixed(2)} / m²`}
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <h3 className="font-display text-sm font-semibold text-[color:var(--navy-dark)]">
                    Gewerbeeinheiten
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional. Nettomieten belegter Gewerbeeinheiten fliessen automatisch
                    in die Gesamteinnahmen ein.
                  </p>
                </div>

                <div className="space-y-3">
                  {(inputs.mfhCommercialUnits ?? []).map((u, idx) => (
                    <div
                      key={u.id}
                      className="rounded-xl border border-black/5 bg-[color:var(--navy-wash)]/30 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Input
                          value={u.label}
                          onChange={(e) =>
                            patchCommercial(u.id, { label: e.target.value })
                          }
                          placeholder={`Gewerbe ${idx + 1}`}
                          className="h-8 max-w-[60%] text-sm"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeCommercial(u.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Nutzfläche">
                          <NumberInput
                            value={u.area}
                            onChange={(v) => patchCommercial(u.id, { area: v })}
                            suffix="m²"
                          />
                        </Field>
                        <Field label="Nettomiete / Mo.">
                          <NumberInput
                            value={u.monthlyRent}
                            onChange={(v) =>
                              patchCommercial(u.id, { monthlyRent: v })
                            }
                            suffix="CHF"
                          />
                        </Field>
                        <Field label="Stockwerk">
                          <Select
                            value={u.floor ?? ""}
                            onValueChange={(v) =>
                              patchCommercial(u.id, {
                                floor: (v || undefined) as MfhCommercialUnit["floor"],
                              })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {FLOOR_OPTIONS.map((f) => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Nutzungsart">
                          <Select
                            value={u.usage ?? ""}
                            onValueChange={(v) =>
                              patchCommercial(u.id, {
                                usage: (v || undefined) as CommercialUsage,
                              })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMERCIAL_USAGE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-xs text-[color:var(--navy-dark)]">
                        <Checkbox
                          checked={!!u.vacant}
                          onCheckedChange={(v) =>
                            patchCommercial(u.id, { vacant: !!v })
                          }
                        />
                        Leerstehend / nicht vermietet
                      </label>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCommercial}
                    className="w-full"
                  >
                    <Plus className="mr-2 size-4" />
                    Gewerbeeinheit hinzufügen
                  </Button>
                </div>

                {commercialSummary.count > 0 && (
                  <div className="rounded-xl bg-[color:var(--navy-wash)]/50 p-3 text-xs text-[color:var(--navy-dark)]">
                    <p className="font-semibold">Gewerbe – Zusammenfassung</p>
                    <p className="mt-1 text-[color:var(--navy-mid)]">
                      {commercialSummary.count} Einheit(en) ·{" "}
                      {commercialSummary.occupied} vermietet ·{" "}
                      {commercialSummary.vacant} leer
                      {commercialSummary.totalArea > 0 &&
                        ` · ${commercialSummary.totalArea} m² Nutzfläche`}
                    </p>
                    <p className="text-[color:var(--navy-mid)]">
                      Miete gesamt CHF{" "}
                      {Math.round(commercialSummary.totalRent).toLocaleString("de-CH")}{" "}
                      / Mo. · CHF{" "}
                      {Math.round(commercialSummary.totalRent * 12).toLocaleString("de-CH")}{" "}
                      / Jahr
                    </p>
                  </div>
                )}
              </>
            )}

            {!isMfh && isApartment && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stockwerk">
                  <Select
                    value={inputs.floor ?? ""}
                    onValueChange={(v) => update("floor", (v || undefined) as AnalysisInputs["floor"])}
                  >
                    <SelectTrigger><SelectValue placeholder="Wählen …" /></SelectTrigger>
                    <SelectContent>
                      {FLOOR_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Stockwerke gesamt">
                  <NumberInput
                    value={inputs.totalFloors}
                    onChange={(v) => update("totalFloors", v)}
                  />
                </Field>
              </div>
            )}

            {!isMfh && !isApartment && (
              <p className="text-sm text-muted-foreground">
                Für {OBJECT_TYPES.find((o) => o.value === inputs.objectType)?.label} sind
                keine wohnungsspezifischen Angaben erforderlich. Weiter zu Ausstattung.
              </p>
            )}

            <h3 className="pt-2 font-display text-base font-semibold text-[color:var(--navy-dark)]">
              Ausstattung
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["balcony", "Balkon"],
                  ["terrace", "Terrasse"],
                  ["garden", "Garten"],
                  ["cellar", "Keller"],
                  ["storage", "Reduit"],
                  ["elevator", "Lift"],
                  ["pool", "Pool"],
                  ["whirlpool", "Whirlpool"],
                  ["sauna", "Sauna"],
                  ["washingMachine", "Eigene Waschmaschine"],
                  ["tumbler", "Eigener Tumbler"],
                ] as const
              ).map(([k, l]) => (
                <label
                  key={k}
                  className="flex items-center gap-2 rounded-xl border border-black/5 bg-white px-3 py-2.5 text-sm"
                >
                  <Checkbox
                    checked={inputs.features[k]}
                    onCheckedChange={(v) =>
                      update("features", { ...inputs.features, [k]: !!v })
                    }
                  />
                  {l}
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[color:var(--navy-dark)]">
                Parkierung (Anzahl)
              </Label>
              {(
                [
                  ["garage", "Garage"],
                  ["doubleGarage", "Doppelgarage"],
                  ["undergroundParking", "Tiefgaragenplatz"],
                  ["carport", "Carport"],
                  ["outdoorParking", "Aussenparkplatz"],
                ] as const
              ).map(([k, l]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-xl border border-black/5 bg-white px-3 py-2"
                >
                  <span className="text-sm">{l}</span>
                  <div className="w-20">
                    <NumberInput
                      value={inputs.features[k]}
                      onChange={(v) =>
                        update("features", { ...inputs.features, [k]: v ?? 0 })
                      }
                      min={0}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200/60 bg-amber-50/40 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-800">
                Premium
              </p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--navy-dark)]">
                Optimalen Kaufpreis berechnen
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                HomeIQ nutzt jetzt alle erfassten Objekt-, Lage- und Ausstattungsdaten,
                um den Marktwert unabhängig vom eingegebenen Kaufpreis zu schätzen.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEstimatePrice}
                disabled={priceLoading}
                className="mt-3 w-full border-[color:var(--navy-mid)]/30 text-[color:var(--navy-dark)]"
              >
                {priceLoading ? (
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 size-3.5 text-[color:var(--navy-mid)]" />
                )}
                Optimalen Kaufpreis berechnen (Premium)
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold">Finanzierung</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Eigenkapital" required>
                <NumberInput
                  value={inputs.equity}
                  onChange={(v) => update("equity", v ?? 0)}
                  suffix="CHF"
                />
              </Field>
              <Field label="Hypothekarzins" required>
                <NumberInput
                  value={inputs.interestRate}
                  onChange={(v) => update("interestRate", v ?? 0)}
                  suffix="%"
                />
              </Field>
              <Field
                label="Hypothek"
                hint={
                  inputs.mortgage === undefined
                    ? `Automatisch: CHF ${autoMortgage.toLocaleString("de-CH")}`
                    : "Manuell überschrieben"
                }
              >
                <NumberInput
                  value={inputs.mortgage}
                  onChange={(v) => update("mortgage", v)}
                  suffix="CHF"
                  placeholder={autoMortgage.toLocaleString("de-CH")}
                />
              </Field>
              <Field label="Amortisation / Jahr">
                <NumberInput
                  value={inputs.amortization}
                  onChange={(v) => update("amortization", v)}
                  suffix="CHF"
                />
              </Field>
              <Field label="Kaufnebenkosten">
                <NumberInput
                  value={inputs.purchaseCosts}
                  onChange={(v) => update("purchaseCosts", v)}
                  suffix="CHF"
                />
              </Field>
              <Field label="Renovation einmalig">
                <NumberInput
                  value={inputs.renovationCosts}
                  onChange={(v) => update("renovationCosts", v)}
                  suffix="CHF"
                />
              </Field>
              <Field label="Rückstellungen / Jahr">
                <NumberInput
                  value={inputs.maintenance}
                  onChange={(v) => update("maintenance", v)}
                  suffix="CHF"
                />
              </Field>
              <Field label="Verwaltung / Jahr">
                <NumberInput
                  value={inputs.management}
                  onChange={(v) => update("management", v)}
                  suffix="CHF"
                />
              </Field>
              {isApartment && (
                <Field label="Erneuerungsfonds / Jahr">
                  <NumberInput
                    value={inputs.renewalFund}
                    onChange={(v) => update("renewalFund", v)}
                    suffix="CHF"
                  />
                </Field>
              )}
            </div>

            {finStatus.investment > 0 && (
              <div className={`rounded-2xl p-4 ring-1 ${finToneCls[finStatus.level]}`}>
                <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
                  Eigenkapitalquote {finStatus.equityPct.toFixed(1)} %
                </p>
                <p className="mt-1 font-display text-sm font-semibold">
                  {finStatus.label}
                </p>
                <p className="mt-1 text-xs opacity-90">{finStatus.hint}</p>
                <p className="mt-2 text-[10px] opacity-70">
                  Hinweis: Die tatsächliche Kreditentscheidung liegt bei der
                  finanzierenden Bank.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold">Einnahmen</h2>

            {isMfh && (
              <>
                <div className="rounded-2xl bg-[color:var(--navy-wash)]/50 p-4 text-xs text-[color:var(--navy-dark)]">
                  <p className="font-semibold">Wohnungsmieten (aus Wohneinheiten)</p>
                  <p className="mt-1 text-[color:var(--navy-mid)]">
                    CHF {Math.round(unitsSummary.totalRent).toLocaleString("de-CH")} / Monat · CHF{" "}
                    {Math.round(unitsSummary.totalRent * 12).toLocaleString("de-CH")} / Jahr
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Automatisch aus den erfassten Wohneinheiten summiert.
                  </p>
                </div>

                <div className="rounded-2xl bg-[color:var(--navy-wash)]/50 p-4 text-xs text-[color:var(--navy-dark)]">
                  <p className="font-semibold">Gewerbemieten (aus Gewerbeeinheiten)</p>
                  <p className="mt-1 text-[color:var(--navy-mid)]">
                    CHF {Math.round(commercialSummary.totalRent).toLocaleString("de-CH")} / Monat · CHF{" "}
                    {Math.round(commercialSummary.totalRent * 12).toLocaleString("de-CH")} / Jahr
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {commercialSummary.count === 0
                      ? "Keine Gewerbeeinheiten erfasst — im Schritt Wohn- und Gewerbeeinheiten hinzufügen."
                      : `${commercialSummary.occupied} von ${commercialSummary.count} Gewerbeeinheiten vermietet.`}
                  </p>
                </div>
              </>
            )}

            {!isMfh && (
              <div>
                <Field label="Nettomiete Wohnung / Monat" required>
                  <NumberInput
                    value={inputs.monthlyRent}
                    onChange={(v) => update("monthlyRent", v ?? 0)}
                    suffix="CHF"
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEstimateRent}
                  disabled={rentLoading}
                  className="mt-2 w-full border-[color:var(--navy-mid)]/30 text-[color:var(--navy-dark)]"
                >
                  {rentLoading ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-3.5 text-[color:var(--navy-mid)]" />
                  )}
                  Marktmiete automatisch schätzen (Premium)
                </Button>
              </div>
            )}

            <div className="rounded-2xl border border-black/5 bg-white p-4">
              <p className="text-xs font-semibold text-[color:var(--navy-dark)]">
                Parkeinnahmen (Miete pro Einheit / Monat)
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Anzahl stammt aus dem Schritt „Ausstattung". Miete pro Einheit hier
                eintragen — Monats- und Jahreswert werden automatisch berechnet.
              </p>
              <div className="mt-3 space-y-2">
                {parking.items.map(({ key, label, count, rent }) => {
                  const monthly = count * rent;
                  const yearly = monthly * 12;
                  const warn = count === 0 && rent > 0;
                  const missing = count > 0 && rent === 0;
                  return (
                    <div key={key} className="rounded-xl bg-[color:var(--navy-wash)]/40 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[color:var(--navy-dark)]">{label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {count} Einheit(en)
                            {count > 0 && rent > 0
                              ? ` · CHF ${Math.round(monthly).toLocaleString("de-CH")} / Mo. · CHF ${Math.round(yearly).toLocaleString("de-CH")} / Jahr`
                              : ""}
                          </p>
                        </div>
                        <div className="w-28">
                          <NumberInput
                            value={inputs[key]}
                            onChange={(v) => update(key, v)}
                            suffix="CHF"
                            min={0}
                          />
                        </div>
                      </div>
                      {warn && (
                        <p className="mt-1 text-[10px] text-amber-700">
                          Miete erfasst, aber Anzahl in Ausstattung ist 0 — Einnahme wird als 0 gewertet.
                        </p>
                      )}
                      {missing && (
                        <p className="mt-1 text-[10px] text-amber-700">
                          {count} {label} erfasst, aber keine Miete angegeben.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {parking.totalUnits > 0 && (
                <p className="mt-3 text-xs font-medium text-[color:var(--navy-dark)]">
                  Gesamt: {parking.totalUnits} Parkeinheiten · CHF{" "}
                  {Math.round(parking.totalMonthly).toLocaleString("de-CH")} / Mo. · CHF{" "}
                  {Math.round(parking.totalMonthly * 12).toLocaleString("de-CH")} / Jahr
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {isMfh && (
                <Field label="Lager / Nebenräume / Monat">
                  <NumberInput
                    value={inputs.storageRent}
                    onChange={(v) => update("storageRent", v)}
                    suffix="CHF"
                  />
                </Field>
              )}
              <Field label="Sonstige Einnahmen / Monat">
                <NumberInput
                  value={inputs.otherIncome}
                  onChange={(v) => update("otherIncome", v)}
                  suffix="CHF"
                />
              </Field>
            </div>

            {isMfh && (
              <div className="rounded-2xl bg-[color:var(--navy-dark)]/95 p-4 text-xs text-white">
                <p className="text-[10px] uppercase tracking-widest opacity-70">
                  Gesamteinnahmen
                </p>
                {(() => {
                  const total =
                    unitsSummary.totalRent +
                    commercialSummary.totalRent +
                    parking.totalMonthly +
                    (inputs.storageRent ?? 0) +
                    (inputs.otherIncome ?? 0);
                  return (
                    <p className="mt-1 font-display text-base font-semibold">
                      CHF {Math.round(total).toLocaleString("de-CH")} / Mo. · CHF{" "}
                      {Math.round(total * 12).toLocaleString("de-CH")} / Jahr
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft className="mr-2 size-4" /> Zurück
          </Button>
        )}
        <Button
          className="flex-1 bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
          onClick={next}
          disabled={saving}
        >
          {step === STEPS.length - 1 ? (
            <>
              <Save className="mr-2 size-4" />
              {saving ? "Speichern …" : "Analyse berechnen"}
            </>
          ) : (
            <>
              Weiter <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>

      <PaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        isAuthenticated={!!user}
      />
      <MarketRentDialog
        open={rentOpen}
        onOpenChange={setRentOpen}
        loading={rentLoading}
        result={rentResult}
        userRent={inputs.monthlyRent || undefined}
        onAccept={(rent) => {
          setInputs((s) => ({
            ...s,
            monthlyRent: rent,
            premiumInsights: {
              ...(s.premiumInsights ?? {}),
              marketRent: rentResult
                ? {
                    estimatedRent: rentResult.estimatedRent,
                    low: rentResult.low,
                    high: rentResult.high,
                    reasoning: rentResult.reasoning,
                    dataQuality: rentResult.dataQuality,
                    comparableCount: rentResult.comparableCount,
                    radiusKm: rentResult.radiusKm,
                    sources: rentResult.sources,
                    generatedAt: new Date().toISOString(),
                  }
                : s.premiumInsights?.marketRent,
            },
          }));
          setRentOpen(false);
          toast.success("Marktmiete übernommen");
        }}
      />
      <PurchasePriceDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        loading={priceLoading}
        result={priceResult}
        userPrice={inputs.purchasePrice || undefined}
        onAccept={(price) => {
          setInputs((s) => ({
            ...s,
            purchasePrice: price,
            premiumInsights: {
              ...(s.premiumInsights ?? {}),
              purchasePrice: priceResult
                ? {
                    askingPrice: inputs.purchasePrice || undefined,
                    marketValue: priceResult.marketValue,
                    low: priceResult.low,
                    high: priceResult.high,
                    attractivePrice: priceResult.attractivePrice,
                    veryAttractivePrice: priceResult.veryAttractivePrice,
                    reasoning: priceResult.reasoning,
                    dataQuality: priceResult.dataQuality,
                    comparableCount: priceResult.comparableCount,
                    radiusKm: priceResult.radiusKm,
                    sources: priceResult.sources,
                    generatedAt: new Date().toISOString(),
                  }
                : s.premiumInsights?.purchasePrice,
            },
          }));
          setPriceOpen(false);
          toast.success("Kaufpreis übernommen");
        }}
      />
    </AppShell>
  );
}
