-- A narrowly scoped action for admins/estimators: confirm freshness without
-- granting UPDATE permission on library prices, names, or active flags.
create schema if not exists private;

create function private.confirm_library_price(p_table text, p_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_at timestamptz;
begin
  if auth.uid() is null or not coalesce(public.can_edit(), false) then
    raise exception 'Only admins and estimators may confirm library prices.' using errcode = '42501';
  end if;

  if p_table = 'materials' then
    update public.materials set cost_updated_at = now()
      where id = p_id and active and cost is not null
      returning cost_updated_at into checked_at;
  elsif p_table = 'finishes' then
    update public.finishes set cost_updated_at = now()
      where id = p_id and active and cost is not null
      returning cost_updated_at into checked_at;
  else
    raise exception 'Unsupported price library.' using errcode = '22023';
  end if;

  if checked_at is null then
    raise exception 'No active, priced library entry was found.' using errcode = 'P0002';
  end if;
  return checked_at;
end;
$$;

-- Keep privileged implementation outside the exposed API schema. The public
-- wrapper runs with caller permissions; the private helper checks their role.
revoke all on function private.confirm_library_price(text, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.confirm_library_price(text, uuid) to authenticated;

create function public.confirm_library_price(p_table text, p_id uuid)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$ select private.confirm_library_price(p_table, p_id); $$;

revoke all on function public.confirm_library_price(text, uuid) from public, anon;
grant execute on function public.confirm_library_price(text, uuid) to authenticated;
