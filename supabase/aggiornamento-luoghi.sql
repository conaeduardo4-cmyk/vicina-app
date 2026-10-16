-- =====================================================================
--  Vicina · LUOGHI SICURI dal server (cache per zona, 7 giorni)
--  Supabase → SQL Editor → incolla → Run. Si può rieseguire.
--  Serve alla Edge Function «luoghi»: l'app non la legge mai direttamente.
-- =====================================================================
create table if not exists public.places_cache (
  key  text primary key,
  data jsonb not null default '[]',
  src  text not null default 'overpass',
  at   timestamptz not null default now()
);
alter table public.places_cache enable row level security;   -- nessuna regola: solo la funzione (service role) la usa
revoke all on public.places_cache from anon, authenticated;
