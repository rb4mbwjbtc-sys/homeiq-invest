import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PREMIUM_PRICE_CHF } from "@/lib/homeiq/config";
import {
  getSubscriptionStatus,
  mockCancelSubscription,
} from "@/lib/homeiq/subscription.functions";
import { getUserQuota } from "@/lib/homeiq/quota.functions";


export const Route = createFileRoute("/account")({
  component: AccountPage,
});

interface StatusView {
  status: string;
  currentPeriodEnd: string | null;
  isPremium: boolean;
  used: number;
  limit: number;
  remaining: number;
}

function AccountPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const getStatus = useServerFn(getSubscriptionStatus);
  const cancelSub = useServerFn(mockCancelSubscription);
  const getQuota = useServerFn(getUserQuota);
  const [view, setView] = useState<StatusView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    Promise.all([getStatus(), getQuota()])
      .then(([s, q]) => {
        setView({
          status: s.status,
          currentPeriodEnd: s.currentPeriodEnd,
          isPremium: s.isPremium,
          used: q.used,
          limit: q.limit,
          remaining: Number.isFinite(q.remaining) ? q.remaining : Infinity,
        });
      })
      .catch((e) => {
        console.error(e);
        toast.error("Konto-Daten konnten nicht geladen werden.");
      });
  }, [user, loading, getStatus, getQuota, navigate]);

  async function handleCancel() {
    if (!confirm("Abo wirklich kündigen? Sie behalten Premium bis zum Ende der laufenden Periode.")) return;
    setBusy(true);
    try {
      await cancelSub();
      toast.success("Abo gekündigt.");
      const s = await getStatus();
      setView((v) => v && { ...v, status: s.status, currentPeriodEnd: s.currentPeriodEnd, isPremium: s.isPremium });
    } catch (e) {
      console.error(e);
      toast.error("Kündigung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const statusLabel: Record<string, string> = {
    free: "Kostenloser Plan",
    active: "Premium aktiv",
    canceled_active_until_end: "Premium — läuft aus",
    canceled: "Gekündigt",
  };

  return (
    <AppShell>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs text-[color:var(--navy-light)]"
      >
        <ArrowLeft className="size-3" /> Zurück
      </Link>

      <h1 className="mt-4 font-display text-2xl font-semibold text-[color:var(--navy-dark)]">
        Konto
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>

      {view && (
        <>
          <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
              Abonnement
            </p>
            <p className="mt-2 font-display text-lg font-semibold text-[color:var(--navy-dark)]">
              {statusLabel[view.status] ?? view.status}
            </p>
            {view.currentPeriodEnd && (
              <p className="mt-1 text-xs text-muted-foreground">
                {view.status === "canceled_active_until_end" ? "Endet am " : "Verlängerung am "}
                {new Date(view.currentPeriodEnd).toLocaleDateString("de-CH")}
              </p>
            )}
            <p className="mt-3 text-sm">
              {view.isPremium
                ? `CHF ${PREMIUM_PRICE_CHF.toFixed(2)} / Monat`
                : "Kostenloser Plan — 3 Analysen inklusive"}
            </p>
            <div className="mt-4 flex gap-2">
              {view.isPremium && view.status === "active" ? (
                <Button variant="outline" onClick={handleCancel} disabled={busy}>
                  Abo kündigen
                </Button>
              ) : !view.isPremium ? (
                <Button
                  asChild
                  className="bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
                >
                  <Link to="/subscribe">Premium aktivieren</Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white p-6 ring-1 ring-black/5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
              Nutzung
            </p>
            <p className="mt-2 text-sm">
              {view.isPremium ? (
                <>Analysen gesamt: <strong>{view.used}</strong> · unbegrenzt</>
              ) : (
                <>
                  Analysen genutzt: <strong>{view.used}</strong> / {view.limit} ·{" "}
                  <strong>{view.remaining}</strong> verbleibend
                </>
              )}
            </p>
          </div>
        </>
      )}

      <div className="mt-6">
        <Button variant="ghost" onClick={handleSignOut}>
          <LogOut className="mr-2 size-4" /> Abmelden
        </Button>
      </div>
    </AppShell>
  );
}
