begin;
select plan(4);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner14@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'player14@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');

insert into public.tournaments(id, owner_id, name, public_title, tournament_date, start_time, end_time, public_slug, betting_enabled)
values
  ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'Task 14 attivo', 'Task 14 attivo', current_date, '10:00', '12:00', 'task-14-attivo', true),
  ('34000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000001', 'Task 14 disattivo', 'Task 14 disattivo', current_date, '10:00', '12:00', 'task-14-disattivo', false);

insert into public.matches(id, tournament_id, sequence_number, starts_at, ends_at, status)
values
  ('44000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 1, now(), now() + interval '15 minutes', 'scheduled'),
  ('44000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 1, now(), now() + interval '15 minutes', 'scheduled');

insert into public.bet_markets(id, tournament_id, match_id, kind, status, line)
values
  ('54000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', 'match_outcome', 'open', null),
  ('54000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000002', 'match_outcome', 'open', null);

insert into public.bet_selections(id, market_id, code, label, odds, prior_probability)
values
  ('64000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001', 'A', 'Coppia A', 2, .5),
  ('64000000-0000-0000-0000-000000000002', '54000000-0000-0000-0000-000000000002', 'A', 'Coppia A', 2, .5);

set local role authenticated;
set local "request.jwt.claim.sub" = '14000000-0000-0000-0000-000000000002';

select is((select count(*) from public.bet_markets where tournament_id = '34000000-0000-0000-0000-000000000001'), 1::bigint, 'a non-owner sees open markets of a tournament with betting enabled');
select is((select count(*) from public.bet_selections where market_id = '54000000-0000-0000-0000-000000000001'), 1::bigint, 'a non-owner sees selections of a market they can read');
select is((select count(*) from public.bet_markets where tournament_id = '34000000-0000-0000-0000-000000000002'), 0::bigint, 'a non-owner does not see markets of a tournament with betting disabled');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '14000000-0000-0000-0000-000000000001';

select is((select count(*) from public.bet_markets where tournament_id = '34000000-0000-0000-0000-000000000002'), 1::bigint, 'the organizer sees markets even when betting is disabled');

select * from finish();
rollback;
