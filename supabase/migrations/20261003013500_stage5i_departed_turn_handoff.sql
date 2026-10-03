create or replace function public.commit_online_match_transition_server(
  p_match_id uuid,p_expected_version bigint,p_intent_id uuid,p_actor_user_id uuid,p_action_type text,p_payload jsonb,
  p_state jsonb,p_snapshot jsonb,p_current_player_id text,p_turn_number integer,p_status text,p_source text,p_turn_advanced boolean
) returns jsonb language plpgsql set search_path='' as $$
declare
  v_version bigint; v_lobby_id uuid; v_existing bigint; v_deadline timestamptz;
  v_timer integer; v_started timestamptz; v_next_inactive boolean := false;
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

  if p_turn_advanced then
    v_started:=now();
    select exists(
      select 1 from public.online_match_players mp
      where mp.match_id=p_match_id
        and mp.player_id=p_current_player_id
        and not mp.is_bot
        and (mp.left_at is not null or coalesce(mp.last_seen_at,now())<=now()-interval '5 minutes')
    ) into v_next_inactive;
  end if;

  update public.online_match_states set state=p_state,updated_at=now() where match_id=p_match_id;
  update public.online_matches set
    version=v_version+1,status=p_status,current_player_id=p_current_player_id,
    turn_number=p_turn_number,snapshot=p_snapshot,updated_at=now(),
    turn_started_at=case when p_status<>'playing' then turn_started_at when p_turn_advanced then v_started else turn_started_at end,
    turn_deadline_at=case
      when p_status<>'playing' then null
      when p_turn_advanced and v_next_inactive then v_started
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

create or replace function public.cleanup_abandoned_online_matches_server()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_ids uuid[];
  v_count integer := 0;
begin
  -- A disconnected/departed current player must not block a match that still
  -- has another active human. Mark the turn expired; existing pump logic
  -- performs the deterministic timeout action.
  update public.online_matches m
  set turn_deadline_at=now(),updated_at=now()
  where m.status='playing'
    and (m.turn_deadline_at is null or m.turn_deadline_at>now())
    and exists(
      select 1 from public.online_match_players current_mp
      where current_mp.match_id=m.id
        and current_mp.player_id=m.current_player_id
        and not current_mp.is_bot
        and (current_mp.left_at is not null or coalesce(current_mp.last_seen_at,m.created_at)<=now()-interval '5 minutes')
    )
    and exists(
      select 1 from public.online_match_players active_mp
      where active_mp.match_id=m.id
        and not active_mp.is_bot
        and active_mp.left_at is null
        and coalesce(active_mp.last_seen_at,m.created_at)>now()-interval '5 minutes'
    );

  select array_agg(m.id)
  into v_match_ids
  from public.online_matches m
  where m.status = 'playing'
    and exists (
      select 1 from public.online_match_players mp
      where mp.match_id = m.id and not mp.is_bot
    )
    and not exists (
      select 1 from public.online_match_players mp
      where mp.match_id = m.id
        and not mp.is_bot
        and mp.left_at is null
        and coalesce(mp.last_seen_at, m.created_at) > now() - interval '5 minutes'
    )
    and (
      select max(coalesce(mp.left_at, mp.last_seen_at, m.created_at))
      from public.online_match_players mp
      where mp.match_id = m.id and not mp.is_bot
    ) <= now() - interval '5 minutes';

  v_count := coalesce(cardinality(v_match_ids), 0);
  if v_count = 0 then return 0; end if;

  update public.online_matches
  set status='abandoned',version=version+1,current_player_id=null,turn_started_at=null,turn_deadline_at=null,updated_at=now()
  where id=any(v_match_ids) and status='playing';

  update public.online_lobbies l
  set status='closed',updated_at=now()
  where l.id in (select m.lobby_id from public.online_matches m where m.id=any(v_match_ids))
    and l.status in ('starting','in_game');

  return v_count;
end $$;

revoke all on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text,text,boolean) to service_role;
revoke all on function public.cleanup_abandoned_online_matches_server() from public,anon,authenticated;
grant execute on function public.cleanup_abandoned_online_matches_server() to service_role;
