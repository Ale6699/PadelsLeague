begin;
select plan(8);

select has_column('public', 'tournaments', 'schedule_needs_regeneration', 'schedule invalidation is stored');
select has_column('public', 'tournaments', 'timer_sound_enabled', 'timer preference is stored');
select function_returns('public', 'delete_tournament', array['uuid', 'bigint'], 'jsonb', 'atomic delete function exists');
select policies_are('public', 'tournaments', array['Owners can create tournaments', 'Owners can delete tournaments', 'Owners can read tournaments', 'Owners can update tournaments'], 'owner CRUD policies are explicit');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner11@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-0000-0000-000000000001';
insert into public.tournaments(id, owner_id, name, public_title, tournament_date, start_time, end_time, public_slug)
values ('33000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001', 'Task 11', 'Task 11', current_date, '10:00', '12:00', 'task-11');
insert into public.players(id, tournament_id, first_name, last_name, level, gender)
values ('44000000-0000-0000-0000-000000000004', '33000000-0000-0000-0000-000000000003', 'Mario', 'Rossi', 'intermediate', 'male');
update public.tournaments set name = 'Task 11 aggiornato' where id = '33000000-0000-0000-0000-000000000003';
select is((select name from public.tournaments where id = '33000000-0000-0000-0000-000000000003'), 'Task 11 aggiornato', 'owner updates own tournament');
select ok(((public.delete_tournament('33000000-0000-0000-0000-000000000003', 1))->>'conflict')::boolean, 'stale version is rejected');
select ok(((public.delete_tournament('33000000-0000-0000-0000-000000000003', 2))->>'deleted')::boolean, 'owner deletes matching version');
reset role;
select is((select count(*) from public.players where tournament_id = '33000000-0000-0000-0000-000000000003'), 0::bigint, 'delete cascades to children');

select * from finish();
rollback;
