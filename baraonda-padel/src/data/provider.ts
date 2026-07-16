import { Tournament } from '../models';
import { isSupabaseConfigured } from '../lib/supabase';
import { tournamentStore } from '../storage';
import { AppError } from './errors';
import { SupabaseTournamentRepository, UpdateTournamentInput } from './tournaments.repository';

export type DataProvider = {
  kind: 'local' | 'supabase';
  list: () => Promise<Tournament[]>;
  save: (tournaments: Tournament[]) => Promise<void>;
  update: (id: string, input: UpdateTournamentInput, expectedVersion: number) => Promise<Tournament>;
  remove: (id: string, expectedVersion?: number) => Promise<void>;
  replaceSchedule: (tournament: Tournament, expectedVersion: number) => Promise<void>;
  importSnapshots?: (tournaments: Tournament[]) => Promise<void>;
};

const localProvider: DataProvider = {
  kind: 'local',
  list: async () => tournamentStore.load(),
  save: async tournaments => { tournamentStore.save(tournaments); },
  update: async (id, input, expectedVersion) => {
    const tournaments = tournamentStore.load(); const current = tournaments.find(item => item.id === id);
    if (!current) throw { code: 'not_found', message: 'Torneo non trovato.' } satisfies AppError;
    if ((current.version ?? 1) !== expectedVersion) throw { code: 'conflict', message: 'Il torneo è stato modificato da un’altra schermata.' } satisfies AppError;
    const updated = { ...current, ...input, version: expectedVersion + 1, updatedAt: new Date().toISOString() };
    tournamentStore.save(tournaments.map(item => item.id === id ? updated : item)); return updated;
  },
  remove: async (id, expectedVersion) => {
    const tournaments = tournamentStore.load(); const current = tournaments.find(item => item.id === id);
    if (!current) throw { code: 'not_found', message: 'Torneo non trovato.' } satisfies AppError;
    if (expectedVersion !== undefined && (current.version ?? 1) !== expectedVersion) throw { code: 'conflict', message: 'Il torneo è stato modificato da un’altra schermata.' } satisfies AppError;
    tournamentStore.save(tournaments.filter(item => item.id !== id));
  },
  replaceSchedule: async tournament => {
    const tournaments = tournamentStore.load();
    tournamentStore.save(tournaments.map(item => item.id === tournament.id ? { ...tournament, scheduleNeedsRegeneration: false, version: (tournament.version ?? 1) + 1 } : item));
  },
};

const supabaseRepository = new SupabaseTournamentRepository();
const supabaseProvider: DataProvider = {
  kind: 'supabase', list: () => supabaseRepository.list(),
  save: async tournaments => { for (const tournament of tournaments) await supabaseRepository.save(tournament); },
  update: (id, input, expectedVersion) => supabaseRepository.update(id, input, expectedVersion),
  remove: (id, expectedVersion) => supabaseRepository.remove(id, expectedVersion),
  replaceSchedule: (tournament, expectedVersion) => supabaseRepository.replaceSchedule(tournament, expectedVersion),
  importSnapshots: async tournaments => { for (const tournament of tournaments) await supabaseRepository.importSnapshot(tournament); },
};

/** Supabase is the primary source when configured; local mode remains an offline demo and cache. */
export const isLocalDemo = import.meta.env.VITE_DATA_PROVIDER === 'local' || !isSupabaseConfigured;
export const dataProvider: DataProvider = isLocalDemo ? localProvider : supabaseProvider;
