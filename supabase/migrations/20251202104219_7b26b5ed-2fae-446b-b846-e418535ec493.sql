-- Create enums for unit types and storage types
CREATE TYPE public.unit_type AS ENUM ('kg', 'g', 'L', 'ml', 'oz', 'each');
CREATE TYPE public.storage_type AS ENUM ('freezer', 'fridge', 'dry');

-- LOCATIONS
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SUPPLIERS
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- INGREDIENTS
CREATE TABLE public.ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit public.unit_type NOT NULL DEFAULT 'each',
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  storage_type public.storage_type NOT NULL DEFAULT 'dry',
  default_cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- INGREDIENT_PRICES (versioned pricing)
CREATE TABLE public.ingredient_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  cost_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- DISHES
CREATE TABLE public.dishes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- DISH_INGREDIENTS (recipe)
CREATE TABLE public.dish_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- STOCK_LEVELS
CREATE TABLE public.stock_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ingredient_id, location_id)
);

-- PURCHASE_ORDERS
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- PURCHASE_ORDER_ITEMS
CREATE TABLE public.purchase_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 4) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SALES
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies (for now, no auth required)
-- LOCATIONS policies
CREATE POLICY "Allow all access to locations" ON public.locations FOR ALL USING (true) WITH CHECK (true);

-- SUPPLIERS policies
CREATE POLICY "Allow all access to suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);

-- INGREDIENTS policies
CREATE POLICY "Allow all access to ingredients" ON public.ingredients FOR ALL USING (true) WITH CHECK (true);

-- INGREDIENT_PRICES policies
CREATE POLICY "Allow all access to ingredient_prices" ON public.ingredient_prices FOR ALL USING (true) WITH CHECK (true);

-- DISHES policies
CREATE POLICY "Allow all access to dishes" ON public.dishes FOR ALL USING (true) WITH CHECK (true);

-- DISH_INGREDIENTS policies
CREATE POLICY "Allow all access to dish_ingredients" ON public.dish_ingredients FOR ALL USING (true) WITH CHECK (true);

-- STOCK_LEVELS policies
CREATE POLICY "Allow all access to stock_levels" ON public.stock_levels FOR ALL USING (true) WITH CHECK (true);

-- PURCHASE_ORDERS policies
CREATE POLICY "Allow all access to purchase_orders" ON public.purchase_orders FOR ALL USING (true) WITH CHECK (true);

-- PURCHASE_ORDER_ITEMS policies
CREATE POLICY "Allow all access to purchase_order_items" ON public.purchase_order_items FOR ALL USING (true) WITH CHECK (true);

-- SALES policies
CREATE POLICY "Allow all access to sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);

-- Function to get latest ingredient price
CREATE OR REPLACE FUNCTION public.get_latest_ingredient_price(p_ingredient_id UUID)
RETURNS DECIMAL(10, 2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_price DECIMAL(10, 2);
BEGIN
  SELECT cost_price INTO latest_price
  FROM public.ingredient_prices
  WHERE ingredient_id = p_ingredient_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF latest_price IS NULL THEN
    SELECT default_cost_price INTO latest_price
    FROM public.ingredients
    WHERE id = p_ingredient_id;
  END IF;
  
  RETURN COALESCE(latest_price, 0);
END;
$$;

-- Function to calculate dish cost
CREATE OR REPLACE FUNCTION public.calculate_dish_cost(p_dish_id UUID)
RETURNS DECIMAL(10, 2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_cost DECIMAL(10, 2) := 0;
BEGIN
  SELECT COALESCE(SUM(di.quantity * public.get_latest_ingredient_price(di.ingredient_id)), 0)
  INTO total_cost
  FROM public.dish_ingredients di
  WHERE di.dish_id = p_dish_id;
  
  RETURN total_cost;
END;
$$;

-- Function to calculate dish profit margin
CREATE OR REPLACE FUNCTION public.calculate_dish_margin(p_dish_id UUID)
RETURNS DECIMAL(5, 2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dish_cost DECIMAL(10, 2);
  selling_price DECIMAL(10, 2);
  margin DECIMAL(5, 2);
BEGIN
  dish_cost := public.calculate_dish_cost(p_dish_id);
  
  SELECT d.selling_price INTO selling_price
  FROM public.dishes d
  WHERE d.id = p_dish_id;
  
  IF selling_price IS NULL OR selling_price = 0 THEN
    RETURN 0;
  END IF;
  
  margin := ((selling_price - dish_cost) / selling_price) * 100;
  RETURN COALESCE(margin, 0);
END;
$$;

-- Trigger to update stock when purchase order is completed
CREATE OR REPLACE FUNCTION public.update_stock_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    INSERT INTO public.stock_levels (ingredient_id, location_id, quantity)
    SELECT poi.ingredient_id, NEW.location_id, poi.quantity
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
    ON CONFLICT (ingredient_id, location_id)
    DO UPDATE SET 
      quantity = stock_levels.quantity + EXCLUDED.quantity,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_stock_on_purchase
AFTER UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_stock_on_purchase();

-- Trigger to reduce stock when sale is made
CREATE OR REPLACE FUNCTION public.reduce_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stock_levels sl
  SET quantity = GREATEST(0, sl.quantity - (di.quantity * NEW.quantity)),
      updated_at = now()
  FROM public.dish_ingredients di
  WHERE di.dish_id = NEW.dish_id
    AND sl.ingredient_id = di.ingredient_id
    AND sl.location_id = NEW.location_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_reduce_stock_on_sale
AFTER INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.reduce_stock_on_sale();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add update triggers
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dishes_updated_at BEFORE UPDATE ON public.dishes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_ingredients_supplier ON public.ingredients(supplier_id);
CREATE INDEX idx_ingredient_prices_ingredient ON public.ingredient_prices(ingredient_id);
CREATE INDEX idx_dishes_location ON public.dishes(location_id);
CREATE INDEX idx_dish_ingredients_dish ON public.dish_ingredients(dish_id);
CREATE INDEX idx_dish_ingredients_ingredient ON public.dish_ingredients(ingredient_id);
CREATE INDEX idx_stock_levels_location ON public.stock_levels(location_id);
CREATE INDEX idx_stock_levels_ingredient ON public.stock_levels(ingredient_id);
CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_location ON public.purchase_orders(location_id);
CREATE INDEX idx_purchase_order_items_po ON public.purchase_order_items(purchase_order_id);
CREATE INDEX idx_sales_location ON public.sales(location_id);
CREATE INDEX idx_sales_dish ON public.sales(dish_id);
CREATE INDEX idx_sales_date ON public.sales(sale_date);