-- Liquidazione automatica e riconciliazione idempotente dei mercati partita.
-- La finalizzazione del live match e i movimenti dei wallet avvengono nella stessa transazione.

alter table public.betting_ledger drop constraint if exists betting_ledger_reason_check;
alter table public.betting_ledger add constraint betting_ledger_reason_check check (
  reason in ('join_bonus','bet_stake','bet_payout','bet_refund','bet_settlement_reversal','organizer_adjustment')
);

-- Riporta un mercato liquidato allo stato precedente alla sola liquidazione: lo stake resta
-- impegnato, mentre gli accrediti dei vecchi vincitori vengono stornati. Le puntate tornano
-- pending e possono essere liquidate subito con il nuovo esito.
create or replace function public.betting_reverse_settlement(p_market uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_bet record;
begin
  for v_bet in
    select * from public.bets
    where market_id = p_market and status in ('won','lost')
    for update
  loop
    if v_bet.status = 'won' then
      perform public.betting_credit(
        v_bet.wallet_id,
        -v_bet.potential_payout,
        'bet_settlement_reversal',
        v_bet.id,
        p_market
      );
    end if;
    update public.bets set status = 'pending', settled_at = null where id = v_bet.id;
  end loop;

  update public.bet_selections set is_winner = null where market_id = p_market;
  update public.bet_markets
    set status = 'closed', version = version + 1, updated_at = now()
    where id = p_market;
end; $$;

-- Applica l'esito desiderato solo quando serve. Questo rende innocui salvataggi duplicati e
-- consente di correggere una partita già liquidata senza coniare o perdere gettoni.
create or replace function public.betting_reconcile_market(p_market uuid, p_winning_selection uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text; v_current_winner uuid;
begin
  select status into v_status from public.bet_markets where id = p_market for update;
  if not found or v_status = 'void' then return; end if;

  select id into v_current_winner
  from public.bet_selections
  where market_id = p_market and is_winner is true;

  if v_status = 'settled' and v_current_winner = p_winning_selection then return; end if;
  if v_status = 'settled' then perform public.betting_reverse_settlement(p_market); end if;
  perform public.betting_apply_settlement(p_market, p_winning_selection);
end; $$;

create or replace function public.betting_reconcile_match_markets(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.matches%rowtype;
  v_market record;
  v_winner uuid;
  v_code text;
begin
  select * into v_match from public.matches where id = p_match;
  if not found or v_match.status <> 'completed'
    or v_match.team_a_games is null or v_match.team_b_games is null then return;
  end if;

  for v_market in
    select * from public.bet_markets
    where match_id = p_match
      and status <> 'void'
      and kind in ('match_outcome','over_under_games')
    order by id
    for update
  loop
    if v_market.kind = 'match_outcome' then
      v_code := case
        when v_match.team_a_games > v_match.team_b_games then 'A'
        when v_match.team_b_games > v_match.team_a_games then 'B'
        else 'draw'
      end;
    else
      v_code := case
        when v_match.team_a_games + v_match.team_b_games > coalesce(v_market.line, 0) then 'over'
        else 'under'
      end;
    end if;

    select id into v_winner
    from public.bet_selections
    where market_id = v_market.id and code = v_code;
    if v_winner is not null then
      perform public.betting_reconcile_market(v_market.id, v_winner);
    end if;
  end loop;
end; $$;

-- Include status nella deduplicazione. Prima, se il live_state era già arrivato al server,
-- il successivo cambio del solo status a completed veniva ignorato e il trigger non partiva.
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
  v_stored_status text;
begin
  select t.owner_id,
    greatest(
      coalesce((m.live_state #>> '{lastUpdated}')::bigint, 0),
      coalesce((m.live_state #>> '{score,lastUpdated}')::bigint, 0),
      coalesce((m.live_state #>> '{timer,updatedAt}')::bigint, 0)
    ),
    m.live_state,
    m.status
  into v_owner, v_stored_updated, v_stored_state, v_stored_status
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = p_match_id
  for update of m;

  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'PERMISSION_DENIED'; end if;
  if v_stored_updated > p_last_updated then return false; end if;
  if v_stored_updated = p_last_updated
    and v_stored_state = p_live_state
    and v_stored_status = p_status then return true;
  end if;

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

-- Il trigger gestisce sia la prima finalizzazione sia le correzioni dei game a partita conclusa.
create or replace function public.betting_on_match_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_market record;
begin
  if new.status = 'completed'
    and new.team_a_games is not null
    and new.team_b_games is not null
    and (
      old.status is distinct from 'completed'
      or old.team_a_games is distinct from new.team_a_games
      or old.team_b_games is distinct from new.team_b_games
    ) then
    perform public.betting_reconcile_match_markets(new.id);
  end if;

  if (old.status = 'completed' and new.status is distinct from 'completed')
    or (new.status = 'cancelled' and old.status is distinct from 'cancelled') then
    for v_market in
      select id from public.bet_markets where match_id = new.id and status <> 'void'
    loop
      perform public.betting_void_market(v_market.id);
    end loop;
  end if;

  if new.status is distinct from old.status then
    perform public.betting_sync_open_market(new.tournament_id);
  end if;
  return new;
end; $$;

revoke all on function public.betting_reverse_settlement(uuid), public.betting_reconcile_market(uuid,uuid), public.betting_reconcile_match_markets(uuid), public.betting_on_match_change() from public, anon, authenticated;
grant execute on function public.save_live_match_state(uuid,jsonb,text,bigint) to authenticated;
