import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { PREMIUM_PRICE_CHF } from "@/lib/homeiq/config";
import {
  getSubscriptionStatus,
  mockSubscribe,
} from "@/lib/homeiq/subscription.functions";

export const Route = createFileRoute("/subscribe")({
  component: SubscribePage,
});

function SubscribePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const getStatus = useServerFn(getSubscriptionStatus);
  const doSubscribe = useServerFn(mockSubscribe);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    getStatus().then((s) => setIsPremium(s.isPremium)).catch(() => setIsPremium(false));
  }, [user, loading, getStatus, navigate]);

  async function handleSubscribe() {
    setSubmitting(true);
    try {
      await doSubscribe();
      toast.success("Premium aktiviert. Sie können unbegrenzt analysieren.");
      navigate({ to: "/account" });
    } catch (e) {
      console.error(e);
      toast.error("Abonnement konnte nicht aktiviert werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs text-[color:var(--navy-light)]"
      >
        <ArrowLeft className="size-3" /> Zurück
      </Link>

      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
          HomeIQ Premium
        </span>
        <h1 className="mt-2 font-display text-2xl font-semibold text-[color:var(--navy-dark)]">
          Unbegrenzt analysieren
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nach den 3 kostenlosen Analysen schalten Sie mit Premium jeden weiteren
          Bericht frei — für CHF {PREMIUM_PRICE_CHF.toFixed(2)} pro Monat.
        </p>

        <div className="mt-6 flex items-baseline gap-2">
          <span className="font-display text-4xl font-semibold text-[color:var(--navy-dark)]">
            CHF {PREMIUM_PRICE_CHF.toFixed(2)}
          </span>
          <span className="text-sm text-muted-foreground">/ Monat</span>
        </div>

        <ul className="mt-6 space-y-2 text-sm">
          {[
            "Unbegrenzt viele Analysen",
            "Speichern, bearbeiten, duplizieren",
            "HomeIQ Score mit klickbarer Aufschlüsselung",
            "Automatische Standortdaten (Leerstand, Steuern, Bevölkerung)",
            "Jederzeit monatlich kündbar",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 text-[color:var(--navy-mid)]" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          {isPremium ? (
            <div className="rounded-xl bg-[color:var(--navy-wash)] p-4 text-sm">
              <div className="flex items-center gap-2 text-[color:var(--navy-dark)]">
                <Sparkles className="size-4" />
                <span className="font-medium">Sie sind bereits Premium.</span>
              </div>
              <Button asChild variant="link" className="mt-2 h-auto p-0">
                <Link to="/account">Abo verwalten →</Link>
              </Button>
            </div>
          ) : (
            <Button
              className="w-full bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
              onClick={handleSubscribe}
              disabled={submitting}
            >
              {submitting ? "Aktiviere …" : "Jetzt Premium aktivieren"}
            </Button>
          )}
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          Zahlungsabwicklung erfolgt in einem späteren Release über Paddle
          (inkl. Schweizer MwSt.). In dieser Vorschau wird das Abo direkt aktiviert.
        </p>
      </div>
    </AppShell>
  );
}
