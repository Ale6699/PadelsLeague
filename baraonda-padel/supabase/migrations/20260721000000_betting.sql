-- Scommesse con gettoni virtuali. Saldo e payout vivono SOLO qui: le tabelle non hanno policy di
-- scrittura per i client, ogni mutazione monetaria passa da funzioni security definer con lock di
-- riga sul wallet. Le quote sono calcolate lato server perché la vista pubblica non espone i livelli
-- reali; le formule replicano src/services/bettingOdds.ts (tenere allineati i due calcoli).

alter table public.tournaments add column if not exists betting_enabled boolean not null default false;
alter table public.tournaments add column if not exists betting_initial_balance bigint not null default 1000 check (betting_initial_balance >= 0);
alter table public.tournaments add column if not exists betting_over_under_enabled boolean not null default true;

create table if not exists public.betting_wallets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Giocatore',
  balance bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);
create index if not exists betting_wallets_tournament_idx on public.betting_wallets(tournament_id);
create index if not exists betting_wallets_user_idx on public.betting_wallets(user_id);

create table if not exists public.bet_markets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  kind text not null check (kind in ('match_outcome','tournament_winner','over_under_games','head_to_head')),
  status text not null default 'open' check (status in ('open','closed','settled','void')),
  line numeric,
  liquidity numeric not null default 300,
  params jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bet_markets_tournament_idx on public.bet_markets(tournament_id, kind);
create index if not exists bet_markets_match_idx on public.bet_markets(match_id);

create table if not exists public.bet_selections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.bet_markets(id) on delete cascade,
  code text not null,
  label text not null,
  odds numeric(6,2) not null check (odds >= 1.01),
  prior_probability numeric not null default 0,
  stake_pool bigint not null default 0,
  is_winner boolean,
  unique (market_id, code)
);
create index if not exists bet_selections_market_idx on public.bet_selections(market_id);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.bet_markets(id) on delete cascade,
  selection_id uuid not null references public.bet_selections(id) on delete cascade,
  wallet_id uuid not null references public.betting_wallets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stake bigint not null check (stake > 0),
  odds_at_placement numeric(6,2) not null,
  potential_payout bigint not null,
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists bets_market_idx on public.bets(market_id);
create index if not exists bets_user_idx on public.bets(user_id);
create index if not exists bets_wallet_idx on public.bets(wallet_id);

create table if not exists public.betting_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.betting_wallets(id) on delete cascade,
  delta bigint not null,
  reason text not null check (reason in ('join_bonus','bet_stake','bet_payout','bet_refund','organizer_adjustment')),
  bet_id uuid references public.bets(id) on delete set null,
  market_id uuid references public.bet_markets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists betting_ledger_wallet_idx on public.betting_ledger(wallet_id, created_at desc);

-- ---------- Formule quote (specchio di src/services/bettingOdds.ts) ----------
create or replace function public.betting_level_value(p_level text) returns integer language sql immutable as $$
  select case p_level when 'beginner' then 1 when 'advanced' then 3 else 2 end;
$$;
create or replace function public.betting_logistic(p_x numeric) returns numeric language sql immutable as $$
  select 1 / (1 + exp(-0.6 * p_x));
$$;
create or replace function public.betting_prob_to_odds(p_probability numeric, p_margin numeric default 0.08, p_max_odds numeric default 'Infinity') returns numeric language sql immutable as $$
  select least(p_max_odds, greatest(1.01, round((1 / least(0.99, greatest(0.01, p_probability))) / (1 + p_margin), 2)));
$$;

-- Riprezza tutte le selezioni di un mercato col blend bayesiano prior↔denaro (specchio di currentOdds
-- in bettingOdds.ts): p = (K*prior + stake_pool) / (K + monte_totale). Il vincitore torneo è cappato.
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

-- ---------- Helper monetari (chiamati solo dalle RPC definer) ----------
create or replace function public.betting_credit(p_wallet uuid, p_delta bigint, p_reason text, p_bet uuid default null, p_market uuid default null) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.betting_wallets set balance = balance + p_delta where id = p_wallet;
  insert into public.betting_ledger(wallet_id, delta, reason, bet_id, market_id) values (p_wallet, p_delta, p_reason, p_bet, p_market);
end; $$;

create or replace function public.betting_is_owner(p_tournament uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments t where t.id = p_tournament and t.owner_id = auth.uid());
$$;

-- Liquida un mercato: paga i vincenti (stake*odds già congelato), segna i perdenti, chiude il mercato.
create or replace function public.betting_apply_settlement(p_market uuid, p_winning_selection uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_bet record;
begin
  update public.bet_selections set is_winner = (id = p_winning_selection) where market_id = p_market;
  for v_bet in select * from public.bets where market_id = p_market and status = 'pending' for update loop
    if v_bet.selection_id = p_winning_selection then
      perform public.betting_credit(v_bet.wallet_id, v_bet.potential_payout, 'bet_payout', v_bet.id, p_market);
      update public.bets set status = 'won', settled_at = now() where id = v_bet.id;
    else
      update public.bets set status = 'lost', settled_at = now() where id = v_bet.id;
    end if;
  end loop;
  update public.bet_markets set status = 'settled', version = version + 1, updated_at = now() where id = p_market;
end; $$;

-- Annulla un mercato riportando tutti al saldo pre-scommessa, anche se già liquidato (usato per
-- override organizzatore e per reset/annullo partita): ai vinti si storna il payload netto.
create or replace function public.betting_void_market(p_market uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_bet record;
begin
  for v_bet in select * from public.bets where market_id = p_market and status <> 'void' for update loop
    if v_bet.status = 'won' then
      perform public.betting_credit(v_bet.wallet_id, v_bet.stake - v_bet.potential_payout, 'bet_refund', v_bet.id, p_market);
    else
      perform public.betting_credit(v_bet.wallet_id, v_bet.stake, 'bet_refund', v_bet.id, p_market);
    end if;
    update public.bets set status = 'void', settled_at = now() where id = v_bet.id;
  end loop;
  update public.bet_selections set is_winner = null where market_id = p_market;
  update public.bet_markets set status = 'void', version = version + 1, updated_at = now() where id = p_market;
end; $$;

-- ---------- RPC organizzatore: configurazione ----------
create or replace function public.set_betting_config(p_tournament uuid, p_enabled boolean, p_initial_balance bigint, p_over_under_enabled boolean default true) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.betting_is_owner(p_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  if p_initial_balance < 0 then raise exception 'VALIDATION'; end if;
  update public.tournaments set betting_enabled = p_enabled, betting_initial_balance = p_initial_balance, betting_over_under_enabled = p_over_under_enabled where id = p_tournament;
end; $$;

-- ---------- RPC organizzatore: generazione mercati con quote ----------
create or replace function public.generate_match_markets(p_match uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  v_match public.matches%rowtype; v_tournament uuid; v_max_games integer; v_over_under boolean;
  a1 int; a2 int; b1 int; b2 int; d numeric; core numeric; p_draw numeric; balance numeric; p_over numeric; v_line numeric; v_market uuid;
begin
  select * into v_match from public.matches where id = p_match; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  v_tournament := v_match.tournament_id;
  if not public.betting_is_owner(v_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  select max_games_per_match, betting_over_under_enabled into v_max_games, v_over_under from public.tournaments where id = v_tournament;
  select betting_level_value(level) into a1 from public.players where id = v_match.team_a_player_1_id;
  select betting_level_value(level) into a2 from public.players where id = v_match.team_a_player_2_id;
  select betting_level_value(level) into b1 from public.players where id = v_match.team_b_player_1_id;
  select betting_level_value(level) into b2 from public.players where id = v_match.team_b_player_2_id;
  a1 := coalesce(a1,2); a2 := coalesce(a2,2); b1 := coalesce(b1,2); b2 := coalesce(b2,2);
  d := (a1 + a2) - (b1 + b2);
  -- Esito partita: prior salvato per il pricing dinamico; odds iniziali = prior (pool a zero).
  if not exists (select 1 from public.bet_markets where match_id = p_match and kind = 'match_outcome') then
    p_draw := 0.15 * (1 - least(4, abs(d)) / 4.0); core := public.betting_logistic(d);
    insert into public.bet_markets(tournament_id, match_id, kind, status) values (v_tournament, p_match, 'match_outcome', 'open') returning id into v_market;
    insert into public.bet_selections(market_id, code, label, prior_probability, odds) values
      (v_market, 'A', 'Coppia A', (1 - p_draw) * core, public.betting_prob_to_odds((1 - p_draw) * core)),
      (v_market, 'B', 'Coppia B', (1 - p_draw) * (1 - core), public.betting_prob_to_odds((1 - p_draw) * (1 - core))),
      (v_market, 'draw', 'Pareggio', p_draw, public.betting_prob_to_odds(p_draw));
  end if;
  -- Over/Under game TOTALI (entrambe le coppie): solo se abilitato. La linea supera il massimo per
  -- squadra perché il totale somma le due coppie: default maxGames + 2.5.
  if v_over_under and not exists (select 1 from public.bet_markets where match_id = p_match and kind = 'over_under_games') then
    balance := 1 - least(4, abs(d)) / 4.0; p_over := 0.35 + 0.3 * balance; v_line := greatest(1, coalesce(v_max_games, 6)) + 2.5;
    insert into public.bet_markets(tournament_id, match_id, kind, status, line) values (v_tournament, p_match, 'over_under_games', 'open', v_line) returning id into v_market;
    insert into public.bet_selections(market_id, code, label, prior_probability, odds) values
      (v_market, 'over', 'Più di ' || v_line || ' game', p_over, public.betting_prob_to_odds(p_over)),
      (v_market, 'under', 'Meno di ' || v_line || ' game', 1 - p_over, public.betting_prob_to_odds(1 - p_over));
  end if;
end; $$;

create or replace function public.generate_tournament_markets(p_tournament uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_market uuid; v_total numeric;
begin
  if not public.betting_is_owner(p_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  if exists (select 1 from public.bet_markets where tournament_id = p_tournament and kind = 'tournament_winner') then return; end if;
  insert into public.bet_markets(tournament_id, match_id, kind, status, liquidity) values (p_tournament, null, 'tournament_winner', 'open', 800) returning id into v_market;
  -- Prior compresso (α=1.4) → favorito basso; quote iniziali cappate a 15.
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

-- ---------- RPC organizzatore: gestione mercati e saldi ----------
create or replace function public.open_market(p_market uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_tournament uuid; v_status text;
begin
  select tournament_id, status into v_tournament, v_status from public.bet_markets where id = p_market for update; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.betting_is_owner(v_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  if v_status = 'settled' then raise exception 'MARKET_CLOSED'; end if; -- va prima annullato
  update public.bet_markets set status = 'open', version = version + 1, updated_at = now() where id = p_market;
end; $$;

create or replace function public.close_market(p_market uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_tournament uuid;
begin
  select tournament_id into v_tournament from public.bet_markets where id = p_market for update; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.betting_is_owner(v_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  update public.bet_markets set status = 'closed', version = version + 1, updated_at = now() where id = p_market and status in ('open','closed');
end; $$;

create or replace function public.settle_market(p_market uuid, p_winning_selection uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_tournament uuid; v_status text;
begin
  select tournament_id, status into v_tournament, v_status from public.bet_markets where id = p_market for update; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.betting_is_owner(v_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  if v_status = 'settled' then raise exception 'MARKET_CLOSED'; end if;
  if not exists (select 1 from public.bet_selections where id = p_winning_selection and market_id = p_market) then raise exception 'VALIDATION'; end if;
  perform public.betting_apply_settlement(p_market, p_winning_selection);
end; $$;

create or replace function public.void_market(p_market uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_tournament uuid;
begin
  select tournament_id into v_tournament from public.bet_markets where id = p_market for update; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.betting_is_owner(v_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  perform public.betting_void_market(p_market);
end; $$;

create or replace function public.adjust_balance(p_wallet uuid, p_delta bigint, p_reason text default 'organizer_adjustment') returns void language plpgsql security definer set search_path = public as $$
declare v_tournament uuid;
begin
  select tournament_id into v_tournament from public.betting_wallets where id = p_wallet for update; if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if not public.betting_is_owner(v_tournament) then raise exception 'PERMISSION_DENIED'; end if;
  perform public.betting_credit(p_wallet, p_delta, 'organizer_adjustment', null, null);
end; $$;

-- ---------- RPC scommettitore ----------
create or replace function public.join_tournament_betting(p_tournament uuid) returns public.betting_wallets language plpgsql security definer set search_path = public as $$
declare v_enabled boolean; v_initial bigint; v_wallet public.betting_wallets%rowtype; v_name text;
begin
  if auth.uid() is null then raise exception 'PERMISSION_DENIED'; end if;
  select betting_enabled, betting_initial_balance into v_enabled, v_initial from public.tournaments where id = p_tournament;
  if not found or not v_enabled then raise exception 'MARKET_CLOSED'; end if; -- scommesse non attive
  select * into v_wallet from public.betting_wallets where tournament_id = p_tournament and user_id = auth.uid();
  if found then return v_wallet; end if;
  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') into v_name from public.profiles where id = auth.uid();
  if v_name is null then select split_part(email, '@', 1) into v_name from auth.users where id = auth.uid(); end if;
  insert into public.betting_wallets(tournament_id, user_id, display_name, balance) values (p_tournament, auth.uid(), coalesce(v_name, 'Giocatore'), v_initial) returning * into v_wallet;
  insert into public.betting_ledger(wallet_id, delta, reason) values (v_wallet.id, v_initial, 'join_bonus');
  return v_wallet;
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
  if not found then raise exception 'PERMISSION_DENIED'; end if; -- deve prima unirsi al tavolo
  if v_wallet.balance < p_stake then raise exception 'INSUFFICIENT_FUNDS'; end if;
  v_payout := floor(p_stake * v_odds); -- quota congelata: v_odds è la quota corrente pre-puntata mostrata al giocatore
  insert into public.bets(market_id, selection_id, wallet_id, user_id, stake, odds_at_placement, potential_payout)
    values (p_market, p_selection, v_wallet.id, auth.uid(), p_stake, v_odds, v_payout) returning * into v_bet;
  perform public.betting_credit(v_wallet.id, -p_stake, 'bet_stake', v_bet.id, p_market);
  update public.bet_selections set stake_pool = stake_pool + p_stake where id = p_selection;
  perform public.betting_reprice_market(p_market); -- sposta le quote per i giocatori successivi
  return v_bet;
end; $$;

-- ---------- Liquidazione ibrida via trigger sui risultati partita ----------
create or replace function public.betting_on_match_change() returns trigger language plpgsql security definer set search_path = public as $$
declare v_market record; v_winner uuid; v_total int;
begin
  -- Risultato inserito: chiudi e liquida i mercati aperti/chiusi della partita.
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
  -- Risultato resettato o partita annullata: annulla i mercati (rimborso integrale).
  if (old.status = 'completed' and new.status is distinct from 'completed') or (new.status = 'cancelled' and old.status is distinct from 'cancelled') then
    for v_market in select id from public.bet_markets where match_id = new.id and status <> 'void' loop
      perform public.betting_void_market(v_market.id);
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists matches_betting_settlement on public.matches;
create trigger matches_betting_settlement after update on public.matches for each row execute function public.betting_on_match_change();

-- ---------- RLS ----------
alter table public.betting_wallets enable row level security;
alter table public.betting_ledger enable row level security;
alter table public.bet_markets enable row level security;
alter table public.bet_selections enable row level security;
alter table public.bets enable row level security;

create policy "wallet owner or organizer read" on public.betting_wallets for select to authenticated using (user_id = auth.uid() or public.betting_is_owner(tournament_id));
create policy "ledger owner or organizer read" on public.betting_ledger for select to authenticated using (exists (select 1 from public.betting_wallets w where w.id = betting_ledger.wallet_id and (w.user_id = auth.uid() or public.betting_is_owner(w.tournament_id))));
create policy "markets read for enabled tournament" on public.bet_markets for select to authenticated using (public.betting_is_owner(tournament_id) or exists (select 1 from public.tournaments t where t.id = bet_markets.tournament_id and t.betting_enabled));
create policy "selections read for enabled tournament" on public.bet_selections for select to authenticated using (exists (select 1 from public.bet_markets m join public.tournaments t on t.id = m.tournament_id where m.id = bet_selections.market_id and (t.betting_enabled or public.betting_is_owner(t.id))));
create policy "bets owner or organizer read" on public.bets for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.bet_markets m where m.id = bets.market_id and public.betting_is_owner(m.tournament_id)));

-- Nessuna policy di insert/update/delete: ogni scrittura passa dalle RPC security definer sopra.
revoke all on public.betting_wallets, public.betting_ledger, public.bet_markets, public.bet_selections, public.bets from anon;
grant select on public.betting_wallets, public.betting_ledger, public.bet_markets, public.bet_selections, public.bets to authenticated;

-- I client non possono chiamare gli helper interni, solo le RPC pubbliche.
revoke all on function public.betting_credit(uuid,bigint,text,uuid,uuid), public.betting_apply_settlement(uuid,uuid), public.betting_void_market(uuid), public.betting_reprice_market(uuid), public.betting_on_match_change() from public, anon, authenticated;
grant execute on function public.set_betting_config(uuid,boolean,bigint,boolean), public.generate_match_markets(uuid), public.generate_tournament_markets(uuid), public.create_head_to_head_market(uuid,uuid,uuid), public.open_market(uuid), public.close_market(uuid), public.settle_market(uuid,uuid), public.void_market(uuid), public.adjust_balance(uuid,bigint,text), public.join_tournament_betting(uuid), public.place_bet(uuid,uuid,bigint) to authenticated;
revoke all on function public.set_betting_config(uuid,boolean,bigint,boolean), public.generate_match_markets(uuid), public.generate_tournament_markets(uuid), public.create_head_to_head_market(uuid,uuid,uuid), public.open_market(uuid), public.close_market(uuid), public.settle_market(uuid,uuid), public.void_market(uuid), public.adjust_balance(uuid,bigint,text), public.join_tournament_betting(uuid), public.place_bet(uuid,uuid,bigint) from public, anon;

-- La pagina scommesse arriva dal link pubblico: espone se le scommesse sono attive e il saldo iniziale.
create or replace view public.public_tournaments as
  select id, name, public_title, tournament_date, start_time, end_time, match_duration_minutes, transition_duration_minutes, max_games_per_match, status, public_slug, updated_at, betting_enabled, betting_initial_balance, betting_over_under_enabled
  from public.tournaments where is_public;
grant select on public.public_tournaments to anon, authenticated;

-- Classifica gettoni: solo nome scelto al join e saldo, senza esporre l'identità (user_id).
create or replace view public.public_betting_leaderboard as
  select w.tournament_id, w.display_name, w.balance from public.betting_wallets w join public.tournaments t on t.id = w.tournament_id where t.betting_enabled;
alter view public.public_betting_leaderboard set (security_invoker = false);
grant select on public.public_betting_leaderboard to authenticated;
revoke all on public.public_betting_leaderboard from anon;

alter publication supabase_realtime add table public.betting_wallets, public.bet_markets, public.bet_selections, public.bets;
