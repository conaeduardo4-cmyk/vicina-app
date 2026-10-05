-- =====================================================================
--  VICINA – ASSISTENTE (Gemini): limite di messaggi al giorno per utente
--  Esegui questo file una volta nel SQL Editor (è incluso anche in installa.sql).
-- =====================================================================
create schema if not exists private;

create table if not exists private.ai_quota (
  uid uuid not null references auth.users(id) on delete cascade,
  day date not null,
  n   int  not null default 0,
  primary key (uid, day)
);
alter table private.ai_quota enable row level security;

-- Conta un messaggio e restituisce quanti ne restano oggi (-1 = limite superato).
-- La chiama solo la Edge Function "assistente" con la chiave di servizio.
create or replace function public.ai_take_quota(p_uid uuid, p_limit int) returns int
language plpgsql security definer set search_path = public, private as $$
declare c int;
begin
  insert into private.ai_quota (uid, day, n) values (p_uid, current_date, 1)
  on conflict (uid, day) do update set n = private.ai_quota.n + 1
  returning n into c;
  if random() < 0.02 then delete from private.ai_quota where day < current_date - 7; end if;
  if c > p_limit then return -1; end if;
  return p_limit - c;
end $$;

revoke all on function public.ai_take_quota(uuid, int) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.ai_take_quota(uuid, int) to service_role';
  end if;
end $$;
