begin;
select plan(25);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner13@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bettor13a@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'bettor13b@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');

insert into public.tournaments(id, owner_id, name, public_title, tournament_date, start_time, end_time, public_slug, betting_enabled)
values ('33000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000001', 'Task 13', 'Task 13', current_date, '10:00', '12:00', 'task-13', true);

insert into public.matches(id, tournament_id, sequence_number, starts_at, ends_at, status, live_state)
values (
  '43000000-0000-0000-0000-000000000004',
  '33000000-0000-0000-0000-000000000003',
  1,
  now(),
  now() + interval '15 minutes',
  'in_progress',
  '{"lastUpdated":1000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":6,"teamBGames":4,"deuceCount":0,"lastUpdated":1000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":1000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb
);

insert into public.bet_markets(id, tournament_id, match_id, kind, status, line)
values
  ('53000000-0000-0000-0000-000000000005', '33000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000004', 'match_outcome', 'closed', null),
  ('53000000-0000-0000-0000-000000000006', '33000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000004', 'over_under_games', 'closed', 8.5);

insert into public.bet_selections(id, market_id, code, label, odds, prior_probability)
values
  ('63000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000005', 'A', 'Coppia A', 2, .4),
  ('63000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000005', 'B', 'Coppia B', 3, .35),
  ('63000000-0000-0000-0000-000000000003', '53000000-0000-0000-0000-000000000005', 'draw', 'Pareggio', 4, .25),
  ('63000000-0000-0000-0000-000000000004', '53000000-0000-0000-0000-000000000006', 'over', 'Over', 1.8, .5),
  ('63000000-0000-0000-0000-000000000005', '53000000-0000-0000-0000-000000000006', 'under', 'Under', 2.2, .5);

insert into public.betting_wallets(id, tournament_id, user_id, display_name, balance)
values
  ('73000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000002', 'A', 800),
  ('73000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000003', 'B', 800);

insert into public.bets(id, market_id, selection_id, wallet_id, user_id, stake, odds_at_placement, potential_payout)
values
  ('83000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000005', '63000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 100, 2, 200),
  ('83000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000005', '63000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000003', 100, 3, 300),
  ('83000000-0000-0000-0000-000000000003', '53000000-0000-0000-0000-000000000006', '63000000-0000-0000-0000-000000000004', '73000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 100, 1.8, 180),
  ('83000000-0000-0000-0000-000000000004', '53000000-0000-0000-0000-000000000006', '63000000-0000-0000-0000-000000000005', '73000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000003', 100, 2.2, 220);

set local role authenticated;
set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000001';

select ok(public.save_live_match_state(
  '43000000-0000-0000-0000-000000000004',
  '{"lastUpdated":1000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":6,"teamBGames":4,"deuceCount":0,"lastUpdated":1000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":1000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'completed', 1000
), 'status-only completion is persisted');
select is((select jsonb_build_array(status, team_a_games, team_b_games) from public.matches where id = '43000000-0000-0000-0000-000000000004'), '["completed", 6, 4]'::jsonb, 'final score is stored');
select is((select count(*) from public.bet_markets where match_id = '43000000-0000-0000-0000-000000000004' and status = 'settled'), 2::bigint, 'closed match markets are settled');
select is((select array_agg(code order by code) from public.bet_selections where is_winner is true), array['A','over'], 'A and Over win');
select is((select array_agg(balance order by id) from public.betting_wallets), array[1180::bigint,800::bigint], 'initial winners receive frozen payouts');
select is((select array_agg(status order by id) from public.bets), array['won','lost','won','lost'], 'bets are marked won and lost');

select ok(public.save_live_match_state(
  '43000000-0000-0000-0000-000000000004',
  '{"lastUpdated":1000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":6,"teamBGames":4,"deuceCount":0,"lastUpdated":1000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":1000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'completed', 1000
), 'duplicate completion is accepted');
select is((select array_agg(balance order by id) from public.betting_wallets), array[1180::bigint,800::bigint], 'duplicate completion does not pay twice');
select is((select count(*) from public.betting_ledger where reason = 'bet_payout'), 2::bigint, 'only two payout entries exist');

select ok(public.save_live_match_state(
  '43000000-0000-0000-0000-000000000004',
  '{"lastUpdated":2000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":3,"teamBGames":5,"deuceCount":0,"lastUpdated":2000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":2000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'completed', 2000
), 'corrected score is accepted');
select is((select array_agg(code order by code) from public.bet_selections where is_winner is true), array['B','under'], 'B and Under win after correction');
select is((select array_agg(balance order by id) from public.betting_wallets), array[800::bigint,1320::bigint], 'old payouts are reversed and new payouts applied');
select is((select count(*) from public.betting_ledger where reason = 'bet_settlement_reversal'), 2::bigint, 'two old payouts are audited as reversals');

select ok(public.save_live_match_state(
  '43000000-0000-0000-0000-000000000004',
  '{"lastUpdated":3000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":2,"teamBGames":6,"deuceCount":0,"lastUpdated":3000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":3000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'completed', 3000
), 'same market outcomes with a new score are accepted');
select is((select array_agg(balance order by id) from public.betting_wallets), array[800::bigint,1320::bigint], 'unchanged market outcomes create no movements');
select is((select jsonb_build_array(count(*) filter (where reason = 'bet_payout'), count(*) filter (where reason = 'bet_settlement_reversal')) from public.betting_ledger), '[4, 2]'::jsonb, 'ledger remains idempotent when winners do not change');

select ok(public.save_live_match_state(
  '43000000-0000-0000-0000-000000000004',
  '{"lastUpdated":4000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":4,"teamBGames":4,"deuceCount":0,"lastUpdated":4000},"timer":{"status":"completed","durationMilliseconds":720000,"remainingMilliseconds":0,"startedAt":null,"endsAt":null,"updatedAt":4000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'completed', 4000
), 'draw correction is accepted');
select is((select array_agg(code order by code) from public.bet_selections where is_winner is true), array['draw','under'], 'only match outcome changes to draw');
select is((select array_agg(balance order by id) from public.betting_wallets), array[800::bigint,1020::bigint], 'only the changed market is financially reconciled');
select is((select count(*) from public.betting_ledger where reason = 'bet_settlement_reversal'), 3::bigint, 'only one additional payout is reversed');

select ok(public.save_live_match_state(
  '43000000-0000-0000-0000-000000000004',
  '{"lastUpdated":5000,"score":{"teamAPoints":0,"teamBPoints":0,"advantageTeam":null,"teamAGames":0,"teamBGames":0,"deuceCount":0,"lastUpdated":5000},"timer":{"status":"idle","durationMilliseconds":720000,"remainingMilliseconds":720000,"startedAt":null,"endsAt":null,"updatedAt":5000},"history":[],"redo":[],"servingTeam":"team_a","audioEnabled":true}'::jsonb,
  'scheduled', 5000
), 'reset is accepted');
select is((select count(*) from public.bet_markets where status = 'void'), 2::bigint, 'reset voids both markets');
select is((select count(*) from public.bets where status = 'void'), 4::bigint, 'reset voids all bets');
select is((select array_agg(balance order by id) from public.betting_wallets), array[1000::bigint,1000::bigint], 'reset restores both original balances');
select is((select count(*) from public.betting_ledger where reason = 'bet_refund'), 4::bigint, 'every bet has an audited refund');

select * from finish();
rollback;
