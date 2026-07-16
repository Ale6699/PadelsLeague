-- Task 10: traditional advantage scoring replaces the golden point everywhere.
update public.tournaments set scoring_mode = 'advantages' where scoring_mode is distinct from 'advantages';
alter table public.tournaments alter column scoring_mode set default 'advantages';
alter table public.tournaments drop constraint if exists tournaments_scoring_mode_check;
alter table public.tournaments add constraint tournaments_scoring_mode_check check (scoring_mode = 'advantages');

create or replace function public.force_advantages_scoring()
returns trigger language plpgsql set search_path = public as $$
begin
  new.scoring_mode := 'advantages';
  return new;
end;
$$;
drop trigger if exists tournaments_force_advantages_scoring on public.tournaments;
create trigger tournaments_force_advantages_scoring before insert or update of scoring_mode on public.tournaments
for each row execute function public.force_advantages_scoring();

alter table public.matches add column if not exists live_advantage_team text;

-- Convert the former representation that stored "advantage" in a numeric point column.
update public.matches
set live_advantage_team = case
      when live_team_a_points = 'advantage' and live_team_b_points = 'advantage' then null
      when live_team_a_points = 'advantage' then 'team_a'
      when live_team_b_points = 'advantage' then 'team_b'
      else live_advantage_team
    end,
    live_team_a_points = case when live_team_a_points = 'advantage' or live_team_b_points = 'advantage' then '40' else live_team_a_points end,
    live_team_b_points = case when live_team_a_points = 'advantage' or live_team_b_points = 'advantage' then '40' else live_team_b_points end;

update public.matches
set live_state = jsonb_set(
  jsonb_set(
    jsonb_set(
      live_state,
      '{score,teamAPoints}',
      to_jsonb(case when live_state #>> '{score,teamAPoints}' = 'advantage' or live_state #>> '{score,teamBPoints}' = 'advantage' then 40 else coalesce((live_state #>> '{score,teamAPoints}')::integer, 0) end),
      true
    ),
    '{score,teamBPoints}',
    to_jsonb(case when live_state #>> '{score,teamAPoints}' = 'advantage' or live_state #>> '{score,teamBPoints}' = 'advantage' then 40 else coalesce((live_state #>> '{score,teamBPoints}')::integer, 0) end),
    true
  ),
  '{score,advantageTeam}',
  case
    when live_state #>> '{score,teamAPoints}' = 'advantage' and live_state #>> '{score,teamBPoints}' = 'advantage' then 'null'::jsonb
    when live_state #>> '{score,teamAPoints}' = 'advantage' then to_jsonb('team_a'::text)
    when live_state #>> '{score,teamBPoints}' = 'advantage' then to_jsonb('team_b'::text)
    when live_state #>> '{score,advantageTeam}' in ('team_a', 'team_b')
      and live_state #>> '{score,teamAPoints}' = '40'
      and live_state #>> '{score,teamBPoints}' = '40'
      then to_jsonb(live_state #>> '{score,advantageTeam}')
    else 'null'::jsonb
  end,
  true
)
where live_state is not null;

alter table public.matches drop constraint if exists matches_live_team_a_points_check;
alter table public.matches drop constraint if exists matches_live_team_b_points_check;
alter table public.matches add constraint matches_live_team_a_points_check check (live_team_a_points in ('0', '15', '30', '40'));
alter table public.matches add constraint matches_live_team_b_points_check check (live_team_b_points in ('0', '15', '30', '40'));
alter table public.matches add constraint matches_live_advantage_team_check check (live_advantage_team in ('team_a', 'team_b') or live_advantage_team is null);
alter table public.matches add constraint matches_live_advantage_requires_deuce_check check (live_advantage_team is null or (live_team_a_points = '40' and live_team_b_points = '40'));
alter table public.matches add constraint matches_live_state_advantage_requires_deuce_check check (
  live_state is null
  or live_state #>> '{score,advantageTeam}' is null
  or (
    live_state #>> '{score,advantageTeam}' in ('team_a', 'team_b')
    and live_state #>> '{score,teamAPoints}' = '40'
    and live_state #>> '{score,teamBPoints}' = '40'
  )
);

-- The public projection includes only the live match state needed by the scoreboard.
create or replace view public.public_matches as
select m.id, m.tournament_id, m.sequence_number, m.starts_at, m.ends_at,
  m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id,
  m.team_a_games, m.team_b_games, m.status,
  m.live_team_a_points, m.live_team_b_points, m.live_advantage_team,
  m.timer_status, m.timer_remaining_ms, m.serving_team, m.live_state
from public.matches m
join public.tournaments t on t.id = m.tournament_id
where t.is_public;
grant select on public.public_matches to anon, authenticated;

-- Allows anonymous realtime delivery only for matches whose tournament is public.
create or replace function public.is_public_tournament(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.tournaments where id = p_tournament_id and is_public) $$;
revoke all on function public.is_public_tournament(uuid) from public;
grant execute on function public.is_public_tournament(uuid) to anon, authenticated;
drop policy if exists "Public can read public match scores" on public.matches;
create policy "Public can read public match scores" on public.matches for select to anon
using (public.is_public_tournament(matches.tournament_id));

-- Serialize live writes and reject a client snapshot older than the state already stored.
create or replace function public.save_live_match_state(
  p_match_id uuid,
  p_live_state jsonb,
  p_status text,
  p_last_updated bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_stored_updated bigint;
  v_stored_state jsonb;
begin
  select t.owner_id,
    greatest(
      coalesce((m.live_state #>> '{lastUpdated}')::bigint, 0),
      coalesce((m.live_state #>> '{score,lastUpdated}')::bigint, 0),
      coalesce((m.live_state #>> '{timer,updatedAt}')::bigint, 0)
    ),
    m.live_state
  into v_owner, v_stored_updated, v_stored_state
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = p_match_id
  for update of m;

  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'PERMISSION_DENIED'; end if;
  if v_stored_updated > p_last_updated then return false; end if;
  if v_stored_updated = p_last_updated and v_stored_state = p_live_state then return true; end if;

  update public.matches
  set live_state = p_live_state,
      status = p_status,
      live_team_a_points = p_live_state #>> '{score,teamAPoints}',
      live_team_b_points = p_live_state #>> '{score,teamBPoints}',
      live_advantage_team = nullif(p_live_state #>> '{score,advantageTeam}', ''),
      timer_status = p_live_state #>> '{timer,status}',
      timer_duration_ms = (p_live_state #>> '{timer,durationMilliseconds}')::bigint,
      timer_remaining_ms = (p_live_state #>> '{timer,remainingMilliseconds}')::bigint,
      timer_started_at = case when p_live_state #>> '{timer,startedAt}' is null then null else to_timestamp((p_live_state #>> '{timer,startedAt}')::double precision / 1000) end,
      timer_ends_at = case when p_live_state #>> '{timer,endsAt}' is null then null else to_timestamp((p_live_state #>> '{timer,endsAt}')::double precision / 1000) end,
      serving_team = p_live_state #>> '{servingTeam}',
      team_a_games = case when p_status = 'completed' then (p_live_state #>> '{score,teamAGames}')::integer else team_a_games end,
      team_b_games = case when p_status = 'completed' then (p_live_state #>> '{score,teamBGames}')::integer else team_b_games end
  where id = p_match_id;
  return true;
end;
$$;
revoke all on function public.save_live_match_state(uuid, jsonb, text, bigint) from public, anon;
grant execute on function public.save_live_match_state(uuid, jsonb, text, bigint) to authenticated;
