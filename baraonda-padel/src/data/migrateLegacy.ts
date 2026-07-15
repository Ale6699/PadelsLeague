import { Tournament, uid } from '../models';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Supabase uses UUID primary keys. Old local versions used short browser ids,
 * therefore a migration must remap every reference atomically before import.
 */
export function migrateLegacyTournaments(tournaments: Tournament[], createId = uid): Tournament[] {
  const ids = new Map<string, string>();
  const idFor = (id: string) => {
    if (!ids.has(id)) ids.set(id, UUID_PATTERN.test(id) ? id : createId());
    return ids.get(id)!;
  };

  return tournaments.map(tournament => {
    const tournamentId = idFor(tournament.id);
    const players = tournament.players.map(player => ({
      ...player,
      id: idFor(player.id),
      avoidPartners: player.avoidPartners.map(idFor),
    }));
    return {
      ...tournament,
      id: tournamentId,
      players,
      matches: tournament.matches.map(match => ({ ...match, id: idFor(match.id), players: match.players.map(idFor) as Tournament['matches'][number]['players'] })),
      previousMatches: tournament.previousMatches?.map(match => ({ ...match, id: idFor(match.id), players: match.players.map(idFor) as Tournament['matches'][number]['players'] })),
    };
  });
}
