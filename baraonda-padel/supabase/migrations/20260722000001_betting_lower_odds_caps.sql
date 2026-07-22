-- Abbassa i tetti delle quote (longshot/favoriti) senza toccare il margine banco (resta 0.08).
-- Tetto generale MAX_ODDS = 8 su esito partita, over/under e testa-a-testa; vincitore torneo da 15 a 8.
-- Rispecchia src/services/bettingOdds.ts (MAX_ODDS, MAX_WINNER_ODDS). Idempotente sopra 20260721010000.

-- Reprezzo: applica il tetto 8 a tutti i mercati (prima il vincitore torneo usava 15, gli altri nessun tetto).
create or replace function public.betting_reprice_market(p_market uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_liquidity numeric; v_kind text; v_total bigint; v_max numeric;
begin
  select liquidity, kind into v_liquidity, v_kind from public.bet_markets where id = p_market;
  select coalesce(sum(stake_pool), 0) into v_total from public.bet_selections where market_id = p_market;
  v_max := case when v_kind = 'tournament_winner' then 8 else 8 end;
  update public.bet_selections
    set odds = public.betting_prob_to_odds((v_liquidity * prior_probability + stake_pool) / (v_liquidity + v_total), 0.08, v_max)
    where market_id = p_market;
end; $$;

-- Mercati partita: quote iniziali con tetto 8 (esito + over/under).
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
      (v_market, 'A', 'Coppia A', (1 - p_draw) * core, public.betting_prob_to_odds((1 - p_draw) * core, 0.08, 8)),
      (v_market, 'B', 'Coppia B', (1 - p_draw) * (1 - core), public.betting_prob_to_odds((1 - p_draw) * (1 - core), 0.08, 8)),
      (v_market, 'draw', 'Pareggio', p_draw, public.betting_prob_to_odds(p_draw, 0.08, 8));
  end if;
  if v_over_under and not exists (select 1 from public.bet_markets where match_id = p_match and kind = 'over_under_games') then
    balance := 1 - least(4, abs(d)) / 4.0; p_over := 0.35 + 0.3 * balance; v_line := greatest(1, coalesce(v_max_games, 6)) + 2.5;
    insert into public.bet_markets(tournament_id, match_id, kind, status, line) values (v_tournament, p_match, 'over_under_games', 'open', v_line) returning id into v_market;
    insert into public.bet_selections(market_id, code, label, prior_probability, odds) values
      (v_market, 'over', 'Più di ' || v_line || ' game', p_over, public.betting_prob_to_odds(p_over, 0.08, 8)),
      (v_market, 'under', 'Meno di ' || v_line || ' game', 1 - p_over, public.betting_prob_to_odds(1 - p_over, 0.08, 8));
  end if;
end; $$;

-- Vincitore torneo: tetto quota da 15 a 8.
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
      public.betting_prob_to_odds(exp(1.4 * betting_level_value(p.level) + 0.14 * (coalesce(ts.wins,0) * 3 + coalesce(ts.draws,0))) / v_total, 0.08, 8)
    from public.players p left join public.tournament_standings ts on ts.player_id = p.id
    where p.tournament_id = p_tournament and p.status in ('active','late');
end; $$;

-- Testa-a-testa: quote iniziali con tetto 8.
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
    (v_market, p_player_a::text, na, core, public.betting_prob_to_odds(core, 0.08, 8)),
    (v_market, p_player_b::text, nb, 1 - core, public.betting_prob_to_odds(1 - core, 0.08, 8));
  return v_market;
end; $$;

-- Applica subito i nuovi tetti ai mercati già aperti (senza doverli rigenerare).
do $$ declare m record; begin
  for m in select id from public.bet_markets where status in ('open','closed') loop
    perform public.betting_reprice_market(m.id);
  end loop;
end $$;

revoke all on function public.betting_reprice_market(uuid), public.betting_generate_match_markets_internal(uuid) from public, anon, authenticated;
