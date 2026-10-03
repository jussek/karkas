alter table public.online_match_players
  add column if not exists presence_capable boolean not null default false;

create or replace function public.set_online_match_presence(
  p_match_id uuid,
  p_present boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.online_match_players
    where match_id=p_match_id and user_id=v_uid and not is_bot
  ) then raise exception 'MATCH_MEMBER_REQUIRED'; end if;

  if p_present then
    update public.online_match_players mp
    set left_at=coalesce(mp.left_at,now()),last_seen_at=coalesce(mp.last_seen_at,now())
    from public.online_matches m
    where mp.match_id=m.id and mp.user_id=v_uid and not mp.is_bot
      and m.status='playing' and mp.match_id<>p_match_id and mp.left_at is null;

    update public.online_matches m
    set turn_deadline_at=now(),updated_at=now()
    where m.status='playing' and m.id<>p_match_id and m.current_player_id=v_uid::text
      and exists(
        select 1 from public.online_match_players mp
        where mp.match_id=m.id and mp.user_id=v_uid and mp.left_at is not null
      );

    update public.online_match_players
    set left_at=null,last_seen_at=now(),presence_capable=true
    where match_id=p_match_id and user_id=v_uid and not is_bot;
  else
    update public.online_match_players
    set left_at=now(),last_seen_at=now(),presence_capable=true
    where match_id=p_match_id and user_id=v_uid and not is_bot;

    update public.online_matches
    set turn_deadline_at=now(),updated_at=now()
    where id=p_match_id and status='playing' and current_player_id=v_uid::text;
  end if;
end
$$;

create or replace function public.find_my_active_online_match_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mp.match_id
  from public.online_match_players mp
  join public.online_matches m on m.id=mp.match_id
  where mp.user_id=auth.uid()
    and not mp.is_bot
    and mp.left_at is null
    and m.status='playing'
    and (
      not mp.presence_capable
      or coalesce(mp.last_seen_at,m.updated_at)>now()-interval '5 minutes'
    )
  order by coalesce(mp.last_seen_at,m.updated_at) desc
  limit 1
$$;

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
        and (
          mp.left_at is not null
          or (mp.presence_capable and coalesce(mp.last_seen_at,now())<=now()-interval '5 minutes')
        )
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
  update public.online_matches m
  set turn_deadline_at=now(),updated_at=now()
  where m.status='playing'
    and (m.turn_deadline_at is null or m.turn_deadline_at>now())
    and exists(
      select 1 from public.online_match_players current_mp
      where current_mp.match_id=m.id
        and current_mp.player_id=m.current_player_id
        and not current_mp.is_bot
        and (
          current_mp.left_at is not null
          or (current_mp.presence_capable and coalesce(current_mp.last_seen_at,m.created_at)<=now()-interval '5 minutes')
        )
    )
    and exists(
      select 1 from public.online_match_players active_mp
      where active_mp.match_id=m.id
        and not active_mp.is_bot
        and active_mp.left_at is null
        and (
          not active_mp.presence_capable
          or coalesce(active_mp.last_seen_at,m.created_at)>now()-interval '5 minutes'
        )
    );

  select array_agg(m.id)
  into v_match_ids
  from public.online_matches m
  where m.status='playing'
    and exists(
      select 1 from public.online_match_players mp
      where mp.match_id=m.id and not mp.is_bot
    )
    and not exists(
      select 1 from public.online_match_players mp
      where mp.match_id=m.id
        and not mp.is_bot
        and mp.left_at is null
        and (
          not mp.presence_capable
          or coalesce(mp.last_seen_at,m.created_at)>now()-interval '5 minutes'
        )
    )
    and (
      select max(coalesce(mp.left_at,mp.last_seen_at,m.created_at))
      from public.online_match_players mp
      where mp.match_id=m.id and not mp.is_bot
    )<=now()-interval '5 minutes';

  v_count:=coalesce(cardinality(v_match_ids),0);
  if v_count=0 then return 0; end if;

  update public.online_matches
  set status='abandoned',version=version+1,current_player_id=null,turn_started_at=null,turn_deadline_at=null,updated_at=now()
  where id=any(v_match_ids) and status='playing';

  update public.online_lobbies l
  set status='closed',updated_at=now()
  where l.id in (select m.lobby_id from public.online_matches m where m.id=any(v_match_ids))
    and l.status in ('starting','in_game');

  return v_count;
end $$;

revoke all on function public.set_online_match_presence(uuid,boolean) from public,anon;
revoke all on function public.find_my_active_online_match_id() from public,anon;
revoke all on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text,text,boolean) from public,anon,authenticated;
revoke all on function public.cleanup_abandoned_online_matches_server() from public,anon,authenticated;
grant execute on function public.set_online_match_presence(uuid,boolean) to authenticated;
grant execute on function public.find_my_active_online_match_id() to authenticated;
grant execute on function public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text,text,boolean) to service_role;
grant execute on function public.cleanup_abandoned_online_matches_server() to service_role;
