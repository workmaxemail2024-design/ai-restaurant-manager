REVOKE ALL ON FUNCTION public.expense_finance_guard(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_location_guard(uuid, uuid, text) FROM PUBLIC, anon, authenticated;