create table public.online_matches (
  id uuid primary key,
  lobby_id uuid not null unique references public.online_lobbies(id) on delete restrict,
  version bigint not null default 0 check (version >= 0),
  status text not null check (status in ('playing','finished','abandoned')),
  current_player_id text,
  turn_number integer not null check (turn_number >= 1),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.online_match_players (
  match_id uuid not null references public.online_matches(id) on delete cascade,
  seat_index integer not null check (seat_index between 0 and 5),
  player_id text not null,
  user_id uuid references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 24),
  is_bot boolean not null,
  color text not null,
  primary key(match_id,seat_index),
  unique(match_id,player_id),
  check ((is_bot and user_id is null) or (not is_bot and user_id is not null and player_id=user_id::text))
);
create index online_match_players_user_id_idx on public.online_match_players(user_id) where user_id is not null;
create table public.online_match_states (
  match_id uuid primary key references public.online_matches(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.online_match_actions (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.online_matches(id) on delete cascade,
  intent_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  version_before bigint not null,
  version_after bigint not null,
  action_type text not null check(action_type in ('PLACE_TILE','PLACE_MEEPLE','END_TURN')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(match_id,intent_id)
);
create index online_match_actions_match_created_idx on public.online_match_actions(match_id,created_at);

alter table public.online_matches enable row level security;
alter table public.online_match_players enable row level security;
alter table public.online_match_states enable row level security;
alter table public.online_match_actions enable row level security;

create function private.is_online_match_member(p_match_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.online_match_players where match_id=p_match_id and user_id=auth.uid() and not is_bot)
$$;
revoke all on function private.is_online_match_member(uuid) from public,anon;
grant execute on function private.is_online_match_member(uuid) to authenticated;

create policy "participants view public match" on public.online_matches for select to authenticated
using ((select auth.uid()) is not null and private.is_online_match_member(id));
create policy "participants view match roster" on public.online_match_players for select to authenticated
using ((select auth.uid()) is not null and private.is_online_match_member(match_id));

revoke all on public.online_matches,public.online_match_players,public.online_match_states,public.online_match_actions from public,anon,authenticated;
grant select on public.online_matches,public.online_match_players to authenticated;
grant all on public.online_matches,public.online_match_players,public.online_match_states,public.online_match_actions to service_role;
grant usage,select on sequence public.online_match_actions_id_seq to service_role;

create function public.create_online_match_server(
  p_lobby_id uuid,p_actor_user_id uuid,p_match_id uuid,p_state jsonb,p_snapshot jsonb,p_players jsonb,
  p_current_player_id text,p_turn_number integer,p_status text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_host uuid; v_lobby_status text; v_existing uuid;
begin
  select host_user_id,status into v_host,v_lobby_status from public.online_lobbies where id=p_lobby_id for update;
  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;
  if v_host<>p_actor_user_id then raise exception 'HOST_REQUIRED'; end if;
  select id into v_existing from public.online_matches where lobby_id=p_lobby_id;
  if v_existing is not null then return v_existing; end if;
  if v_lobby_status<>'starting' then raise exception 'LOBBY_NOT_STARTING'; end if;
  insert into public.online_matches(id,lobby_id,status,current_player_id,turn_number,snapshot)
  values(p_match_id,p_lobby_id,p_status,p_current_player_id,p_turn_number,p_snapshot);
  insert into public.online_match_states(match_id,state) values(p_match_id,p_state);
  insert into public.online_match_players(match_id,seat_index,player_id,user_id,display_name,is_bot,color)
  select p_match_id,x.seat_index,x.player_id,x.user_id,x.display_name,x.is_bot,x.color
  from jsonb_to_recordset(p_players) as x(seat_index integer,player_id text,user_id uuid,display_name text,is_bot boolean,color text);
  update public.online_lobbies set status='in_game',updated_at=now() where id=p_lobby_id;
  return p_match_id;
end $$;

create function public.commit_online_match_transition_server(
  p_match_id uuid,p_expected_version bigint,p_intent_id uuid,p_actor_user_id uuid,p_action_type text,p_payload jsonb,
  p_state jsonb,p_snapshot jsonb,p_current_player_id text,p_turn_number integer,p_status text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_version bigint; v_lobby_id uuid; v_existing bigint;
begin
  select version,lobby_id into v_version,v_lobby_id from public.online_matches where id=p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select version_after into v_existing from public.online_match_actions where match_id=p_match_id and intent_id=p_intent_id;
  if v_existing is not null then return jsonb_build_object('idempotent',true,'version',v_existing); end if;
  if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  update public.online_match_states set state=p_state,updated_at=now() where match_id=p_match_id;
  update public.online_matches set version=v_version+1,status=p_status,current_player_id=p_current_player_id,turn_number=p_turn_number,snapshot=p_snapshot,updated_at=now() where id=p_match_id;
  insert into public.online_match_actions(match_id,intent_id,actor_user_id,version_before,version_after,action_type,payload)
  values(p_match_id,p_intent_id,p_actor_user_id,v_version,v_version+1,p_action_type,p_payload);
  if p_status='finished' then update public.online_lobbies set status='finished',updated_at=now() where id=v_lobby_id; end if;
  return jsonb_build_object('idempotent',false,'version',v_version+1);
end $$;

revoke all on function public.create_online_match_server(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,integer,text) from public,anon,authenticated;
revoke all on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.create_online_match_server(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,integer,text) to service_role;
grant execute on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text) to service_role;

alter publication supabase_realtime add table public.online_matches;
