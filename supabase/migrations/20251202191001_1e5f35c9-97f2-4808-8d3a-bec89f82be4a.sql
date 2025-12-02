-- POS Integrations table
CREATE TABLE public.pos_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  pos_provider TEXT NOT NULL,
  api_key TEXT,
  api_secret TEXT,
  webhook_url TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  last_sync_time TIMESTAMP WITH TIME ZONE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- POS Sales Import table
CREATE TABLE public.pos_sales_import (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  pos_provider TEXT NOT NULL,
  external_sale_id TEXT,
  data JSONB NOT NULL,
  mapped_dish_id UUID REFERENCES public.dishes(id) ON DELETE SET NULL,
  mapped_total_price NUMERIC,
  mapped_quantity INTEGER,
  mapped_sale_date DATE,
  sync_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- POS Staff Import table
CREATE TABLE public.pos_staff_import (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  external_staff_id TEXT NOT NULL,
  pos_provider TEXT NOT NULL,
  clock_in TIMESTAMP WITH TIME ZONE,
  clock_out TIMESTAMP WITH TIME ZONE,
  mapped_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  data JSONB NOT NULL,
  sync_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- POS Sync Logs table
CREATE TABLE public.pos_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  pos_provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- POS Mappings table for item/staff mapping
CREATE TABLE public.pos_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  pos_provider TEXT NOT NULL,
  mapping_type TEXT NOT NULL, -- 'dish', 'staff', 'category'
  external_id TEXT NOT NULL,
  external_name TEXT,
  internal_id UUID,
  confidence_score NUMERIC,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(location_id, pos_provider, mapping_type, external_id)
);

-- Enable RLS
ALTER TABLE public.pos_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_staff_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all access to pos_integrations" ON public.pos_integrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pos_sales_import" ON public.pos_sales_import FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pos_staff_import" ON public.pos_staff_import FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pos_sync_logs" ON public.pos_sync_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pos_mappings" ON public.pos_mappings FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_pos_integrations_location ON public.pos_integrations(location_id);
CREATE INDEX idx_pos_sales_import_location ON public.pos_sales_import(location_id);
CREATE INDEX idx_pos_sales_import_status ON public.pos_sales_import(sync_status);
CREATE INDEX idx_pos_staff_import_location ON public.pos_staff_import(location_id);
CREATE INDEX idx_pos_sync_logs_location ON public.pos_sync_logs(location_id);
CREATE INDEX idx_pos_mappings_location ON public.pos_mappings(location_id, pos_provider);

-- Add updated_at triggers
CREATE TRIGGER update_pos_integrations_updated_at
  BEFORE UPDATE ON public.pos_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pos_mappings_updated_at
  BEFORE UPDATE ON public.pos_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();