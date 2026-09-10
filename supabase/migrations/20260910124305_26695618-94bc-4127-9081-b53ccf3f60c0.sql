
REVOKE EXECUTE ON FUNCTION public.guard_stock_counts_closed_day() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_stock_counts_closed_day() FROM anon;
GRANT EXECUTE ON FUNCTION public.guard_stock_counts_closed_day() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.lock_stock_count_audit_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_stock_count_audit_fields() FROM anon;
GRANT EXECUTE ON FUNCTION public.lock_stock_count_audit_fields() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_stock_count_line_parent() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_stock_count_line_parent() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_stock_count_line_parent() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.guard_stock_count_lines_closed_day() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_stock_count_lines_closed_day() FROM anon;
GRANT EXECUTE ON FUNCTION public.guard_stock_count_lines_closed_day() TO authenticated;
