-- =====================================================================
--  Vicina · FOTO PROFILO (visibile a tutta la tua cerchia)
--  Supabase → SQL Editor → incolla tutto → Run. Si può rieseguire senza problemi.
--  Cosa fa:
--   • colonna profiles.avatar (codice casuale della foto, non indovinabile)
--   • set_avatar(): salva / toglie la tua foto
--   • circle_avatars(): le foto di chi è nella tua cerchia (partner, amici, gruppi, richieste ai tuoi gruppi)
--   • bucket «avatars»: foto JPEG max 512 KB; ognuno carica e cancella solo nella propria cartella
-- =====================================================================

alter table public.profiles add column if not exists avatar text;
do $$ begin
  alter table public.profiles add constraint profiles_avatar_chk check (avatar is null or avatar ~ '^[A-Za-z0-9_-]{8,64}$');
exception when duplicate_object then null; end $$;

create or replace function public.set_avatar(p_avatar text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Accedi di nuovo'; end if;
  if p_avatar is not null and p_avatar !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'Foto non valida'; end if;
  update public.profiles set avatar = p_avatar where id = auth.uid();
end $$;

create or replace function public.circle_avatars() returns table(uid uuid, avatar text)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as u),
  people as (
    select unnest(l.uids) as x from public.links l, me where me.u = any(l.uids)
    union select unnest(g.member_uids) from public.groups g, me where me.u = any(g.member_uids)
    union select k::uuid from public.groups g, me, jsonb_object_keys(g.requests) k where g.admin_uid = me.u
    union select s.from_uid from public.sos s, me where me.u = any(s.recipients) and s.active
    union select u from me
  )
  select p.id, p.avatar from public.profiles p where p.avatar is not null and p.id in (select x from people);
$$;

revoke all on function public.set_avatar(text), public.circle_avatars() from public, anon;
grant execute on function public.set_avatar(text), public.circle_avatars() to authenticated;

-- ---------------------------------------------------------------------
--  Foto (Storage): bucket pubblico in lettura, ma il nome del file è un codice casuale
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/jpeg'];

do $vicina_avatar$
begin
  drop policy if exists "vicina: carico la mia foto profilo"  on storage.objects;
  drop policy if exists "vicina: vedo la mia foto profilo"    on storage.objects;
  drop policy if exists "vicina: cancello la mia foto profilo" on storage.objects;
  create policy "vicina: carico la mia foto profilo" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy "vicina: vedo la mia foto profilo" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy "vicina: cancello la mia foto profilo" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when insufficient_privilege or others then
  raise notice 'Regole dei file non create (%): creale da Supabase → Storage → avatars → Policies (vedi README, «Foto profilo»).', sqlerrm;
end
$vicina_avatar$;

notify pgrst, 'reload schema';
