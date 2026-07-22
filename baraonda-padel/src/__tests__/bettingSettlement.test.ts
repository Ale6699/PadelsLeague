import { describe, expect, it } from 'vitest';
import { Bet, BetMarket, LocalBettingState, matchMarketWinningCode, reconcileLocalMatchBetting } from '../data/betting';
import { Match, Tournament } from '../models';

const selection = (marketId: string, id: string, code: string) => ({ id, marketId, code, label: code, odds: 2, prior: .5, stakePool: 0, isWinner: null });
const market = (id: string, kind: 'match_outcome' | 'over_under_games', codes: string[], line: number | null): BetMarket => ({
  id, tournamentId: 't', matchId: 'm', kind, status: 'closed', line, liquidity: 300, params: {}, selections: codes.map(code => selection(id, `${id}-${code}`, code)),
});
const bet = (id: string, marketId: string, selectionId: string, payout: number): Bet => ({ id, marketId, selectionId, stake: 100, oddsAtPlacement: payout / 100, potentialPayout: payout, status: 'pending' });
const completedMatch = (aGames: number, bGames: number, status: Match['status'] = 'completed'): Match => ({ id: 'm', start: '10:00', end: '10:15', players: ['a', 'b', 'c', 'd'], locked: false, violations: [], status, result: { aGames, bGames } });
const tournament = (match: Match): Pick<Tournament, 'matches'> => ({ matches: [match] });

const initialState = (): LocalBettingState => {
  const outcome = market('outcome', 'match_outcome', ['A', 'B', 'draw'], null);
  const totals = market('totals', 'over_under_games', ['over', 'under'], 8.5);
  return {
    config: { enabled: true, initialBalance: 1000, overUnderEnabled: true },
    wallet: { id: 'w', tournamentId: 't', userId: 'u', displayName: 'Test', balance: 600 },
    markets: [outcome, totals],
    bets: [
      bet('a', outcome.id, 'outcome-A', 200), bet('b', outcome.id, 'outcome-B', 300),
      bet('over', totals.id, 'totals-over', 180), bet('under', totals.id, 'totals-under', 220),
    ],
  };
};

describe('liquidazione locale mercati partita', () => {
  it('risolve vittoria, pareggio e linea Under/Over senza push', () => {
    expect(matchMarketWinningCode({ kind: 'match_outcome', line: null }, 6, 3)).toBe('A');
    expect(matchMarketWinningCode({ kind: 'match_outcome', line: null }, 2, 5)).toBe('B');
    expect(matchMarketWinningCode({ kind: 'match_outcome', line: null }, 4, 4)).toBe('draw');
    expect(matchMarketWinningCode({ kind: 'over_under_games', line: 8.5 }, 5, 4)).toBe('over');
    expect(matchMarketWinningCode({ kind: 'over_under_games', line: 8.5 }, 5, 3)).toBe('under');
  });

  it('liquida entrambi i mercati una sola volta', () => {
    const settled = reconcileLocalMatchBetting(initialState(), tournament(completedMatch(6, 4)));
    expect(settled.wallet?.balance).toBe(980);
    expect(settled.bets.map(item => item.status)).toEqual(['won', 'lost', 'won', 'lost']);
    expect(settled.markets.every(item => item.status === 'settled')).toBe(true);
    expect(reconcileLocalMatchBetting(settled, tournament(completedMatch(6, 4)))).toEqual(settled);
  });

  it('storna i vecchi payout e applica quelli del risultato corretto', () => {
    const first = reconcileLocalMatchBetting(initialState(), tournament(completedMatch(6, 4)));
    const corrected = reconcileLocalMatchBetting(first, tournament(completedMatch(3, 5)));
    expect(corrected.wallet?.balance).toBe(1120);
    expect(corrected.bets.map(item => item.status)).toEqual(['lost', 'won', 'lost', 'won']);
    expect(corrected.markets[0].selections.find(item => item.isWinner)?.code).toBe('B');
    expect(corrected.markets[1].selections.find(item => item.isWinner)?.code).toBe('under');
  });

  it('riconcilia solo il mercato il cui esito cambia', () => {
    const first = reconcileLocalMatchBetting(initialState(), tournament(completedMatch(6, 4)));
    const corrected = reconcileLocalMatchBetting(first, tournament(completedMatch(5, 5)));
    expect(corrected.wallet?.balance).toBe(780);
    expect(corrected.bets.find(item => item.id === 'over')?.status).toBe('won');
    expect(corrected.markets[1]).toEqual(first.markets[1]);
  });

  it('rimborsa integralmente un risultato resettato e lascia i mercati void', () => {
    const settled = reconcileLocalMatchBetting(initialState(), tournament(completedMatch(6, 4)));
    const reset = reconcileLocalMatchBetting(settled, tournament({ ...completedMatch(0, 0, 'scheduled'), result: { aGames: null, bGames: null } }));
    expect(reset.wallet?.balance).toBe(1000);
    expect(reset.bets.every(item => item.status === 'void')).toBe(true);
    expect(reset.markets.every(item => item.status === 'void')).toBe(true);
  });
});
