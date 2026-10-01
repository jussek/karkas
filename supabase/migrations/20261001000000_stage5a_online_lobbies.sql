-- Stage 5A lobby transport. Anonymous Auth sessions use the authenticated role.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon;

create table public.online_lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 80),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null default 'waiting' check (status in ('waiting', 'starting', 'in_game', 'finished', 'closed')),
  max_players integer not null check (max_players between 2 and 6),
  turn_timer_seconds integer not null default 0 check (turn_timer_seconds in (0, 15, 30, 60)),
  bot_slots integer not null default 0 check (bot_slots >= 0 and bot_slots < max_players),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.online_lobby_players (
  lobby_id uuid not null references public.online_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_index integer not null check (seat_index between 0 and 5),
  display_name text not null check (char_length(display_name) between 1 and 24),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id),
  unique (lobby_id, seat_index)
);

alter table public.online_lobbies enable row level security;
alter table public.online_lobby_players enable row level security;

-- RLS-only helper: it can answer only for the current authenticated identity.
create function private.is_online_lobby_member(p_lobby_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (
  select 1 from public.online_lobby_players
  where lobby_id = p_lobby_id and user_id = auth.uid()
) $$;
revoke all on function private.is_online_lobby_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_online_lobby_member(uuid) to authenticated;

create policy "waiting public or member lobby select" on public.online_lobbies for select to authenticated
using (auth.uid() is not null and ((visibility = 'public' and status = 'waiting') or host_user_id = auth.uid() or private.is_online_lobby_member(id)));
create policy "host updates waiting lobby" on public.online_lobbies for update to authenticated
using (auth.uid() is not null and host_user_id = auth.uid() and status = 'waiting')
with check (auth.uid() is not null and host_user_id = auth.uid());

create policy "members or public browser view lobby players" on public.online_lobby_players for select to authenticated
using (auth.uid() is not null and (private.is_online_lobby_member(lobby_id) or exists (
  select 1 from public.online_lobbies l where l.id = lobby_id and l.visibility = 'public' and l.status = 'waiting'
)));
create policy "member updates own ready while waiting" on public.online_lobby_players for update to authenticated
using (auth.uid() is not null and user_id = auth.uid() and exists (
  select 1 from public.online_lobbies l where l.id = lobby_id and l.status = 'waiting'
))
with check (auth.uid() is not null and user_id = auth.uid());

-- Clients cannot insert/delete membership or mutate identity/seat columns directly.
revoke all on public.online_lobbies, public.online_lobby_players from anon, authenticated;
grant select on public.online_lobbies, public.online_lobby_players to authenticated;
grant update (ready) on public.online_lobby_players to authenticated;

-- Privileged implementations live outside the Data API exposed schema.
create function private.create_online_lobby_impl(p_name text, p_visibility text, p_max_players integer, p_turn_timer_seconds integer, p_bot_slots integer, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6));
  insert into public.online_lobbies(code, host_user_id, name, visibility, max_players, turn_timer_seconds, bot_slots)
    values(v_code, auth.uid(), nullif(pg_catalog.btrim(p_name), ''), p_visibility, p_max_players, p_turn_timer_seconds, p_bot_slots) returning id into v_id;
  insert into public.online_lobby_players(lobby_id, user_id, seat_index, display_name)
    values(v_id, auth.uid(), 0, coalesce(nullif(pg_catalog.btrim(p_display_name), ''), 'Игрок 1'));
  return v_id;
end $$;

-- Internal join primitive. Only by-code flow may set p_allow_private.
create function private.join_online_lobby_impl(p_lobby_id uuid, p_display_name text, p_allow_private boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_seat integer; v_max integer; v_bots integer; v_visibility text; v_humans integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select max_players, bot_slots, visibility into v_max, v_bots, v_visibility
    from public.online_lobbies where id = p_lobby_id and status = 'waiting' for update;
  if v_max is null or (v_visibility = 'private' and not p_allow_private) then raise exception 'lobby is not joinable'; end if;
  if exists(select 1 from public.online_lobby_players where lobby_id = p_lobby_id and user_id = auth.uid()) then return p_lobby_id; end if;
  select count(*) into v_humans from public.online_lobby_players where lobby_id = p_lobby_id;
  if v_humans + 1 + v_bots > v_max then raise exception 'lobby is full'; end if;
  select s into v_seat from generate_series(0, v_max - 1) s where not exists(
    select 1 from public.online_lobby_players p where p.lobby_id = p_lobby_id and p.seat_index = s
  ) order by s limit 1;
  insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name)
    values(p_lobby_id,auth.uid(),v_seat,coalesce(nullif(pg_catalog.btrim(p_display_name),''),'Игрок '||(v_seat+1)));
  return p_lobby_id;
end $$;

create function private.join_online_lobby_by_code_impl(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select id into v_id from public.online_lobbies where code=upper(pg_catalog.btrim(p_code)) and status='waiting';
  if v_id is null then raise exception 'lobby is not joinable'; end if;
  return private.join_online_lobby_impl(v_id, p_display_name, true);
end $$;

create function private.leave_online_lobby_impl(p_lobby_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.online_lobbies where id=p_lobby_id and status='waiting') then raise exception 'lobby is not waiting'; end if;
  if exists(select 1 from public.online_lobbies where id=p_lobby_id and host_user_id=auth.uid()) then
    update public.online_lobbies set status='closed', updated_at=now() where id=p_lobby_id;
  else
    delete from public.online_lobby_players where lobby_id=p_lobby_id and user_id=auth.uid();
  end if;
end $$;

create function private.update_online_lobby_settings_impl(p_lobby_id uuid, p_settings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_max integer; v_bots integer; v_humans integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select coalesce((p_settings->>'maxPlayers')::integer, max_players), coalesce((p_settings->>'botSlots')::integer, bot_slots)
    into v_max, v_bots from public.online_lobbies
    where id=p_lobby_id and host_user_id=auth.uid() and status='waiting' for update;
  if not found then raise exception 'host cannot update lobby'; end if;
  select count(*) into v_humans from public.online_lobby_players where lobby_id=p_lobby_id;
  if v_humans + v_bots > v_max then raise exception 'configured capacity exceeded'; end if;
  update public.online_lobbies set
    name=case when p_settings ? 'name' then nullif(pg_catalog.btrim(p_settings->>'name'),'') else name end,
    visibility=coalesce(p_settings->>'visibility',visibility), max_players=v_max,
    turn_timer_seconds=coalesce((p_settings->>'turnTimerSeconds')::integer,turn_timer_seconds),
    bot_slots=v_bots, updated_at=now() where id=p_lobby_id;
  return p_lobby_id;
end $$;

-- Exposed RPCs are unprivileged wrappers; all authorization lives in the narrow private implementations.
create function public.create_online_lobby(p_name text, p_visibility text, p_max_players integer, p_turn_timer_seconds integer, p_bot_slots integer, p_display_name text default null)
returns uuid language sql security invoker set search_path = '' as $$ select private.create_online_lobby_impl(p_name,p_visibility,p_max_players,p_turn_timer_seconds,p_bot_slots,p_display_name) $$;
create function public.join_online_lobby(p_lobby_id uuid, p_display_name text default null)
returns uuid language sql security invoker set search_path = '' as $$ select private.join_online_lobby_impl(p_lobby_id,p_display_name,false) $$;
create function public.join_online_lobby_by_code(p_code text, p_display_name text default null)
returns uuid language sql security invoker set search_path = '' as $$ select private.join_online_lobby_by_code_impl(p_code,p_display_name) $$;
create function public.leave_online_lobby(p_lobby_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.leave_online_lobby_impl(p_lobby_id) $$;
create function public.update_online_lobby_settings(p_lobby_id uuid, p_settings jsonb)
returns uuid language sql security invoker set search_path = '' as $$ select private.update_online_lobby_settings_impl(p_lobby_id,p_settings) $$;

revoke all on function private.create_online_lobby_impl(text,text,integer,integer,integer,text), private.join_online_lobby_impl(uuid,text,boolean), private.join_online_lobby_by_code_impl(text,text), private.leave_online_lobby_impl(uuid), private.update_online_lobby_settings_impl(uuid,jsonb) from public, anon;
grant execute on function private.create_online_lobby_impl(text,text,integer,integer,integer,text), private.join_online_lobby_impl(uuid,text,boolean), private.join_online_lobby_by_code_impl(text,text), private.leave_online_lobby_impl(uuid), private.update_online_lobby_settings_impl(uuid,jsonb) to authenticated;
revoke all on function public.create_online_lobby(text,text,integer,integer,integer,text), public.join_online_lobby(uuid,text), public.join_online_lobby_by_code(text,text), public.leave_online_lobby(uuid), public.update_online_lobby_settings(uuid,jsonb) from public, anon;
grant execute on function public.create_online_lobby(text,text,integer,integer,integer,text), public.join_online_lobby(uuid,text), public.join_online_lobby_by_code(text,text), public.leave_online_lobby(uuid), public.update_online_lobby_settings(uuid,jsonb) to authenticated;

alter publication supabase_realtime add table public.online_lobbies, public.online_lobby_players;
