import { Tournament } from '../models';
import { isSupabaseConfigured } from '../lib/supabase';
import { tournamentStore } from '../storage';
import { SupabaseTournamentRepository } from './tournaments.repository';

export type DataProvider = { kind: 'local' | 'supabase'; list: () => Promise<Tournament[]>; save: (tournaments: Tournament[]) => Promise<void>; importSnapshots?: (tournaments: Tournament[]) => Promise<void> };
const localProvider: DataProvider = { kind: 'local', list: async () => tournamentStore.load(), save: async tournaments => { tournamentStore.save(tournaments); } };
const supabaseRepository = new SupabaseTournamentRepository();
const supabaseProvider: DataProvider = { kind: 'supabase', list: () => supabaseRepository.list(), save: async tournaments => { for (const tournament of tournaments) await supabaseRepository.save(tournament); }, importSnapshots: async tournaments => { for (const tournament of tournaments) await supabaseRepository.importSnapshot(tournament); } };
/** Supabase is the primary source when configured; local mode remains an offline demo and cache. */
export const isLocalDemo = import.meta.env.VITE_DATA_PROVIDER === 'local' || !isSupabaseConfigured;
export const dataProvider: DataProvider = isLocalDemo ? localProvider : supabaseProvider;
