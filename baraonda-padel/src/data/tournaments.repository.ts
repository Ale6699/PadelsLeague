import { Tournament } from '../models';
import { AppError, mapSupabaseError } from './errors';
import { mapMatchDomainToInsert, mapMatchRowToDomain } from './mappers/match.mapper';
import { mapAvailabilityDomainToInsert, mapAvailabilityRowToDomain, mapPlayerDomainToInsert, mapPlayerRowToDomain } from './mappers/player.mapper';
import { mapTournamentDomainToInsert, mapTournamentRowToDomain } from './mappers/tournament.mapper';
import { requireSupabase } from '../lib/supabase';

export interface TournamentRepository { list(): Promise<Tournament[]>; save(tournament: Tournament): Promise<void>; importSnapshot(tournament: Tournament): Promise<void>; remove(id: string): Promise<void>; replaceSchedule(tournament: Tournament, expectedVersion: number): Promise<void>; }
const fail = (error: unknown): never => { throw mapSupabaseError(error); };

export class SupabaseTournamentRepository implements TournamentRepository {
  async list() {
    const client = requireSupabase(); const { data: rows, error } = await client.from('tournaments').select('*').order('updated_at', { ascending: false }); if (error) return fail(error);
    return Promise.all((rows ?? []).map(async row => {
      const tournament = mapTournamentRowToDomain(row); const [{ data: playerRows, error: playerError }, { data: matchRows, error: matchError }, { data: breakRows, error: breakError }, { data: constraintRows, error: constraintError }] = await Promise.all([client.from('players').select('*').eq('tournament_id', row.id).order('sort_order'), client.from('matches').select('*').eq('tournament_id', row.id).order('sequence_number'), client.from('tournament_breaks').select('*').eq('tournament_id', row.id).order('starts_at'), client.from('player_constraints').select('*').eq('tournament_id', row.id)]);
      if (playerError || matchError || breakError || constraintError) return fail(playerError ?? matchError ?? breakError ?? constraintError);
      const playerIds = (playerRows ?? []).map(player => player.id); const { data: availabilityRows, error: availabilityError } = playerIds.length ? await client.from('player_availability').select('*').in('player_id', playerIds) : { data: [], error: null };
      if (availabilityError) return fail(availabilityError);
      tournament.players = (playerRows ?? []).map(mapPlayerRowToDomain); tournament.matches = (matchRows ?? []).map(mapMatchRowToDomain); tournament.settings.pauses = (breakRows ?? []).map(item => ({ from: new Date(item.starts_at).toTimeString().slice(0, 5), to: new Date(item.ends_at).toTimeString().slice(0, 5) }));
      (availabilityRows ?? []).forEach(item => { const player = tournament.players.find(candidate => candidate.id === item.player_id); if (player) player.availability.push(mapAvailabilityRowToDomain(item)); });
      (constraintRows ?? []).forEach(item => { const player = tournament.players.find(candidate => candidate.id === item.player_a_id); if (player) player.avoidPartners.push(item.player_b_id); });
      return tournament;
    }));
  }
  async save(tournament: Tournament) {
    const client = requireSupabase(); const { error: tournamentError } = await client.from('tournaments').upsert(mapTournamentDomainToInsert(tournament)); if (tournamentError) return fail(tournamentError);
    const players = tournament.players.map((player, index) => mapPlayerDomainToInsert(player, tournament.id, index));
    if (players.length) { const { error: playersError } = await client.from('players').upsert(players); if (playersError) return fail(playersError); }
    const playerIds = tournament.players.map(player => player.id);
    if (playerIds.length) { const { error } = await client.from('player_availability').delete().in('player_id', playerIds); if (error) return fail(error); }
    const availability = tournament.players.flatMap(player => player.availability.map(slot => mapAvailabilityDomainToInsert(slot, player.id, tournament.settings.date)));
    if (availability.length) { const { error } = await client.from('player_availability').insert(availability); if (error) return fail(error); }
    const { error: deleteConstraintsError } = await client.from('player_constraints').delete().eq('tournament_id', tournament.id); if (deleteConstraintsError) return fail(deleteConstraintsError);
    const constraints = tournament.players.flatMap(player => player.avoidPartners.filter(other => player.id < other).map(other => ({ tournament_id: tournament.id, player_a_id: player.id, player_b_id: other, constraint_type: 'cannot_be_teammates' })));
    if (constraints.length) { const { error } = await client.from('player_constraints').insert(constraints); if (error) return fail(error); }
    const { error: deleteBreaksError } = await client.from('tournament_breaks').delete().eq('tournament_id', tournament.id); if (deleteBreaksError) return fail(deleteBreaksError);
    if (tournament.settings.pauses.length) { const { error } = await client.from('tournament_breaks').insert(tournament.settings.pauses.map(pause => ({ tournament_id: tournament.id, starts_at: `${tournament.settings.date}T${pause.from}:00`, ends_at: `${tournament.settings.date}T${pause.to}:00` }))); if (error) return fail(error); }
    const matches = tournament.matches.map((match, index) => mapMatchDomainToInsert(match, tournament.id, index + 1, tournament.settings.date));
    if (matches.length) { const { error: matchesError } = await client.from('matches').upsert(matches); if (matchesError) return fail(matchesError); }
    const scoreActions = tournament.matches.flatMap(match => (match.liveState?.history ?? []).map(action => ({ match_id: match.id, client_action_id: action.id, action_type: action.type, previous_score: action.previousScore, next_score: action.nextScore, created_at: new Date(action.timestamp).toISOString() })));
    if (scoreActions.length) { const { error } = await client.from('match_score_actions').upsert(scoreActions, { onConflict: 'client_action_id', ignoreDuplicates: true }); if (error) return fail(error); }
  }
  async importSnapshot(tournament: Tournament) { const { error } = await requireSupabase().rpc('import_tournament_snapshot', { p_snapshot: tournament }); if (error) return fail(error); }
  async remove(id: string) { const { error } = await requireSupabase().from('tournaments').delete().eq('id', id); if (error) return fail(error); }
  async replaceSchedule(tournament: Tournament, expectedVersion: number) { const { error } = await requireSupabase().rpc('replace_tournament_schedule', { p_tournament_id: tournament.id, p_expected_version: expectedVersion, p_matches: tournament.matches.map((match, index) => ({ ...mapMatchDomainToInsert(match, tournament.id, index + 1, tournament.settings.date), starts_at: `${tournament.settings.date}T${match.start}:00`, ends_at: `${tournament.settings.date}T${match.end}:00` })) }); if (error) return fail(error); }
}

export const isAppError = (value: unknown): value is AppError => typeof value === 'object' && value !== null && 'code' in value;
