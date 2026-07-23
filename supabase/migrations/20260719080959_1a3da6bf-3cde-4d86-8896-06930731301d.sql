
-- ============================================================
-- 1) profiles
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_status text NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free','active','pending_payment','payment_failed','canceled_active_until_end','expired')),
  subscription_provider text,
  external_customer_id text,
  external_subscription_id text,
  current_period_end timestamptz,
  analyses_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_owner_select" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profile_owner_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.tg_profiles_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_premium(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid
      AND subscription_status IN ('active','canceled_active_until_end')
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_premium(uuid) TO authenticated, anon;

-- ============================================================
-- 2) guest_usage
-- ============================================================
CREATE TABLE public.guest_usage (
  device_id text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.guest_usage TO service_role;
ALTER TABLE public.guest_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3) location_cache
-- ============================================================
CREATE TABLE public.location_cache (
  address_key text PRIMARY KEY,
  zip text,
  city text,
  street text,
  house_number text,
  latitude double precision,
  longitude double precision,
  gemeinde text,
  kanton text,
  bfs_nr integer,
  ov_data jsonb,
  amenities jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_location_cache_fetched_at ON public.location_cache(fetched_at);
GRANT SELECT ON public.location_cache TO anon, authenticated;
GRANT ALL ON public.location_cache TO service_role;
ALTER TABLE public.location_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "location_cache_read_all" ON public.location_cache FOR SELECT USING (true);

-- ============================================================
-- 4) gemeinde_data — auto ID, unique on (name, kanton)
-- ============================================================
CREATE TABLE public.gemeinde_data (
  id bigserial PRIMARY KEY,
  bfs_nr integer,
  name text NOT NULL,
  kanton text NOT NULL,
  vacancy_pct numeric,
  vacancy_year integer,
  tax_index numeric,
  population integer,
  population_growth_pct numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, kanton)
);
CREATE INDEX idx_gemeinde_data_name ON public.gemeinde_data(lower(name));
CREATE INDEX idx_gemeinde_data_kanton ON public.gemeinde_data(kanton);
CREATE INDEX idx_gemeinde_data_bfs_nr ON public.gemeinde_data(bfs_nr);
GRANT SELECT ON public.gemeinde_data TO anon, authenticated;
GRANT ALL ON public.gemeinde_data TO service_role;
ALTER TABLE public.gemeinde_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gemeinde_data_read_all" ON public.gemeinde_data FOR SELECT USING (true);

-- Seed data: major Swiss municipalities.
-- Values are illustrative and should be overwritten from the official
-- BFS Leerwohnungszählung / Steuerbelastung / STATPOP CSV imports.
INSERT INTO public.gemeinde_data (name, kanton, vacancy_pct, vacancy_year, tax_index, population, population_growth_pct) VALUES
  ('Zürich',            'ZH', 0.07, 2024,  82.0, 434335,  0.9),
  ('Bern',               'BE', 0.55, 2024, 118.9, 134794,  0.4),
  ('Basel',              'BS', 1.31, 2024,  96.7, 173863,  0.6),
  ('Lausanne',           'VD', 0.11, 2024, 118.3, 140202,  0.5),
  ('Winterthur',         'ZH', 0.35, 2024,  96.2, 117382,  1.2),
  ('Luzern',             'LU', 0.65, 2024,  87.8,  83600,  0.8),
  ('St. Gallen',         'SG', 0.85, 2024, 102.5,  76213,  0.4),
  ('Lugano',             'TI', 1.10, 2024,  91.2,  62580, -0.1),
  ('Biel/Bienne',        'BE', 1.65, 2024, 121.5,  55206,  0.5),
  ('Thun',               'BE', 0.65, 2024, 106.2,  46295,  0.6),
  ('Köniz',              'BE', 0.45, 2024, 100.5,  42388,  0.7),
  ('La Chaux-de-Fonds',  'NE', 1.90, 2024, 122.8,  36915, -0.3),
  ('Schaffhausen',       'SH', 0.75, 2024, 105.3,  36979,  0.5),
  ('Chur',               'GR', 0.70, 2024,  97.8,  38037,  0.9),
  ('Uster',              'ZH', 0.40, 2024,  92.3,  36009,  1.0),
  ('Zug',                'ZG', 0.35, 2024,  61.2,  31530,  1.6),
  ('Wil',                'SG', 1.05, 2024, 102.8,  24461,  0.7),
  ('Rapperswil-Jona',    'SG', 0.55, 2024,  87.5,  27716,  0.8),
  ('Sion',               'VS', 1.35, 2024, 103.8,  35709,  1.1),
  ('Neuchâtel',          'NE', 1.85, 2024, 121.2,  33475, -0.2),
  ('Fribourg',           'FR', 0.95, 2024, 108.3,  38928,  0.9),
  ('Aarau',              'AG', 0.85, 2024,  93.5,  21649,  1.1),
  ('Baden',              'AG', 0.75, 2024,  91.2,  20063,  1.0),
  ('Frauenfeld',         'TG', 1.05, 2024,  99.6,  25943,  0.9),
  ('Kreuzlingen',        'TG', 1.35, 2024,  96.8,  22397,  0.6),
  ('Wetzikon',           'ZH', 0.55, 2024,  94.2,  24939,  1.2),
  ('Emmen',              'LU', 1.15, 2024,  96.5,  30837,  0.7),
  ('Kriens',             'LU', 0.45, 2024,  92.3,  27722,  0.9),
  ('Vernier',            'GE', 0.35, 2024, 118.5,  35786,  0.6),
  ('Genève',             'GE', 0.45, 2024, 116.9, 203856,  0.5),
  ('Onex',               'GE', 0.30, 2024, 118.3,  19434,  0.4),
  ('Lancy',              'GE', 0.28, 2024, 117.8,  34497,  0.9),
  ('Meyrin',             'GE', 0.32, 2024, 117.5,  26893,  0.7),
  ('Yverdon-les-Bains',  'VD', 1.45, 2024, 116.8,  31572,  0.5),
  ('Montreux',           'VD', 0.85, 2024, 115.2,  26841,  0.4),
  ('Nyon',               'VD', 0.55, 2024, 106.5,  22622,  1.0),
  ('Renens',             'VD', 0.65, 2024, 118.9,  21611,  0.5),
  ('Vevey',              'VD', 0.75, 2024, 117.5,  20218,  0.4),
  ('Solothurn',          'SO', 1.05, 2024, 110.8,  17057,  0.3),
  ('Olten',              'SO', 1.25, 2024, 111.5,  18929,  0.6),
  ('Bellinzona',         'TI', 1.60, 2024,  90.8,  43922,  0.2),
  ('Locarno',            'TI', 1.45, 2024,  92.5,  16062, -0.1),
  ('Zollikon',           'ZH', 0.15, 2024,  74.5,  13521,  0.6),
  ('Küsnacht',           'ZH', 0.20, 2024,  71.2,  15055,  0.7),
  ('Meilen',             'ZH', 0.25, 2024,  76.8,  14625,  0.9);

CREATE OR REPLACE FUNCTION public.tg_gemeinde_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER gemeinde_data_updated_at
BEFORE UPDATE ON public.gemeinde_data
FOR EACH ROW EXECUTE FUNCTION public.tg_gemeinde_updated_at();

-- ============================================================
-- 5) subscription_events
-- ============================================================
CREATE TABLE public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_customer_id text,
  external_subscription_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscription_events_user_id ON public.subscription_events(user_id);
CREATE INDEX idx_subscription_events_received_at ON public.subscription_events(received_at DESC);
GRANT ALL ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
