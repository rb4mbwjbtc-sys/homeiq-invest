import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREE_ANALYSIS_LIMIT } from "./config";

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  isPremium: boolean;
  isAuthenticated: boolean;
}

const deviceSchema = z.object({ deviceId: z.string().min(4).max(128) });

/** Anonyme Gäste: Nutzung pro Gerät (localStorage-ID). */
export const getGuestQuota = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deviceSchema.parse(d))
  .handler(async ({ data }): Promise<QuotaStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("guest_usage")
      .select("count")
      .eq("device_id", data.deviceId)
      .maybeSingle();
    const used = row?.count ?? 0;
    return {
      used,
      limit: FREE_ANALYSIS_LIMIT,
      remaining: Math.max(0, FREE_ANALYSIS_LIMIT - used),
      isPremium: false,
      isAuthenticated: false,
    };
  });

export const consumeGuestQuota = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deviceSchema.parse(d))
  .handler(async ({ data }): Promise<QuotaStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("guest_usage")
      .select("count")
      .eq("device_id", data.deviceId)
      .maybeSingle();
    const current = existing?.count ?? 0;
    if (current >= FREE_ANALYSIS_LIMIT) {
      throw new Error("QUOTA_EXCEEDED");
    }
    const next = current + 1;
    await supabaseAdmin.from("guest_usage").upsert(
      {
        device_id: data.deviceId,
        count: next,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );
    return {
      used: next,
      limit: FREE_ANALYSIS_LIMIT,
      remaining: Math.max(0, FREE_ANALYSIS_LIMIT - next),
      isPremium: false,
      isAuthenticated: false,
    };
  });

/** Authentifizierte Nutzer: Limit gilt nur, wenn nicht Premium. */
export const getUserQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuotaStatus> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("analyses_count, subscription_status, current_period_end")
      .eq("id", context.userId)
      .maybeSingle();
    const used = profile?.analyses_count ?? 0;
    const status = profile?.subscription_status ?? "free";
    const periodEnd = profile?.current_period_end
      ? new Date(profile.current_period_end)
      : null;
    const isPremium =
      (status === "active" || status === "canceled_active_until_end") &&
      (!periodEnd || periodEnd > new Date());
    return {
      used,
      limit: FREE_ANALYSIS_LIMIT,
      remaining: isPremium ? Number.POSITIVE_INFINITY : Math.max(0, FREE_ANALYSIS_LIMIT - used),
      isPremium,
      isAuthenticated: true,
    };
  });

export const consumeUserQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuotaStatus> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("analyses_count, subscription_status, current_period_end")
      .eq("id", context.userId)
      .maybeSingle();
    const current = profile?.analyses_count ?? 0;
    const status = profile?.subscription_status ?? "free";
    const periodEnd = profile?.current_period_end
      ? new Date(profile.current_period_end)
      : null;
    const isPremium =
      (status === "active" || status === "canceled_active_until_end") &&
      (!periodEnd || periodEnd > new Date());
    if (!isPremium && current >= FREE_ANALYSIS_LIMIT) {
      throw new Error("QUOTA_EXCEEDED");
    }
    const next = current + 1;
    await context.supabase
      .from("profiles")
      .update({ analyses_count: next })
      .eq("id", context.userId);
    return {
      used: next,
      limit: FREE_ANALYSIS_LIMIT,
      remaining: isPremium ? Number.POSITIVE_INFINITY : Math.max(0, FREE_ANALYSIS_LIMIT - next),
      isPremium,
      isAuthenticated: true,
    };
  });
