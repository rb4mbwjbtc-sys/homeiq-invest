import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, MoreVertical, Copy, Trash2, Pencil, FileText, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteAnalysis,
  duplicateAnalysis,
  listAnalyses,
} from "@/lib/homeiq/storage";
import type { StoredAnalysis } from "@/lib/homeiq/types";
import { chf, dateShort } from "@/lib/homeiq/format";
import { getGuestQuota, getUserQuota, type QuotaStatus } from "@/lib/homeiq/quota.functions";
import { getDeviceId } from "@/lib/homeiq/deviceId";
import { FREE_ANALYSIS_LIMIT } from "@/lib/homeiq/config";

export const Route = createFileRoute("/")({
  component: HomePage,
});

import { scoreChip, scoreDashboardLabel } from "@/lib/homeiq/colors";

function HomePage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<StoredAnalysis[] | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const navigate = useNavigate();
  const fetchGuestQuota = useServerFn(getGuestQuota);
  const fetchUserQuota = useServerFn(getUserQuota);

  async function refresh() {
    try {
      const list = await listAnalyses();
      // Standardsortierung: Score absteigend, Tiebreaker updatedAt absteigend
      list.sort((a, b) => {
        const diff = (b.result?.score ?? -1) - (a.result?.score ?? -1);
        if (diff !== 0) return diff;
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      });
      setItems(list);
    } catch (e) {
      console.error(e);
      toast.error("Analysen konnten nicht geladen werden.");
    }
  }


  async function refreshQuota() {
    try {
      if (user) {
        setQuota(await fetchUserQuota());
      } else {
        setQuota(await fetchGuestQuota({ data: { deviceId: getDeviceId() } }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (!loading) {
      void refresh();
      void refreshQuota();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  const isEmpty = items !== null && items.length === 0;

  return (
    <AppShell>
      <section className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-[color:var(--navy-dark)]">
          Immobilien analysieren
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Die smarte Immobilienanalyse für Investoren. Schnell. Objektiv. Verständlich.
        </p>
      </section>

      {!quota?.isPremium && (
        <section className="mb-6 rounded-2xl border border-[color:var(--navy-mid)]/20 bg-gradient-to-br from-[color:var(--navy-wash)] to-white p-5 ring-1 ring-black/5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[color:var(--navy-mid)]" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--navy-mid)]">
              Premium — CHF 9.90 / Monat
            </p>
          </div>
          <ul className="mt-3 grid gap-1.5 text-[13px] text-[color:var(--navy-dark)]">
            <li>· Unbegrenzte Analysen</li>
            <li>· Professioneller PDF-Bericht</li>
            <li>· Geräteübergreifender Zugriff auf alle Analysen</li>
            <li>· Automatische Marktmiete schätzen</li>
            <li>· Optimale Kaufpreisberechnung</li>
          </ul>
          <div className="mt-4">
            <Button
              asChild
              size="sm"
              className="bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
            >
              <Link to={user ? "/subscribe" : "/auth"}>Premium freischalten</Link>
            </Button>
          </div>
        </section>
      )}

      {quota && (
        <div className="mb-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
            Kontingent
          </p>
          <p className="mt-1 text-sm text-[color:var(--navy-dark)]">
            {quota.isPremium ? (
              <>
                <Sparkles className="mr-1 inline size-3.5 text-[color:var(--navy-mid)]" />
                Premium — unbegrenzt
              </>
            ) : (
              <>
                <strong>{quota.remaining}</strong> von {FREE_ANALYSIS_LIMIT} Gratis-Analysen übrig
              </>
            )}
          </p>
        </div>
      )}


      <div className="mb-8">
        <Button
          size="lg"
          className="w-full bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
          onClick={() => navigate({ to: "/new" })}
        >
          <Plus className="mr-2 size-4" /> Neue Analyse erstellen
        </Button>
      </div>


      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
          Gespeicherte Analysen
        </h2>

        {items === null ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-muted-foreground ring-1 ring-black/5">
            Lade …
          </div>
        ) : isEmpty ? (
          <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
            <FileText className="mx-auto size-8 text-[color:var(--navy-light)]" />
            <p className="mt-3 text-sm text-[color:var(--navy-dark)]">
              Noch keine Analysen gespeichert.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Legen Sie oben eine neue Analyse an, um zu starten.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => {
              const dash = scoreDashboardLabel(a.result.score);
              return (
              <li
                key={a.id}
                className="group rounded-2xl bg-white p-4 ring-1 ring-black/5"
              >
                <div className="flex items-center justify-between">
                  <Link
                    to="/analysis/$id"
                    params={{ id: a.id }}
                    className="min-w-0 flex-1 pr-2"
                  >
                    <p className="truncate font-display text-sm font-semibold text-[color:var(--navy-dark)]">
                      {a.name || "Ohne Titel"}
                    </p>
                    <p className="text-[11px] text-[color:var(--navy-light)]">
                      {[a.inputs.zip, a.inputs.city].filter(Boolean).join(" ") ||
                        "—"}{" "}
                      · {chf(a.inputs.purchasePrice)} · {dateShort(a.updatedAt)}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-10 items-center justify-center rounded-full font-display text-sm font-semibold ring-1 ${scoreChip(a.result.score)}`}
                    >
                      {a.result.score}
                    </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to="/analysis/$id" params={{ id: a.id }}>
                          <FileText className="mr-2 size-4" /> Öffnen
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          to="/new"
                          search={{ id: a.id } as never}
                        >
                          <Pencil className="mr-2 size-4" /> Bearbeiten
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          const c = await duplicateAnalysis(a.id);
                          if (c) {
                            toast.success("Analyse dupliziert");
                            void refresh();
                          }
                        }}
                      >
                        <Copy className="mr-2 size-4" /> Duplizieren
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={async () => {
                          if (!confirm("Analyse wirklich löschen?")) return;
                          await deleteAnalysis(a.id);
                          toast.success("Gelöscht");
                          void refresh();
                        }}
                      >
                        <Trash2 className="mr-2 size-4" /> Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                </div>
                <p className="mt-2 text-[11px] font-medium text-[color:var(--navy-mid)]">
                  {dash.emoji} {dash.label}
                </p>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
