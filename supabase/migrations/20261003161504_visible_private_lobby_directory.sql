create or replace function private.list_online_lobby_directory_impl()
returns table(
  id uuid,
  name text,
  visibility text,
  status text,
  max_players integer,
  turn_timer_seconds integer,
  bot_slots integer,
  bot_fill_enabled boolean,
  player_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    l.id,
    l.name,
    l.visibility,
    l.status,
    l.max_players,
    l.turn_timer_seconds,
    l.bot_slots,
    l.bot_fill_enabled,
    count(p.user_id)::integer as player_count,
    l.created_at,
    l.updated_at
  from public.online_lobbies l
  left join public.online_lobby_players p on p.lobby_id = l.id
  where l.status = 'waiting'
    and (l.visibility = 'public' or l.code ~ '^[0-9]{4}$')
  group by l.id, l.name, l.visibility, l.status, l.max_players, l.turn_timer_seconds, l.bot_slots, l.bot_fill_enabled, l.created_at, l.updated_at
  order by l.created_at asc
$function$;

revoke all on function private.list_online_lobby_directory_impl() from public, anon;
grant execute on function private.list_online_lobby_directory_impl() to authenticated, service_role;

create or replace function public.list_online_lobby_directory()
returns table(
  id uuid,
  name text,
  visibility text,
  status text,
  max_players integer,
  turn_timer_seconds integer,
  bot_slots integer,
  bot_fill_enabled boolean,
  player_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path to ''
as $function$
  select * from private.list_online_lobby_directory_impl()
$function$;

revoke all on function public.list_online_lobby_directory() from public, anon;
grant execute on function public.list_online_lobby_directory() to authenticated, service_role;

create or replace function private.join_online_lobby_with_code_impl(
  p_lobby_id uuid,
  p_code text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  v_code := pg_catalog.btrim(coalesce(p_code,''));
  if v_code !~ '^[0-9]{4}$' then raise exception 'lobby code is invalid'; end if;
  if not exists(
    select 1
    from public.online_lobbies l
    where l.id = p_lobby_id
      and l.status = 'waiting'
      and l.visibility = 'private'
      and l.code = v_code
  ) then
    raise exception 'lobby code is invalid';
  end if;
  return private.join_online_lobby_impl(p_lobby_id, p_display_name, true);
end
$function$;

revoke all on function private.join_online_lobby_with_code_impl(uuid,text,text) from public, anon;
grant execute on function private.join_online_lobby_with_code_impl(uuid,text,text) to authenticated, service_role;

create or replace function public.join_online_lobby_with_code(
  p_lobby_id uuid,
  p_code text,
  p_display_name text default null
)
returns uuid
language sql
set search_path to ''
as $function$
  select private.join_online_lobby_with_code_impl(p_lobby_id,p_code,p_display_name)
$function$;

revoke all on function public.join_online_lobby_with_code(uuid,text,text) from public, anon;
grant execute on function public.join_online_lobby_with_code(uuid,text,text) to authenticated, service_role;
