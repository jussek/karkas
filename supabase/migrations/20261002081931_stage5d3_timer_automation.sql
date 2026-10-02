alter table public.online_matches
  add column turn_timer_seconds integer not null default 0
    check (turn_timer_seconds in (0,15,30,60)),
  add column turn_started_at timestamptz,
  add column turn_deadline_at timestamptz;

alter table public.online_match_actions
  add column source text not null default 'human'
    check (source in ('human','bot','timeout'));

alter table public.online_match_actions
  add constraint online_match_actions_source_actor_check check (
    (source='human' and actor_user_id is not null)
    or (source in ('bot','timeout') and actor_user_id is null)
  );

create index online_matches_due_idx
on public.online_matches(turn_deadline_at)
where status='playing';

drop function public.create_online_match_server(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,integer,text);
create function public.create_online_match_server(
  p_lobby_id uuid,p_actor_user_id uuid,p_match_id uuid,p_state jsonb,p_snapshot jsonb,p_players jsonb,
  p_current_player_id text,p_turn_number integer,p_status text,p_turn_timer_seconds integer
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_host uuid; v_lobby_status text; v_existing uuid; v_started timestamptz;
begin
  if p_turn_timer_seconds not in (0,15,30,60) then raise exception 'INVALID_TIMER'; end if;
  select host_user_id,status into v_host,v_lobby_status from public.online_lobbies where id=p_lobby_id for update;
  if not found then raise exception 'LOBBY_NOT_FOUND'; end if;
  if v_host<>p_actor_user_id then raise exception 'HOST_REQUIRED'; end if;
  select id into v_existing from public.online_matches where lobby_id=p_lobby_id;
  if v_existing is not null then return v_existing; end if;
  if v_lobby_status<>'starting' then raise exception 'LOBBY_NOT_STARTING'; end if;
  v_started:=now();
  insert into public.online_matches(
    id,lobby_id,status,current_player_id,turn_number,snapshot,
    turn_timer_seconds,turn_started_at,turn_deadline_at
  ) values(
    p_match_id,p_lobby_id,p_status,p_current_player_id,p_turn_number,p_snapshot,
    p_turn_timer_seconds,v_started,
    case when p_status='playing' and p_turn_timer_seconds>0
      then v_started+make_interval(secs=>p_turn_timer_seconds) else null end
  );
  insert into public.online_match_states(match_id,state) values(p_match_id,p_state);
  insert into public.online_match_players(match_id,seat_index,player_id,user_id,display_name,is_bot,color)
  select p_match_id,x.seat_index,x.player_id,x.user_id,x.display_name,x.is_bot,x.color
  from jsonb_to_recordset(p_players) as x(seat_index integer,player_id text,user_id uuid,display_name text,is_bot boolean,color text);
  update public.online_lobbies set status='in_game',updated_at=now() where id=p_lobby_id;
  return p_match_id;
end $$;

drop function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text);
create function public.commit_online_match_transition_server(
  p_match_id uuid,p_expected_version bigint,p_intent_id uuid,p_actor_user_id uuid,p_action_type text,p_payload jsonb,
  p_state jsonb,p_snapshot jsonb,p_current_player_id text,p_turn_number integer,p_status text,
  p_source text,p_turn_advanced boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_version bigint; v_lobby_id uuid; v_existing bigint; v_deadline timestamptz;
  v_timer integer; v_started timestamptz;
begin
  if p_source not in ('human','bot','timeout') then raise exception 'INVALID_SOURCE'; end if;
  if (p_source='human') <> (p_actor_user_id is not null) then raise exception 'INVALID_ACTOR_SOURCE'; end if;
  select version,lobby_id,turn_deadline_at,turn_timer_seconds
    into v_version,v_lobby_id,v_deadline,v_timer
    from public.online_matches where id=p_match_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  select version_after into v_existing from public.online_match_actions where match_id=p_match_id and intent_id=p_intent_id;
  if v_existing is not null then return jsonb_build_object('idempotent',true,'version',v_existing); end if;
  if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_source='human' and v_deadline is not null and now()>=v_deadline then raise exception 'TURN_EXPIRED'; end if;
  if p_turn_advanced then v_started:=now(); end if;
  update public.online_match_states set state=p_state,updated_at=now() where match_id=p_match_id;
  update public.online_matches set
    version=v_version+1,status=p_status,current_player_id=p_current_player_id,
    turn_number=p_turn_number,snapshot=p_snapshot,updated_at=now(),
    turn_started_at=case when p_status<>'playing' then turn_started_at when p_turn_advanced then v_started else turn_started_at end,
    turn_deadline_at=case
      when p_status<>'playing' then null
      when p_turn_advanced and v_timer>0 then v_started+make_interval(secs=>v_timer)
      when p_turn_advanced then null
      else turn_deadline_at end
    where id=p_match_id;
  insert into public.online_match_actions(
    match_id,intent_id,actor_user_id,version_before,version_after,action_type,payload,source
  ) values(
    p_match_id,p_intent_id,p_actor_user_id,v_version,v_version+1,p_action_type,p_payload,p_source
  );
  if p_status='finished' then update public.online_lobbies set status='finished',updated_at=now() where id=v_lobby_id; end if;
  return jsonb_build_object('idempotent',false,'version',v_version+1);
end $$;

create function public.list_due_online_matches_server(p_limit integer default 20)
returns table(match_id uuid) language sql stable security invoker set search_path='' as $$
  select m.id
  from public.online_matches m
  where m.status='playing' and (
    m.turn_deadline_at<=now()
    or exists (
      select 1 from public.online_match_players p
      where p.match_id=m.id and p.player_id=m.current_player_id and p.is_bot
    )
  )
  order by m.turn_deadline_at nulls first,m.updated_at
  limit least(greatest(p_limit,1),20)
$$;

revoke all on function public.create_online_match_server(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,integer,text,integer) from public,anon,authenticated;
revoke all on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text,text,boolean) from public,anon,authenticated;
revoke all on function public.list_due_online_matches_server(integer) from public,anon,authenticated;
grant execute on function public.create_online_match_server(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,integer,text,integer) to service_role;
grant execute on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text,text,boolean) to service_role;
grant execute on function public.list_due_online_matches_server(integer) to service_role;
