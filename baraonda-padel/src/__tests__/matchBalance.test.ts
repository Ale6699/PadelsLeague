import { describe, expect, it } from 'vitest';
import { Match, Player, Level } from '../models';
import { calculateMatchBalance } from '../services/matchBalance';

const player = (id: string, level: Level, gender: Player['gender'] = 'Uomo'): Player => ({ id, firstName: id, lastName: '', level, gender, notes: '', availability: [{ from: '09:00', to: '18:00' }], avoidPartners: [], status: 'attivo' });
const match = (ids: [string, string, string, string]): Match => ({ id: 'm', start: '10:00', end: '10:15', players: ids, locked: false, violations: [] });

describe('calculateMatchBalance', () => {
  it('valuta come eccellente quattro intermedi', () => {
    const players = ['a', 'b', 'c', 'd'].map(id => player(id, 'Intermedio'));
    const rating = calculateMatchBalance(match(['a', 'b', 'c', 'd']), players);
    expect(rating.strengthDifference).toBe(0); expect(rating.score).toBe(100); expect(rating.label).toBe('excellent');
  });
  it('applica una piccola penalità a coppie equivalenti ma eterogenee', () => {
    const players = [player('a', 'Avanzato'), player('b', 'Principiante'), player('c', 'Avanzato'), player('d', 'Principiante')];
    const rating = calculateMatchBalance(match(['a', 'b', 'c', 'd']), players);
    expect(rating.strengthDifference).toBe(0); expect(rating.score).toBe(88); expect(rating.label).toBe('balanced');
  });
  it('considera equilibrata una differenza minima', () => {
    const players = [player('a', 'Avanzato'), player('b', 'Intermedio'), player('c', 'Intermedio'), player('d', 'Intermedio')];
    const rating = calculateMatchBalance(match(['a', 'b', 'c', 'd']), players);
    expect(rating.strengthDifference).toBe(1); expect(rating.label).toBe('balanced');
  });
  it('segnala una partita sbilanciata', () => {
    const players = [player('a', 'Avanzato'), player('b', 'Avanzato'), player('c', 'Intermedio'), player('d', 'Principiante')];
    const rating = calculateMatchBalance(match(['a', 'b', 'c', 'd']), players);
    expect(rating.score).toBeLessThan(60); expect(rating.warnings.some(warning => warning.startsWith('Rating di equilibrio basso'))).toBe(true);
  });
  it('vieta avanzati contro principianti', () => {
    const players = [player('a', 'Avanzato'), player('b', 'Avanzato'), player('c', 'Principiante'), player('d', 'Principiante')];
    const rating = calculateMatchBalance(match(['a', 'b', 'c', 'd']), players);
    expect(rating.label).toBe('very_unbalanced'); expect(rating.score).toBeLessThan(40); expect(rating.warnings).toContain('Due giocatori avanzati non possono giocare contro due principianti.');
  });
  it('vieta due avanzati contro una coppia avanzato-principiante', () => {
    const players = [player('a', 'Avanzato'), player('b', 'Avanzato'), player('c', 'Avanzato'), player('d', 'Principiante')];
    const rating = calculateMatchBalance(match(['a', 'b', 'c', 'd']), players);
    expect(rating.label).toBe('very_unbalanced'); expect(rating.score).toBeLessThan(40); expect(rating.warnings).toContain('Due giocatori avanzati non possono giocare contro una coppia con un principiante.');
  });
  it('gestisce un livello non valido come intermedio', () => {
    const invalid = { ...player('a', 'Intermedio'), level: 'Sconosciuto' } as unknown as Player;
    const rating = calculateMatchBalance(match(['a', 'b', 'c', 'd']), [invalid, player('b', 'Intermedio'), player('c', 'Intermedio'), player('d', 'Intermedio')]);
    expect(rating.score).toBe(100); expect(rating.warnings[0]).toContain('livello');
  });
  it('assegna al massimo due punti alle due coppie miste', () => {
    const mixed = [player('a', 'Avanzato', 'Uomo'), player('b', 'Intermedio', 'Donna'), player('c', 'Intermedio', 'Uomo'), player('d', 'Intermedio', 'Donna')];
    const plain = mixed.map(item => ({ ...item, gender: 'Uomo' as const }));
    expect(calculateMatchBalance(match(['a', 'b', 'c', 'd']), mixed).score - calculateMatchBalance(match(['a', 'b', 'c', 'd']), plain).score).toBe(2);
  });
});
