-- Auth ownership is introduced nullable so existing installations can be claimed
-- by their first organizer without baking a user UUID into a migration.
alter table public.tournaments add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.tournaments add column if not exists is_public boolean not null default false;
create index if not exists tournaments_owner_id_idx on public.tournaments(owner_id);
create index if not exists tournaments_public_slug_idx on public.tournaments(public_slug) where is_public;

create or replace function public.assign_tournament_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null then new.owner_id = auth.uid(); end if;
  return new;
end; $$;
drop trigger if exists tournaments_assign_owner on public.tournaments;
create trigger tournaments_assign_owner before insert on public.tournaments for each row execute function public.assign_tournament_owner();

-- Run once as the first authenticated organizer to claim data created before Auth.
-- It intentionally never overwrites an existing owner.
create or replace function public.claim_unowned_tournaments() returns integer language plpgsql security definer set search_path = public as $$
declare claimed integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.tournaments set owner_id = auth.uid() where owner_id is null;
  get diagnostics claimed = row_count;
  return claimed;
end; $$;

-- Remove prototype-wide access before adding owner-scoped policies.
drop policy if exists "prototype public read" on public.tournaments; drop policy if exists "prototype public write" on public.tournaments;
drop policy if exists "prototype public read" on public.players; drop policy if exists "prototype public write" on public.players;
drop policy if exists "prototype public read" on public.player_availability; drop policy if exists "prototype public write" on public.player_availability;
drop policy if exists "prototype public read" on public.player_constraints; drop policy if exists "prototype public write" on public.player_constraints;
drop policy if exists "prototype public read" on public.tournament_breaks; drop policy if exists "prototype public write" on public.tournament_breaks;
drop policy if exists "prototype public read" on public.matches; drop policy if exists "prototype public write" on public.matches;
drop policy if exists "prototype public read" on public.match_score_actions; drop policy if exists "prototype public write" on public.match_score_actions;

create policy "Owners can manage tournaments" on public.tournaments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners can manage players" on public.players for all to authenticated using (exists (select 1 from public.tournaments t where t.id = players.tournament_id and t.owner_id = auth.uid())) with check (exists (select 1 from public.tournaments t where t.id = players.tournament_id and t.owner_id = auth.uid()));
create policy "Owners can manage availability" on public.player_availability for all to authenticated using (exists (select 1 from public.players p join public.tournaments t on t.id = p.tournament_id where p.id = player_availability.player_id and t.owner_id = auth.uid())) with check (exists (select 1 from public.players p join public.tournaments t on t.id = p.tournament_id where p.id = player_availability.player_id and t.owner_id = auth.uid()));
create policy "Owners can manage constraints" on public.player_constraints for all to authenticated using (exists (select 1 from public.tournaments t where t.id = player_constraints.tournament_id and t.owner_id = auth.uid())) with check (exists (select 1 from public.tournaments t where t.id = player_constraints.tournament_id and t.owner_id = auth.uid()));
create policy "Owners can manage breaks" on public.tournament_breaks for all to authenticated using (exists (select 1 from public.tournaments t where t.id = tournament_breaks.tournament_id and t.owner_id = auth.uid())) with check (exists (select 1 from public.tournaments t where t.id = tournament_breaks.tournament_id and t.owner_id = auth.uid()));
create policy "Owners can manage matches" on public.matches for all to authenticated using (exists (select 1 from public.tournaments t where t.id = matches.tournament_id and t.owner_id = auth.uid())) with check (exists (select 1 from public.tournaments t where t.id = matches.tournament_id and t.owner_id = auth.uid()));
create policy "Owners can manage score actions" on public.match_score_actions for all to authenticated using (exists (select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id where m.id = match_score_actions.match_id and t.owner_id = auth.uid())) with check (exists (select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id where m.id = match_score_actions.match_id and t.owner_id = auth.uid()));

-- Security-definer public projections intentionally expose no notes, medical status,
-- availability, incompatibilities, owner information or internal audit/version data.
drop view if exists public.public_tournaments;
create view public.public_tournaments as select id,name,public_title,tournament_date,start_time,end_time,match_duration_minutes,transition_duration_minutes,max_games_per_match,status,public_slug,updated_at from public.tournaments where is_public;
create or replace view public.public_players as select p.id,p.tournament_id,p.first_name,p.last_name from public.players p join public.tournaments t on t.id=p.tournament_id where t.is_public;
create or replace view public.public_matches as select m.id,m.tournament_id,m.sequence_number,m.starts_at,m.ends_at,m.team_a_player_1_id,m.team_a_player_2_id,m.team_b_player_1_id,m.team_b_player_2_id,m.team_a_games,m.team_b_games,m.status from public.matches m join public.tournaments t on t.id=m.tournament_id where t.is_public;
alter view public.tournament_standings set (security_invoker = false);
create or replace view public.public_standings as select s.tournament_id,s.player_id,s.first_name,s.last_name,s.played,s.wins,s.draws,s.losses,s.games_for,s.games_against,s.points from public.tournament_standings s join public.tournaments t on t.id=s.tournament_id where t.is_public;
grant select on public.public_tournaments, public.public_players, public.public_matches, public.public_standings to anon, authenticated;
revoke all on public.tournament_standings from anon;
revoke all on public.tournaments, public.players, public.player_availability, public.player_constraints, public.tournament_breaks, public.matches, public.match_score_actions from anon;
grant execute on function public.claim_unowned_tournaments() to authenticated;
-- After the documented claim step has run in an existing environment, enforce:
-- alter table public.tournaments alter column owner_id set not null;
