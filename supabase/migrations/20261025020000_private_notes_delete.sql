-- Existing RLS restricts every operation to Brandon Diaz and Test ChatGPT.
-- Grant the delete operation without changing the two-account access policy.
grant delete on public.app_change_requests to authenticated;
