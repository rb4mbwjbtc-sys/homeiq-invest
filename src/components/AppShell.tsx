import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[color:var(--navy-wash)]/40">
      <header className="border-b border-black/5 bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-[color:var(--navy-dark)] text-[color:var(--navy-wash)]">
              <span className="font-display text-sm font-bold">iQ</span>
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-semibold text-[color:var(--navy-dark)]">
                HomeIQ Invest
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[color:var(--navy-light)]">
                Immobilien-Analyse
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <UserIcon className="size-4" />
                    <span className="hidden max-w-[140px] truncate sm:inline">
                      {user.email}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Angemeldet als
                  </DropdownMenuLabel>
                  <DropdownMenuLabel className="pt-0 text-sm">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await supabase.auth.signOut();
                    }}
                  >
                    <LogOut className="mr-2 size-4" /> Abmelden
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to="/auth">Anmelden</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">{children}</main>
      <footer className="border-t border-black/5 py-6 text-center text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} HomeIQ Invest — Keine Anlage- oder Kaufberatung.
      </footer>
    </div>
  );
}
