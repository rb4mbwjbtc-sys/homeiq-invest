import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SubscriptionStatus {
  status: "free" | "active" | "canceled_active_until_end" | "canceled";
  provider: string | null;
  currentPeriodEnd: string | null;
  isPremium: boolean;
}

export const getSubscriptionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionStatus> => {
    const { data } = await context.supabase
      .from("profiles")
      .select("subscription_status, subscription_provider, current_period_end")
      .eq("id", context.userId)
      .maybeSingle();
    const status = (data?.subscription_status ?? "free") as SubscriptionStatus["status"];
    const periodEnd = data?.current_period_end
      ? new Date(data.current_period_end)
      : null;
    const isPremium =
      (status === "active" || status === "canceled_active_until_end") &&
      (!periodEnd || periodEnd > new Date());
    return {
      status,
      provider: data?.subscription_provider ?? null,
      currentPeriodEnd: data?.current_period_end ?? null,
      isPremium,
    };
  });

/**
 * MOCK: Aktiviert das Abo für 1 Monat. Ersatz später durch echten Paddle-Webhook-Flow.
 */
export const mockSubscribe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionStatus> => {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await context.supabase
      .from("profiles")
      .update({
        subscription_status: "active",
        subscription_provider: "mock",
        current_period_end: periodEnd.toISOString(),
      })
      .eq("id", context.userId);
    return {
      status: "active",
      provider: "mock",
      currentPeriodEnd: periodEnd.toISOString(),
      isPremium: true,
    };
  });

export const mockCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionStatus> => {
    const { data } = await context.supabase
      .from("profiles")
      .select("current_period_end")
      .eq("id", context.userId)
      .maybeSingle();
    const end = data?.current_period_end ?? null;
    await context.supabase
      .from("profiles")
      .update({ subscription_status: "canceled_active_until_end" })
      .eq("id", context.userId);
    return {
      status: "canceled_active_until_end",
      provider: "mock",
      currentPeriodEnd: end,
      isPremium: end ? new Date(end) > new Date() : false,
    };
  });
