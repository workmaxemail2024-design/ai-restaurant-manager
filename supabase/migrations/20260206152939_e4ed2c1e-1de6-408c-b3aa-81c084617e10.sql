-- Create menus table
CREATE TABLE public.menus (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location_id UUID REFERENCES public.locations(id),
  restaurant_id UUID REFERENCES public.restaurants(id),
  days JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of day names: ["monday", "tuesday", ...]
  start_time TIME NOT NULL DEFAULT '00:00:00',
  end_time TIME NOT NULL DEFAULT '23:59:59',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create menu_dishes junction table (many-to-many)
CREATE TABLE public.menu_dishes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id UUID NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(menu_id, dish_id)
);

-- Enable RLS on menus
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for menus
CREATE POLICY "Tenant access to menus"
ON public.menus
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- Enable RLS on menu_dishes
ALTER TABLE public.menu_dishes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for menu_dishes
CREATE POLICY "Tenant access to menu_dishes"
ON public.menu_dishes
FOR ALL
USING (user_belongs_to_restaurant(restaurant_id))
WITH CHECK (user_belongs_to_restaurant(restaurant_id));

-- Create indexes for performance
CREATE INDEX idx_menus_restaurant_id ON public.menus(restaurant_id);
CREATE INDEX idx_menus_location_id ON public.menus(location_id);
CREATE INDEX idx_menus_status ON public.menus(status);
CREATE INDEX idx_menu_dishes_menu_id ON public.menu_dishes(menu_id);
CREATE INDEX idx_menu_dishes_dish_id ON public.menu_dishes(dish_id);

-- Create trigger for updated_at
CREATE TRIGGER update_menus_updated_at
BEFORE UPDATE ON public.menus
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();