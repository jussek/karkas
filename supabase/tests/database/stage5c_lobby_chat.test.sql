begin;
select plan(20);
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c-a@test',now(),now()),
('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c-b@test',now(),now()),
('10000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c-c@test',now(),now());
select is((select column_default from information_schema.columns where table_schema='public' and table_name='online_lobbies' and column_name='bot_fill_enabled'),'false','bot fill defaults false');
set local role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000a',true);
select public.create_online_lobby('Fill','public',4,0,true,'Alice') as fill_lobby \gset
select is((select bot_slots from public.online_lobbies where id=:'fill_lobby'),0,'waiting bot slots zero');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000b',true);
select lives_ok(format('select public.join_online_lobby(%L,%L)', :'fill_lobby','Bob'),'bot fill does not block human join');
select throws_ok(format('select public.update_online_lobby_settings(%L,%L::jsonb)', :'fill_lobby','{"maxPlayers":3}'),'P0001','host cannot update lobby','non-host settings rejected');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000a',true);
update public.online_lobby_players set ready=true where lobby_id=:'fill_lobby' and user_id=auth.uid();
select lives_ok(format('select public.update_online_lobby_settings(%L,%L::jsonb)', :'fill_lobby','{"turnTimerSeconds":15}'),'host updates gameplay settings');
select is((select count(*) from public.online_lobby_players where lobby_id=:'fill_lobby' and ready),0::bigint,'gameplay settings reset all ready');
select throws_ok(format('select public.update_online_lobby_settings(%L,%L::jsonb)', :'fill_lobby','{"maxPlayers":1}'),'P0001','configured capacity exceeded','cannot shrink below humans');
select throws_ok(format('select public.start_online_lobby(%L)', :'fill_lobby'),'P0001','all human players must be ready','all humans ready required');
update public.online_lobby_players set ready=true where lobby_id=:'fill_lobby';
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000b',true);
select throws_ok(format('select public.start_online_lobby(%L)', :'fill_lobby'),'P0001','host cannot start lobby','non-host cannot start');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000a',true);
select lives_ok(format('select public.start_online_lobby(%L)', :'fill_lobby'),'host starts all-ready lobby');
select results_eq(format('select status,bot_slots from public.online_lobbies where id=%L', :'fill_lobby'),$$values ('starting',2)$$,'start sets starting and fills bots');
select lives_ok(format('select public.send_online_lobby_message(%L,%L)', :'fill_lobby',' hello '),'member sends chat during starting');
select results_eq(format('select display_name,body from public.online_lobby_messages where lobby_id=%L', :'fill_lobby'),$$values ('Alice','hello')$$,'chat stores membership name and trimmed body');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000c',true);
select is((select count(*) from public.online_lobby_messages where lobby_id=:'fill_lobby'),0::bigint,'non-member cannot read chat');
select throws_ok(format('select public.send_online_lobby_message(%L,%L)', :'fill_lobby','intrude'),'P0001','member cannot send message','non-member cannot send chat');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000a',true);
select public.create_online_lobby('Solo','public',4,0,true,'Alice') as solo_lobby \gset
update public.online_lobby_players set ready=true where lobby_id=:'solo_lobby';
select lives_ok(format('select public.start_online_lobby(%L)', :'solo_lobby'),'bot fill allows ready solo host');
select is((select bot_slots from public.online_lobbies where id=:'solo_lobby'),3,'solo fill computes bot slots');
select public.create_online_lobby('No bots','public',4,0,false,'Alice') as no_bot_lobby \gset
update public.online_lobby_players set ready=true where lobby_id=:'no_bot_lobby';
select throws_ok(format('select public.start_online_lobby(%L)', :'no_bot_lobby'),'P0001','not enough participants','no-bot start requires two humans');
select public.leave_online_lobby(:'no_bot_lobby');
select throws_ok(format('select public.send_online_lobby_message(%L,%L)', :'no_bot_lobby','closed'),'P0001','member cannot send message','closed lobby rejects chat');
reset role;
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='online_lobby_messages'),1::bigint,'messages published to Realtime');
select * from finish(); rollback;
