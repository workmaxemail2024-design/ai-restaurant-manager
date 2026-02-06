-- Add operating_hours JSONB field to locations table
ALTER TABLE public.locations 
ADD COLUMN operating_hours jsonb DEFAULT NULL;

-- Add a comment explaining the expected structure
COMMENT ON COLUMN public.locations.operating_hours IS 'Operating hours per day. Shape: {"mon": {"closed": false, "open": "11:00", "close": "23:00"}, ...}';