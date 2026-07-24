-- "Job adders" reads like jargon; the Settings sidebar now says "Added costs".
update public.settings set group_name = 'Added costs' where group_name = 'Job adders';
