-- Device push tokens for native (Android FCM) notifications.
-- The client upserts its FCM token here on registration; a backend Edge Function
-- (send-push) reads them with the service role to deliver notifications.

create table if not exists public.push_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null default 'android',
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- A user can only see/manage their own device tokens. The sender uses the
-- service role key, which bypasses RLS.
drop policy if exists "push_tokens_own" on public.push_tokens;
create policy "push_tokens_own" on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
