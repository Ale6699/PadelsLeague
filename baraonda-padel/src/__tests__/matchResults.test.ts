import { describe, expect, it } from 'vitest';
import { Match, Player, Tournament, defaultSettings } from '../models';
import { calculateMatchOutcome, getMatchOutcome, validateMatchScore } from '../services/matchResults';
import { getStandings } from '../services/standings';

const player = (id: string): Player => ({ id, firstName: id, lastName: '', level: 'Intermedio', gender: 'Uomo', notes: '', availability: [{ from: '09:00', to: '18:00' }], avoidPartners: [], status: 'attivo' });
const players = ['a', 'b', 'c', 'd'].map(player);
const match = (aGames: number | null, bGames: number | null, outcome?: 'A' | 'B' | 'D'): Match => ({ id: 'm', start: '10:00', end: '10:15', players: ['a', 'b', 'c', 'd'], locked: false, violations: [], result: { aGames, bGames, outcome } });
const tournament = (matches: Match[]): Tournament => ({ id: 't', name: 'Test', settings: defaultSettings, players, matches });

describe('calculateMatchOutcome', () => {
  it.each([[6, 3, 'team_a'], [2, 5, 'team_b'], [4, 4, 'draw'], [null, null, 'not_played'], [4, null, 'incomplete'], [null, 2, 'incomplete']] as const)('calcola %s–%s come %s', (a, b, expected) => expect(calculateMatchOutcome(a, b)).toBe(expected));
  it('rifiuta game fuori limite o non interi', () => { expect(validateMatchScore(-1)).toBe(false); expect(validateMatchScore(7)).toBe(false); expect(validateMatchScore(2.5)).toBe(false); });
  it('dà precedenza ai game rispetto al vecchio vincitore incoerente', () => expect(getMatchOutcome(match(6, 3, 'B'))).toBe('team_a'));
});

describe('classifica derivata dai game', () => {
  it('ricalcola senza duplicare punti dopo una correzione', () => {
    const first = getStandings(tournament([match(6, 3)])); expect(first.find(row => row.id === 'a')?.points).toBe(3);
    const corrected = getStandings(tournament([match(2, 5)])); expect(corrected.find(row => row.id === 'a')?.points).toBe(0); expect(corrected.find(row => row.id === 'c')?.points).toBe(3);
  });
  it('non assegna punti a partita resettata o incompleta', () => {
    const reset = getStandings(tournament([match(null, null)])); const incomplete = getStandings(tournament([match(4, null)]));
    expect(reset.every(row => row.points === 0)).toBe(true); expect(incomplete.every(row => row.points === 0)).toBe(true);
  });
});
