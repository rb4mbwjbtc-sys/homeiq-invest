import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // E-Mail-Bestätigungslink: Supabase hängt Tokens im URL-Hash an.
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) {
            toast.error(error.message);
            return;
          }
          if (data.session) {
            window.history.replaceState(null, "", window.location.pathname);
            toast.success("E-Mail bestätigt");
            navigate({ to: "/" });
          }
        });
      return;
    }
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        toast.success("Konto erstellt. Sie sind jetzt angemeldet.");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Angemeldet");
        navigate({ to: "/" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fehler";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      toast.error(error.message ?? "Google-Anmeldung fehlgeschlagen");
      setBusy(false);
      return;
    }
    if (data.url) {
      window.location.assign(data.url);
      return;
    }
    setBusy(false);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 font-display text-2xl font-semibold text-[color:var(--navy-dark)]">
          {mode === "signin" ? "Anmelden" : "Konto erstellen"}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Speichern Sie Ihre Analysen sicher und gerätübergreifend.
        </p>

        <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={google}
            disabled={busy}
          >
            <svg className="mr-2 size-4" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Mit Google fortfahren
          </Button>

          <div className="my-4 flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> oder <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="email" className="text-xs">
                E-Mail
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs">
                Passwort
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[color:var(--navy-mid)] hover:bg-[color:var(--navy-dark)]"
              disabled={busy}
            >
              {mode === "signin" ? "Anmelden" : "Konto erstellen"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-[color:var(--navy-dark)]"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin"
              ? "Noch kein Konto? Registrieren"
              : "Bereits ein Konto? Anmelden"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Oder{" "}
          <Link to="/" className="underline">
            als Gast fortfahren
          </Link>{" "}
          (Speicherung nur auf diesem Gerät).
        </p>
      </div>
    </AppShell>
  );
}
