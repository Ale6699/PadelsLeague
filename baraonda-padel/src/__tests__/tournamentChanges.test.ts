import { describe, expect, it } from 'vitest';
import { makeTournament } from '../models';
import { applyTournamentFormValues, getTournamentChanges, normalizeTournamentConfirmation, tournamentToFormValues } from '../domain/tournaments/tournamentChanges';
import { validateTournament } from '../domain/tournaments/tournamentValidation';

describe('modifica torneo', () => {
  it('precarica tutti i valori correnti', () => {
    const tournament = makeTournament('Baraonda'); tournament.notes = 'Note'; tournament.publicSlug = 'baraonda'; tournament.settings.playMinutes = 15;
    expect(tournamentToFormValues(tournament)).toMatchObject({ name: 'Baraonda', notes: 'Note', publicSlug: 'baraonda', playMinutes: 15 });
  });

  it('non rileva richieste inutili', () => {
    const tournament = makeTournament('Baraonda');
    expect(getTournamentChanges(tournament, tournamentToFormValues(tournament))).toEqual({ hasChanges: false, affectsSchedule: false, changedFields: [] });
  });

  it('distingue modifiche semplici da quelle che influenzano il calendario', () => {
    const tournament = makeTournament('Baraonda'); const values = tournamentToFormValues(tournament);
    expect(getTournamentChanges(tournament, { ...values, name: 'Nuovo nome' }).affectsSchedule).toBe(false);
    expect(getTournamentChanges(tournament, { ...values, playMinutes: 18 })).toMatchObject({ hasChanges: true, affectsSchedule: true });
  });

  it('applica solo i campi modificabili e preserva identità e proprietario', () => {
    const tournament = makeTournament('Baraonda', 'owner'); const values = { ...tournamentToFormValues(tournament), name: '  Nuovo  ', notes: ' nota ' };
    expect(applyTournamentFormValues(tournament, values)).toMatchObject({ id: tournament.id, ownerId: 'owner', name: 'Nuovo', notes: 'nota' });
  });

  it('valida nome, orari, durate, game, slug e note', () => {
    const values = { ...tournamentToFormValues(makeTournament()), name: '', end: '09:00', playMinutes: 0, warmupMinutes: -1, maxGamesPerMatch: 0, publicSlug: 'Slug non valido!', notes: 'x'.repeat(2001) };
    expect(Object.keys(validateTournament(values))).toEqual(expect.arrayContaining(['name', 'end', 'playMinutes', 'warmupMinutes', 'maxGamesPerMatch', 'publicSlug', 'notes']));
  });

  it('normalizza il nome richiesto dalla conferma distruttiva', () => {
    expect(normalizeTournamentConfirmation('  Baraonda   Padel  ')).toBe(normalizeTournamentConfirmation('baraonda padel'));
  });
});
