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
