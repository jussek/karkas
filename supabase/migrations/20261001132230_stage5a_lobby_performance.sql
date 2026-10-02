create index if not exists online_lobbies_host_user_id_idx
on public.online_lobbies(host_user_id);

create index if not exists online_lobby_players_user_id_idx
on public.online_lobby_players(user_id);

drop policy if exists "waiting public or member lobby select" on public.online_lobbies;
create policy "waiting public or member lobby select" on public.online_lobbies for select to authenticated
using ((select auth.uid()) is not null and ((visibility = 'public' and status = 'waiting') or host_user_id = (select auth.uid()) or private.is_online_lobby_member(id)));

drop policy if exists "host updates waiting lobby" on public.online_lobbies;
create policy "host updates waiting lobby" on public.online_lobbies for update to authenticated
using ((select auth.uid()) is not null and host_user_id = (select auth.uid()) and status = 'waiting')
with check ((select auth.uid()) is not null and host_user_id = (select auth.uid()));

drop policy if exists "members or public browser view lobby players" on public.online_lobby_players;
create policy "members or public browser view lobby players" on public.online_lobby_players for select to authenticated
using ((select auth.uid()) is not null and (private.is_online_lobby_member(lobby_id) or exists (
  select 1 from public.online_lobbies l where l.id = lobby_id and l.visibility = 'public' and l.status = 'waiting'
)));

drop policy if exists "member updates own ready while waiting" on public.online_lobby_players;
create policy "member updates own ready while waiting" on public.online_lobby_players for update to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()) and exists (
  select 1 from public.online_lobbies l where l.id = lobby_id and l.status = 'waiting'
))
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));
