-- guest_usage: explicit deny for anon/authenticated (service role bypasses RLS)
CREATE POLICY "guest_usage_no_client_access"
  ON public.guest_usage
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- profiles: restrict INSERT to own row (creation is normally via handle_new_user trigger)
CREATE POLICY "profile_owner_insert"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- subscription_events: only the owning user can read their billing events
CREATE POLICY "subscription_events_owner_select"
  ON public.subscription_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Lock down SECURITY DEFINER trigger/helper functions so signed-in users
-- cannot invoke them directly through the exposed API schema. Triggers
-- continue to work because they execute as the table owner, not the caller.
REVOKE EXECUTE ON FUNCTION public.tg_analyses_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_gemeinde_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_profiles_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
