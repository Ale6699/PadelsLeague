import { Tournament } from './models';

export interface TournamentStore {
  load(): Tournament[];
  save(tournaments: Tournament[]): void;
}

/** Browser implementation. The app only depends on this interface, so it can later use SQLite or Supabase. */
export class LocalTournamentStore implements TournamentStore {
  constructor(private readonly key = 'baraonda-padel-v2') {}
  load(): Tournament[] {
    try { return JSON.parse(localStorage.getItem(this.key) ?? '[]') as Tournament[]; }
    catch { return []; }
  }
  save(tournaments: Tournament[]) { localStorage.setItem(this.key, JSON.stringify(tournaments)); }
}

export const tournamentStore = new LocalTournamentStore();
