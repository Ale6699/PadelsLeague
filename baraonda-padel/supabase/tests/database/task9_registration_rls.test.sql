begin;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mario@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Mario","last_name":"Rossi","accepted_terms":true,"marketing_consent":true}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'anna@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Anna","last_name":"Verdi","accepted_terms":true}', now(), now(), '', '', '', '');

select is((select first_name from public.profiles where id = '10000000-0000-0000-0000-000000000001'), 'Mario', 'trigger copies first name');
select is((select last_name from public.profiles where id = '10000000-0000-0000-0000-000000000001'), 'Rossi', 'trigger copies last name');
select ok((select accepted_terms_at is not null from public.profiles where id = '10000000-0000-0000-0000-000000000001'), 'trigger records terms acceptance');
select is((select marketing_consent from public.profiles where id = '20000000-0000-0000-0000-000000000002'), false, 'marketing defaults to false');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';
select is((select count(*) from public.profiles), 1::bigint, 'a user reads only the own profile');
update public.profiles set first_name = 'Marco' where id = '10000000-0000-0000-0000-000000000001';
select is((select first_name from public.profiles), 'Marco', 'a user updates the own name');
select throws_like($$update public.profiles set id = '20000000-0000-0000-0000-000000000002' where id = '10000000-0000-0000-0000-000000000001'$$, '%permission denied%profiles%', 'a user cannot change profile id');

insert into public.tournaments (id, owner_id, name, public_title, start_time, end_time, public_slug)
values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Torneo Mario', 'Torneo Mario', '10:00', '12:00', 'torneo-mario');
select is((select owner_id from public.tournaments where id = '30000000-0000-0000-0000-000000000003'), '10000000-0000-0000-0000-000000000001'::uuid, 'database overrides a forged owner id');

reset role;
update public.tournaments set owner_id = '20000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000003';
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';
select is((select count(*) from public.tournaments), 0::bigint, 'a user cannot read another user tournament');
reset role;

delete from auth.users where id = '20000000-0000-0000-0000-000000000002';
select is((select count(*) from public.profiles where id = '20000000-0000-0000-0000-000000000002'), 0::bigint, 'deleting auth user cascades to profile');

select * from finish();
rollback;
