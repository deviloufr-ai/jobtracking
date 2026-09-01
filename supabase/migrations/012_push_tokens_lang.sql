-- Per-device language so push notifications can be localized (FR/EN).
alter table public.push_tokens add column if not exists lang text;
