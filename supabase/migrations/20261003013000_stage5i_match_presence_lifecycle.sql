alter table public.online_match_players
  add column if not exists last_seen_at timestamptz default now(),
  add column if not exists left_at timestamptz;

update public.online_match_players
set last_seen_at = coalesce(last_seen_at, now())
where not is_bot;

create index if not exists online_match_players_presence_idx
  on public.online_match_players(match_id, left_at, last_seen_at)
  where not is_bot;

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
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.online_match_players
    where match_id = p_match_id
      and user_id = v_uid
      and not is_bot
  ) then
    raise exception 'MATCH_MEMBER_REQUIRED';
  end if;

  if p_present then
    -- Entering one match ends this user's active presence in every older match.
    update public.online_match_players mp
    set left_at = coalesce(mp.left_at, now()),
        last_seen_at = coalesce(mp.last_seen_at, now())
    from public.online_matches m
    where mp.match_id = m.id
      and mp.user_id = v_uid
      and not mp.is_bot
      and m.status = 'playing'
      and mp.match_id <> p_match_id
      and mp.left_at is null;

    -- If the departed user owned the current turn, make it immediately eligible
    -- for the existing timeout automation so remaining players are not blocked.
    update public.online_matches m
    set turn_deadline_at = now(),
        updated_at = now()
    where m.status = 'playing'
      and m.id <> p_match_id
      and m.current_player_id = v_uid::text
      and exists (
        select 1 from public.online_match_players mp
        where mp.match_id = m.id
          and mp.user_id = v_uid
          and mp.left_at is not null
      );

    update public.online_match_players
    set left_at = null,
        last_seen_at = now()
    where match_id = p_match_id
      and user_id = v_uid
      and not is_bot;
  else
    update public.online_match_players
    set left_at = now(),
        last_seen_at = now()
    where match_id = p_match_id
      and user_id = v_uid
      and not is_bot;

    update public.online_matches
    set turn_deadline_at = now(),
        updated_at = now()
    where id = p_match_id
      and status = 'playing'
      and current_player_id = v_uid::text;
  end if;
end
$$;

create or replace function public.leave_my_online_matches(
  p_except_match_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  with departed as (
    update public.online_match_players mp
    set left_at = now(),
        last_seen_at = coalesce(mp.last_seen_at, now())
    from public.online_matches m
    where mp.match_id = m.id
      and mp.user_id = v_uid
      and not mp.is_bot
      and m.status = 'playing'
      and (p_except_match_id is null or mp.match_id <> p_except_match_id)
      and mp.left_at is null
    returning mp.match_id
  )
  select count(*) into v_count from departed;

  update public.online_matches m
  set turn_deadline_at = now(),
      updated_at = now()
  where m.status = 'playing'
    and m.current_player_id = v_uid::text
    and (p_except_match_id is null or m.id <> p_except_match_id)
    and exists (
      select 1 from public.online_match_players mp
      where mp.match_id = m.id
        and mp.user_id = v_uid
        and mp.left_at is not null
    );

  return v_count;
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
  join public.online_matches m on m.id = mp.match_id
  where mp.user_id = auth.uid()
    and not mp.is_bot
    and mp.left_at is null
    and m.status = 'playing'
    and coalesce(mp.last_seen_at, m.updated_at) > now() - interval '5 minutes'
  order by coalesce(mp.last_seen_at, m.updated_at) desc
  limit 1
$$;

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
  select array_agg(m.id)
  into v_match_ids
  from public.online_matches m
  where m.status = 'playing'
    and exists (
      select 1
      from public.online_match_players mp
      where mp.match_id = m.id and not mp.is_bot
    )
    and not exists (
      select 1
      from public.online_match_players mp
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
  if v_count = 0 then
    return 0;
  end if;

  update public.online_matches
  set status = 'abandoned',
      version = version + 1,
      current_player_id = null,
      turn_started_at = null,
      turn_deadline_at = null,
      updated_at = now()
  where id = any(v_match_ids)
    and status = 'playing';

  update public.online_lobbies l
  set status = 'closed',
      updated_at = now()
  where l.id in (
    select m.lobby_id
    from public.online_matches m
    where m.id = any(v_match_ids)
  )
    and l.status in ('starting','in_game');

  return v_count;
end
$$;

revoke all on function public.set_online_match_presence(uuid, boolean) from public, anon;
revoke all on function public.leave_my_online_matches(uuid) from public, anon;
revoke all on function public.find_my_active_online_match_id() from public, anon;
revoke all on function public.cleanup_abandoned_online_matches_server() from public, anon, authenticated;

grant execute on function public.set_online_match_presence(uuid, boolean) to authenticated;
grant execute on function public.leave_my_online_matches(uuid) to authenticated;
grant execute on function public.find_my_active_online_match_id() to authenticated;
grant execute on function public.cleanup_abandoned_online_matches_server() to service_role;

-- Supabase Cron is independent from Vercel plan limits. It only performs
-- lifecycle cleanup; game turns still use the existing participant pump.
create extension if not exists pg_cron with schema pg_catalog;

do $do$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'karkas_cleanup_abandoned_matches'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'karkas_cleanup_abandoned_matches',
    '* * * * *',
    'select public.cleanup_abandoned_online_matches_server();'
  );
end
$do$;
