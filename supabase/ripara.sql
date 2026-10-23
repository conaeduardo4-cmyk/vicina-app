-- Vicina · RIPARAZIONE dopo installa.sql (aggiunge le parti mancanti, non cancella niente). Si può rieseguire.
-- =====================================================================
--  Vicina · modalità anonima: notifiche senza la parola «SOS»
--  Incolla tutto in Supabase → SQL Editor → Run. Si può rilanciare senza danni.
-- =====================================================================
alter table public.profiles add column if not exists discreet boolean not null default false;

create or replace function public.set_discreet(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set discreet = coalesce(p_on, false) where id = auth.uid();
end $$;

revoke all on function public.set_discreet(boolean) from public, anon;
grant execute on function public.set_discreet(boolean) to authenticated;

-- =====================================================================
--  Vicina · aggiornamento chat: conferme di lettura (spunte «letto»)
--  Incolla tutto in Supabase → SQL Editor → Run. Si può rilanciare senza danni.
--  («Sta scrivendo…» e l'anteprima del testo non hanno bisogno del database:
--   passano dal tempo reale di Supabase.)
-- =====================================================================

create table if not exists public.chat_reads (
  chat_id  uuid not null,
  uid      uuid not null references auth.users(id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (chat_id, uid)
);

alter table public.chat_reads enable row level security;

drop policy if exists "letture: partecipanti" on public.chat_reads;
create policy "letture: partecipanti" on public.chat_reads for select to authenticated
  using (private.can_chat(chat_id));

-- segna la chat come letta adesso (solo se fai parte della chat)
create or replace function public.mark_read(p_chat_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not private.can_chat(p_chat_id) then return; end if;
  insert into public.chat_reads (chat_id, uid, read_at) values (p_chat_id, auth.uid(), now())
  on conflict (chat_id, uid) do update set read_at = excluded.read_at;
end $$;

revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.mark_read(uuid) to authenticated;
grant select on public.chat_reads to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.chat_reads;
exception when duplicate_object then null;
end $$;

-- =====================================================================
--  Vicina 3.0 · CENTRALE DI SOCCORSO
--  · Soccorritori: chi riceve l'SOS dice «Sto arrivando», «Chiamo io il 112», «Seguo da qui» o «Sono arrivato»;
--    chi ha chiesto aiuto e gli altri della cerchia lo vedono subito (posizione e tempo stimato).
--  · Prove certificate: ogni audio, foto e posizione della diretta viene registrata con l'impronta SHA-256 del file
--    e una catena firmata dal server (data e ora del server): se qualcuno modifica o toglie un pezzo, la catena non torna.
--  · I file della diretta (aNNNN = audio, fNNNN = fotogrammi) vanno nella cartella dell'SOS.
--  Esegui questo file nel SQL Editor (è già incluso in installa.sql e schema.sql). Si può rieseguire.
-- =====================================================================

alter table public.sos add column if not exists helpers jsonb not null default '{}';

-- ruolo di chi aiuta: coming (sto arrivando), calling (chiamo il 112), remote (seguo da qui), arrived (sono arrivato), none (non posso)
create or replace function public.sos_help(p_sos_id text, p_role text, p_lat double precision default null,
                                           p_lng double precision default null, p_eta int default null) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare u uuid := auth.uid(); s public.sos; old jsonb; loc boolean; me text;
begin
  if u is null then raise exception 'Accedi per continuare'; end if;
  if p_role not in ('coming','calling','remote','arrived','none') then raise exception 'Ruolo non valido'; end if;
  select * into s from public.sos where id = p_sos_id for update;
  if not found or not (u = any(s.recipients)) then raise exception 'Non autorizzato'; end if;
  if not s.active then raise exception 'L''SOS è già stato chiuso'; end if;
  old := s.helpers -> u::text;
  -- solo posizione (stesso ruolo): al massimo una scrittura ogni 8 secondi
  if old is not null and old ->> 'role' = p_role and (old ->> 'at')::bigint > floor(extract(epoch from now()) * 1000) - 8000 then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;
  me := private.full_name(u);
  loc := p_lat is not null and p_lng is not null and abs(p_lat) <= 90 and abs(p_lng) <= 180;
  update public.sos set
    helpers = helpers || jsonb_build_object(u::text, jsonb_strip_nulls(jsonb_build_object(
      'name', me, 'role', p_role, 'at', floor(extract(epoch from now()) * 1000),
      'lat', case when loc then p_lat end, 'lng', case when loc then p_lng end,
      'eta', case when p_eta between 0 and 1440 then p_eta end))),
    acks = case when p_role <> 'none' and not (acks ? u::text) then acks || jsonb_build_object(u::text, me) else acks end
   where id = p_sos_id;
  if old is null or old ->> 'role' is distinct from p_role then
    perform private.push('help_role', p_sos_id, jsonb_build_object('uid', u, 'role', p_role));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Prove certificate
-- ---------------------------------------------------------------------
create table if not exists public.sos_evidence (
  sos_id text not null references public.sos(id) on delete cascade,
  seq    int  not null,
  kind   text not null check (kind in ('audio','frame','photo','pos','event')),
  path   text check (path is null or char_length(path) <= 200),
  sha    text check (sha is null or sha ~ '^[0-9a-f]{64}$'),
  note   text check (note is null or char_length(note) <= 200),
  lat    double precision,
  lng    double precision,
  at     timestamptz not null default now(),
  chain  text not null,
  primary key (sos_id, seq)
);
alter table public.sos_evidence enable row level security;
revoke all on public.sos_evidence from anon, authenticated;
grant select on public.sos_evidence to authenticated;
drop policy if exists "prove: mittente e destinatari" on public.sos_evidence;
create policy "prove: mittente e destinatari" on public.sos_evidence for select to authenticated
  using (exists (select 1 from public.sos s where s.id = sos_id and (s.from_uid = auth.uid() or auth.uid() = any(s.recipients))));

-- aggiunge un elemento alla catena: impronta del file (calcolata dal telefono) + ora del server + anello precedente
create or replace function public.add_evidence(p_sos_id text, p_kind text, p_path text default null, p_sha text default null,
                                               p_note text default null, p_lat double precision default null,
                                               p_lng double precision default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sos; n int; prev text; c text; t timestamptz := now();
        la double precision := case when abs(p_lat) <= 90 then p_lat end; lo double precision := case when abs(p_lng) <= 180 then p_lng end;
        sh text := lower(p_sha);
begin
  select * into s from public.sos where id = p_sos_id and from_uid = auth.uid() for update;
  if not found then raise exception 'Non autorizzato'; end if;
  if s.created_at < now() - interval '6 hours' then raise exception 'SOS troppo vecchio'; end if;
  if p_path is not null and p_path !~ ('^' || auth.uid()::text || '/' || p_sos_id || '/[A-Za-z0-9._-]{1,40}$') then raise exception 'Percorso non valido'; end if;
  select coalesce(max(seq), 0), (array_agg(chain order by seq desc))[1] into n, prev from public.sos_evidence where sos_id = p_sos_id;
  if n >= 3000 then raise exception 'Troppe prove per questo SOS'; end if;
  c := encode(extensions.digest(coalesce(prev, p_sos_id) || '|' || (n + 1) || '|' || p_kind || '|' || coalesce(p_path, '') || '|' ||
                                coalesce(sh, '') || '|' || coalesce(la::text, '') || ',' || coalesce(lo::text, '') || '|' ||
                                to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'sha256'), 'hex');
  insert into public.sos_evidence (sos_id, seq, kind, path, sha, note, lat, lng, at, chain)
       values (p_sos_id, n + 1, p_kind, p_path, sh, left(p_note, 200), la, lo, t, c);
  return jsonb_build_object('seq', n + 1, 'chain', c, 'at', floor(extract(epoch from t) * 1000));
end $$;

-- verifica della catena (chiunque veda l'SOS): ricalcola ogni anello e dice se è tutto integro
create or replace function public.verify_evidence(p_sos_id text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; prev text := p_sos_id; ok boolean := true; n int := 0; bad int := null;
begin
  if not exists (select 1 from public.sos where id = p_sos_id and (from_uid = auth.uid() or auth.uid() = any(recipients))) then
    raise exception 'Non autorizzato';
  end if;
  for r in select * from public.sos_evidence where sos_id = p_sos_id order by seq loop
    n := n + 1;
    if r.seq <> n or r.chain <> encode(extensions.digest(prev || '|' || r.seq || '|' || r.kind || '|' || coalesce(r.path, '') || '|' ||
                                coalesce(r.sha, '') || '|' || coalesce(r.lat::text, '') || ',' || coalesce(r.lng::text, '') || '|' ||
                                to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'sha256'), 'hex') then
      ok := false; bad := coalesce(bad, r.seq);
    end if;
    prev := r.chain;
  end loop;
  return jsonb_build_object('ok', ok, 'count', n, 'last', prev, 'firstBad', bad);
end $$;

revoke execute on function public.sos_help(text, text, double precision, double precision, int),
  public.add_evidence(text, text, text, text, text, double precision, double precision), public.verify_evidence(text) from public, anon;
grant execute on function public.sos_help(text, text, double precision, double precision, int),
  public.add_evidence(text, text, text, text, text, double precision, double precision), public.verify_evidence(text) to authenticated;

-- file della diretta nella cartella dell'SOS (oltre a foto e vocale)
do $vicina_storage$
begin
  drop policy if exists "vicina: carico le mie foto SOS" on storage.objects;
  create policy "vicina: carico le mie foto SOS" on storage.objects for insert to authenticated
    with check (bucket_id = 'sos' and (storage.foldername(name))[1] = auth.uid()::text
                and (storage.filename(name) in ('back.jpg', 'front.jpg', 'voice.webm', 'voice.m4a', 'voice.mp4', 'voice.ogg', 'voice.aac')
                     or storage.filename(name) ~ '^[af][0-9]{4}\.(jpg|webm|m4a|mp4|ogg|aac)$'));
exception when insufficient_privilege or others then
  raise notice 'Regole dei file non aggiornate (%): creale da Supabase → Storage → Policies (vedi README, «Centrale di soccorso»).', sqlerrm;
end
$vicina_storage$;

-- tempo reale
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.sos_evidence'; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
--  Lingua dell'app (per le notifiche push nella lingua di chi le riceve)
-- =====================================================================
alter table public.profiles add column if not exists lang text not null default 'it';
do $$ begin
  alter table public.profiles add constraint profiles_lang_chk check (lang in ('it','en','es','fr','de','pt','ar','uk','ro','sq'));
exception when duplicate_object then null; end $$;
create or replace function public.set_lang(p_lang text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_lang not in ('it','en','es','fr','de','pt','ar','uk','ro','sq') then raise exception 'Lingua non valida'; end if;
  update public.profiles set lang = p_lang where id = auth.uid() and lang is distinct from p_lang;
end $$;
revoke execute on function public.set_lang(text) from public, anon;
grant execute on function public.set_lang(text) to authenticated;
notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
-- ===== Vicina 3.1: profili, allegati in chat, assistente con più chat =====
-- =====================================================================
--  Vicina 3.1 · PROFILI, CHAT CON ALLEGATI, ASSISTENTE CON PIÙ CHAT
--  · Profilo: bio, città, banner, compleanno visibile (facoltativo); lo vede solo chi è nella tua cerchia,
--    insieme al tuo numero di telefono.
--  · Chat: foto, file, messaggi vocali e posizione. I file stanno nel bucket privato «chat»:
--    li può leggere e caricare solo chi fa parte di quella chat.
--  · Assistente: più conversazioni, salvate sul tuo account (le vedi da ogni telefono).
--  Esegui questo file nel SQL Editor (è già incluso in installa.sql e schema.sql). Si può rieseguire.
--  NON cancella nessun dato.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Profilo esteso
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists bio       text not null default '';
alter table public.profiles add column if not exists city      text not null default '';
alter table public.profiles add column if not exists banner    text;
alter table public.profiles add column if not exists show_bday boolean not null default false;
do $$ begin
  alter table public.profiles add constraint profiles_bio_chk check (char_length(bio) <= 150);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_city_chk check (char_length(city) <= 40);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_banner_chk check (banner is null or banner ~ '^[A-Za-z0-9_-]{8,64}$');
exception when duplicate_object then null; end $$;

-- salva nome, bio, città e compleanno; il nuovo nome viene aggiornato anche nella cerchia e nei gruppi
create or replace function public.set_profile(p_name text, p_surname text, p_bio text, p_city text, p_show_bday boolean)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); fullname text;
begin
  if u is null then raise exception 'Accedi di nuovo'; end if;
  p_name := trim(coalesce(p_name, '')); p_surname := trim(coalesce(p_surname, ''));
  if char_length(p_name) not between 1 and 40 or char_length(p_surname) not between 1 and 40 then raise exception 'Scrivi nome e cognome'; end if;
  update public.profiles
     set name = p_name, surname = p_surname,
         bio = left(trim(coalesce(p_bio, '')), 150), city = left(trim(coalesce(p_city, '')), 40),
         show_bday = coalesce(p_show_bday, false)
   where id = u;
  fullname := p_name || ' ' || p_surname;
  update public.links  set names   = names   || jsonb_build_object(u::text, fullname) where u = any(uids);
  update public.groups set members = members || jsonb_build_object(u::text, fullname) where u = any(member_uids);
end $$;

create or replace function public.set_banner(p_banner text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Accedi di nuovo'; end if;
  if p_banner is not null and p_banner !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'Immagine non valida'; end if;
  update public.profiles set banner = p_banner where id = auth.uid();
end $$;

-- il profilo di una persona della tua cerchia (con il numero di telefono)
create or replace function public.circle_profile(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.profiles; since timestamptz; kind text;
begin
  if me is null or not private.knows(me, p_uid) then raise exception 'Profilo non disponibile'; end if;
  select * into p from public.profiles where id = p_uid;
  if not found then raise exception 'Profilo non disponibile'; end if;
  select l.created_at, l.kind into since, kind from public.links l where me = any(l.uids) and p_uid = any(l.uids) limit 1;
  if since is null then
    select g.created_at, 'group' into since, kind from public.groups g where me = any(g.member_uids) and p_uid = any(g.member_uids) order by g.created_at limit 1;
  end if;
  return jsonb_build_object(
    'uid', p.id, 'name', p.name, 'surname', p.surname, 'bio', p.bio, 'city', p.city,
    'avatar', p.avatar, 'banner', p.banner, 'phone', p.phone,
    'bday', case when p.show_bday or p.id = me then to_char(p.dob, 'MM-DD') end,
    'kind', coalesce(kind, case when p.id = me then 'me' end), 'since', since);
end $$;

revoke all on function public.set_profile(text, text, text, text, boolean), public.set_banner(text), public.circle_profile(uuid) from public, anon;
grant execute on function public.set_profile(text, text, text, text, boolean), public.set_banner(text), public.circle_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------
--  Chat: foto, file, vocali e posizione
-- ---------------------------------------------------------------------
alter table public.messages add column if not exists file      text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_size integer;
alter table public.messages add column if not exists mime      text;
alter table public.messages add column if not exists dur       integer;
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%type%text%sos%safe%' loop
    execute format('alter table public.messages drop constraint %I', c);
  end loop;
  alter table public.messages add constraint messages_type_chk check (type in ('text','sos','safe','image','file','voice','loc'));
exception when duplicate_object then null; end $$;

create or replace function private.before_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('text','image','file','voice','loc') then
    new.from_name := coalesce((select trim(name || ' ' || surname) from public.profiles where id = new.from_uid), '');
    new.created_at := now(); new.photos := '{}'; new.sos_id := null;
    if new.type = 'text' then
      new.file := null; new.file_name := null; new.file_size := null; new.mime := null; new.dur := null; new.lat := null; new.lng := null;
      if coalesce(new.text, '') = '' then raise exception 'Messaggio vuoto'; end if;
    elsif new.type = 'loc' then
      new.file := null; new.file_name := null; new.file_size := null; new.mime := null; new.dur := null;
      if new.lat is null or new.lng is null or abs(new.lat) > 90 or abs(new.lng) > 180 then raise exception 'Posizione non valida'; end if;
    else
      new.lat := null; new.lng := null;
      -- il file deve stare nella cartella di questa chat: <chat>/<codice>.<estensione>
      if new.file is null or new.file !~ ('^' || new.chat_id::text || '/[A-Za-z0-9_-]{8,64}\.[a-z0-9]{1,5}$') then raise exception 'File non valido'; end if;
      new.file_name := left(coalesce(nullif(trim(new.file_name), ''), 'file'), 120);
      new.mime := left(coalesce(new.mime, ''), 100);
      if new.file_size is not null and (new.file_size < 0 or new.file_size > 15728640) then raise exception 'File troppo grande (massimo 15 MB)'; end if;
      if new.dur is not null and (new.dur < 0 or new.dur > 600) then new.dur := null; end if;
    end if;
  end if;
  return new;
end $$;
create or replace function private.after_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('text','image','file','voice','loc') then perform private.push('msg', new.id::text); end if;
  return null;
end $$;

grant insert (chat_id, type, from_uid, text, file, file_name, file_size, mime, dur, lat, lng) on public.messages to authenticated;
drop policy if exists "messaggi: partecipanti scrivono" on public.messages;
create policy "messaggi: partecipanti scrivono" on public.messages for insert to authenticated
  with check (type in ('text','image','file','voice','loc') and from_uid = auth.uid() and private.can_chat(chat_id));

-- bucket privato per gli allegati: cartella = id della chat
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat', 'chat', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

create or replace function private.chat_folder_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f text := split_part(p_name, '/', 1);
begin
  if f !~ '^[0-9a-f-]{36}$' then return false; end if;
  return private.can_chat(f::uuid);
end $$;
grant execute on function private.chat_folder_ok(text) to authenticated;

do $vicina_chat$
begin
  drop policy if exists "vicina: carico allegati chat" on storage.objects;
  drop policy if exists "vicina: vedo allegati chat"   on storage.objects;
  create policy "vicina: carico allegati chat" on storage.objects for insert to authenticated
    with check (bucket_id = 'chat' and private.chat_folder_ok(name));
  create policy "vicina: vedo allegati chat" on storage.objects for select to authenticated
    using (bucket_id = 'chat' and private.chat_folder_ok(name));
exception when insufficient_privilege or others then
  raise notice 'Regole dei file della chat non create (%): creale da Supabase → Storage → chat → Policies (vedi README).', sqlerrm;
end
$vicina_chat$;

-- ---------------------------------------------------------------------
--  Assistente: più conversazioni, salvate sull'account
-- ---------------------------------------------------------------------
create table if not exists public.ai_chats (
  id         uuid primary key default gen_random_uuid(),
  uid        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_chats_uid_idx on public.ai_chats (uid, updated_at desc);

create table if not exists public.ai_messages (
  id         bigserial primary key,
  chat_id    uuid not null references public.ai_chats(id) on delete cascade,
  uid        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','model','local')),
  text       text not null check (char_length(text) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_chat_idx on public.ai_messages (chat_id, id);

alter table public.ai_chats    enable row level security;
alter table public.ai_messages enable row level security;
revoke all on public.ai_chats, public.ai_messages from anon, authenticated;
grant select, delete on public.ai_chats, public.ai_messages to authenticated;
grant insert (id, title) on public.ai_chats to authenticated;
grant update (title) on public.ai_chats to authenticated;
grant insert (chat_id, role, text) on public.ai_messages to authenticated;
grant usage on sequence public.ai_messages_id_seq to authenticated;

drop policy if exists "ia: le mie chat" on public.ai_chats;
drop policy if exists "ia: i miei messaggi" on public.ai_messages;
create policy "ia: le mie chat" on public.ai_chats for all to authenticated using (uid = auth.uid()) with check (uid = auth.uid());
create policy "ia: i miei messaggi" on public.ai_messages for all to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid() and exists (select 1 from public.ai_chats c where c.id = chat_id and c.uid = auth.uid()));

-- limiti: al massimo 100 chat e 400 messaggi per chat; ogni messaggio aggiorna la data della chat
create or replace function private.ai_before_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ai_chats where uid = new.uid) >= 100 then
    delete from public.ai_chats where id in (select id from public.ai_chats where uid = new.uid order by updated_at asc limit 1);
  end if;
  return new;
end $$;
drop trigger if exists vicina_ai_before_chat on public.ai_chats;
create trigger vicina_ai_before_chat before insert on public.ai_chats for each row execute function private.ai_before_chat();

create or replace function private.ai_after_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_chats set updated_at = now() where id = new.chat_id;
  delete from public.ai_messages where chat_id = new.chat_id and id < (select min(id) from (select id from public.ai_messages where chat_id = new.chat_id order by id desc limit 400) t);
  return null;
end $$;
drop trigger if exists vicina_ai_after_message on public.ai_messages;
create trigger vicina_ai_after_message after insert on public.ai_messages for each row execute function private.ai_after_message();

notify pgrst, 'reload schema';

select 'Riparazione fatta (con la 3.1). Ora esegui la riga select private.configure(...) con il tuo indirizzo e segreto.' as risultato;
