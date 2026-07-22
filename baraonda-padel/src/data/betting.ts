import { isLocalDemo } from './provider';
import { supabase, requireSupabase } from '../lib/supabase';
import { mapSupabaseError } from './errors';
import { tournamentStore } from '../storage';
import { levelValue, uid } from '../models';
import {
  DEFAULT_LIQUIDITY, MAX_ODDS, MAX_WINNER_ODDS, WINNER_LIQUIDITY, currentOdds, headToHeadProbability,
  matchOutcomeProbabilities, overUnderProbabilities, payout, probabilityToOdds, teamStrength,
  tournamentWinnerProbabilities,
} from '../services/bettingOdds';

export type MarketKind = 'match_outcome' | 'tournament_winner' | 'over_under_games' | 'head_to_head';
export type MarketStatus = 'open' | 'closed' | 'settled' | 'void';
export type BetStatus = 'pending' | 'won' | 'lost' | 'void';

export type BettingConfig = { enabled: boolean; initialBalance: number; overUnderEnabled: boolean };
export type Wallet = { id: string; tournamentId: string; userId: string; displayName: string; balance: number };
export type BetSelection = { id: string; marketId: string; code: string; label: string; odds: number; prior: number; stakePool: number; isWinner: boolean | null };
export type BetMarket = { id: string; tournamentId: string; matchId: string | null; kind: MarketKind; status: MarketStatus; line: number | null; liquidity: number; params: Record<string, unknown>; selections: BetSelection[] };
export type Bet = { id: string; marketId: string; selectionId: string; stake: number; oddsAtPlacement: number; potentialPayout: number; status: BetStatus };
export type LeaderboardEntry = { displayName: string; balance: number };

export interface BettingProvider {
  kind: 'local' | 'supabase';
  getConfig(tournamentId: string): Promise<BettingConfig>;
  join(tournamentId: string): Promise<Wallet>;
  getWallet(tournamentId: string): Promise<Wallet | null>;
  listMarkets(tournamentId: string): Promise<BetMarket[]>;
  listMyBets(tournamentId: string): Promise<Bet[]>;
  listLeaderboard(tournamentId: string): Promise<LeaderboardEntry[]>;
  placeBet(marketId: string, selectionId: string, stake: number): Promise<void>;
  setConfig(tournamentId: string, enabled: boolean, initialBalance: number, overUnderEnabled: boolean): Promise<void>;
  generateMatchMarkets(matchId: string, tournamentId: string): Promise<void>;
  generateTournamentMarkets(tournamentId: string): Promise<void>;
  createHeadToHead(tournamentId: string, playerA: string, playerB: string): Promise<void>;
  openMarket(marketId: string): Promise<void>;
  closeMarket(marketId: string): Promise<void>;
  settleMarket(marketId: string, winningSelectionId: string): Promise<void>;
  voidMarket(marketId: string): Promise<void>;
  listWallets(tournamentId: string): Promise<Wallet[]>;
  adjustBalance(walletId: string, delta: number): Promise<void>;
}

const fail = (error: unknown): never => { throw mapSupabaseError(error); };

// ---------------- Supabase ----------------
const mapMarket = (row: any, selections: any[]): BetMarket => ({
  id: row.id, tournamentId: row.tournament_id, matchId: row.match_id, kind: row.kind, status: row.status,
  line: row.line === null ? null : Number(row.line), liquidity: Number(row.liquidity ?? 300), params: row.params ?? {},
  selections: selections.filter(selection => selection.market_id === row.id).map(mapSelection),
});
const mapSelection = (row: any): BetSelection => ({ id: row.id, marketId: row.market_id, code: row.code, label: row.label, odds: Number(row.odds), prior: Number(row.prior_probability ?? 0), stakePool: Number(row.stake_pool ?? 0), isWinner: row.is_winner });
const mapWallet = (row: any): Wallet => ({ id: row.id, tournamentId: row.tournament_id, userId: row.user_id, displayName: row.display_name, balance: Number(row.balance) });
const mapBet = (row: any): Bet => ({ id: row.id, marketId: row.market_id, selectionId: row.selection_id, stake: Number(row.stake), oddsAtPlacement: Number(row.odds_at_placement), potentialPayout: Number(row.potential_payout), status: row.status });

const supabaseBetting: BettingProvider = {
  kind: 'supabase',
  async getConfig(tournamentId) {
    const client = requireSupabase();
    const { data, error } = await client.from('public_tournaments').select('betting_enabled, betting_initial_balance, betting_over_under_enabled').eq('id', tournamentId).maybeSingle();
    if (error) return fail(error);
    return { enabled: Boolean(data?.betting_enabled), initialBalance: Number(data?.betting_initial_balance ?? 1000), overUnderEnabled: data?.betting_over_under_enabled ?? true };
  },
  async join(tournamentId) {
    const { data, error } = await requireSupabase().rpc('join_tournament_betting', { p_tournament: tournamentId });
    if (error) return fail(error);
    return mapWallet(data);
  },
  async getWallet(tournamentId) {
    const client = requireSupabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data, error } = await client.from('betting_wallets').select('*').eq('tournament_id', tournamentId).eq('user_id', user.id).maybeSingle();
    if (error) return fail(error);
    return data ? mapWallet(data) : null;
  },
  async listMarkets(tournamentId) {
    const client = requireSupabase();
    const { data: markets, error } = await client.from('bet_markets').select('*').eq('tournament_id', tournamentId).order('created_at');
    if (error) return fail(error);
    const marketIds = (markets ?? []).map(market => market.id);
    const { data: selections, error: selectionError } = marketIds.length ? await client.from('bet_selections').select('*').in('market_id', marketIds) : { data: [], error: null };
    if (selectionError) return fail(selectionError);
    return (markets ?? []).map(market => mapMarket(market, selections ?? []));
  },
  async listMyBets(tournamentId) {
    const { data, error } = await requireSupabase().from('bets').select('*, bet_markets!inner(tournament_id)').eq('bet_markets.tournament_id', tournamentId).order('placed_at', { ascending: false });
    if (error) return fail(error);
    return (data ?? []).map(mapBet);
  },
  async listLeaderboard(tournamentId) {
    const { data, error } = await requireSupabase().from('public_betting_leaderboard').select('display_name, balance').eq('tournament_id', tournamentId).order('balance', { ascending: false });
    if (error) return fail(error);
    return (data ?? []).map(row => ({ displayName: row.display_name, balance: Number(row.balance) }));
  },
  async placeBet(marketId, selectionId, stake) { const { error } = await requireSupabase().rpc('place_bet', { p_market: marketId, p_selection: selectionId, p_stake: stake }); if (error) return fail(error); },
  async setConfig(tournamentId, enabled, initialBalance, overUnderEnabled) { const { error } = await requireSupabase().rpc('set_betting_config', { p_tournament: tournamentId, p_enabled: enabled, p_initial_balance: initialBalance, p_over_under_enabled: overUnderEnabled }); if (error) return fail(error); },
  async generateMatchMarkets(matchId) { const { error } = await requireSupabase().rpc('generate_match_markets', { p_match: matchId }); if (error) return fail(error); },
  async generateTournamentMarkets(tournamentId) { const { error } = await requireSupabase().rpc('generate_tournament_markets', { p_tournament: tournamentId }); if (error) return fail(error); },
  async createHeadToHead(tournamentId, playerA, playerB) { const { error } = await requireSupabase().rpc('create_head_to_head_market', { p_tournament: tournamentId, p_player_a: playerA, p_player_b: playerB }); if (error) return fail(error); },
  async openMarket(marketId) { const { error } = await requireSupabase().rpc('open_market', { p_market: marketId }); if (error) return fail(error); },
  async closeMarket(marketId) { const { error } = await requireSupabase().rpc('close_market', { p_market: marketId }); if (error) return fail(error); },
  async settleMarket(marketId, winningSelectionId) { const { error } = await requireSupabase().rpc('settle_market', { p_market: marketId, p_winning_selection: winningSelectionId }); if (error) return fail(error); },
  async voidMarket(marketId) { const { error } = await requireSupabase().rpc('void_market', { p_market: marketId }); if (error) return fail(error); },
  async listWallets(tournamentId) { const { data, error } = await requireSupabase().from('betting_wallets').select('*').eq('tournament_id', tournamentId).order('balance', { ascending: false }); if (error) return fail(error); return (data ?? []).map(mapWallet); },
  async adjustBalance(walletId, delta) { const { error } = await requireSupabase().rpc('adjust_balance', { p_wallet: walletId, p_delta: delta, p_reason: 'organizer_adjustment' }); if (error) return fail(error); },
};

// ---------------- Local demo (mono-utente) ----------------
// Simulazione in localStorage per la modalità demo: un solo scommettitore. Le stesse formule di
// bettingOdds.ts calcolano le quote leggendo i livelli reali dal torneo salvato localmente.
type LocalState = { config: BettingConfig; wallet: Wallet | null; markets: BetMarket[]; bets: Bet[] };
const LOCAL_KEY = 'baraonda-padel-betting';
const LOCAL_USER = { id: 'local-user', name: 'Tu' };

const loadLocal = (): Record<string, LocalState> => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch { return {}; } };
const saveLocal = (state: Record<string, LocalState>) => localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
const localState = (tournamentId: string): LocalState => loadLocal()[tournamentId] ?? { config: { enabled: false, initialBalance: 1000, overUnderEnabled: true }, wallet: null, markets: [], bets: [] };
const writeLocal = (tournamentId: string, state: LocalState) => { const all = loadLocal(); all[tournamentId] = state; saveLocal(all); };
const localTournament = (tournamentId: string) => tournamentStore.load().find(item => item.id === tournamentId);
// Riprezza le selezioni di un mercato locale con lo stesso blend del server (currentOdds).
const repriceMarket = (market: BetMarket): BetMarket => {
  const total = market.selections.reduce((sum, selection) => sum + selection.stakePool, 0);
  const maxOdds = market.kind === 'tournament_winner' ? MAX_WINNER_ODDS : MAX_ODDS;
  return { ...market, selections: market.selections.map(selection => ({ ...selection, odds: currentOdds(selection.prior, selection.stakePool, total, market.liquidity, undefined, maxOdds) })) };
};

type LocalTournament = ReturnType<typeof localTournament>;
// Costruisce i mercati di una partita (esito + eventuale over/under) con prior e quote iniziali.
const buildMatchMarkets = (tournamentId: string, tournament: NonNullable<LocalTournament>, match: NonNullable<LocalTournament>['matches'][number]): BetMarket[] => {
  const byId = new Map(tournament.players.map(player => [player.id, player]));
  const level = (id: string) => levelValue[byId.get(id)?.level ?? 'Intermedio'];
  const [p1, p2, p3, p4] = match.players;
  const strengthA = teamStrength(level(p1), level(p2)); const strengthB = teamStrength(level(p3), level(p4));
  const outcome = matchOutcomeProbabilities(strengthA, strengthB);
  const sel = (code: string, label: string, prior: number): BetSelection => ({ id: uid(), marketId: '', code, label, prior, stakePool: 0, odds: probabilityToOdds(prior, undefined, MAX_ODDS), isWinner: null });
  const markets: BetMarket[] = [
    { id: uid(), tournamentId, matchId: match.id, kind: 'match_outcome', status: 'open', line: null, liquidity: DEFAULT_LIQUIDITY, params: {}, selections: [sel('A', 'Coppia A', outcome.pA), sel('B', 'Coppia B', outcome.pB), sel('draw', 'Pareggio', outcome.pDraw)] },
  ];
  if (tournament.bettingOverUnderEnabled ?? true) {
    const line = (tournament.settings.maxGamesPerMatch ?? 6) + 2.5;
    const overUnder = overUnderProbabilities(strengthA, strengthB);
    markets.push({ id: uid(), tournamentId, matchId: match.id, kind: 'over_under_games', status: 'open', line, liquidity: DEFAULT_LIQUIDITY, params: {}, selections: [sel('over', `Più di ${line} game`, overUnder.pOver), sel('under', `Meno di ${line} game`, overUnder.pUnder)] });
  }
  markets.forEach(market => market.selections.forEach(selection => { selection.marketId = market.id; }));
  return markets;
};

// Finestra mercati (demo locale): tiene aperta solo la prossima partita 'scheduled', generandola se serve,
// e chiude le altre. Replica betting_sync_open_market del DB; invocata a ogni lettura dei mercati.
const localSync = (tournamentId: string) => {
  const tournament = localTournament(tournamentId); if (!tournament) return;
  const state = localState(tournamentId);
  if (!(tournament.bettingEnabled ?? state.config.enabled)) return;
  const next = tournament.matches.find(match => (match.status ?? 'scheduled') === 'scheduled');
  let markets = state.markets;
  if (next && !markets.some(market => market.matchId === next.id)) markets = [...markets, ...buildMatchMarkets(tournamentId, tournament, next)];
  markets = markets.map(market => {
    if (market.kind !== 'match_outcome' && market.kind !== 'over_under_games') return market;
    if (market.status === 'settled' || market.status === 'void') return market;
    return { ...market, status: next && market.matchId === next.id ? 'open' : 'closed' };
  });
  writeLocal(tournamentId, { ...state, markets });
};

const localBetting: BettingProvider = {
  kind: 'local',
  async getConfig(tournamentId) { const tournament = localTournament(tournamentId); return { enabled: tournament?.bettingEnabled ?? localState(tournamentId).config.enabled, initialBalance: tournament?.bettingInitialBalance ?? 1000, overUnderEnabled: tournament?.bettingOverUnderEnabled ?? localState(tournamentId).config.overUnderEnabled }; },
  async join(tournamentId) {
    const state = localState(tournamentId);
    if (state.wallet) return state.wallet;
    const config = await this.getConfig(tournamentId);
    const wallet: Wallet = { id: uid(), tournamentId, userId: LOCAL_USER.id, displayName: LOCAL_USER.name, balance: config.initialBalance };
    writeLocal(tournamentId, { ...state, config, wallet });
    return wallet;
  },
  async getWallet(tournamentId) { return localState(tournamentId).wallet; },
  async listMarkets(tournamentId) { localSync(tournamentId); return localState(tournamentId).markets; },
  async listMyBets(tournamentId) { return localState(tournamentId).bets; },
  async listLeaderboard(tournamentId) { const wallet = localState(tournamentId).wallet; return wallet ? [{ displayName: wallet.displayName, balance: wallet.balance }] : []; },
  async placeBet(marketId, selectionId, stake) {
    const tournamentId = loadLocal() && Object.keys(loadLocal()).find(id => localState(id).markets.some(market => market.id === marketId));
    if (!tournamentId) throw mapSupabaseError(new Error('MATCH_NOT_FOUND'));
    const state = localState(tournamentId);
    const market = state.markets.find(item => item.id === marketId);
    const selection = market?.selections.find(item => item.id === selectionId);
    if (!market || !selection) throw mapSupabaseError(new Error('MATCH_NOT_FOUND'));
    if (market.status !== 'open') throw mapSupabaseError(new Error('MARKET_CLOSED'));
    if (!state.wallet || state.wallet.balance < stake || stake <= 0) throw mapSupabaseError(new Error('INSUFFICIENT_FUNDS'));
    const bet: Bet = { id: uid(), marketId, selectionId, stake, oddsAtPlacement: selection.odds, potentialPayout: payout(stake, selection.odds), status: 'pending' };
    // Aggiunge lo stake al pool dell'esito e riprezza il mercato (la quota bloccata resta selection.odds pre-puntata).
    const markets = state.markets.map(item => item.id !== marketId ? item : repriceMarket({ ...item, selections: item.selections.map(current => current.id === selectionId ? { ...current, stakePool: current.stakePool + stake } : current) }));
    writeLocal(tournamentId, { ...state, wallet: { ...state.wallet, balance: state.wallet.balance - stake }, bets: [bet, ...state.bets], markets });
  },
  async setConfig(tournamentId, enabled, initialBalance, overUnderEnabled) { const state = localState(tournamentId); writeLocal(tournamentId, { ...state, config: { enabled, initialBalance, overUnderEnabled } }); },
  async generateMatchMarkets(matchId, tournamentId) {
    const tournament = localTournament(tournamentId); const match = tournament?.matches.find(item => item.id === matchId); if (!tournament || !match) return;
    const state = localState(tournamentId); if (state.markets.some(market => market.matchId === matchId)) return;
    writeLocal(tournamentId, { ...state, markets: [...state.markets, ...buildMatchMarkets(tournamentId, tournament, match)] });
  },
  async generateTournamentMarkets(tournamentId) {
    const tournament = localTournament(tournamentId); if (!tournament) return;
    const state = localState(tournamentId); if (state.markets.some(market => market.kind === 'tournament_winner')) return;
    const players = tournament.players.filter(player => player.status === 'attivo' || player.status === 'ritardo');
    const priors = tournamentWinnerProbabilities(players.map(player => ({ id: player.id, level: levelValue[player.level], points: 0 })));
    const market: BetMarket = { id: uid(), tournamentId, matchId: null, kind: 'tournament_winner', status: 'open', line: null, liquidity: WINNER_LIQUIDITY, params: {}, selections: players.map(player => {
      const prior = priors.get(player.id) ?? 0;
      return { id: uid(), marketId: '', code: player.id, label: `${player.firstName} ${player.lastName}`, prior, stakePool: 0, odds: probabilityToOdds(prior, undefined, MAX_WINNER_ODDS), isWinner: null };
    }) };
    market.selections.forEach(selection => { selection.marketId = market.id; });
    writeLocal(tournamentId, { ...state, markets: [...state.markets, market] });
  },
  async createHeadToHead(tournamentId, playerA, playerB) {
    const tournament = localTournament(tournamentId); if (!tournament) return;
    const state = localState(tournamentId);
    const a = tournament.players.find(player => player.id === playerA); const b = tournament.players.find(player => player.id === playerB); if (!a || !b) return;
    const priorA = headToHeadProbability(levelValue[a.level] - levelValue[b.level], 0);
    const market: BetMarket = { id: uid(), tournamentId, matchId: null, kind: 'head_to_head', status: 'open', line: null, liquidity: DEFAULT_LIQUIDITY, params: { playerA, playerB }, selections: [
      { id: uid(), marketId: '', code: playerA, label: `${a.firstName} ${a.lastName}`, prior: priorA, stakePool: 0, odds: probabilityToOdds(priorA, undefined, MAX_ODDS), isWinner: null },
      { id: uid(), marketId: '', code: playerB, label: `${b.firstName} ${b.lastName}`, prior: 1 - priorA, stakePool: 0, odds: probabilityToOdds(1 - priorA, undefined, MAX_ODDS), isWinner: null },
    ] };
    market.selections.forEach(selection => { selection.marketId = market.id; });
    writeLocal(tournamentId, { ...state, markets: [...state.markets, market] });
  },
  async openMarket(marketId) { updateLocalMarket(marketId, market => ({ ...market, status: 'open' })); },
  async closeMarket(marketId) { updateLocalMarket(marketId, market => ({ ...market, status: 'closed' })); },
  async settleMarket(marketId, winningSelectionId) {
    const tournamentId = findLocalMarketTournament(marketId); if (!tournamentId) return;
    const state = localState(tournamentId); const market = state.markets.find(item => item.id === marketId); if (!market) return;
    let wallet = state.wallet;
    const bets = state.bets.map(bet => {
      if (bet.marketId !== marketId || bet.status !== 'pending') return bet;
      const won = bet.selectionId === winningSelectionId;
      if (won && wallet) wallet = { ...wallet, balance: wallet.balance + bet.potentialPayout };
      return { ...bet, status: won ? 'won' as const : 'lost' as const };
    });
    const markets = state.markets.map(item => item.id === marketId ? { ...item, status: 'settled' as const, selections: item.selections.map(selection => ({ ...selection, isWinner: selection.id === winningSelectionId })) } : item);
    writeLocal(tournamentId, { ...state, wallet, markets, bets });
  },
  async voidMarket(marketId) {
    const tournamentId = findLocalMarketTournament(marketId); if (!tournamentId) return;
    const state = localState(tournamentId); let wallet = state.wallet;
    const bets = state.bets.map(bet => {
      if (bet.marketId !== marketId || bet.status === 'void') return bet;
      if (wallet) wallet = { ...wallet, balance: wallet.balance + (bet.status === 'won' ? bet.stake - bet.potentialPayout : bet.stake) };
      return { ...bet, status: 'void' as const };
    });
    const markets = state.markets.map(item => item.id === marketId ? { ...item, status: 'void' as const } : item);
    writeLocal(tournamentId, { ...state, wallet, markets, bets });
  },
  async listWallets(tournamentId) { const wallet = localState(tournamentId).wallet; return wallet ? [wallet] : []; },
  async adjustBalance(_walletId, delta) { const tournamentId = Object.keys(loadLocal())[0]; if (!tournamentId) return; const state = localState(tournamentId); if (state.wallet) writeLocal(tournamentId, { ...state, wallet: { ...state.wallet, balance: state.wallet.balance + delta } }); },
};

const findLocalMarketTournament = (marketId: string) => Object.keys(loadLocal()).find(id => localState(id).markets.some(market => market.id === marketId));
const updateLocalMarket = (marketId: string, change: (market: BetMarket) => BetMarket) => {
  const tournamentId = findLocalMarketTournament(marketId); if (!tournamentId) return;
  const state = localState(tournamentId);
  writeLocal(tournamentId, { ...state, markets: state.markets.map(market => market.id === marketId ? change(market) : market) });
};

export const bettingProvider: BettingProvider = isLocalDemo || !supabase ? localBetting : supabaseBetting;
