-- Account names are independent of the client-facing signature fields.
alter table public.profiles add column first_name text
  check (first_name is null or (length(btrim(first_name)) between 1 and 80));
alter table public.profiles add column last_name text
  check (last_name is null or (length(btrim(last_name)) between 1 and 80));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (new.id, new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''));
  return new;
end;
$$;

-- Keep the privileged implementation out of the exposed public schema.
-- Callers can only change their own names; admins may correct team names.
create schema if not exists private;
create function private.set_profile_name(p_user_id uuid, p_first_name text, p_last_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (p_user_id is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'You may only update your own name.' using errcode = '42501';
  end if;
  if p_first_name is null or p_last_name is null
    or length(btrim(p_first_name)) not between 1 and 80
    or length(btrim(p_last_name)) not between 1 and 80 then
    raise exception 'First and last name are required (up to 80 characters each).' using errcode = '22023';
  end if;
  update public.profiles set first_name = btrim(p_first_name), last_name = btrim(p_last_name)
    where id = p_user_id;
  if not found then raise exception 'User not found.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function private.set_profile_name(uuid, text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.set_profile_name(uuid, text, text) to authenticated;

create function public.set_profile_name(p_user_id uuid, p_first_name text, p_last_name text)
returns void language sql security invoker set search_path = '' as $$
  select private.set_profile_name(p_user_id, p_first_name, p_last_name);
$$;
revoke all on function public.set_profile_name(uuid, text, text) from public, anon;
grant execute on function public.set_profile_name(uuid, text, text) to authenticated;
