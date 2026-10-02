create index if not exists
online_match_actions_actor_user_id_idx
on public.online_match_actions(actor_user_id)
where actor_user_id is not null;
