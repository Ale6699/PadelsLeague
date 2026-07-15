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
});
