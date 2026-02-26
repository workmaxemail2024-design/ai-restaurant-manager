
-- Reservation status and source enums
CREATE TYPE public.reservation_status AS ENUM (
  'inquiry', 'pending', 'confirmed', 'declined', 'cancelled', 'seated', 'completed', 'no_show'
);

CREATE TYPE public.reservation_source AS ENUM (
  'phone', 'walk_in', 'online', 'staff'
);

CREATE TYPE public.table_shape AS ENUM (
  'square', 'circle', 'rect'
);

-- 1) reservation_customers
CREATE TABLE public.reservation_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  location_id UUID REFERENCES public.locations(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reservation_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access to reservation_customers"
  ON public.reservation_customers FOR ALL
  USING (user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (user_belongs_to_restaurant(restaurant_id));

CREATE TRIGGER update_reservation_customers_updated_at
  BEFORE UPDATE ON public.reservation_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) reservation_sittings
CREATE TABLE public.reservation_sittings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  location_id UUID REFERENCES public.locations(id),
  name TEXT NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  start_time TIME NOT NULL DEFAULT '12:00:00',
  end_time TIME NOT NULL DEFAULT '15:00:00',
  default_duration_minutes INTEGER NOT NULL DEFAULT 90,
  buffer_minutes INTEGER NOT NULL DEFAULT 15,
  max_covers INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reservation_sittings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access to reservation_sittings"
  ON public.reservation_sittings FOR ALL
  USING (user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (user_belongs_to_restaurant(restaurant_id));

CREATE TRIGGER update_reservation_sittings_updated_at
  BEFORE UPDATE ON public.reservation_sittings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) reservation_tables
CREATE TABLE public.reservation_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 4,
  area TEXT,
  shape public.table_shape NOT NULL DEFAULT 'rect',
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  w NUMERIC NOT NULL DEFAULT 80,
  h NUMERIC NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access to reservation_tables"
  ON public.reservation_tables FOR ALL
  USING (user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (user_belongs_to_restaurant(restaurant_id));

CREATE TRIGGER update_reservation_tables_updated_at
  BEFORE UPDATE ON public.reservation_tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) reservations
CREATE TABLE public.reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  customer_id UUID REFERENCES public.reservation_customers(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  status public.reservation_status NOT NULL DEFAULT 'pending',
  source public.reservation_source NOT NULL DEFAULT 'phone',
  table_ids JSONB NOT NULL DEFAULT '[]',
  sitting_id UUID REFERENCES public.reservation_sittings(id),
  special_requests TEXT,
  actual_spend NUMERIC,
  decline_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant access to reservations"
  ON public.reservations FOR ALL
  USING (user_belongs_to_restaurant(restaurant_id))
  WITH CHECK (user_belongs_to_restaurant(restaurant_id));

CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_reservations_date ON public.reservations (restaurant_id, location_id, start_at);
CREATE INDEX idx_reservations_customer ON public.reservations (customer_id);
CREATE INDEX idx_reservations_status ON public.reservations (status);
CREATE INDEX idx_reservation_customers_restaurant ON public.reservation_customers (restaurant_id);
CREATE INDEX idx_reservation_tables_location ON public.reservation_tables (restaurant_id, location_id);
