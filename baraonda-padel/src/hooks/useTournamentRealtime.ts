import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/** Supabase Postgres Changes is primary sync; local polling remains only as a fallback in local demo mode. */
export function useTournamentRealtime(tournamentId: string | undefined, onChange: () => void) {
  useEffect(() => {
    const client = supabase;
    if (!client || !tournamentId) return undefined;
    const channel = client.channel(`tournament:${tournamentId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, onChange).on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `tournament_id=eq.${tournamentId}` }, onChange).on('postgres_changes', { event: '*', schema: 'public', table: 'player_constraints', filter: `tournament_id=eq.${tournamentId}` }, onChange).on('postgres_changes', { event: '*', schema: 'public', table: 'player_availability' }, onChange).on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_breaks', filter: `tournament_id=eq.${tournamentId}` }, onChange).on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` }, onChange).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [onChange, tournamentId]);
}
