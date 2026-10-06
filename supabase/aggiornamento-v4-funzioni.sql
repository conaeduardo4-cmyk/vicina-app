-- =====================================================================
--  VICINA – SOLO FUNZIONI (SOS, posizione live, vocale)
--  Da usare se l'app dice "Could not find the function …".
--  Non tocca lo spazio file (Storage): quello l'hai già sistemato a parte.
--  Esegui tutto nel SQL Editor. Si può rieseguire senza danni.
-- =====================================================================
-- ---------- Parte 1: prerequisiti (aggiornamento v3) ----------
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

-- ---------- Parte 2: novità v4 ----------
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


-- aggiorna subito l'elenco delle funzioni visto dall'app
notify pgrst, 'reload schema';

select proname from pg_proc where proname in ('send_sos','update_sos_location','stop_sos_live','attach_sos_audio','resolve_sos') order by 1;
