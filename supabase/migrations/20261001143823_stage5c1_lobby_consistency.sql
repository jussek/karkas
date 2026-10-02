create index if not exists online_lobby_messages_user_id_idx
on public.online_lobby_messages(user_id);

create or replace function private.update_online_lobby_settings_impl(
  p_lobby_id uuid,
  p_settings jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_max integer;
  v_humans integer;
  v_max_seat integer;
  v_old_max integer;
  v_old_timer integer;
  v_old_fill boolean;
  v_new_fill boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select
    max_players,
    turn_timer_seconds,
    bot_fill_enabled
  into
    v_old_max,
    v_old_timer,
    v_old_fill
  from public.online_lobbies
  where id=p_lobby_id
    and host_user_id=auth.uid()
    and status='waiting'
  for update;

  if not found then
    raise exception 'host cannot update lobby';
  end if;

  v_max :=
    coalesce((p_settings->>'maxPlayers')::integer, v_old_max);

  v_new_fill :=
    coalesce((p_settings->>'botFillEnabled')::boolean, v_old_fill);

  select
    count(*),
    coalesce(max(seat_index), -1)
  into
    v_humans,
    v_max_seat
  from public.online_lobby_players
  where lobby_id=p_lobby_id;

  if v_humans > v_max or v_max_seat >= v_max then
    raise exception 'configured capacity exceeded';
  end if;

  update public.online_lobbies
  set
    name =
      case
        when p_settings ? 'name'
          then nullif(pg_catalog.btrim(p_settings->>'name'),'')
        else name
      end,
    visibility =
      coalesce(p_settings->>'visibility', visibility),
    max_players = v_max,
    turn_timer_seconds =
      coalesce(
        (p_settings->>'turnTimerSeconds')::integer,
        turn_timer_seconds
      ),
    bot_fill_enabled = v_new_fill,
    bot_slots = 0,
    updated_at = now()
  where id=p_lobby_id;

  if
    v_max <> v_old_max
    or coalesce(
      (p_settings->>'turnTimerSeconds')::integer,
      v_old_timer
    ) <> v_old_timer
    or v_new_fill <> v_old_fill
  then
    update public.online_lobby_players
    set ready=false
    where lobby_id=p_lobby_id;
  end if;

  return p_lobby_id;
end
$$;

create or replace function private.leave_online_lobby_impl(
  p_lobby_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
  v_host uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select
    status,
    host_user_id
  into
    v_status,
    v_host
  from public.online_lobbies
  where id=p_lobby_id
  for update;

  if not found or v_status <> 'waiting' then
    raise exception 'lobby is not waiting';
  end if;

  if v_host=auth.uid() then
    update public.online_lobbies
    set
      status='closed',
      updated_at=now()
    where id=p_lobby_id;
  else
    delete from public.online_lobby_players
    where lobby_id=p_lobby_id
      and user_id=auth.uid();
  end if;
end
$$;

create function private.set_online_lobby_ready_impl(
  p_lobby_id uuid,
  p_ready boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform 1
  from public.online_lobbies
  where id=p_lobby_id
    and status='waiting'
  for update;

  if not found then
    raise exception 'lobby is not waiting';
  end if;

  update public.online_lobby_players
  set ready=p_ready
  where lobby_id=p_lobby_id
    and user_id=auth.uid();

  if not found then
    raise exception 'member cannot change ready';
  end if;

  return p_lobby_id;
end
$$;

create function public.set_online_lobby_ready(
  p_lobby_id uuid,
  p_ready boolean
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select private.set_online_lobby_ready_impl(
    p_lobby_id,
    p_ready
  )
$$;

revoke all
on function private.set_online_lobby_ready_impl(uuid,boolean)
from public,anon;

grant execute
on function private.set_online_lobby_ready_impl(uuid,boolean)
to authenticated;

revoke all
on function public.set_online_lobby_ready(uuid,boolean)
from public,anon;

grant execute
on function public.set_online_lobby_ready(uuid,boolean)
to authenticated;
