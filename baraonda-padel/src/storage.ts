import { Tournament } from './models';
import { normalizeLiveMatchState } from './services/liveMatch';

export type TournamentSnapshot = { tournaments: Tournament[]; lastUpdated: number };
const scoreOrNull = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
const normalizeTournaments = (tournaments: Tournament[]) => tournaments.map(tournament => ({ ...tournament, matches: tournament.matches.map(match => {
  const liveState = match.liveState ? normalizeLiveMatchState(match.liveState, tournament.settings.playMinutes, tournament.settings.maxGamesPerMatch) : undefined;
  if (!match.result) return { ...match, liveState };
  const aGames = scoreOrNull(match.result.aGames); const bGames = scoreOrNull(match.result.bGames);
  // Preserve winner-only historical data, but scores become the sole source as soon as either score exists.
  return aGames === null && bGames === null && match.result.outcome ? { ...match, liveState, result: { aGames, bGames, outcome: match.result.outcome } } : { ...match, liveState, result: { aGames, bGames } };
}) }));

export interface TournamentStore {
  load(): Tournament[];
  save(tournaments: Tournament[]): number;
  loadSnapshot(): TournamentSnapshot;
  reloadTournament(lastKnownUpdate: number, current: Tournament[]): TournamentSnapshot | null;
}

/** Browser implementation. The app only depends on this interface, so it can later use SQLite or Supabase. */
export class LocalTournamentStore implements TournamentStore {
  constructor(private readonly key = 'baraonda-padel-v2') {}
  loadSnapshot(): TournamentSnapshot {
    try {
      const stored = JSON.parse(localStorage.getItem(this.key) ?? '[]') as Tournament[] | TournamentSnapshot;
      // Keeps tournaments saved by versions before the refresh feature readable.
      if (Array.isArray(stored)) return { tournaments: normalizeTournaments(stored), lastUpdated: 0 };
      return { tournaments: normalizeTournaments(Array.isArray(stored.tournaments) ? stored.tournaments : []), lastUpdated: stored.lastUpdated ?? 0 };
    } catch { return { tournaments: [], lastUpdated: 0 }; }
  }
  load() { return this.loadSnapshot().tournaments; }
  save(tournaments: Tournament[]) {
    const normalized = normalizeTournaments(tournaments);
    const current = this.loadSnapshot();
    // Do not emit a storage event or overwrite the timestamp when nothing changed.
    if (JSON.stringify(current.tournaments) === JSON.stringify(normalized)) return current.lastUpdated;
    const lastUpdated = Date.now();
    localStorage.setItem(this.key, JSON.stringify({ tournaments: normalized, lastUpdated } satisfies TournamentSnapshot));
    return lastUpdated;
  }
  /**
   * Read-through operation used by the public screen. Returning null keeps React
   * state untouched when another tab did not actually save newer tournament data.
   * A Supabase Realtime adapter can implement the same contract later.
   */
  reloadTournament(lastKnownUpdate: number, current: Tournament[]) {
    const snapshot = this.loadSnapshot();
    if (snapshot.lastUpdated && snapshot.lastUpdated === lastKnownUpdate) return null;
    return JSON.stringify(snapshot.tournaments) === JSON.stringify(current) ? null : snapshot;
  }
  get storageKey() { return this.key; }
}

export const tournamentStore = new LocalTournamentStore();
