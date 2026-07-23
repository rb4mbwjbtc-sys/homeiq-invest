import { Link } from "@tanstack/react-router";
import { Sparkles, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PREMIUM_PRICE_CHF } from "@/lib/homeiq/config";

export function PaywallDialog({
  open,
  onOpenChange,
  isAuthenticated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAuthenticated: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-[color:var(--navy-wash)]">
              <Lock className="size-4 text-[color:var(--navy-dark)]" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--navy-light)]">
              Kostenlose Analysen aufgebraucht
            </span>
          </div>
          <DialogTitle className="font-display text-xl">
            Weiter mit HomeIQ Premium
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm">
            Sie haben Ihre 3 kostenlosen Analysen genutzt. Mit Premium analysieren Sie
            unbegrenzt viele Objekte für CHF {PREMIUM_PRICE_CHF.toFixed(2)} pro Monat.
            Jederzeit kündbar.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2 text-sm text-[color:var(--navy-dark)]">
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 text-[color:var(--navy-mid)]" />
            Unbegrenzte Analysen
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 text-[color:var(--navy-mid)]" />
            Professioneller PDF-Bericht
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 text-[color:var(--navy-mid)]" />
            Geräteübergreifender Zugriff auf alle Analysen
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 text-[color:var(--navy-mid)]" />
            Automatische Marktmiete schätzen
          </li>
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 text-[color:var(--navy-mid)]" />
            Optimale Kaufpreisberechnung
          </li>
        </ul>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {isAuthenticated ? (
            <Button
              asChild
              className="w-full bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
            >
              <Link to="/subscribe">Premium aktivieren</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                className="w-full bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
              >
                <Link to="/auth">Konto erstellen & abonnieren</Link>

              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Ihre bisherigen Gast-Analysen werden übernommen.
              </p>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Später
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
