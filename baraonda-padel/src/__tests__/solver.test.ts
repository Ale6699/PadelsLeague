import { describe, expect, it } from 'vitest';
import { Player, Tournament, defaultSettings } from '../models';
import { buildSlots, generateSchedule, isAvailable } from '../solver';

const player = (id: string, availability = [{ from: '09:00', to: '18:00' }]): Player => ({ id, firstName: id, lastName: '', level: 'Intermedio', gender: id.endsWith('d') ? 'Donna' : 'Uomo', notes: '', availability, avoidPartners: [], status: 'attivo' });
const tournament = (players: Player[], changes = {}): Tournament => ({ id: 't', name: 'Test', players, matches: [], settings: { ...defaultSettings, date: '2026-07-15', start: '09:00', end: '14:00', playMinutes: 12, warmupMinutes: 3, pauses: [], targetMatchesPerPlayer: 8, prioritizeMixed: true, ...changes } });

describe('generatore baraonda', () => {
  it('non schiera un giocatore disponibile solo fino alle 13:00 oltre tale orario', () => {
    const early = player('early', [{ from: '09:00', to: '13:00' }]); const t = tournament([early, ...['a', 'b', 'c', 'd'].map(id => player(id))]);
    expect(generateSchedule(t).filter(match => match.players.includes('early')).every(match => match.start < '13:00')).toBe(true);
  });
  it('non schiera un giocatore che arriva dopo le 12:00 prima del suo arrivo', () => {
    const late = player('late', [{ from: '12:00', to: '14:00' }]); const t = tournament([late, ...['a', 'b', 'c', 'd'].map(id => player(id))]);
    expect(generateSchedule(t).filter(match => match.players.includes('late')).every(match => match.start >= '12:00')).toBe(true);
  });
  it('non crea slot dentro la pausa pranzo', () => {
    const t = tournament(['a', 'b', 'c', 'd'].map(id => player(id)), { pauses: [{ from: '12:00', to: '13:00' }] });
    expect(buildSlots(t.settings).every(slot => slot.end <= '12:00' || slot.start >= '13:00')).toBe(true);
  });
  it("non mette due incompatibili nella stessa coppia quando esiste un'alternativa", () => {
    const a = player('a'); const b = player('b'); a.avoidPartners = ['b']; b.avoidPartners = ['a']; const matches = generateSchedule(tournament([a, b, player('c'), player('d')]));
    expect(matches.every(match => !((match.players[0] === 'a' && match.players[1] === 'b') || (match.players[0] === 'b' && match.players[1] === 'a') || (match.players[2] === 'a' && match.players[3] === 'b') || (match.players[2] === 'b' && match.players[3] === 'a')))).toBe(true);
  });
  it('ripartisce 36 slot fra 19 giocatori con uno scarto massimo di una presenza', () => {
    const players = Array.from({ length: 19 }, (_, i) => player(`p${i}`)); const t = tournament(players, { end: '18:00' }); const matches = generateSchedule(t);
    const counts = new Map(players.map(p => [p.id, 0])); matches.forEach(match => match.players.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
    expect(matches).toHaveLength(36); expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });
  it('conserva le partite bloccate durante la rigenerazione', () => {
    const t = tournament(['a', 'b', 'c', 'd', 'e'].map(id => player(id))); const original = generateSchedule(t); const locked = { ...original[0], locked: true };
    const regenerated = generateSchedule({ ...t, matches: [locked] });
    expect(regenerated.find(match => match.start === locked.start)).toEqual(locked);
  });
  it('la disponibilità è un vincolo duro del solver', () => expect(isAvailable(player('a', [{ from: '09:00', to: '10:00' }]), 600, 615)).toBe(false));
  it('integra un giocatore aggiunto dopo, togliendo partite ai presenti, senza toccare le bloccate', () => {
    const original4 = ['a', 'b', 'c', 'd'].map(id => player(id));
    const t = tournament(original4, { end: '18:00' });
    const firstPass = generateSchedule(t);
    const locked = { ...firstPass[0], locked: true };
    const withLate = tournament([...original4, player('late')], { end: '18:00' });
    const regenerated = generateSchedule({ ...withLate, matches: [locked] });
    expect(regenerated.find(match => match.start === locked.start)).toEqual(locked);
    expect(regenerated.some(match => match.players.includes('late'))).toBe(true);
    const counts = new Map(withLate.players.map(p => [p.id, 0])); regenerated.forEach(match => match.players.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });
  it('non affama i giocatori con livelli scomodi: 2 principianti e 6 avanzati restano entro uno scarto di 1', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ ...player(`p${i}`), level: (i < 2 ? 'Principiante' : 'Avanzato') as Player['level'] }));
    const matches = generateSchedule(tournament(players, { end: '18:00' }));
    const counts = new Map(players.map(p => [p.id, 0])); matches.forEach(match => match.players.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
  });
  it('un giocatore con finestra stretta gioca comunque la sua parte dentro la finestra', () => {
    const narrow = player('narrow', [{ from: '12:00', to: '14:00' }]);
    const t = tournament([...Array.from({ length: 12 }, (_, i) => player(`p${i}`)), narrow]);
    const matches = generateSchedule(t);
    const narrowMatches = matches.filter(match => match.players.includes('narrow'));
    expect(narrowMatches.length).toBeGreaterThanOrEqual(6);
    expect(narrowMatches.every(match => match.start >= '12:00')).toBe(true);
  });
  it("l'equità non dipende dall'ordine dei giocatori nella rosa", () => {
    const players = Array.from({ length: 5 }, (_, i) => player(`p${i}`));
    const countsFor = (roster: Player[]) => {
      const matches = generateSchedule(tournament(roster, { end: '10:30' }));
      const counts = new Map(roster.map(p => [p.id, 0])); matches.forEach(match => match.players.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
      return counts;
    };
    const forward = countsFor(players); const backward = countsFor([...players].reverse());
    expect(Math.max(...forward.values()) - Math.min(...forward.values())).toBeLessThanOrEqual(1);
    expect(Math.max(...backward.values()) - Math.min(...backward.values())).toBeLessThanOrEqual(1);
    expect([...forward.values()].sort()).toEqual([...backward.values()].sort());
  });
  it('le incompatibilità restano rigide anche quando i conteggi sono sbilanciati', () => {
    const roster = ['a', 'b', 'c', 'd', 'e'].map(id => player(id));
    roster[0].avoidPartners = ['b', 'c', 'd'];
    roster[1].avoidPartners = ['a']; roster[2].avoidPartners = ['a']; roster[3].avoidPartners = ['a'];
    const matches = generateSchedule(tournament(roster));
    const teammateOfA = (match: { players: string[] }) => match.players[0] === 'a' ? match.players[1] : match.players[1] === 'a' ? match.players[0] : match.players[2] === 'a' ? match.players[3] : match.players[3] === 'a' ? match.players[2] : null;
    expect(matches.filter(match => match.players.includes('a')).every(match => teammateOfA(match) === 'e')).toBe(true);
    expect(matches.every(match => match.violations.every(violation => !violation.includes('incompatibilità')))).toBe(true);
  });
  it('il target di partite è una priorità, non un tetto: gli slot si riempiono comunque', () => {
    const matches = generateSchedule(tournament(['a', 'b', 'c', 'd', 'e'].map(id => player(id)), { targetMatchesPerPlayer: 2 }));
    expect(matches).toHaveLength(20);
    const counts = new Map<string, number>(); matches.forEach(match => match.players.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
    expect([...counts.values()]).toEqual([16, 16, 16, 16, 16]);
  });
  it('il calendario generato è deterministico', () => {
    const build = () => generateSchedule(tournament(Array.from({ length: 19 }, (_, i) => player(`p${i}`)), { end: '18:00' }));
    expect(build().map(match => match.players)).toEqual(build().map(match => match.players));
  });
  it('genera in meno di un secondo con 30 giocatori e ~40 slot', () => {
    const players = Array.from({ length: 30 }, (_, i) => ({ ...player(`p${i}`, i % 7 === 0 ? [{ from: '12:00', to: '16:00' }] : [{ from: '09:00', to: '19:00' }]), level: (['Principiante', 'Intermedio', 'Avanzato'] as const)[i % 3] }));
    players[0].avoidPartners = ['p1']; players[1].avoidPartners = ['p0'];
    const started = performance.now();
    const matches = generateSchedule(tournament(players, { end: '19:00' }));
    expect(performance.now() - started).toBeLessThan(1000);
    expect(matches.length).toBeGreaterThan(0);
  });
});
