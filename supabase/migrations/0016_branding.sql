-- Company branding files (logo). Public bucket: the logo appears on customer
-- documents anyway, and a stable URL keeps printing simple.
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "admin branding write" on storage.objects
  for insert to authenticated with check (bucket_id = 'branding' and public.is_admin());
create policy "admin branding update" on storage.objects
  for update to authenticated using (bucket_id = 'branding' and public.is_admin());
create policy "admin branding delete" on storage.objects
  for delete to authenticated using (bucket_id = 'branding' and public.is_admin());

-- upsert needs read access too
create policy "team branding read" on storage.objects
  for select to authenticated using (bucket_id = 'branding');
