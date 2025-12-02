-- Create staff role enum
CREATE TYPE public.staff_role AS ENUM ('chef', 'waiter', 'manager', 'host', 'bartender', 'kitchen_assistant', 'cleaner');

-- Create staff status enum
CREATE TYPE public.staff_status AS ENUM ('active', 'inactive', 'on_leave');

-- Create attendance source enum
CREATE TYPE public.attendance_source AS ENUM ('manual', 'pos', 'auto');

-- Staff table
CREATE TABLE public.staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role staff_role NOT NULL DEFAULT 'waiter',
  hourly_rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status staff_status NOT NULL DEFAULT 'active',
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Staff shifts table
CREATE TABLE public.staff_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  shift_start TIMESTAMP WITH TIME ZONE NOT NULL,
  shift_end TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Staff attendance table
CREATE TABLE public.staff_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
  clock_out TIMESTAMP WITH TIME ZONE,
  source attendance_source NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Staff performance table
CREATE TABLE public.staff_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  kpi_sales DECIMAL(10, 2) NOT NULL DEFAULT 0,
  kpi_customers_served INTEGER NOT NULL DEFAULT 0,
  kpi_errors INTEGER NOT NULL DEFAULT 0,
  score DECIMAL(5, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(staff_id, date)
);

-- Add selling_price to dishes if missing (for menu engineering)
ALTER TABLE public.dishes ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Enable RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_performance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all access to staff" ON public.staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to staff_shifts" ON public.staff_shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to staff_attendance" ON public.staff_attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to staff_performance" ON public.staff_performance FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_staff_location ON public.staff(location_id);
CREATE INDEX idx_staff_status ON public.staff(status);
CREATE INDEX idx_staff_shifts_staff ON public.staff_shifts(staff_id);
CREATE INDEX idx_staff_shifts_location ON public.staff_shifts(location_id);
CREATE INDEX idx_staff_shifts_dates ON public.staff_shifts(shift_start, shift_end);
CREATE INDEX idx_staff_attendance_staff ON public.staff_attendance(staff_id);
CREATE INDEX idx_staff_attendance_dates ON public.staff_attendance(clock_in);
CREATE INDEX idx_staff_performance_staff ON public.staff_performance(staff_id);
CREATE INDEX idx_staff_performance_date ON public.staff_performance(date);

-- Triggers for updated_at
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_staff_shifts_updated_at BEFORE UPDATE ON public.staff_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate staff performance score
CREATE OR REPLACE FUNCTION public.calculate_staff_score(p_staff_id UUID, p_date DATE)
RETURNS DECIMAL
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales DECIMAL;
  v_customers INTEGER;
  v_errors INTEGER;
  v_score DECIMAL;
BEGIN
  SELECT kpi_sales, kpi_customers_served, kpi_errors
  INTO v_sales, v_customers, v_errors
  FROM public.staff_performance
  WHERE staff_id = p_staff_id AND date = p_date;
  
  IF v_sales IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Score calculation: sales weight + customers weight - error penalty
  v_score := (v_sales / 100) + (v_customers * 2) - (v_errors * 10);
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;