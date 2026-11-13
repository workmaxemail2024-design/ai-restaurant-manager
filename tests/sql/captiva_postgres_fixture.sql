-- Disposable Postgres 17 fixture for the Captiva migration.
-- No production credentials or data.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.restaurants(id uuid PRIMARY KEY);
CREATE TABLE public.locations(id uuid PRIMARY KEY, restaurant_id uuid REFERENCES public.restaurants(id));
CREATE TABLE public.dishes(id uuid PRIMARY KEY, restaurant_id uuid, location_id uuid);
CREATE TABLE public.pos_integrations(
  id uuid PRIMARY KEY, restaurant_id uuid, location_id uuid, pos_provider text
);
CREATE TABLE public.daily_ledger_entries(
  id uuid PRIMARY KEY, restaurant_id uuid, location_id uuid,
  entry_date date, is_closed boolean NOT NULL DEFAULT false,
  manual_revenue numeric
);
CREATE TABLE public.pos_sales_import(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid, location_id uuid, pos_provider text,
  external_sale_id text, data jsonb NOT NULL,
  mapped_dish_id uuid, mapped_total_price numeric,
  mapped_quantity integer, mapped_sale_date date, sync_status text,
  external_item_id text,
  UNIQUE(restaurant_id,location_id,pos_provider,external_sale_id)
);
CREATE TABLE public.external_pos_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid, location_id uuid, pos_provider text,
  external_item_id text, mapped_dish_id uuid,
  UNIQUE(restaurant_id,location_id,pos_provider,external_item_id)
);
CREATE TABLE public.sales(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid, location_id uuid, dish_id uuid,
  quantity integer, total_price numeric, sale_date date, source text,
  pos_import_id uuid
);
CREATE UNIQUE INDEX sales_pos_import_id_uniq ON public.sales(pos_import_id);
CREATE TABLE public.pos_daily_summaries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid, location_id uuid, pos_provider text,report_date date,
  gross_sales numeric,net_sales numeric,vat_amount numeric,discounts numeric,
  product_gross_sales numeric,product_net_sales numeric,product_vat_amount numeric,
  summary_gross_sales numeric,summary_net_sales numeric,summary_vat_amount numeric,
  has_product_detail boolean,has_summary_report boolean,order_count integer,
  visitor_count integer,average_order_value numeric,source_file_name text,updated_at timestamptz
);
