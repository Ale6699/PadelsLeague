import { describe, expect, it } from 'vitest';
import { migrateLegacyTournaments } from '../data/migrateLegacy';
import { makeTournament } from '../models';

describe('migrateLegacyTournaments', () => {
  it('remaps legacy ids and every player reference consistently', () => {
    const tournament = makeTournament('Locale');
    tournament.id = 'legacy-tournament';
    tournament.players = [{ id: 'a', firstName: 'Ada', lastName: '', level: 'Intermedio', gender: 'Donna', notes: '', status: 'attivo', availability: [], avoidPartners: ['b'] }, { id: 'b', firstName: 'Bruno', lastName: '', level: 'Intermedio', gender: 'Uomo', notes: '', status: 'attivo', availability: [], avoidPartners: [] }];
    tournament.matches = [{ id: 'match', start: '10:00', end: '10:15', players: ['a', 'b', 'a', 'b'], locked: false, violations: [] }];
    let sequence = 0;
    const migrated = migrateLegacyTournaments([tournament], () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`)[0];
    expect(migrated.id).toMatch(/^00000000/);
    expect(migrated.matches[0].players).toEqual([migrated.players[0].id, migrated.players[1].id, migrated.players[0].id, migrated.players[1].id]);
    expect(migrated.players[0].avoidPartners).toEqual([migrated.players[1].id]);
  });
});
