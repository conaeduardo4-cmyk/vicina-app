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
