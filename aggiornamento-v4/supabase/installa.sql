-- =====================================================================
--  VICINA – INSTALLAZIONE COMPLETA (azzeramento + server) in un solo file.
--  Incolla TUTTO in Supabase → SQL Editor → Run.
--  ⚠️ Cancella tabelle già esistenti chiamate profiles, links, groups, sos, messages.
-- =====================================================================
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


-- =====================================================================
--  VICINA – server su Supabase (piano gratuito)
--  Incolla TUTTO in Supabase → SQL Editor → Run.  Si può rieseguire.
--  Alla fine esegui anche la riga "select private.configure(...)" (vedi in fondo).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;
create extension if not exists pg_cron;


-- Controllo: se nel progetto esistono già tabelle con lo stesso nome ma struttura diversa
-- (per esempio da un tentativo precedente o da un modello di Supabase) ci fermiamo con un messaggio chiaro.
do $$
declare r record; t text;
begin
  for r in select * from (values
      ('profiles','id','uuid'), ('profiles','muted_groups','ARRAY'), ('profiles','fcm_tokens','ARRAY'), ('profiles','dob','date'),
      ('links','id','uuid'), ('links','uids','ARRAY'), ('links','pair','text'),
      ('groups','id','uuid'), ('groups','member_uids','ARRAY'), ('groups','members','jsonb'), ('groups','requests','jsonb'),
      ('sos','id','text'), ('sos','recipients','ARRAY'), ('sos','acks','jsonb'),
      ('messages','id','uuid'), ('messages','chat_id','uuid'), ('messages','photos','ARRAY')) v(tbl, col, typ)
  loop
    if to_regclass('public.' || r.tbl) is null then continue; end if;
    select data_type into t from information_schema.columns where table_schema = 'public' and table_name = r.tbl and column_name = r.col;
    if t is distinct from r.typ then
      raise exception 'La tabella public.% esiste già ma non è quella di Vicina (colonna "%": trovato %, atteso %). Esegui prima supabase/reset.sql, poi di nuovo questo file.',
        r.tbl, r.col, coalesce(t, 'assente'), r.typ;
    end if;
  end loop;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  Tabelle
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  surname      text not null check (char_length(surname) between 1 and 40),
  dob          date not null,
  gender       text not null check (gender in ('f','m')),
  phone        text not null default '' check (char_length(phone) <= 20),
  muted_groups uuid[] not null default '{}' check (cardinality(muted_groups) <= 20),
  fcm_tokens   text[] not null default '{}' check (cardinality(fcm_tokens) <= 10),
  last_sos_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- collegamenti 1:1 (partner / amici). L'id del collegamento è anche l'id della chat.
create table if not exists public.links (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('partner','friend')),
  uids       uuid[] not null check (cardinality(uids) = 2),
  names      jsonb not null default '{}',
  pair       text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists links_uids_idx on public.links using gin (uids);

-- gruppi (max 8). L'id del gruppo è anche l'id della chat.
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 30),
  admin_uid   uuid not null references auth.users(id) on delete cascade,
  code        text not null unique,
  member_uids uuid[] not null,
  members     jsonb not null default '{}',
  requests    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists groups_members_idx on public.groups using gin (member_uids);

-- codici di invito (non leggibili dall'app)
create table if not exists private.codes (
  code       text primary key,
  kind       text not null check (kind in ('partner','friend','group')),
  owner      uuid not null references auth.users(id) on delete cascade,
  group_id   uuid references public.groups(id) on delete cascade,
  expires_at timestamptz
);

create table if not exists public.sos (
  id          text primary key,
  from_uid    uuid not null references auth.users(id) on delete cascade,
  from_name   text not null default '',
  from_phone  text not null default '',
  recipients  uuid[] not null,
  chats       uuid[] not null,
  lat         double precision,
  lng         double precision,
  acc         integer,
  photos      text[] not null default '{}',
  acks        jsonb not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists sos_recipients_idx on public.sos using gin (recipients);
create index if not exists sos_from_idx on public.sos (from_uid, active);
create index if not exists sos_created_idx on public.sos (created_at);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null,
  type       text not null check (type in ('text','sos','safe')),
  from_uid   uuid not null,
  from_name  text not null default '',
  text       text check (text is null or char_length(text) between 1 and 1000),
  sos_id     text,
  lat        double precision,
  lng        double precision,
  photos     text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_idx on public.messages (chat_id, created_at desc);
create index if not exists messages_sos_idx on public.messages (sos_id);

-- ---------------------------------------------------------------------
--  Funzioni di supporto (schema private, non esposto all'app)
-- ---------------------------------------------------------------------
create or replace function private.full_name(u uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare n text;
begin
  select trim(name || ' ' || surname) into n from public.profiles where id = u;
  if n is null then raise exception 'Completa prima il profilo'; end if;
  return n;
end $$;

create or replace function private.unique_code() returns text
language plpgsql security definer set search_path = public, private, extensions as $$
declare c text; chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea; i int;
begin
  loop
    b := extensions.gen_random_bytes(6); c := '';
    for i in 0..5 loop c := c || substr(chars, (get_byte(b, i) % 31) + 1, 1); end loop;
    exit when not exists (select 1 from private.codes where code = c)
          and not exists (select 1 from public.groups where code = c);
  end loop;
  return c;
end $$;

-- chi può leggere/scrivere nella chat
create or replace function private.can_chat(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.links  where id = cid and auth.uid() = any(uids))
      or exists (select 1 from public.groups where id = cid and auth.uid() = any(member_uids));
$$;

-- configurazione per le notifiche push (salvata nel Vault cifrato di Supabase)
create or replace function private.configure(project_url text, push_secret text) returns text
language plpgsql security definer set search_path = public, vault as $$
begin
  delete from vault.secrets where name in ('vicina_project_url', 'vicina_push_secret');
  perform vault.create_secret(rtrim(project_url, '/'), 'vicina_project_url');
  perform vault.create_secret(push_secret, 'vicina_push_secret');
  return 'ok';
end $$;

-- chiama la Edge Function "vicina" (asincrono, parte dopo il commit)
create or replace function private.push(event text, id text, extra jsonb default '{}') returns void
language plpgsql security definer set search_path = public, extensions as $$
declare url text; sec text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'vicina_project_url';
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'vicina_push_secret';
  if url is null or sec is null then return; end if;
  perform net.http_post(
    url := url || '/functions/v1/vicina',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-vicina-secret', sec),
    body := jsonb_build_object('event', event, 'id', id) || coalesce(extra, '{}'::jsonb),
    timeout_milliseconds := 8000);
exception when others then
  raise warning 'vicina push: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
--  Messaggi: nome mittente e orario li decide il server; push sui testi
-- ---------------------------------------------------------------------
create or replace function private.before_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'text' then
    new.from_name := coalesce((select trim(name || ' ' || surname) from public.profiles where id = new.from_uid), '');
    new.created_at := now(); new.photos := '{}'; new.sos_id := null; new.lat := null; new.lng := null;
  end if;
  return new;
end $$;
create or replace function private.after_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'text' then perform private.push('msg', new.id::text); end if;
  return null;
end $$;
drop trigger if exists vicina_before_message on public.messages;
create trigger vicina_before_message before insert on public.messages for each row execute function private.before_message();
drop trigger if exists vicina_after_message on public.messages;
create trigger vicina_after_message after insert on public.messages for each row execute function private.after_message();

-- ---------------------------------------------------------------------
--  Sicurezza (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.links    enable row level security;
alter table public.groups   enable row level security;
alter table public.sos      enable row level security;
alter table public.messages enable row level security;
alter table private.codes   enable row level security;

revoke all on public.profiles, public.links, public.groups, public.sos, public.messages from anon, authenticated;
grant select on public.profiles, public.links, public.groups, public.sos, public.messages to authenticated;
grant insert (id, name, surname, dob, gender, phone) on public.profiles to authenticated;
grant update (phone) on public.profiles to authenticated;
grant insert (chat_id, type, from_uid, text) on public.messages to authenticated;

drop policy if exists "profilo: leggo il mio"   on public.profiles;
drop policy if exists "profilo: creo il mio"    on public.profiles;
drop policy if exists "profilo: modifico il mio" on public.profiles;
create policy "profilo: leggo il mio"    on public.profiles for select to authenticated using (id = auth.uid());
create policy "profilo: creo il mio"     on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profilo: modifico il mio" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "collegamenti: solo i miei" on public.links;
create policy "collegamenti: solo i miei" on public.links for select to authenticated using (auth.uid() = any(uids));

drop policy if exists "gruppi: solo i miei" on public.groups;
create policy "gruppi: solo i miei" on public.groups for select to authenticated using (auth.uid() = any(member_uids));

drop policy if exists "sos: mittente e destinatari" on public.sos;
create policy "sos: mittente e destinatari" on public.sos for select to authenticated using (from_uid = auth.uid() or auth.uid() = any(recipients));

drop policy if exists "messaggi: partecipanti leggono" on public.messages;
drop policy if exists "messaggi: partecipanti scrivono" on public.messages;
create policy "messaggi: partecipanti leggono" on public.messages for select to authenticated using (private.can_chat(chat_id));
create policy "messaggi: partecipanti scrivono" on public.messages for insert to authenticated
  with check (type = 'text' and from_uid = auth.uid() and private.can_chat(chat_id));

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.can_chat(uuid) to authenticated;

-- ---------------------------------------------------------------------
--  Azioni dell'app (RPC). Tutte le scritture sensibili passano da qui.
-- ---------------------------------------------------------------------
create or replace function public.save_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(p_token, '') = '' or char_length(p_token) > 400 then return; end if;
  update public.profiles
     set fcm_tokens = (array_remove(fcm_tokens, p_token) || p_token)[greatest(1, cardinality(array_remove(fcm_tokens, p_token)) - 8):]
   where id = auth.uid();
end $$;

create or replace function public.set_muted(p_group_id uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set muted_groups = case when p_muted then array_append(array_remove(muted_groups, p_group_id), p_group_id)
                             else array_remove(muted_groups, p_group_id) end
   where id = auth.uid();
end $$;

create or replace function public.create_invite(p_kind text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); c text; exp timestamptz := now() + interval '10 minutes';
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if p_kind not in ('friend', 'partner') then raise exception 'Tipo non valido'; end if;
  perform private.full_name(u);
  delete from private.codes where owner = u and kind = p_kind;
  c := private.unique_code();
  insert into private.codes (code, kind, owner, expires_at) values (c, p_kind, u, exp);
  return jsonb_build_object('code', c, 'expiresAt', floor(extract(epoch from exp) * 1000)::bigint);
end $$;

create or replace function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); me text; r private.codes; g public.groups; oname text; pid text; lid uuid;
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  me := private.full_name(u);
  select * into r from private.codes where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Codice non valido o scaduto'; end if;

  if r.kind = 'group' then
    select * into g from public.groups where id = r.group_id for update;
    if not found then raise exception 'Gruppo non trovato'; end if;
    if u = any(g.member_uids) then raise exception 'Sei già nel gruppo'; end if;
    if g.requests ? u::text then raise exception 'Hai già chiesto di entrare: attendi l''approvazione'; end if;
    if cardinality(g.member_uids) >= 8 then raise exception 'Il gruppo è pieno (massimo 8 persone)'; end if;
    if (select count(*) from jsonb_object_keys(g.requests)) >= 20 then raise exception 'Troppe richieste in attesa'; end if;
    update public.groups set requests = requests || jsonb_build_object(u::text, me) where id = g.id;
    perform private.push('join', g.id::text, jsonb_build_object('uid', u));
    return jsonb_build_object('kind', 'group', 'name', g.name);
  end if;

  if r.expires_at < now() then
    delete from private.codes where code = r.code;
    raise exception 'Codice scaduto: chiedine uno nuovo';
  end if;
  if r.owner = u then raise exception 'Questo è il tuo codice: condividilo con l''altra persona'; end if;
  if r.kind = 'partner' then
    if exists (select 1 from public.links where kind = 'partner' and u = any(uids)) then raise exception 'Hai già un partner'; end if;
    if exists (select 1 from public.links where kind = 'partner' and r.owner = any(uids)) then raise exception 'Questa persona ha già un partner'; end if;
  end if;
  pid := least(u::text, r.owner::text) || '_' || greatest(u::text, r.owner::text);
  if exists (select 1 from public.links where pair = pid) then raise exception 'Siete già collegati'; end if;
  oname := private.full_name(r.owner);
  insert into public.links (kind, uids, names, pair)
       values (r.kind, array[u, r.owner], jsonb_build_object(u::text, me, r.owner::text, oname), pid)
    returning id into lid;
  delete from private.codes where code = r.code;
  perform private.push('link', lid::text, jsonb_build_object('to', r.owner, 'name', me));
  return jsonb_build_object('kind', r.kind, 'name', oname);
end $$;

create or replace function public.remove_link(p_link_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.links where id = p_link_id and auth.uid() = any(uids)) then raise exception 'Non autorizzato'; end if;
  delete from public.messages where chat_id = p_link_id;
  delete from public.links where id = p_link_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.create_group(p_name text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); me text; n text := left(trim(coalesce(p_name, '')), 30); c text; gid uuid;
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if n = '' then raise exception 'Dai un nome al gruppo'; end if;
  if (select count(*) from public.groups where u = any(member_uids)) >= 10 then raise exception 'Hai raggiunto il massimo di 10 gruppi'; end if;
  me := private.full_name(u); c := private.unique_code();
  insert into public.groups (name, admin_uid, code, member_uids, members)
       values (n, u, c, array[u], jsonb_build_object(u::text, me)) returning id into gid;
  insert into private.codes (code, kind, owner, group_id) values (c, 'group', u, gid);
  return jsonb_build_object('groupId', gid, 'code', c);
end $$;

create or replace function public.decide_join(p_group_id uuid, p_uid uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare g public.groups; n text;
begin
  select * into g from public.groups where id = p_group_id for update;
  if not found or g.admin_uid <> auth.uid() then raise exception 'Solo l''admin può farlo'; end if;
  n := g.requests ->> p_uid::text;
  if n is null then raise exception 'Richiesta non trovata'; end if;
  if p_accept and cardinality(g.member_uids) >= 8 then raise exception 'Gruppo pieno: massimo 8 persone'; end if;
  update public.groups set
    requests    = requests - p_uid::text,
    member_uids = case when p_accept then array_append(member_uids, p_uid) else member_uids end,
    members     = case when p_accept then members || jsonb_build_object(p_uid::text, n) else members end
  where id = p_group_id;
  if p_accept then perform private.push('joined', p_group_id::text, jsonb_build_object('uid', p_uid)); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remove_member(p_group_id uuid, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where id = p_group_id for update;
  if not found then raise exception 'Gruppo non trovato'; end if;
  if p_uid = g.admin_uid then raise exception 'L''admin non può uscire: elimina il gruppo'; end if;
  if auth.uid() <> g.admin_uid and auth.uid() <> p_uid then raise exception 'Non autorizzato'; end if;
  update public.groups set member_uids = array_remove(member_uids, p_uid), members = members - p_uid::text where id = p_group_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.delete_group(p_group_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.groups where id = p_group_id and admin_uid = auth.uid()) then raise exception 'Solo l''admin può eliminare il gruppo'; end if;
  delete from public.messages where chat_id = p_group_id;
  delete from public.groups where id = p_group_id;  -- il codice si cancella a cascata
  return jsonb_build_object('ok', true);
end $$;

-- SOS: l'allarme parte subito, le foto si aggiungono dopo
create or replace function public.send_sos(p_sos_id text, p_lat double precision default null, p_lng double precision default null, p_acc double precision default null) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); p public.profiles; me text; ch uuid[]; rec uuid[]; loc boolean;
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if coalesce(p_sos_id, '') !~ '^[A-Za-z0-9_-]{10,40}$' then raise exception 'SOS non valido'; end if;
  select * into p from public.profiles where id = u for update;
  if not found then raise exception 'Completa prima il profilo'; end if;
  if p.last_sos_at > now() - interval '20 seconds' then raise exception 'Hai appena inviato un SOS: la tua cerchia è già stata avvisata'; end if;
  me := trim(p.name || ' ' || p.surname);

  select coalesce(array_agg(id), '{}') into ch from (
    select id from public.links where u = any(uids)
    union all
    select id from public.groups where u = any(member_uids) and not (id = any(p.muted_groups))) x;
  select coalesce(array_agg(distinct m), '{}') into rec from (
    select unnest(uids) m from public.links where u = any(uids)
    union
    select unnest(member_uids) from public.groups where u = any(member_uids) and not (id = any(p.muted_groups))) y
  where m <> u;
  if cardinality(ch) = 0 or cardinality(rec) = 0 then raise exception 'Aggiungi prima qualcuno da avvisare'; end if;
  if exists (select 1 from public.sos where id = p_sos_id) then raise exception 'SOS già inviato'; end if;

  loc := p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180;
  update public.sos set active = false, resolved_at = now() where from_uid = u and active;  -- uno solo attivo
  insert into public.sos (id, from_uid, from_name, from_phone, recipients, chats, lat, lng, acc)
       values (p_sos_id, u, me, p.phone, rec, ch,
               case when loc then p_lat end, case when loc then p_lng end, case when loc and p_acc is not null then round(p_acc)::int end);
  insert into public.messages (chat_id, type, from_uid, from_name, sos_id, lat, lng)
       select c, 'sos', u, me, p_sos_id, case when loc then p_lat end, case when loc then p_lng end from unnest(ch) c;
  update public.profiles set last_sos_at = now() where id = u;
  perform private.push('sos', p_sos_id);
  return jsonb_build_object('recipients', cardinality(rec));
end $$;

create or replace function public.attach_sos_photos(p_sos_id text, p_paths text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ok text[];
begin
  if not exists (select 1 from public.sos where id = p_sos_id and from_uid = auth.uid()) then raise exception 'Non autorizzato'; end if;
  select coalesce(array_agg(distinct x), '{}') into ok from unnest(coalesce(p_paths, '{}')) x
   where x ~ ('^sos/' || auth.uid()::text || '/' || p_sos_id || '/(back|front)\.jpg$');
  if cardinality(ok) = 0 then return jsonb_build_object('ok', true); end if;
  update public.sos set photos = array(select distinct unnest(photos || ok)) where id = p_sos_id;
  update public.messages set photos = array(select distinct unnest(photos || ok)) where sos_id = p_sos_id;
  return jsonb_build_object('ok', true);
end $$;

-- "Ho visto, me ne occupo"
create or replace function public.ack_sos(p_sos_id text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid();
begin
  if not exists (select 1 from public.sos where id = p_sos_id and u = any(recipients)) then raise exception 'Non autorizzato'; end if;
  update public.sos set acks = acks || jsonb_build_object(u::text, private.full_name(u)) where id = p_sos_id;
  perform private.push('ack', p_sos_id, jsonb_build_object('uid', u));
  return jsonb_build_object('ok', true);
end $$;

-- "Sono al sicuro"
create or replace function public.resolve_sos(p_sos_id text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare s public.sos;
begin
  select * into s from public.sos where id = p_sos_id and from_uid = auth.uid() for update;
  if not found then raise exception 'Non autorizzato'; end if;
  if not s.active then return jsonb_build_object('ok', true); end if;
  update public.sos set active = false, resolved_at = now() where id = p_sos_id;
  insert into public.messages (chat_id, type, from_uid, from_name, sos_id)
       select c, 'safe', s.from_uid, s.from_name, p_sos_id from unnest(s.chats) c
        where exists (select 1 from public.links where id = c) or exists (select 1 from public.groups where id = c);
  perform private.push('safe', p_sos_id);
  return jsonb_build_object('ok', true);
end $$;

-- Eliminazione account (obbligatoria per l'App Store)
create or replace function public.delete_account() returns jsonb
language plpgsql security definer set search_path = public, private, auth as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  perform private.push('purge', u::text);  -- cancella le foto dallo storage
  delete from public.messages where chat_id in (select id from public.links where u = any(uids));
  delete from public.links where u = any(uids);
  delete from public.messages where chat_id in (select id from public.groups where admin_uid = u);
  delete from public.groups where admin_uid = u;
  update public.groups set member_uids = array_remove(member_uids, u), members = members - u::text, requests = requests - u::text
   where u = any(member_uids) or requests ? u::text;
  begin
    delete from auth.users where id = u;  -- profilo, SOS e codici si cancellano a cascata
  exception when insufficient_privilege then
    -- se il database non lo permette, l'utente viene eliminato dalla Edge Function ("purge")
    delete from public.sos where from_uid = u;
    delete from private.codes where owner = u;
    delete from public.profiles where id = u;
  end;
  return jsonb_build_object('ok', true);
end $$;

-- usata dal controllo giornaliero che evita la pausa del piano gratuito
create or replace function public.ping() returns text language sql stable as $$ select 'ok'::text $$;

revoke execute on function public.save_token(text), public.set_muted(uuid, boolean), public.create_invite(text),
  public.redeem_invite(text), public.remove_link(uuid), public.create_group(text), public.decide_join(uuid, uuid, boolean),
  public.remove_member(uuid, uuid), public.delete_group(uuid), public.send_sos(text, double precision, double precision, double precision),
  public.attach_sos_photos(text, text[]), public.ack_sos(text), public.resolve_sos(text), public.delete_account()
  from public, anon;
grant execute on function public.save_token(text), public.set_muted(uuid, boolean), public.create_invite(text),
  public.redeem_invite(text), public.remove_link(uuid), public.create_group(text), public.decide_join(uuid, uuid, boolean),
  public.remove_member(uuid, uuid), public.delete_group(uuid), public.send_sos(text, double precision, double precision, double precision),
  public.attach_sos_photos(text, text[]), public.ack_sos(text), public.resolve_sos(text), public.delete_account()
  to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------------
--  Foto SOS (Storage): bucket privato, max 2 MB, solo JPEG
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sos', 'sos', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

-- Le regole sui file (storage.objects) appartengono a Supabase: su alcuni progetti il database non può modificarle
-- da qui ("must be owner of table objects" / "error creating policy"). In quel caso NON si blocca tutto:
-- esce un avviso e le regole vanno create una volta a mano (README → "Regole dei file").
do $vicina_storage$
begin
  drop policy if exists "vicina: carico le mie foto SOS" on storage.objects;
  drop policy if exists "vicina: vedo le foto SOS"       on storage.objects;
  create policy "vicina: carico le mie foto SOS" on storage.objects for insert to authenticated
    with check (bucket_id = 'sos' and (storage.foldername(name))[1] = auth.uid()::text
                and storage.filename(name) in ('back.jpg', 'front.jpg'));
  create policy "vicina: vedo le foto SOS" on storage.objects for select to authenticated
    using (bucket_id = 'sos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.sos s where s.id = (storage.foldername(name))[2] and auth.uid() = any(s.recipients))));
exception when insufficient_privilege or others then
  raise notice 'Regole dei file non aggiornate (%): se i vocali o le foto non si caricano, creale da Supabase → Storage → Policies (vedi README).', sqlerrm;
end
$vicina_storage$;

-- ---------------------------------------------------------------------
--  Tempo reale
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'links', 'groups', 'sos', 'messages'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  Pulizia automatica ogni ora (pg_cron, gratuito)
--  - chiude gli SOS rimasti aperti da più di 12 ore
--  - cancella i codici scaduti
--  - chiede alla Edge Function di cancellare foto e SOS più vecchi di 7 giorni
-- ---------------------------------------------------------------------
create or replace function private.cleanup() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  update public.sos set active = false, resolved_at = now() where active and created_at < now() - interval '12 hours';
  delete from private.codes where expires_at is not null and expires_at < now();
  perform private.push('cleanup', 'all');
end $$;

do $$
begin
  if to_regclass('cron.job') is null then
    raise exception 'Estensione pg_cron non attiva: in Supabase vai su Database → Extensions, attiva "pg_cron", poi riesegui questo file.';
  end if;
  execute 'select cron.unschedule(jobid) from cron.job where jobname = ''vicina-cleanup''';
  execute 'select cron.schedule(''vicina-cleanup'', ''17 * * * *'', ''select private.cleanup()'')';
end $$;

-- ---------------------------------------------------------------------
--  Assistente (Gemini): limite giornaliero
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
--  v3: posizione live 15 minuti + messaggio vocale
-- ---------------------------------------------------------------------

alter table public.sos      add column if not exists loc_at     timestamptz;
alter table public.sos      add column if not exists live_until timestamptz;
alter table public.sos      add column if not exists track      jsonb not null default '[]';
alter table public.sos      add column if not exists audio      text;
alter table public.messages add column if not exists audio      text;

-- SOS con posizione live facoltativa (p_live = true → aggiornamenti per 15 minuti)
drop function if exists public.send_sos(text, double precision, double precision, double precision);
create or replace function public.send_sos(p_sos_id text, p_lat double precision default null, p_lng double precision default null,
                                           p_acc double precision default null, p_live boolean default true) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); p public.profiles; me text; ch uuid[]; rec uuid[]; loc boolean;
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if coalesce(p_sos_id, '') !~ '^[A-Za-z0-9_-]{10,40}$' then raise exception 'SOS non valido'; end if;
  select * into p from public.profiles where id = u for update;
  if not found then raise exception 'Completa prima il profilo'; end if;
  if p.last_sos_at > now() - interval '20 seconds' then raise exception 'Hai appena inviato un SOS: la tua cerchia è già stata avvisata'; end if;
  me := trim(p.name || ' ' || p.surname);

  select coalesce(array_agg(id), '{}') into ch from (
    select id from public.links where u = any(uids)
    union all
    select id from public.groups where u = any(member_uids) and not (id = any(p.muted_groups))) x;
  select coalesce(array_agg(distinct m), '{}') into rec from (
    select unnest(uids) m from public.links where u = any(uids)
    union
    select unnest(member_uids) from public.groups where u = any(member_uids) and not (id = any(p.muted_groups))) y
  where m <> u;
  if cardinality(ch) = 0 or cardinality(rec) = 0 then raise exception 'Aggiungi prima qualcuno da avvisare'; end if;
  if exists (select 1 from public.sos where id = p_sos_id) then raise exception 'SOS già inviato'; end if;

  loc := p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180;
  update public.sos set active = false, resolved_at = now(), live_until = least(live_until, now()) where from_uid = u and active;
  insert into public.sos (id, from_uid, from_name, from_phone, recipients, chats, lat, lng, acc, loc_at, live_until, track)
       values (p_sos_id, u, me, p.phone, rec, ch,
               case when loc then p_lat end, case when loc then p_lng end, case when loc and p_acc is not null then round(p_acc)::int end,
               case when loc then now() end,
               case when coalesce(p_live, false) then now() + interval '15 minutes' end,
               case when loc then jsonb_build_array(jsonb_build_object('lat', p_lat, 'lng', p_lng, 't', floor(extract(epoch from now()) * 1000))) else '[]'::jsonb end);
  insert into public.messages (chat_id, type, from_uid, from_name, sos_id, lat, lng)
       select c, 'sos', u, me, p_sos_id, case when loc then p_lat end, case when loc then p_lng end from unnest(ch) c;
  update public.profiles set last_sos_at = now() where id = u;
  perform private.push('sos', p_sos_id);
  return jsonb_build_object('recipients', cardinality(rec), 'liveUntil',
    case when coalesce(p_live, false) then floor(extract(epoch from now() + interval '15 minutes') * 1000) end);
end $$;

-- Aggiornamento della posizione durante i 15 minuti live
create or replace function public.update_sos_location(p_sos_id text, p_lat double precision, p_lng double precision, p_acc double precision default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.sos;
begin
  select * into s from public.sos where id = p_sos_id and from_uid = auth.uid();
  if not found then raise exception 'Non autorizzato'; end if;
  if not s.active or s.live_until is null or s.live_until < now() then return jsonb_build_object('live', false); end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Posizione non valida'; end if;
  if s.loc_at is not null and s.loc_at > now() - interval '4 seconds' then
    return jsonb_build_object('live', true, 'until', floor(extract(epoch from s.live_until) * 1000));   -- troppo ravvicinato
  end if;
  update public.sos set lat = p_lat, lng = p_lng, acc = case when p_acc is null then null else round(p_acc)::int end, loc_at = now(),
         track = (case when jsonb_array_length(track) >= 150 then track - 0 else track end)
                 || jsonb_build_array(jsonb_build_object('lat', p_lat, 'lng', p_lng, 't', floor(extract(epoch from now()) * 1000)))
   where id = p_sos_id;
  update public.messages set lat = p_lat, lng = p_lng where sos_id = p_sos_id and type = 'sos';
  return jsonb_build_object('live', true, 'until', floor(extract(epoch from s.live_until) * 1000));
end $$;

-- Ferma la posizione live (dal pulsante "Ferma" o da "Sono al sicuro")
create or replace function public.stop_sos_live(p_sos_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.sos set live_until = least(coalesce(live_until, now()), now()) where id = p_sos_id and from_uid = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- Messaggio vocale allegato all'SOS
create or replace function public.attach_sos_audio(p_sos_id text, p_path text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from public.sos where id = p_sos_id and from_uid = auth.uid()) then raise exception 'Non autorizzato'; end if;
  if coalesce(p_path, '') !~ ('^sos/' || auth.uid()::text || '/' || p_sos_id || '/voice\.(webm|m4a|mp4|ogg|aac)$') then raise exception 'File non valido'; end if;
  update public.sos set audio = p_path where id = p_sos_id;
  update public.messages set audio = p_path where sos_id = p_sos_id and type = 'sos';
  perform private.push('voice', p_sos_id);
  return jsonb_build_object('ok', true);
end $$;

-- "Sono al sicuro" chiude anche la posizione live
create or replace function public.resolve_sos(p_sos_id text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare s public.sos;
begin
  select * into s from public.sos where id = p_sos_id and from_uid = auth.uid() for update;
  if not found then raise exception 'Non autorizzato'; end if;
  if not s.active then return jsonb_build_object('ok', true); end if;
  update public.sos set active = false, resolved_at = now(), live_until = least(coalesce(live_until, now()), now()) where id = p_sos_id;
  insert into public.messages (chat_id, type, from_uid, from_name, sos_id)
       select c, 'safe', s.from_uid, s.from_name, p_sos_id from unnest(s.chats) c
        where exists (select 1 from public.links where id = c) or exists (select 1 from public.groups where id = c);
  perform private.push('safe', p_sos_id);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.send_sos(text, double precision, double precision, double precision, boolean),
  public.update_sos_location(text, double precision, double precision, double precision), public.stop_sos_live(text),
  public.attach_sos_audio(text, text), public.resolve_sos(text) from public, anon;
grant execute on function public.send_sos(text, double precision, double precision, double precision, boolean),
  public.update_sos_location(text, double precision, double precision, double precision), public.stop_sos_live(text),
  public.attach_sos_audio(text, text), public.resolve_sos(text) to authenticated;

-- Storage: anche l'audio (max 3 MB)
update storage.buckets set file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg']
 where id = 'sos';
-- Le regole sui file (storage.objects) appartengono a Supabase: su alcuni progetti il database non può modificarle
-- da qui ("must be owner of table objects" / "error creating policy"). In quel caso NON si blocca tutto:
-- esce un avviso e le regole vanno create una volta a mano (README → "Regole dei file").
do $vicina_storage$
begin
  drop policy if exists "vicina: carico le mie foto SOS" on storage.objects;
  create policy "vicina: carico le mie foto SOS" on storage.objects for insert to authenticated
    with check (bucket_id = 'sos' and (storage.foldername(name))[1] = auth.uid()::text
                and storage.filename(name) in ('back.jpg', 'front.jpg', 'voice.webm', 'voice.m4a', 'voice.mp4', 'voice.ogg', 'voice.aac'));
exception when insufficient_privilege or others then
  raise notice 'Regole dei file non aggiornate (%): se i vocali o le foto non si caricano, creale da Supabase → Storage → Policies (vedi README).', sqlerrm;
end
$vicina_storage$;

-- =====================================================================
--  ⚠️ ULTIMO PASSO – esegui questa riga con i TUOI valori
--  (l'URL lo trovi in Project Settings → API; il segreto inventalo tu,
--   lungo e casuale, e usa lo stesso in VICINA_PUSH_SECRET della funzione)
--
--  select private.configure('https://TUO-PROGETTO.supabase.co', 'METTI-QUI-UN-SEGRETO-LUNGO');
-- =====================================================================

select 'Vicina installata. Ora esegui: select private.configure(...)' as risultato;


-- =====================================================================
--  VICINA – AGGIORNAMENTO v4
--  · Posizione live attiva per tutto l'SOS, finché non tocchi "Sono al sicuro"
--    (prima durava 15 minuti). Non si può fermare prima.
--  · Percorso più lungo sulla mappa (ultimi 300 punti).
--  Esegui questo file nel SQL Editor (è già incluso in installa.sql e schema.sql). Si può rieseguire.
-- =====================================================================

-- SOS: la posizione live parte sempre e dura quanto l'SOS (massimo 12 ore, poi la pulizia automatica lo chiude)
create or replace function public.send_sos(p_sos_id text, p_lat double precision default null, p_lng double precision default null,
                                           p_acc double precision default null, p_live boolean default true) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); p public.profiles; me text; ch uuid[]; rec uuid[]; loc boolean; lu timestamptz := now() + interval '12 hours';
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if coalesce(p_sos_id, '') !~ '^[A-Za-z0-9_-]{10,40}$' then raise exception 'SOS non valido'; end if;
  select * into p from public.profiles where id = u for update;
  if not found then raise exception 'Completa prima il profilo'; end if;
  if p.last_sos_at > now() - interval '20 seconds' then raise exception 'Hai appena inviato un SOS: la tua cerchia è già stata avvisata'; end if;
  me := trim(p.name || ' ' || p.surname);

  select coalesce(array_agg(id), '{}') into ch from (
    select id from public.links where u = any(uids)
    union all
    select id from public.groups where u = any(member_uids) and not (id = any(p.muted_groups))) x;
  select coalesce(array_agg(distinct m), '{}') into rec from (
    select unnest(uids) m from public.links where u = any(uids)
    union
    select unnest(member_uids) from public.groups where u = any(member_uids) and not (id = any(p.muted_groups))) y
  where m <> u;
  if cardinality(ch) = 0 or cardinality(rec) = 0 then raise exception 'Aggiungi prima qualcuno da avvisare'; end if;
  if exists (select 1 from public.sos where id = p_sos_id) then raise exception 'SOS già inviato'; end if;

  loc := p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180;
  update public.sos set active = false, resolved_at = now(), live_until = least(live_until, now()) where from_uid = u and active;
  insert into public.sos (id, from_uid, from_name, from_phone, recipients, chats, lat, lng, acc, loc_at, live_until, track)
       values (p_sos_id, u, me, p.phone, rec, ch,
               case when loc then p_lat end, case when loc then p_lng end, case when loc and p_acc is not null then round(p_acc)::int end,
               case when loc then now() end, lu,
               case when loc then jsonb_build_array(jsonb_build_object('lat', p_lat, 'lng', p_lng, 't', floor(extract(epoch from now()) * 1000))) else '[]'::jsonb end);
  insert into public.messages (chat_id, type, from_uid, from_name, sos_id, lat, lng)
       select c, 'sos', u, me, p_sos_id, case when loc then p_lat end, case when loc then p_lng end from unnest(ch) c;
  update public.profiles set last_sos_at = now() where id = u;
  perform private.push('sos', p_sos_id);
  return jsonb_build_object('recipients', cardinality(rec), 'liveUntil', floor(extract(epoch from lu) * 1000));
end $$;

-- Aggiornamento della posizione finché l'SOS è attivo
create or replace function public.update_sos_location(p_sos_id text, p_lat double precision, p_lng double precision, p_acc double precision default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.sos;
begin
  select * into s from public.sos where id = p_sos_id and from_uid = auth.uid();
  if not found then raise exception 'Non autorizzato'; end if;
  if not s.active then return jsonb_build_object('live', false); end if;
  if s.live_until is null or s.live_until < now() + interval '1 hour' then        -- SOS vecchi (v3): la live continua lo stesso
    update public.sos set live_until = greatest(coalesce(s.created_at, now()) + interval '12 hours', now() + interval '1 hour') where id = p_sos_id;
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Posizione non valida'; end if;
  if s.loc_at is not null and s.loc_at > now() - interval '4 seconds' then
    return jsonb_build_object('live', true);                                       -- troppo ravvicinato
  end if;
  update public.sos set lat = p_lat, lng = p_lng, acc = case when p_acc is null then null else round(p_acc)::int end, loc_at = now(),
         track = (case when jsonb_array_length(track) >= 300 then track - 0 else track end)
                 || jsonb_build_array(jsonb_build_object('lat', p_lat, 'lng', p_lng, 't', floor(extract(epoch from now()) * 1000)))
   where id = p_sos_id;
  update public.messages set lat = p_lat, lng = p_lng where sos_id = p_sos_id and type = 'sos';
  return jsonb_build_object('live', true);
end $$;

-- La posizione live non si ferma più a mano: si chiude solo con "Sono al sicuro" (resolve_sos).
create or replace function public.stop_sos_live(p_sos_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.sos set live_until = least(coalesce(live_until, now()), now())
   where id = p_sos_id and from_uid = auth.uid() and not active;
  return jsonb_build_object('ok', true);
end $$;


-- =====================================================================
--  VICINA – TERMINI D'USO: registra sul server quale versione dei termini ha accettato ogni utente e quando
--  Esegui questo file nel SQL Editor (è già incluso in installa.sql e schema.sql). Si può rieseguire.
-- =====================================================================
alter table public.profiles add column if not exists terms_version     int not null default 0;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.accept_terms(p_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Accedi per continuare'; end if;
  if p_version is null or p_version < 1 or p_version > 1000 then raise exception 'Versione non valida'; end if;
  update public.profiles set terms_version = greatest(terms_version, p_version), terms_accepted_at = now() where id = auth.uid();
  return jsonb_build_object('ok', found);
end $$;

revoke execute on function public.accept_terms(int) from public, anon;
grant execute on function public.accept_terms(int) to authenticated;
notify pgrst, 'reload schema';
