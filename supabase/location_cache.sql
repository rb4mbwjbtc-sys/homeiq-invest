-- Optional persistent cache for HomeIQ V3.2.
-- Run this in the SQL editor of the HomeIQ-owned Supabase project.

create table if not exists public.location_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists location_cache_expires_at_idx
  on public.location_cache (expires_at);

alter table public.location_cache enable row level security;

-- No browser/client policy is created. Access is server-side only through
-- SUPABASE_SERVICE_ROLE_KEY in the Vercel function.
