create or replace function private.set_online_lobby_display_name_impl(p_lobby_id uuid, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_name := nullif(pg_catalog.btrim(p_display_name), '');
  if v_name is null then
    raise exception 'display name is required';
  end if;
  if char_length(v_name) > 32 then
    raise exception 'display name is too long';
  end if;

  perform 1
    from public.online_lobbies
    where id = p_lobby_id and status = 'waiting'
    for update;
  if not found then
    raise exception 'lobby is not waiting';
  end if;

  update public.online_lobby_players
    set display_name = v_name
    where lobby_id = p_lobby_id and user_id = auth.uid();
  if not found then
    raise exception 'member cannot change display name';
  end if;

  return p_lobby_id;
end
$$;

revoke all on function private.set_online_lobby_display_name_impl(uuid, text) from public, anon;
grant execute on function private.set_online_lobby_display_name_impl(uuid, text) to authenticated;

create or replace function public.set_online_lobby_display_name(p_lobby_id uuid, p_display_name text)
returns uuid
language sql
set search_path to ''
as $$
  select private.set_online_lobby_display_name_impl(p_lobby_id, p_display_name)
$$;

revoke all on function public.set_online_lobby_display_name(uuid, text) from public, anon;
grant execute on function public.set_online_lobby_display_name(uuid, text) to authenticated, service_role;
