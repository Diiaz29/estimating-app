-- Signatures belong to people, not the company: whoever authored a proposal
-- revision or change order signs it. Drawn in-app (PNG data URL, a few KB).
alter table public.profiles add column if not exists signature_data text;
alter table public.profiles add column if not exists signer_name text;
alter table public.profiles add column if not exists signer_title text;

-- Anyone may set their OWN signature without being able to touch their role.
create or replace function public.set_my_signature(p_data text, p_name text, p_title text)
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set signature_data = nullif(p_data, ''),
         signer_name = nullif(p_name, ''),
         signer_title = nullif(p_title, '')
   where id = auth.uid();
$$;
revoke all on function public.set_my_signature(text, text, text) from public;
grant execute on function public.set_my_signature(text, text, text) to authenticated;

-- the short-lived company-wide signer fields are replaced by per-user ones
delete from public.text_settings where key in ('signer_name', 'signer_title');
