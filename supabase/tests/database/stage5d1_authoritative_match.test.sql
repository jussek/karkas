begin;
select plan(26);
select has_table('public','online_matches','public match table exists');
select has_table('public','online_match_players','match roster exists');
select has_table('public','online_match_states','private state exists');
select has_table('public','online_match_actions','private action log exists');
select ok((select relrowsecurity from pg_class where oid='public.online_matches'::regclass),'matches RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.online_match_players'::regclass),'roster RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.online_match_states'::regclass),'state RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.online_match_actions'::regclass),'actions RLS enabled');
select ok(not has_table_privilege('anon','public.online_matches','SELECT'),'anon cannot read matches');
select ok(not has_table_privilege('authenticated','public.online_match_states','SELECT'),'authenticated cannot read private state');
select ok(not has_table_privilege('authenticated','public.online_match_actions','SELECT'),'authenticated cannot read action log');
select ok(not has_function_privilege('authenticated','public.create_online_match_server(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,integer,text)','EXECUTE'),'authenticated cannot create server match');
select ok(not has_function_privilege('authenticated','public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text)','EXECUTE'),'authenticated cannot commit server transition');
select ok(has_function_privilege('service_role','public.create_online_match_server(uuid,uuid,uuid,jsonb,jsonb,jsonb,text,integer,text)','EXECUTE'),'service role creates match');
select ok(has_function_privilege('service_role','public.commit_online_match_transition_server(uuid,bigint,uuid,uuid,text,jsonb,jsonb,jsonb,text,integer,text)','EXECUTE'),'service role commits transition');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='online_matches'),1::bigint,'public match is realtime');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='online_match_states'),0::bigint,'private state is not realtime');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='online_match_actions'),0::bigint,'action log is not realtime');

insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('30000000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m-a@test',now(),now()),
('30000000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m-b@test',now(),now());
insert into public.online_lobbies(id,code,host_user_id,visibility,status,max_players,turn_timer_seconds,bot_slots)
values('40000000-0000-4000-8000-000000000001','D1TEST','30000000-0000-4000-8000-00000000000a','private','starting',2,0,0);
insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name,ready) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-00000000000a',0,'Alice',true);
set local role service_role;
select public.create_online_match_server('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-00000000000a','50000000-0000-4000-8000-000000000001','{"secret":"state"}','{"safe":true}','[{"seat_index":0,"player_id":"30000000-0000-4000-8000-00000000000a","user_id":"30000000-0000-4000-8000-00000000000a","display_name":"Alice","is_bot":false,"color":"blue"}]','30000000-0000-4000-8000-00000000000a',1,'playing');
select is(public.create_online_match_server('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-00000000000a','50000000-0000-4000-8000-000000000002','{}','{}','[]',null,1,'playing'),'50000000-0000-4000-8000-000000000001'::uuid,'parallel-safe create is idempotent by locked lobby');
select is((select count(*) from public.online_matches where lobby_id='40000000-0000-4000-8000-000000000001'),1::bigint,'one match per lobby');
select public.commit_online_match_transition_server('50000000-0000-4000-8000-000000000001',0,'60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-00000000000a','END_TURN','{}','{"next":"state"}','{"safe":2}','30000000-0000-4000-8000-00000000000a',2,'playing');
select is((select version from public.online_matches where id='50000000-0000-4000-8000-000000000001'),1::bigint,'commit increments version once');
select public.commit_online_match_transition_server('50000000-0000-4000-8000-000000000001',0,'60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-00000000000a','END_TURN','{}','{}','{}',null,99,'playing');
select is((select version from public.online_matches where id='50000000-0000-4000-8000-000000000001'),1::bigint,'duplicate intent is idempotent');
select throws_ok(
  $$select public.commit_online_match_transition_server('50000000-0000-4000-8000-000000000001',0,'60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-00000000000a','END_TURN','{}','{}','{}',null,99,'playing')$$,
  'P0001','VERSION_CONFLICT','same expected version cannot commit twice');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-00000000000a',true);
select is((select count(*) from public.online_matches),1::bigint,'participant reads public match');
select is((select count(*) from public.online_match_players),1::bigint,'participant reads immutable roster');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-00000000000b',true);
select is((select count(*) from public.online_matches),0::bigint,'non-member cannot read match');
select * from finish();
rollback;
