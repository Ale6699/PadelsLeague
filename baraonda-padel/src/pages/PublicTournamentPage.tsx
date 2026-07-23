import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicDisplay } from '../components/PublicDisplay';
import { getStandings } from '../services/standings';
import { defaultSettings, Player, Tournament } from '../models';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { tournamentStore } from '../storage';
import { normalizeLiveMatchState } from '../services/liveMatch';
import { findPublicTournamentBySlug, PublicView, publicViewFromPath, publicViewPath } from '../publicView';

const toPublicTournament = (row: any, playerRows: any[], matchRows: any[]): Tournament => ({ id: row.id, name: row.name, settings: { ...defaultSettings, title: row.public_title || row.name, date: row.tournament_date || defaultSettings.date, start: String(row.start_time || '10:00').slice(0, 5), end: String(row.end_time || '19:00').slice(0, 5), playMinutes: row.match_duration_minutes || 12, warmupMinutes: row.transition_duration_minutes || 3, pauses: [] }, players: playerRows.map((player): Player => ({ id: player.id, firstName: player.first_name, lastName: player.last_name, level: 'Intermedio', gender: 'Altro', notes: '', availability: [], avoidPartners: [], status: 'attivo' })), matches: matchRows.map(match => ({ id: match.id, start: new Date(match.starts_at).toISOString().slice(11, 16), end: new Date(match.ends_at).toISOString().slice(11, 16), players: [match.team_a_player_1_id || '', match.team_a_player_2_id || '', match.team_b_player_1_id || '', match.team_b_player_2_id || ''], locked: true, violations: [], status: match.status, result: { aGames: match.team_a_games, bGames: match.team_b_games }, liveState: match.live_state ? normalizeLiveMatchState(match.live_state, row.match_duration_minutes || 12, row.max_games_per_match || 6) : undefined })) });

export function PublicTournamentPage({ slug }: { slug: string }) {
  const [tournament, setTournament] = useState<Tournament | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [bettingEnabled, setBettingEnabled] = useState(false);
  const [view, setView] = useState<PublicView>(() => publicViewFromPath(window.location.pathname));
  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      const local = findPublicTournamentBySlug(tournamentStore.load(), slug);
      setTournament(local ?? null);
      setBettingEnabled(Boolean(local?.bettingEnabled));
      setError(local ? null : 'Questo torneo non è disponibile.');
      setLoading(false);
      return Boolean(local);
    }
    const { data: row, error: tournamentError } = await supabase.from('public_tournaments').select('*').eq('public_slug', slug).maybeSingle();
    setBettingEnabled(Boolean(row?.betting_enabled));
    if (tournamentError || !row) { setTournament(null); setError('Questo torneo non è disponibile.'); setLoading(false); return false; }
    const [{ data: players, error: playersError }, { data: matches, error: matchesError }] = await Promise.all([supabase.from('public_players').select('*').eq('tournament_id', row.id), supabase.from('public_matches').select('*').eq('tournament_id', row.id).order('starts_at')]);
    if (playersError || matchesError) { setError('Non è stato possibile caricare lo schermo pubblico.'); setLoading(false); return false; }
    setTournament(toPublicTournament(row, players ?? [], matches ?? [])); setLoading(false); return true;
  }, [slug]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !tournament?.id) return undefined;
    const channel = supabase.channel(`public-tournament:${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${tournament.id}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `tournament_id=eq.${tournament.id}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [load, tournament?.id]);
  const standings = useMemo(() => tournament ? getStandings(tournament) : [], [tournament]);
  const changeView = (nextView: PublicView) => { window.history.replaceState({}, '', publicViewPath(slug, nextView)); setView(nextView); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  if (loading) return <main className="auth-loading">Caricamento schermo torneo…</main>;
  if (!tournament) return <main className="auth-loading">{error ?? 'Torneo non trovato.'}</main>;
  return <>
    {bettingEnabled && <a className="betting-float-cta" href={`/public/${encodeURIComponent(slug)}/scommesse`}>🪙 Scommetti</a>}
    <PublicDisplay tournament={tournament} standings={standings} reloadTournament={() => { void load(); return true; }} storageKey={tournamentStore.storageKey} view={view} onViewChange={changeView} />
  </>;
}
