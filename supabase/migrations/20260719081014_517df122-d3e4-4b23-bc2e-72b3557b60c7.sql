
-- Revoke EXECUTE from public for trigger functions (they only run via triggers)
REVOKE EXECUTE ON FUNCTION public.tg_profiles_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_gemeinde_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_analyses_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- is_premium: needs to be callable by authenticated users only
REVOKE EXECUTE ON FUNCTION public.is_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_premium(uuid) TO authenticated;
