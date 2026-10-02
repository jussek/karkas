begin;
select plan(9);

insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c1-a@test',now(),now()),
('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c1-b@test',now(),now()),
('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c1-c@test',now(),now());

select has_index('public','online_lobby_messages','online_lobby_messages_user_id_idx','messages user index exists');
select ok(not has_function_privilege('anon','public.set_online_lobby_ready(uuid,boolean)','EXECUTE'),'anon cannot call ready RPC');
select ok(has_function_privilege('authenticated','public.set_online_lobby_ready(uuid,boolean)','EXECUTE'),'authenticated may call ready RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000a',true);
select public.create_online_lobby('Consistency','public',6,0,false,'Alice') as lobby_id \gset
reset role;
insert into public.online_lobby_players(lobby_id,user_id,seat_index,display_name)
values (:'lobby_id','20000000-0000-0000-0000-00000000000b',5,'Bob');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000a',true);
select throws_ok(
  format('select public.update_online_lobby_settings(%L,%L::jsonb)', :'lobby_id','{"maxPlayers":2}'),
  'P0001','configured capacity exceeded','cannot shrink below the highest occupied seat');
select lives_ok(format('select public.set_online_lobby_ready(%L,true)', :'lobby_id'),'member changes ready while waiting');
select is((select ready from public.online_lobby_players where lobby_id=:'lobby_id' and user_id=auth.uid()),true,'ready RPC updates current member');

reset role;
update public.online_lobbies set status='starting' where id=:'lobby_id';
set local role authenticated;
select throws_ok(format('select public.set_online_lobby_ready(%L,false)', :'lobby_id'),'P0001','lobby is not waiting','starting lobby rejects ready');
reset role;
update public.online_lobbies set status='closed' where id=:'lobby_id';
set local role authenticated;
select throws_ok(format('select public.set_online_lobby_ready(%L,false)', :'lobby_id'),'P0001','lobby is not waiting','closed lobby rejects ready');
reset role;
update public.online_lobbies set status='waiting' where id=:'lobby_id';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-00000000000c',true);
select throws_ok(format('select public.set_online_lobby_ready(%L,true)', :'lobby_id'),'P0001','member cannot change ready','non-member cannot change ready');

select * from finish();
rollback;
