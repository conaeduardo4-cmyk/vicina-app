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
