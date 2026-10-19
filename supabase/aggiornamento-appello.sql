-- =====================================================================
--  Vicina · APPELLO «State tutti bene?»
--  Terremoto, alluvione, incendio, attentato, blackout o una serata finita male:
--  con un gesto tutta la cerchia (amici, partner e gruppi) riceve la domanda e ognuno risponde
--  «Sto bene» o «Ho bisogno di aiuto», con la posizione. Chi ha lanciato l'appello vede tutto dal vivo.
--  Esegui questo file nel SQL Editor (è già incluso in installa.sql e schema.sql). Si può rieseguire.
-- =====================================================================

create table if not exists public.checks (
  id          text primary key,
  from_uid    uuid not null references auth.users(id) on delete cascade,
  from_name   text not null default '',
  reason      text not null default 'altro'
              check (reason in ('terremoto','alluvione','incendio','attentato','blackout','maltempo','serata','altro')),
  note        text check (note is null or char_length(note) <= 140),
  recipients  uuid[] not null,
  lat         double precision,
  lng         double precision,
  answered    int not null default 0,     -- quanti hanno risposto (lo vedono tutti, anche chi non conosce gli altri)
  helps       int not null default 0,     -- quanti hanno chiesto aiuto
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  reminded_at timestamptz
);
create index if not exists checks_recipients_idx on public.checks using gin (recipients);
create index if not exists checks_from_idx on public.checks (from_uid, active);
create index if not exists checks_created_idx on public.checks (created_at);

create table if not exists public.check_answers (
  check_id text not null references public.checks(id) on delete cascade,
  uid      uuid not null references auth.users(id) on delete cascade,
  name     text not null default '',
  status   text not null check (status in ('ok','help')),
  note     text check (note is null or char_length(note) <= 140),
  lat      double precision,
  lng      double precision,
  acc      int,
  at       timestamptz not null default now(),
  primary key (check_id, uid)
);
create index if not exists check_answers_uid_idx on public.check_answers (uid);

-- due persone si conoscono se sono collegate o stanno nello stesso gruppo
create or replace function private.knows(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a = b
      or exists (select 1 from public.links where a = any(uids) and b = any(uids))
      or exists (select 1 from public.groups where a = any(member_uids) and b = any(member_uids))
$$;
grant execute on function private.knows(uuid, uuid) to authenticated;

alter table public.checks        enable row level security;
alter table public.check_answers enable row level security;
revoke all on public.checks, public.check_answers from anon, authenticated;
grant select on public.checks, public.check_answers to authenticated;

-- l'appello lo vedono chi l'ha lanciato e chi l'ha ricevuto
drop policy if exists "appello: mittente e destinatari" on public.checks;
create policy "appello: mittente e destinatari" on public.checks for select to authenticated
  using (from_uid = auth.uid() or auth.uid() = any(recipients));

-- le risposte (con la posizione) le vede chi ha lanciato l'appello; gli altri vedono solo quelle delle persone che conoscono
drop policy if exists "appello: risposte visibili" on public.check_answers;
create policy "appello: risposte visibili" on public.check_answers for select to authenticated
  using (exists (select 1 from public.checks c where c.id = check_id
                  and (c.from_uid = auth.uid() or auth.uid() = any(c.recipients))
                  and (uid = auth.uid() or c.from_uid = auth.uid() or uid = c.from_uid or private.knows(auth.uid(), uid))));

-- lancia l'appello a tutta la cerchia (amici, partner, gruppi non silenziati)
create or replace function public.send_check(p_id text, p_reason text default 'altro', p_note text default null,
                                             p_lat double precision default null, p_lng double precision default null) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); p public.profiles; me text; rec uuid[]; loc boolean; r text := coalesce(nullif(p_reason, ''), 'altro');
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if coalesce(p_id, '') !~ '^[A-Za-z0-9_-]{10,40}$' then raise exception 'Appello non valido'; end if;
  if r not in ('terremoto','alluvione','incendio','attentato','blackout','maltempo','serata','altro') then r := 'altro'; end if;
  select * into p from public.profiles where id = u;
  if not found then raise exception 'Completa prima il profilo'; end if;
  if exists (select 1 from public.checks where from_uid = u and created_at > now() - interval '30 seconds') then
    raise exception 'Hai appena lanciato un appello: la tua cerchia è già stata avvisata';
  end if;
  if exists (select 1 from public.checks where id = p_id) then raise exception 'Appello già inviato'; end if;
  me := trim(p.name || ' ' || p.surname);
  select coalesce(array_agg(distinct m), '{}') into rec from (
    select unnest(uids) m from public.links where u = any(uids)
    union
    select unnest(member_uids) from public.groups where u = any(member_uids) and not (id = any(p.muted_groups))) y
  where m <> u;
  if cardinality(rec) = 0 then raise exception 'Aggiungi prima qualcuno alla cerchia'; end if;
  loc := p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180;

  update public.checks set active = false, closed_at = now() where from_uid = u and active;   -- uno alla volta
  insert into public.checks (id, from_uid, from_name, reason, note, recipients, lat, lng)
       values (p_id, u, me, r, nullif(left(trim(coalesce(p_note, '')), 140), ''), rec,
               case when loc then p_lat end, case when loc then p_lng end);
  -- chi lancia l'appello risulta «Sto bene» (può cambiarlo dalla schermata dell'appello)
  insert into public.check_answers (check_id, uid, name, status, lat, lng)
       values (p_id, u, me, 'ok', case when loc then p_lat end, case when loc then p_lng end);
  perform private.push('check', p_id);
  return jsonb_build_object('recipients', cardinality(rec));
end $$;

-- risposta: «Sto bene» (ok) o «Ho bisogno di aiuto» (help), con la posizione. Si può cambiare finché l'appello è aperto.
create or replace function public.answer_check(p_id text, p_status text, p_note text default null,
                                               p_lat double precision default null, p_lng double precision default null,
                                               p_acc double precision default null) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); c public.checks; me text; loc boolean; old text;
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if p_status not in ('ok','help') then raise exception 'Risposta non valida'; end if;
  select * into c from public.checks where id = p_id for update;
  if not found or not (c.from_uid = u or u = any(c.recipients)) then raise exception 'Appello non trovato'; end if;
  if not c.active then raise exception 'L''appello è già stato chiuso'; end if;
  select trim(name || ' ' || surname) into me from public.profiles where id = u;
  loc := p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180;
  select status into old from public.check_answers where check_id = p_id and uid = u;
  insert into public.check_answers (check_id, uid, name, status, note, lat, lng, acc, at)
       values (p_id, u, coalesce(me, ''), p_status, nullif(left(trim(coalesce(p_note, '')), 140), ''),
               case when loc then p_lat end, case when loc then p_lng end,
               case when loc and p_acc is not null then round(p_acc)::int end, now())
  on conflict (check_id, uid) do update set status = excluded.status, note = excluded.note, at = now(),
       lat = coalesce(excluded.lat, check_answers.lat), lng = coalesce(excluded.lng, check_answers.lng),
       acc = case when excluded.lat is not null then excluded.acc else check_answers.acc end;
  update public.checks set
    answered = (select count(*) from public.check_answers where check_id = p_id and uid <> c.from_uid),
    helps    = (select count(*) from public.check_answers where check_id = p_id and status = 'help')
   where id = p_id;
  if old is distinct from p_status then perform private.push('check_ans', p_id, jsonb_build_object('uid', u, 'status', p_status)); end if;
  return jsonb_build_object('ok', true);
end $$;

-- sollecito a chi non ha ancora risposto (al massimo uno ogni 2 minuti)
create or replace function public.remind_check(p_id text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare c public.checks; n int;
begin
  select * into c from public.checks where id = p_id and from_uid = auth.uid() for update;
  if not found then raise exception 'Non autorizzato'; end if;
  if not c.active then raise exception 'L''appello è già stato chiuso'; end if;
  if c.reminded_at > now() - interval '2 minutes' then raise exception 'Hai appena mandato un sollecito: aspetta un paio di minuti'; end if;
  select count(*) into n from unnest(c.recipients) r where not exists (select 1 from public.check_answers a where a.check_id = p_id and a.uid = r);
  if n = 0 then return jsonb_build_object('waiting', 0); end if;
  update public.checks set reminded_at = now() where id = p_id;
  perform private.push('check_remind', p_id);
  return jsonb_build_object('waiting', n);
end $$;

-- chiusura (solo chi l'ha lanciato)
create or replace function public.close_check(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.checks set active = false, closed_at = now() where id = p_id and from_uid = auth.uid() and active;
  return jsonb_build_object('ok', found);
end $$;

revoke execute on function public.send_check(text, text, text, double precision, double precision),
  public.answer_check(text, text, text, double precision, double precision, double precision),
  public.remind_check(text), public.close_check(text) from public, anon;
grant execute on function public.send_check(text, text, text, double precision, double precision),
  public.answer_check(text, text, text, double precision, double precision, double precision),
  public.remind_check(text), public.close_check(text) to authenticated;

-- pulizia: gli appelli si chiudono da soli dopo 24 ore e spariscono dopo 7 giorni
create or replace function private.cleanup_checks() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.checks set active = false, closed_at = now() where active and created_at < now() - interval '24 hours';
  delete from public.checks where created_at < now() - interval '7 days';
end $$;
do $$
begin
  if to_regclass('cron.job') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''vicina-appelli''';
    execute 'select cron.schedule(''vicina-appelli'', ''23 * * * *'', ''select private.cleanup_checks()'')';
  end if;
end $$;

-- tempo reale
do $$
declare t text;
begin
  foreach t in array array['checks', 'check_answers'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
