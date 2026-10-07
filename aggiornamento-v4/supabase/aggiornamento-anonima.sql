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
