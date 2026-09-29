REVOKE ALL ON FUNCTION public.validate_dish_recipe_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_dish_ingredient_line() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.relink_on_dish_merge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reduce_stock_on_sale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recipe_qty_in_stock_unit(uuid, numeric, text) FROM PUBLIC, anon, authenticated;