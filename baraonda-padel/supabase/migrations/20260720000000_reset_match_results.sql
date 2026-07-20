-- Keep the finalized result in sync with the live match status. Returning a match
-- to a playable state must remove the result that was previously completed.
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
      team_a_games = case when p_status = 'completed' then (p_live_state #>> '{score,teamAGames}')::integer else null end,
      team_b_games = case when p_status = 'completed' then (p_live_state #>> '{score,teamBGames}')::integer else null end
  where id = p_match_id;
  return true;
end;
$$;

revoke all on function public.save_live_match_state(uuid, jsonb, text, bigint) from public, anon;
grant execute on function public.save_live_match_state(uuid, jsonb, text, bigint) to authenticated;
