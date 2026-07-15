import { Tournament } from './models';

export type TournamentSnapshot = { tournaments: Tournament[]; lastUpdated: number };

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
      if (Array.isArray(stored)) return { tournaments: stored, lastUpdated: 0 };
      return { tournaments: Array.isArray(stored.tournaments) ? stored.tournaments : [], lastUpdated: stored.lastUpdated ?? 0 };
    } catch { return { tournaments: [], lastUpdated: 0 }; }
  }
  load() { return this.loadSnapshot().tournaments; }
  save(tournaments: Tournament[]) {
    const current = this.loadSnapshot();
    // Do not emit a storage event or overwrite the timestamp when nothing changed.
    if (JSON.stringify(current.tournaments) === JSON.stringify(tournaments)) return current.lastUpdated;
    const lastUpdated = Date.now();
    localStorage.setItem(this.key, JSON.stringify({ tournaments, lastUpdated } satisfies TournamentSnapshot));
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
