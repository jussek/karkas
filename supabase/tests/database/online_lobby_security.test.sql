begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', now(), now()),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', now(), now()),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test', now(), now());

select ok((select relrowsecurity from pg_class where oid='public.online_lobbies'::regclass), 'lobbies RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.online_lobby_players'::regclass), 'players RLS enabled');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef), 0::bigint, 'no SECURITY DEFINER in exposed public schema');
select is((select count(*) from information_schema.role_routine_grants where grantee='anon' and routine_schema in ('public','private')), 0::bigint, 'anon cannot execute lobby functions');
select is((select count(*) from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema='public' and table_name in ('online_lobbies','online_lobby_players','online_lobby_messages') and privilege_type in ('INSERT','DELETE')), 0::bigint, 'no broad INSERT or DELETE grants');
select ok(has_column_privilege('authenticated','public.online_lobby_players','ready','UPDATE'), 'authenticated may update ready column');
select ok(not has_column_privilege('authenticated','public.online_lobby_players','seat_index','UPDATE'), 'authenticated cannot update seat');

set local role anon;
select throws_ok($$select * from public.online_lobbies$$, '42501', null, 'anon cannot select lobbies');
select throws_ok($$select public.create_online_lobby(null,'public',2,0,false,null)$$, '42501', null, 'anon cannot execute application RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
select lives_ok($$select public.create_online_lobby('Public','public',4,30,false,'A')$$, 'user A creates public lobby');
select id as public_lobby from public.online_lobbies where name='Public' \gset
select is((select host_user_id from public.online_lobbies where id=:'public_lobby'), '00000000-0000-0000-0000-00000000000a'::uuid, 'creator is host');
select is((select seat_index from public.online_lobby_players where lobby_id=:'public_lobby' and user_id=auth.uid()), 0, 'host gets seat zero');
select public.create_online_lobby('Private','private',4,0,false,'A') as private_lobby \gset
select code as private_code from public.online_lobbies where id=:'private_lobby' \gset

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',true);
select lives_ok(format('select public.join_online_lobby(%L,%L)', :'public_lobby', 'B'), 'user B joins public lobby by id');
select throws_ok(format('select public.update_online_lobby_settings(%L,%L::jsonb)', :'public_lobby', '{"maxPlayers":3}'), 'P0001', 'host cannot update lobby', 'non-host cannot alter settings');
update public.online_lobby_players set ready=true where lobby_id=:'public_lobby' and user_id='00000000-0000-0000-0000-00000000000a';
select is((select ready from public.online_lobby_players where lobby_id=:'public_lobby' and user_id='00000000-0000-0000-0000-00000000000a'), false, 'user B cannot change A ready');
update public.online_lobby_players set ready=true where lobby_id=:'public_lobby' and user_id=auth.uid();
select is((select ready from public.online_lobby_players where lobby_id=:'public_lobby' and user_id=auth.uid()), true, 'user B can change own ready');
select throws_ok(format('select public.join_online_lobby(%L,%L)', :'private_lobby', 'B'), 'P0001', 'lobby is not joinable', 'private lobby cannot be joined by UUID');
select lives_ok(format('select public.join_online_lobby_by_code(%L,%L)', :'private_code', 'B'), 'private lobby can be joined with code');
select is((select count(*) from public.online_lobby_players where lobby_id=:'private_lobby'), 2::bigint, 'private code join adds membership');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
select public.create_online_lobby('Capacity','public',3,0,true,'A') as capacity_lobby \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',true);
select lives_ok(format('select public.join_online_lobby(%L,%L)', :'capacity_lobby', 'B'), 'one human seat remains after bot reservation');
select lives_ok(format('select public.join_online_lobby(%L,%L)', :'capacity_lobby', 'B again'), 'repeated join is idempotent even when full');
select is((select count(*) from public.online_lobby_players where lobby_id=:'capacity_lobby'), 2::bigint, 'idempotent join does not duplicate player');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',true);
select lives_ok(format('select public.join_online_lobby(%L,%L)', :'capacity_lobby', 'C'), 'bot fill does not reserve waiting seats');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);
select throws_ok(format('select public.update_online_lobby_settings(%L,%L::jsonb)', :'public_lobby', '{"maxPlayers":1}'), 'P0001', 'configured capacity exceeded', 'invalid combined settings update fails');
select results_eq(format('select max_players,bot_slots from public.online_lobbies where id=%L', :'public_lobby'), $$values (4,0)$$, 'failed settings update rolls back both values');
select lives_ok(format('select public.leave_online_lobby(%L)', :'public_lobby'), 'host closes lobby');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',true);
select throws_ok(format('select public.join_online_lobby(%L,%L)', :'public_lobby', 'C'), 'P0001', 'lobby is not joinable', 'closed lobby rejects joins');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',true);
update public.online_lobby_players set ready=false where lobby_id=:'public_lobby' and user_id=auth.uid();
select is((select ready from public.online_lobby_players where lobby_id=:'public_lobby' and user_id=auth.uid()), true, 'closed lobby rejects ready mutation');

reset role;
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('online_lobbies','online_lobby_players','online_lobby_messages')), 3::bigint, 'Realtime publication is preserved');
select * from finish();
rollback;
