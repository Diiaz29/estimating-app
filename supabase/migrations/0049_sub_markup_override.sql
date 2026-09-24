-- Per-quote markup on sub lines (factor, e.g. 1.25 = 25%). Null = the
-- sub_markup setting.
alter table public.line_items add column if not exists markup_override numeric;

notify pgrst, 'reload schema';
