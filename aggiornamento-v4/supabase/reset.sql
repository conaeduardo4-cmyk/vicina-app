-- =====================================================================
--  VICINA – AZZERAMENTO
--  ⚠️ Cancella eventuali tabelle/viste già esistenti con i nomi usati da Vicina
--     (profiles, links, groups, sos, messages) e i loro dati, più le funzioni e i
--     trigger lasciati da tentativi precedenti o da modelli di Supabase.
--     Se nel progetto hai un'altra app che usa questi nomi, NON eseguirlo:
--     crea un nuovo progetto Supabase gratuito solo per Vicina.
--  Gli account (Authentication → Users) e le foto non vengono toccati.
-- =====================================================================
do $$
declare r record;
begin
  -- 1) pulizia automatica programmata (se pg_cron è attivo)
  if to_regclass('cron.job') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''vicina-cleanup''';
  end if;

  -- 2) trigger su auth.users creati da altri tentativi/modelli (es. "handle_new_user" che scrive in profiles):
  --    se restano, la registrazione nell'app fallisce con "Database error saving new user"
  for r in
    select t.tgname from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace
     where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and n.nspname = 'public'
  loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
    raise notice 'Rimosso trigger % su auth.users', r.tgname;
  end loop;

  -- 3) tabelle / viste con i nomi di Vicina (qualunque tipo siano)
  for r in
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('messages', 'sos', 'links', 'groups', 'profiles')
  loop
    execute format('drop %s if exists public.%I cascade',
      case r.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'f' then 'foreign table' else 'table' end, r.relname);
    raise notice 'Rimossa %', r.relname;
  end loop;

  -- 4) funzioni con i nomi di Vicina (qualsiasi versione precedente)
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('save_token', 'set_muted', 'create_invite', 'redeem_invite', 'remove_link',
       'create_group', 'decide_join', 'remove_member', 'delete_group', 'send_sos', 'attach_sos_photos', 'ack_sos',
       'resolve_sos', 'delete_account', 'ping', 'handle_new_user', 'ai_take_quota', 'update_sos_location', 'stop_sos_live', 'attach_sos_audio')
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

drop schema if exists private cascade;
drop policy if exists "vicina: carico le mie foto SOS" on storage.objects;
drop policy if exists "vicina: vedo le foto SOS"       on storage.objects;

select 'Azzeramento fatto: ora esegui schema.sql' as risultato;
