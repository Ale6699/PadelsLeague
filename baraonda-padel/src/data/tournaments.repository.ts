import { Settings, Tournament, TournamentStatus } from '../models';
import { AppError, mapSupabaseError } from './errors';
import { mapMatchDomainToInsert, mapMatchRowToDomain } from './mappers/match.mapper';
import { mapAvailabilityDomainToInsert, mapAvailabilityRowToDomain, mapPlayerDomainToInsert, mapPlayerRowToDomain } from './mappers/player.mapper';
import { mapTournamentDomainToInsert, mapTournamentRowToDomain } from './mappers/tournament.mapper';
import { requireSupabase } from '../lib/supabase';

export type UpdateTournamentInput = {
  name: string; settings: Settings; notes: string; status: TournamentStatus; isPublic: boolean;
  publicSlug: string; scheduleNeedsRegeneration: boolean; timerSoundEnabled: boolean;
};
export type DeleteTournamentResult = { deleted: boolean; conflict: boolean };
export interface TournamentRepository { list(): Promise<Tournament[]>; save(tournament: Tournament): Promise<void>; importSnapshot(tournament: Tournament): Promise<void>; update(id: string, input: UpdateTournamentInput, expectedVersion: number): Promise<Tournament>; remove(id: string, expectedVersion?: number): Promise<void>; replaceSchedule(tournament: Tournament, expectedVersion: number): Promise<void>; }
const fail = (error: unknown): never => { throw mapSupabaseError(error); };

export class SupabaseTournamentRepository implements TournamentRepository {
  async list() {
    const client = requireSupabase(); const { data: rows, error } = await client.from('tournaments').select('*').order('updated_at', { ascending: false }); if (error) return fail(error);
    return Promise.all((rows ?? []).map(async row => {
      const tournament = mapTournamentRowToDomain(row); const [{ data: playerRows, error: playerError }, { data: matchRows, error: matchError }, { data: breakRows, error: breakError }, { data: constraintRows, error: constraintError }] = await Promise.all([client.from('players').select('*').eq('tournament_id', row.id).order('sort_order'), client.from('matches').select('*').eq('tournament_id', row.id).order('sequence_number'), client.from('tournament_breaks').select('*').eq('tournament_id', row.id).order('starts_at'), client.from('player_constraints').select('*').eq('tournament_id', row.id).order('player_b_id')]);
      if (playerError || matchError || breakError || constraintError) return fail(playerError ?? matchError ?? breakError ?? constraintError);
      const playerIds = (playerRows ?? []).map(player => player.id); const { data: availabilityRows, error: availabilityError } = playerIds.length ? await client.from('player_availability').select('*').in('player_id', playerIds).order('available_from').order('available_until') : { data: [], error: null };
      if (availabilityError) return fail(availabilityError);
      tournament.players = (playerRows ?? []).map(mapPlayerRowToDomain); tournament.matches = (matchRows ?? []).map(mapMatchRowToDomain); tournament.settings.pauses = (breakRows ?? []).map(item => ({ from: new Date(item.starts_at).toISOString().slice(11, 16), to: new Date(item.ends_at).toISOString().slice(11, 16) }));
      (availabilityRows ?? []).forEach(item => { const player = tournament.players.find(candidate => candidate.id === item.player_id); if (player) player.availability.push(mapAvailabilityRowToDomain(item)); });
      (constraintRows ?? []).forEach(item => { const player = tournament.players.find(candidate => candidate.id === item.player_a_id); if (player) player.avoidPartners.push(item.player_b_id); });
      return tournament;
    }));
  }
  async save(tournament: Tournament) {
    const client = requireSupabase(); const { data: { user }, error: userError } = await client.auth.getUser(); if (userError || !user) return fail(userError ?? new Error('AUTH_REQUIRED'));
    const ownedTournament = { ...tournament, ownerId: user.id }; const { data: existing, error: lookupError } = await client.from('tournaments').select('id').eq('id', tournament.id).maybeSingle(); if (lookupError) return fail(lookupError); if (!existing) { const { error: tournamentError } = await client.from('tournaments').insert(mapTournamentDomainToInsert(ownedTournament)); if (tournamentError) return fail(tournamentError); }
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
    const mappedMatches = tournament.matches.map((match, index) => ({ match, payload: mapMatchDomainToInsert(match, tournament.id, index + 1, tournament.settings.date) }));
    const matchesWithoutLiveState = mappedMatches.filter(item => !item.match.liveState).map(item => item.payload);
    if (matchesWithoutLiveState.length) { const { error: matchesError } = await client.from('matches').upsert(matchesWithoutLiveState); if (matchesError) return fail(matchesError); }
    for (const item of mappedMatches.filter(candidate => candidate.match.liveState)) {
      const payload = { ...item.payload } as Record<string, unknown>;
      ['team_a_games', 'team_b_games', 'status', 'live_team_a_points', 'live_team_b_points', 'live_advantage_team', 'timer_status', 'timer_duration_ms', 'timer_remaining_ms', 'timer_started_at', 'timer_ends_at', 'serving_team', 'live_state'].forEach(key => delete payload[key]);
      const { error: matchError } = await client.from('matches').upsert(payload); if (matchError) return fail(matchError);
      const liveState = item.match.liveState!;
      const lastUpdated = Math.max(liveState.lastUpdated, liveState.score.lastUpdated, liveState.timer.updatedAt);
      const { data: saved, error: liveError } = await client.rpc('save_live_match_state', { p_match_id: item.match.id, p_live_state: liveState, p_status: item.match.status ?? 'scheduled', p_last_updated: lastUpdated });
      if (liveError) return fail(liveError); if (saved === false) return fail({ status: 409, message: 'VERSION_CONFLICT' });
    }
    const scoreActions = tournament.matches.flatMap(match => (match.liveState?.history ?? []).map(action => ({ match_id: match.id, client_action_id: action.id, action_type: action.type, previous_score: action.previousScore, next_score: action.nextScore, created_at: new Date(action.timestamp).toISOString() })));
    if (scoreActions.length) { const { error } = await client.from('match_score_actions').upsert(scoreActions, { onConflict: 'client_action_id', ignoreDuplicates: true }); if (error) return fail(error); }
  }
  async importSnapshot(tournament: Tournament) { const { error } = await requireSupabase().rpc('import_tournament_snapshot', { p_snapshot: tournament }); if (error) return fail(error); }
  async update(id: string, input: UpdateTournamentInput, expectedVersion: number) {
    const client = requireSupabase(); const { data: { user }, error: userError } = await client.auth.getUser(); if (userError || !user) return fail(userError ?? new Error('AUTH_REQUIRED'));
    const candidate = { id, ownerId: user.id, players: [], matches: [], ...input } as Tournament;
    const payload = mapTournamentDomainToInsert(candidate); delete (payload as Partial<typeof payload>).id; delete (payload as Partial<typeof payload>).owner_id;
    const { data, error } = await client.from('tournaments').update(payload).eq('id', id).eq('owner_id', user.id).eq('version', expectedVersion).select('*').maybeSingle();
    if (error) return fail(error); if (!data) return fail({ status: 409, message: 'VERSION_CONFLICT' });
    const { error: deleteBreaksError } = await client.from('tournament_breaks').delete().eq('tournament_id', id); if (deleteBreaksError) return fail(deleteBreaksError);
    if (input.settings.pauses.length) { const { error: breaksError } = await client.from('tournament_breaks').insert(input.settings.pauses.map(pause => ({ tournament_id: id, starts_at: `${input.settings.date}T${pause.from}:00`, ends_at: `${input.settings.date}T${pause.to}:00` }))); if (breaksError) return fail(breaksError); }
    return mapTournamentRowToDomain(data);
  }
  async remove(id: string, expectedVersion?: number) {
    const { data, error } = await requireSupabase().rpc('delete_tournament', { p_tournament_id: id, p_expected_version: expectedVersion ?? null }); if (error) return fail(error);
    const result = data as unknown as DeleteTournamentResult; if (result?.conflict) return fail({ status: 409, message: 'VERSION_CONFLICT' }); if (!result?.deleted) return fail({ status: 404, message: 'TOURNAMENT_NOT_FOUND' });
  }
  async replaceSchedule(tournament: Tournament, expectedVersion: number) { const replaceable = tournament.matches.filter(match => !match.locked && match.status !== 'completed'); const { error } = await requireSupabase().rpc('replace_tournament_schedule', { p_tournament_id: tournament.id, p_expected_version: expectedVersion, p_matches: replaceable.map((match, index) => ({ ...mapMatchDomainToInsert(match, tournament.id, index + 1, tournament.settings.date), starts_at: `${tournament.settings.date}T${match.start}:00`, ends_at: `${tournament.settings.date}T${match.end}:00` })) }); if (error) return fail(error); }
}

export const isAppError = (value: unknown): value is AppError => typeof value === 'object' && value !== null && 'code' in value;
