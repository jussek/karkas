begin;
select plan(12);

select has_column('public','online_matches','turn_timer_seconds','match stores immutable timer setting');
select has_column('public','online_matches','turn_started_at','match stores server turn start');
select has_column('public','online_matches','turn_deadline_at','match stores server deadline');
select has_column('public','online_match_actions','source','action log records automation source');
select has_function('public','list_due_online_matches_server',array['integer'],'service due-match query exists');
select function_privs_are('public','list_due_online_matches_server',array['integer'],'service_role',array['EXECUTE'],'service role can query due matches');
select function_privs_are('public','list_due_online_matches_server',array['integer'],'authenticated',array[]::text[],'participants cannot execute due query');
select function_privs_are('public','list_due_online_matches_server',array['integer'],'anon',array[]::text[],'anonymous clients cannot execute due query');
select col_is_not_null('public','online_matches','turn_timer_seconds','timer setting is required');
select has_index('public','online_matches','online_matches_due_idx','due matches have a partial index');
select isnt_empty($$select 1 from pg_constraint where conname='online_match_actions_source_actor_check'$$,'action actor/source consistency is constrained');
select isnt_empty($$select 1 from pg_proc where proname='commit_online_match_transition_server' and prosrc like '%TURN_EXPIRED%'$$,'atomic commit protects deadline race');

select * from finish();
rollback;
