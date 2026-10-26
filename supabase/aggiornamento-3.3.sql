-- =====================================================================
--  Vicina 3.3 · DURANTE IL TUO SOS VEDI DOVE SONO LE PERSONE DELLA TUA CERCHIA
--  Mentre un SOS è attivo, i telefoni di chi lo riceve (con l'app aperta) mandano la loro posizione.
--  La vede SOLO chi ha chiesto aiuto, e solo finché l'SOS è attivo: quando lo chiudi le posizioni vengono cancellate.
--  Esegui questo file nel SQL Editor (è già incluso in installa.sql, schema.sql e ripara.sql). Si può rieseguire.
--  NON cancella nessun dato.
-- =====================================================================
create table if not exists public.sos_positions (
  sos_id text not null references public.sos(id) on delete cascade,
  uid    uuid not null references auth.users(id) on delete cascade,
  name   text not null default '',
  lat    double precision not null check (abs(lat) <= 90),
  lng    double precision not null check (abs(lng) <= 180),
  acc    double precision,
  at     timestamptz not null default now(),
  primary key (sos_id, uid)
);
alter table public.sos_positions enable row level security;
revoke all on public.sos_positions from anon, authenticated;
grant select on public.sos_positions to authenticated;
drop policy if exists "posizioni sos: solo chi ha chiesto aiuto" on public.sos_positions;
create policy "posizioni sos: solo chi ha chiesto aiuto" on public.sos_positions for select to authenticated
  using (uid = auth.uid() or exists (select 1 from public.sos s where s.id = sos_id and s.from_uid = auth.uid() and s.active));

-- chi ha ricevuto l'SOS manda la sua posizione (al massimo una volta ogni 10 secondi)
create or replace function public.sos_share_pos(p_sos_id text, p_lat double precision, p_lng double precision, p_acc double precision default null)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); s public.sos; last timestamptz;
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Posizione non valida'; end if;
  select * into s from public.sos where id = p_sos_id;
  if not found or not (u = any(s.recipients)) then raise exception 'Non autorizzato'; end if;
  if not s.active then
    delete from public.sos_positions where sos_id = p_sos_id;
    return jsonb_build_object('ok', false, 'closed', true);
  end if;
  select at into last from public.sos_positions where sos_id = p_sos_id and uid = u;
  if last is not null and last > now() - interval '10 seconds' then return jsonb_build_object('ok', true, 'skipped', true); end if;
  insert into public.sos_positions (sos_id, uid, name, lat, lng, acc, at)
  values (p_sos_id, u, private.full_name(u), p_lat, p_lng, case when p_acc between 0 and 100000 then p_acc end, now())
  on conflict (sos_id, uid) do update set lat = excluded.lat, lng = excluded.lng, acc = excluded.acc, at = excluded.at, name = excluded.name;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.sos_share_pos(text, double precision, double precision, double precision) from public, anon;
grant execute on function public.sos_share_pos(text, double precision, double precision, double precision) to authenticated;

-- SOS chiuso: le posizioni della cerchia spariscono subito
create or replace function private.sos_positions_clear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active then delete from public.sos_positions where sos_id = new.id; end if;
  return null;
end $$;
drop trigger if exists vicina_sos_positions_clear on public.sos;
create trigger vicina_sos_positions_clear after update of active on public.sos for each row execute function private.sos_positions_clear();

notify pgrst, 'reload schema';
