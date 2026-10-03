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
  v_attempt integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform private.assert_single_active_lobby(null);

  if p_visibility = 'private' then
    v_code := upper(pg_catalog.btrim(coalesce(p_join_code,'')));
    if v_code !~ '^[0-9]{4}$' and v_code !~ '^[A-Z0-9]{6}$' then
      raise exception 'join code must contain exactly 4 digits';
    end if;

    begin
      insert into public.online_lobbies(code,host_user_id,name,visibility,max_players,turn_timer_seconds,bot_slots,bot_fill_enabled)
      values(v_code,auth.uid(),nullif(pg_catalog.btrim(p_name),''),p_visibility,p_max_players,p_turn_timer_seconds,0,p_bot_fill_enabled)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'join code is already used';
    end;
  else
    for v_attempt in 1..32 loop
      v_code := pg_catalog.lpad((pg_catalog.floor(pg_catalog.random() * 10000))::integer::text, 4, '0');
      begin
        insert into public.online_lobbies(code,host_user_id,name,visibility,max_players,turn_timer_seconds,bot_slots,bot_fill_enabled)
        values(v_code,auth.uid(),nullif(pg_catalog.btrim(p_name),''),p_visibility,p_max_players,p_turn_timer_seconds,0,p_bot_fill_enabled)
        returning id into v_id;
        exit;
      exception when unique_violation then
        v_id := null;
      end;
    end loop;
    if v_id is null then raise exception 'unable to allocate lobby code'; end if;
  end if;

  insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name)
  values(v_id,auth.uid(),0,coalesce(nullif(pg_catalog.btrim(p_display_name),''),'Игрок 1'));
  return v_id;
end
$function$;

create or replace function private.join_online_lobby_by_code_impl(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  v_code := upper(pg_catalog.btrim(coalesce(p_code,'')));
  if v_code !~ '^[0-9]{4}$' and v_code !~ '^[A-Z0-9]{6}$' then raise exception 'lobby is not joinable'; end if;
  select id into v_id from public.online_lobbies where code=v_code and status='waiting';
  if v_id is null then raise exception 'lobby is not joinable'; end if;
  return private.join_online_lobby_impl(v_id, p_display_name, true);
end
$function$;
