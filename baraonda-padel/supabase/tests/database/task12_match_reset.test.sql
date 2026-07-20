begin;
select plan(10);

select function_returns('public', 'save_live_match_state', array['uuid', 'jsonb', 'text', 'bigint'], 'boolean', 'live match save function exists');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner12@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000001';

insert into public.tournaments(id, owner_id, name, public_title, tournament_date, start_time, end_time, public_slug)
values ('32000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001', 'Task 12', 'Task 12', current_date, '10:00', '12:00', 'task-12');

insert into public.matches(id, tournament_id, sequence_number, starts_at, ends_at, team_a_games, team_b_games, status, live_state)
values (
  '42000000-0000-0000-0000-000000000004',
  '32000000-0000-0000-0000-000000000002',
  1,
  now(),
  now() + interval '15 minutes',
  6,
  4,
  'completed',
  '{"lastUpdated":1000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":6,"teamBGames":4,"lastUpdated":1000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":1000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb
);

select ok(public.save_live_match_state(
  '42000000-0000-0000-0000-000000000004',
  '{"lastUpdated":2000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":0,"teamBGames":0,"lastUpdated":2000},"timer":{"status":"idle","durationMilliseconds":720000,"remainingMilliseconds":720000,"startedAt":null,"endsAt":null,"updatedAt":2000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'scheduled',
  2000
), 'reset snapshot is accepted');
select is((select status from public.matches where id = '42000000-0000-0000-0000-000000000004'), 'scheduled', 'reset returns the match to scheduled');
select is((select team_a_games from public.matches where id = '42000000-0000-0000-0000-000000000004'), null::integer, 'reset clears team A finalized games');
select is((select team_b_games from public.matches where id = '42000000-0000-0000-0000-000000000004'), null::integer, 'reset clears team B finalized games');
select ok((select
  live_state #>> '{score,teamAPoints}' = '0'
  and live_state #>> '{score,teamBPoints}' = '0'
  and live_state #>> '{score,teamAGames}' = '0'
  and live_state #>> '{score,teamBGames}' = '0'
  and live_state #>> '{timer,status}' = 'idle'
  and jsonb_array_length(live_state->'history') = 0
  and jsonb_array_length(live_state->'redo') = 0
  from public.matches where id = '42000000-0000-0000-0000-000000000004'
), 'reset persists a clean live state');

select is(public.save_live_match_state(
  '42000000-0000-0000-0000-000000000004',
  '{"lastUpdated":1500,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":6,"teamBGames":4,"lastUpdated":1500},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":1500},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'completed',
  1500
), false, 'older snapshot is rejected');
select is((select status from public.matches where id = '42000000-0000-0000-0000-000000000004'), 'scheduled', 'rejected snapshot does not restore completion');

select ok(public.save_live_match_state(
  '42000000-0000-0000-0000-000000000004',
  '{"lastUpdated":3000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":5,"teamBGames":3,"lastUpdated":3000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":3000},"history":[],"redo":[],"servingTeam":"team_b","audioEnabled":true}'::jsonb,
  'completed',
  3000
), 'newer completed snapshot is accepted');
select is((select status from public.matches where id = '42000000-0000-0000-0000-000000000004'), 'completed', 'completed snapshot restores completed status');
select is((select jsonb_build_array(team_a_games, team_b_games) from public.matches where id = '42000000-0000-0000-0000-000000000004'), '[5, 3]'::jsonb, 'completed snapshot persists both finalized scores');

select * from finish();
rollback;
