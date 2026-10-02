alter table public.online_lobbies add column bot_fill_enabled boolean not null default false;
update public.online_lobbies set bot_slots=0 where status='waiting';

create table public.online_lobby_messages (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.online_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index online_lobby_messages_lobby_created_idx on public.online_lobby_messages(lobby_id, created_at desc);
alter table public.online_lobby_messages enable row level security;
create policy "members view lobby messages" on public.online_lobby_messages for select to authenticated
using ((select auth.uid()) is not null and private.is_online_lobby_member(lobby_id));
revoke all on public.online_lobby_messages from public, anon, authenticated;
grant select on public.online_lobby_messages to authenticated;

-- Replace create with the bot-fill product contract (bot slots are server-owned).
drop function public.create_online_lobby(text,text,integer,integer,integer,text);
drop function private.create_online_lobby_impl(text,text,integer,integer,integer,text);
create function private.create_online_lobby_impl(p_name text,p_visibility text,p_max_players integer,p_turn_timer_seconds integer,p_bot_fill_enabled boolean,p_display_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  v_code:=upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
  insert into public.online_lobbies(code,host_user_id,name,visibility,max_players,turn_timer_seconds,bot_slots,bot_fill_enabled)
  values(v_code,auth.uid(),nullif(pg_catalog.btrim(p_name),''),p_visibility,p_max_players,p_turn_timer_seconds,0,p_bot_fill_enabled) returning id into v_id;
  insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name) values(v_id,auth.uid(),0,coalesce(nullif(pg_catalog.btrim(p_display_name),''),'Игрок 1'));
  return v_id;
end $$;
create function public.create_online_lobby(p_name text,p_visibility text,p_max_players integer,p_turn_timer_seconds integer,p_bot_fill_enabled boolean,p_display_name text default null)
returns uuid language sql security invoker set search_path='' as $$select private.create_online_lobby_impl(p_name,p_visibility,p_max_players,p_turn_timer_seconds,p_bot_fill_enabled,p_display_name)$$;

-- During waiting, bot fill reserves no seats and bot_slots must remain zero.
create or replace function private.join_online_lobby_impl(p_lobby_id uuid,p_display_name text,p_allow_private boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_seat integer; v_max integer; v_visibility text; v_humans integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select max_players,visibility into v_max,v_visibility from public.online_lobbies where id=p_lobby_id and status='waiting' and bot_slots=0 for update;
  if v_max is null or (v_visibility='private' and not p_allow_private) then raise exception 'lobby is not joinable'; end if;
  if exists(select 1 from public.online_lobby_players where lobby_id=p_lobby_id and user_id=auth.uid()) then return p_lobby_id; end if;
  select count(*) into v_humans from public.online_lobby_players where lobby_id=p_lobby_id;
  if v_humans >= v_max then raise exception 'lobby is full'; end if;
  select s into v_seat from generate_series(0,v_max-1) s where not exists(select 1 from public.online_lobby_players p where p.lobby_id=p_lobby_id and p.seat_index=s) order by s limit 1;
  insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name) values(p_lobby_id,auth.uid(),v_seat,coalesce(nullif(pg_catalog.btrim(p_display_name),''),'Игрок '||(v_seat+1)));
  return p_lobby_id;
end $$;

create or replace function private.update_online_lobby_settings_impl(p_lobby_id uuid,p_settings jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_max integer; v_humans integer; v_old_max integer; v_old_timer integer; v_old_fill boolean; v_new_fill boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select max_players,turn_timer_seconds,bot_fill_enabled into v_old_max,v_old_timer,v_old_fill from public.online_lobbies where id=p_lobby_id and host_user_id=auth.uid() and status='waiting' for update;
  if not found then raise exception 'host cannot update lobby'; end if;
  v_max:=coalesce((p_settings->>'maxPlayers')::integer,v_old_max); v_new_fill:=coalesce((p_settings->>'botFillEnabled')::boolean,v_old_fill);
  select count(*) into v_humans from public.online_lobby_players where lobby_id=p_lobby_id;
  if v_humans > v_max then raise exception 'configured capacity exceeded'; end if;
  update public.online_lobbies set name=case when p_settings?'name' then nullif(pg_catalog.btrim(p_settings->>'name'),'') else name end,
    visibility=coalesce(p_settings->>'visibility',visibility),max_players=v_max,
    turn_timer_seconds=coalesce((p_settings->>'turnTimerSeconds')::integer,turn_timer_seconds),bot_fill_enabled=v_new_fill,bot_slots=0,updated_at=now() where id=p_lobby_id;
  if v_max<>v_old_max or coalesce((p_settings->>'turnTimerSeconds')::integer,v_old_timer)<>v_old_timer or v_new_fill<>v_old_fill then
    update public.online_lobby_players set ready=false where lobby_id=p_lobby_id;
  end if;
  return p_lobby_id;
end $$;

create function private.start_online_lobby_impl(p_lobby_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_humans integer; v_unready integer; v_max integer; v_fill boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select max_players,bot_fill_enabled into v_max,v_fill from public.online_lobbies where id=p_lobby_id and host_user_id=auth.uid() and status='waiting' for update;
  if not found then raise exception 'host cannot start lobby'; end if;
  select count(*),count(*) filter(where not ready) into v_humans,v_unready from public.online_lobby_players where lobby_id=p_lobby_id;
  if v_unready>0 then raise exception 'all human players must be ready'; end if;
  if (not v_fill and v_humans<2) or (v_fill and (v_humans<1 or v_max<2)) then raise exception 'not enough participants'; end if;
  update public.online_lobbies set bot_slots=case when v_fill then v_max-v_humans else 0 end,status='starting',updated_at=now() where id=p_lobby_id;
  return p_lobby_id;
end $$;
create function public.start_online_lobby(p_lobby_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.start_online_lobby_impl(p_lobby_id)$$;

create function private.send_online_lobby_message_impl(p_lobby_id uuid,p_body text)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_name text; v_body text:=pg_catalog.btrim(p_body); v_id bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if char_length(v_body) not between 1 and 280 then raise exception 'message must contain 1..280 characters'; end if;
  select p.display_name into v_name from public.online_lobby_players p join public.online_lobbies l on l.id=p.lobby_id where p.lobby_id=p_lobby_id and p.user_id=auth.uid() and l.status in('waiting','starting','in_game');
  if v_name is null then raise exception 'member cannot send message'; end if;
  insert into public.online_lobby_messages(lobby_id,user_id,display_name,body) values(p_lobby_id,auth.uid(),v_name,v_body) returning id into v_id;
  return v_id;
end $$;
create function public.send_online_lobby_message(p_lobby_id uuid,p_body text) returns bigint language sql security invoker set search_path='' as $$select private.send_online_lobby_message_impl(p_lobby_id,p_body)$$;

revoke all on function private.create_online_lobby_impl(text,text,integer,integer,boolean,text),private.start_online_lobby_impl(uuid),private.send_online_lobby_message_impl(uuid,text) from public,anon;
grant execute on function private.create_online_lobby_impl(text,text,integer,integer,boolean,text),private.start_online_lobby_impl(uuid),private.send_online_lobby_message_impl(uuid,text) to authenticated;
revoke all on function public.create_online_lobby(text,text,integer,integer,boolean,text),public.start_online_lobby(uuid),public.send_online_lobby_message(uuid,text) from public,anon;
grant execute on function public.create_online_lobby(text,text,integer,integer,boolean,text),public.start_online_lobby(uuid),public.send_online_lobby_message(uuid,text) to authenticated;
alter publication supabase_realtime add table public.online_lobby_messages;
