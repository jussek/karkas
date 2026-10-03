create or replace function private.assert_single_active_lobby(p_target_lobby_id uuid default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));

  if exists (
    select 1
    from public.online_lobby_players p
    join public.online_lobbies l on l.id = p.lobby_id
    where p.user_id = auth.uid()
      and l.status in ('waiting','starting','in_game')
      and (p_target_lobby_id is null or p.lobby_id <> p_target_lobby_id)
  ) then
    raise exception 'already in active lobby';
  end if;
end
$function$;

create or replace function private.create_online_lobby_impl(
  p_name text,
  p_visibility text,
  p_max_players integer,
  p_turn_timer_seconds integer,
  p_bot_fill_enabled boolean,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform private.assert_single_active_lobby(null);

  v_code := upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
  insert into public.online_lobbies(code,host_user_id,name,visibility,max_players,turn_timer_seconds,bot_slots,bot_fill_enabled)
  values(v_code,auth.uid(),nullif(pg_catalog.btrim(p_name),''),p_visibility,p_max_players,p_turn_timer_seconds,0,p_bot_fill_enabled)
  returning id into v_id;

  insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name)
  values(v_id,auth.uid(),0,coalesce(nullif(pg_catalog.btrim(p_display_name),''),'Игрок 1'));
  return v_id;
end
$function$;

create or replace function private.create_online_lobby_with_code_impl(
  p_name text,
  p_visibility text,
  p_max_players integer,
  p_turn_timer_seconds integer,
  p_bot_fill_enabled boolean,
  p_join_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform private.assert_single_active_lobby(null);

  if p_visibility = 'private' then
    v_code := upper(pg_catalog.btrim(coalesce(p_join_code,'')));
    if v_code !~ '^[A-Z0-9]{6}$' then
      raise exception 'join code must contain exactly 6 letters or digits';
    end if;
  else
    v_code := upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
  end if;

  begin
    insert into public.online_lobbies(code,host_user_id,name,visibility,max_players,turn_timer_seconds,bot_slots,bot_fill_enabled)
    values(v_code,auth.uid(),nullif(pg_catalog.btrim(p_name),''),p_visibility,p_max_players,p_turn_timer_seconds,0,p_bot_fill_enabled)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'join code is already used';
  end;

  insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name)
  values(v_id,auth.uid(),0,coalesce(nullif(pg_catalog.btrim(p_display_name),''),'Игрок 1'));
  return v_id;
end
$function$;

create or replace function private.join_online_lobby_impl(p_lobby_id uuid, p_display_name text, p_allow_private boolean)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_seat integer;
  v_max integer;
  v_visibility text;
  v_humans integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform private.assert_single_active_lobby(p_lobby_id);

  select max_players,visibility into v_max,v_visibility
  from public.online_lobbies
  where id=p_lobby_id and status='waiting' and bot_slots=0
  for update;

  if v_max is null or (v_visibility='private' and not p_allow_private) then
    raise exception 'lobby is not joinable';
  end if;

  if exists(select 1 from public.online_lobby_players where lobby_id=p_lobby_id and user_id=auth.uid()) then
    return p_lobby_id;
  end if;

  select count(*) into v_humans from public.online_lobby_players where lobby_id=p_lobby_id;
  if v_humans >= v_max then raise exception 'lobby is full'; end if;

  select s into v_seat
  from generate_series(0,v_max-1) s
  where not exists(select 1 from public.online_lobby_players p where p.lobby_id=p_lobby_id and p.seat_index=s)
  order by s limit 1;

  insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name)
  values(p_lobby_id,auth.uid(),v_seat,coalesce(nullif(pg_catalog.btrim(p_display_name),''),'Игрок '||(v_seat+1)));
  return p_lobby_id;
end
$function$;

create or replace function public.create_online_lobby_with_code(
  p_name text,
  p_visibility text,
  p_max_players integer,
  p_turn_timer_seconds integer,
  p_bot_fill_enabled boolean,
  p_join_code text default null,
  p_display_name text default null
)
returns uuid
language sql
set search_path to ''
as $function$
  select private.create_online_lobby_with_code_impl(
    p_name,p_visibility,p_max_players,p_turn_timer_seconds,p_bot_fill_enabled,p_join_code,p_display_name
  )
$function$;

revoke all on function public.create_online_lobby_with_code(text,text,integer,integer,boolean,text,text) from public, anon;
grant execute on function public.create_online_lobby_with_code(text,text,integer,integer,boolean,text,text) to authenticated, service_role;
