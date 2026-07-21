-- Delta sul motore scommesse: quote FISSE che si MUOVONO col denaro puntato (blend prior↔stake),
-- vincitore torneo compresso con tetto, Over/Under attivabile con linea corretta. Idempotente sopra
-- 20260721000000. Le formule replicano src/services/bettingOdds.ts.

-- Nuove colonne (prior + monte per selezione, liquidità per mercato, toggle Over/Under).
alter table public.tournaments add column if not exists betting_over_under_enabled boolean not null default true;
alter table public.bet_markets add column if not exists liquidity numeric not null default 300;
alter table public.bet_selections add column if not exists prior_probability numeric not null default 0;
alter table public.bet_selections add column if not exists stake_pool bigint not null default 0;

-- betting_prob_to_odds passa a 3 argomenti (tetto massimo): rimuovo la vecchia firma a 2 arg per evitare ambiguità.
drop function if exists public.betting_prob_to_odds(numeric, numeric);
create or replace function public.betting_prob_to_odds(p_probability numeric, p_margin numeric default 0.08, p_max_odds numeric default 'Infinity') returns numeric language sql immutable as $$
  select least(p_max_odds, greatest(1.01, round((1 / least(0.99, greatest(0.01, p_probability))) / (1 + p_margin), 2)));
$$;

create or replace function public.betting_reprice_market(p_market uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_liquidity numeric; v_kind text; v_total bigint; v_max numeric;
begin
  select liquidity, kind into v_liquidity, v_kind from public.bet_markets where id = p_market;
  select coalesce(sum(stake_pool), 0) into v_total from public.bet_selections where market_id = p_market;
  v_max := case when v_kind = 'tournament_winner' then 15 else 'Infinity'::numeric end;
  update public.bet_selections
    set odds = public.betting_prob_to_odds((v_liquidity * prior_probability + stake_pool) / (v_liquidity + v_total), 0.08, v_max)
    where market_id = p_market;
end; $$;

-- Generatore interno (senza controllo owner): usato dal wrapper pubblico e dall'automazione via trigger.
create or replace function public.betting_generate_match_markets_internal(p_match uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  v_match public.matches%rowtype; v_tournament uuid; v_max_games integer; v_over_under boolean;
  a1 int; a2 int; b1 int; b2 int; d numeric; core numeric; p_draw numeric; balance numeric; p_over numeric; v_line numeric; v_market uuid;
begin
  select * into v_match from public.matches where id = p_match; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_tournament := v_match.tournament_id;
  select max_games_per_match, betting_over_under_enabled into v_max_games, v_over_under from public.tournaments where id = v_tournament;
  select betting_level_value(level) into a1 from public.players where id = v_match.team_a_player_1_id;
  select betting_level_value(level) into a2 from public.players where id = v_match.team_a_player_2_id;
  select betting_level_value(level) into b1 from public.players where id = v_match.team_b_player_1_id;
  select betting_level_value(level) into b2 from public.players where id = v_match.team_b_player_2_id;
  a1 := coalesce(a1,2); a2 := coalesce(a2,2); b1 := coalesce(b1,2); b2 := coalesce(b2,2);
  d := (a1 + a2) - (b1 + b2);
  if not exists (select 1 from public.bet_markets where match_id = p_match and kind = 'match_outcome') then
    p_draw := 0.15 * (1 - least(4, abs(d)) / 4.0); core := public.betting_logistic(d);
    insert into public.bet_markets(tournament_id, match_id, kind, status) values (v_tournament, p_match, 'match_outcome', 'open') returning id into v_market;
    insert into public.bet_selections(market_id, code, label, prior_probability, odds) values
      (v_market, 'A', 'Coppia A', (1 - p_draw) * core, public.betting_prob_to_odds((1 - p_draw) * core)),
      (v_market, 'B', 'Coppia B', (1 - p_draw) * (1 - core), public.betting_prob_to_odds((1 - p_draw) * (1 - core))),
      (v_market, 'draw', 'Pareggio', p_draw, public.betting_prob_to_odds(p_draw));
  end if;
  if v_over_under and not exists (select 1 from public.bet_markets where match_id = p_match and kind = 'over_under_games') then
    balance := 1 - least(4, abs(d)) / 4.0; p_over := 0.35 + 0.3 * balance; v_line := greatest(1, coalesce(v_max_games, 6)) + 2.5;
    insert into public.bet_markets(tournament_id, match_id, kind, status, line) values (v_tournament, p_match, 'over_under_games', 'open', v_line) returning id into v_market;
    insert into public.bet_selections(market_id, code, label, prior_probability, odds) values
      (v_market, 'over', 'Più di ' || v_line || ' game', p_over, public.betting_prob_to_odds(p_over)),
      (v_market, 'under', 'Meno di ' || v_line || ' game', 1 - p_over, public.betting_prob_to_odds(1 - p_over));
  end if;
end; $$;

create or replace function public.generate_match_markets(p_match uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_tournament uuid;
begin
  select tournament_id into v_tournament from public.matches where id = p_match; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.betting_is_owner(v_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  perform public.betting_generate_match_markets_internal(p_match);
end; $$;

-- Finestra mercati partita: aperta SOLO per la prossima partita da giocare (primo match 'scheduled').
-- Quando una partita inizia (status→in_progress) la sua finestra si chiude e si apre quella successiva.
create or replace function public.betting_sync_open_market(p_tournament uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_enabled boolean; v_next uuid;
begin
  select betting_enabled into v_enabled from public.tournaments where id = p_tournament;
  if not coalesce(v_enabled, false) then return; end if;
  select id into v_next from public.matches where tournament_id = p_tournament and status = 'scheduled' order by sequence_number limit 1;
  update public.bet_markets set status = 'closed', updated_at = now()
    where tournament_id = p_tournament and kind in ('match_outcome','over_under_games') and status = 'open'
      and (v_next is null or match_id is distinct from v_next);
  if v_next is not null then
    if not exists (select 1 from public.bet_markets where match_id = v_next) then
      perform public.betting_generate_match_markets_internal(v_next);
    end if;
    update public.bet_markets set status = 'open', updated_at = now()
      where match_id = v_next and kind in ('match_outcome','over_under_games') and status in ('open','closed');
  end if;
end; $$;

create or replace function public.generate_tournament_markets(p_tournament uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_market uuid; v_total numeric;
begin
  if not public.betting_is_owner(p_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  if exists (select 1 from public.bet_markets where tournament_id = p_tournament and kind = 'tournament_winner') then return; end if;
  insert into public.bet_markets(tournament_id, match_id, kind, status, liquidity) values (p_tournament, null, 'tournament_winner', 'open', 800) returning id into v_market;
  select sum(exp(1.4 * betting_level_value(p.level) + 0.14 * (coalesce(ts.wins,0) * 3 + coalesce(ts.draws,0))))
    into v_total from public.players p left join public.tournament_standings ts on ts.player_id = p.id
    where p.tournament_id = p_tournament and p.status in ('active','late');
  if coalesce(v_total,0) = 0 then v_total := 1; end if;
  insert into public.bet_selections(market_id, code, label, prior_probability, odds)
    select v_market, p.id::text, trim(p.first_name || ' ' || p.last_name),
      exp(1.4 * betting_level_value(p.level) + 0.14 * (coalesce(ts.wins,0) * 3 + coalesce(ts.draws,0))) / v_total,
      public.betting_prob_to_odds(exp(1.4 * betting_level_value(p.level) + 0.14 * (coalesce(ts.wins,0) * 3 + coalesce(ts.draws,0))) / v_total, 0.08, 15)
    from public.players p left join public.tournament_standings ts on ts.player_id = p.id
    where p.tournament_id = p_tournament and p.status in ('active','late');
end; $$;

create or replace function public.create_head_to_head_market(p_tournament uuid, p_player_a uuid, p_player_b uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare v_market uuid; la int; lb int; pa int; pb int; core numeric; na text; nb text;
begin
  if not public.betting_is_owner(p_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  if p_player_a = p_player_b then raise exception 'VALIDATION'; end if;
  select betting_level_value(level), trim(first_name || ' ' || last_name), coalesce((select wins*3+draws from public.tournament_standings where player_id = players.id),0)
    into la, na, pa from public.players where id = p_player_a and tournament_id = p_tournament;
  select betting_level_value(level), trim(first_name || ' ' || last_name), coalesce((select wins*3+draws from public.tournament_standings where player_id = players.id),0)
    into lb, nb, pb from public.players where id = p_player_b and tournament_id = p_tournament;
  if la is null or lb is null then raise exception 'MATCH_NOT_FOUND'; end if;
  core := 1 / (1 + exp(-((la - lb) * 0.7 + (pa - pb) * 0.35)));
  insert into public.bet_markets(tournament_id, match_id, kind, status, params)
    values (p_tournament, null, 'head_to_head', 'open', jsonb_build_object('playerA', p_player_a, 'playerB', p_player_b)) returning id into v_market;
  insert into public.bet_selections(market_id, code, label, prior_probability, odds) values
    (v_market, p_player_a::text, na, core, public.betting_prob_to_odds(core)),
    (v_market, p_player_b::text, nb, 1 - core, public.betting_prob_to_odds(1 - core));
  return v_market;
end; $$;

create or replace function public.place_bet(p_market uuid, p_selection uuid, p_stake bigint) returns public.bets language plpgsql security definer set search_path = public as $$
declare v_market public.bet_markets%rowtype; v_odds numeric(6,2); v_wallet public.betting_wallets%rowtype; v_bet public.bets%rowtype; v_payout bigint;
begin
  if auth.uid() is null then raise exception 'PERMISSION_DENIED'; end if;
  if p_stake <= 0 then raise exception 'VALIDATION'; end if;
  select * into v_market from public.bet_markets where id = p_market; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_market.status <> 'open' then raise exception 'MARKET_CLOSED'; end if;
  select odds into v_odds from public.bet_selections where id = p_selection and market_id = p_market; if v_odds is null then raise exception 'VALIDATION'; end if;
  select * into v_wallet from public.betting_wallets where tournament_id = v_market.tournament_id and user_id = auth.uid() for update;
  if not found then raise exception 'PERMISSION_DENIED'; end if;
  if v_wallet.balance < p_stake then raise exception 'INSUFFICIENT_FUNDS'; end if;
  v_payout := floor(p_stake * v_odds);
  insert into public.bets(market_id, selection_id, wallet_id, user_id, stake, odds_at_placement, potential_payout)
    values (p_market, p_selection, v_wallet.id, auth.uid(), p_stake, v_odds, v_payout) returning * into v_bet;
  perform public.betting_credit(v_wallet.id, -p_stake, 'bet_stake', v_bet.id, p_market);
  update public.bet_selections set stake_pool = stake_pool + p_stake where id = p_selection;
  perform public.betting_reprice_market(p_market);
  return v_bet;
end; $$;

-- set_betting_config guadagna il toggle Over/Under: rimuovo la vecchia firma a 3 arg.
drop function if exists public.set_betting_config(uuid, boolean, bigint);
create or replace function public.set_betting_config(p_tournament uuid, p_enabled boolean, p_initial_balance bigint, p_over_under_enabled boolean default true) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.betting_is_owner(p_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  if p_initial_balance < 0 then raise exception 'VALIDATION'; end if;
  update public.tournaments set betting_enabled = p_enabled, betting_initial_balance = p_initial_balance, betting_over_under_enabled = p_over_under_enabled where id = p_tournament;
  perform public.betting_sync_open_market(p_tournament); -- all'attivazione apre (e genera) i mercati della prossima partita
end; $$;

-- Trigger partite: liquidazione automatica sul risultato + gestione finestra mercati sul cambio stato.
create or replace function public.betting_on_match_change() returns trigger language plpgsql security definer set search_path = public as $$
declare v_market record; v_winner uuid; v_total int;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    for v_market in select * from public.bet_markets where match_id = new.id and status in ('open','closed') and kind in ('match_outcome','over_under_games') loop
      if v_market.kind = 'match_outcome' then
        v_winner := (select id from public.bet_selections where market_id = v_market.id and code = case when coalesce(new.team_a_games,0) > coalesce(new.team_b_games,0) then 'A' when coalesce(new.team_b_games,0) > coalesce(new.team_a_games,0) then 'B' else 'draw' end);
      else
        v_total := coalesce(new.team_a_games,0) + coalesce(new.team_b_games,0);
        v_winner := (select id from public.bet_selections where market_id = v_market.id and code = case when v_total > coalesce(v_market.line,0) then 'over' else 'under' end);
      end if;
      if v_winner is not null then perform public.betting_apply_settlement(v_market.id, v_winner); end if;
    end loop;
  end if;
  if (old.status = 'completed' and new.status is distinct from 'completed') or (new.status = 'cancelled' and old.status is distinct from 'cancelled') then
    for v_market in select id from public.bet_markets where match_id = new.id and status <> 'void' loop
      perform public.betting_void_market(v_market.id);
    end loop;
  end if;
  -- Al cambio stato (es. avvio partita) ricalcola la finestra: chiude la partita iniziata, apre la prossima.
  if new.status is distinct from old.status then perform public.betting_sync_open_market(new.tournament_id); end if;
  return new;
end; $$;

create or replace view public.public_tournaments as
  select id, name, public_title, tournament_date, start_time, end_time, match_duration_minutes, transition_duration_minutes, max_games_per_match, status, public_slug, updated_at, betting_enabled, betting_initial_balance, betting_over_under_enabled
  from public.tournaments where is_public;
grant select on public.public_tournaments to anon, authenticated;

-- I mercati esistenti hanno quote vecchie (statiche) e prior=0: si ripuliscono così l'organizzatore
-- li rigenera col motore dinamico. I wallet di prova si azzerano per ripartire puliti.
delete from public.bet_markets;
delete from public.betting_wallets;

-- Grants aggiornati (le funzioni interne non sono chiamabili dai client).
revoke all on function public.betting_reprice_market(uuid), public.betting_generate_match_markets_internal(uuid), public.betting_sync_open_market(uuid), public.betting_on_match_change() from public, anon, authenticated;
grant execute on function public.set_betting_config(uuid,boolean,bigint,boolean) to authenticated;
revoke all on function public.set_betting_config(uuid,boolean,bigint,boolean) from public, anon;
