import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Download, LogOut, Plus, SlidersHorizontal, Trophy, Tv, Upload, Users, Shuffle } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { Players } from './components/Players';
import { PublicDisplay } from './components/PublicDisplay';
import { Results } from './components/Results';
import { Schedule } from './components/Schedule';
import { SettingsView } from './components/SettingsView';
import { MatchStatus, LiveMatchState, Tournament, makeTournament } from './models';
import { MatchDashboard } from './components/MatchDashboard';
import { exportTournamentPdf } from './services/pdf';
import { getStandings } from './services/standings';
import { tournamentStore } from './storage';
import { dataProvider, isLocalDemo } from './data/provider';
import { isAppError } from './data/tournaments.repository';
import { useTournamentRealtime } from './hooks/useTournamentRealtime';
import { migrateLegacyTournaments } from './data/migrateLegacy';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuth } from './auth/useAuth';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/auth/AuthPages';
import { PublicTournamentPage } from './pages/PublicTournamentPage';
import './styles.css';
import './balance.css';
import './share.css';
import './results.css';
import './match-dashboard.css';
import './supabase.css';
import './auth.css';

const nav = [
  ['dashboard', 'Panoramica', CalendarDays], ['players', 'Giocatori', Users], ['settings', 'Configurazione', SlidersHorizontal],
  ['schedule', 'Calendario', Shuffle], ['results', 'Risultati', Trophy], ['display', 'Schermo pubblico', Tv],
] as const;

function OrganizerApp() {
  const { user, signOut } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>(() => { const saved = tournamentStore.load(); return saved.length ? saved : [makeTournament('Torneo 2026')]; });
  const [loading, setLoading] = useState(Boolean(dataProvider)); const [syncError, setSyncError] = useState<string | null>(null); const [hydrated, setHydrated] = useState(false);
  const [activeId, setActiveId] = useState(tournaments[0]?.id ?? ''); const [tab, setTab] = useState<(typeof nav)[number][0]>('dashboard'); const importer = useRef<HTMLInputElement>(null);
  const [dashboardMatchId, setDashboardMatchId] = useState<string>();
  const tournamentsRef = useRef(tournaments);
  const lastUpdatedRef = useRef(tournamentStore.loadSnapshot().lastUpdated);
  const skipNextRemoteSaveRef = useRef(false);
  const tournament = tournaments.find(item => item.id === activeId) ?? tournaments[0];
  useEffect(() => { let disposed = false; const localSnapshot = tournamentStore.load(); dataProvider.list().then(async items => {
    // First Supabase connection: import the existing local snapshot, converting legacy ids to UUIDs.
    const imported = !items.length && dataProvider.kind === 'supabase' && localSnapshot.length ? migrateLegacyTournaments(localSnapshot) : null;
    if (imported) await (dataProvider.importSnapshots?.(imported) ?? dataProvider.save(imported));
    if (!disposed) { skipNextRemoteSaveRef.current = true; setTournaments(imported ?? (items.length ? items : [makeTournament('Torneo 2026')])); setHydrated(true); }
  }).catch(error => { if (!disposed) { skipNextRemoteSaveRef.current = true; setSyncError(isAppError(error) ? error.message : 'Non è stato possibile caricare i tornei.'); setHydrated(true); } }).finally(() => { if (!disposed) setLoading(false); }); return () => { disposed = true; }; }, []);
  useEffect(() => { tournamentsRef.current = tournaments; lastUpdatedRef.current = tournamentStore.save(tournaments); if (hydrated && dataProvider.kind === 'supabase') { if (skipNextRemoteSaveRef.current) { skipNextRemoteSaveRef.current = false; return; } dataProvider.save(tournaments).catch(error => setSyncError(isAppError(error) ? error.message : 'Errore di salvataggio. I dati restano in cache locale.')); } }, [hydrated, tournaments]);
  const reloadTournaments = useCallback(() => {
    const snapshot = tournamentStore.reloadTournament(lastUpdatedRef.current, tournamentsRef.current);
    if (!snapshot) return false;
    tournamentsRef.current = snapshot.tournaments;
    lastUpdatedRef.current = snapshot.lastUpdated;
    setTournaments(snapshot.tournaments);
    setActiveId(currentId => snapshot.tournaments.some(item => item.id === currentId) ? currentId : snapshot.tournaments[0]?.id ?? '');
    return true;
  }, []);
  const reloadFromProvider = useCallback(() => { if (dataProvider.kind !== 'supabase') return; void dataProvider.list().then(items => { if (!items.length) return; setTournaments(current => { if (JSON.stringify(current) === JSON.stringify(items)) return current; skipNextRemoteSaveRef.current = true; return items; }); }).catch(error => setSyncError(isAppError(error) ? error.message : 'Connessione instabile.')); }, []);
  const update = useCallback((change: (tournament: Tournament) => Tournament) => setTournaments(items => items.map(item => item.id === tournament.id ? change(item) : item)), [tournament.id]);
  const standings = useMemo(() => getStandings(tournament), [tournament]);
  const create = () => { const next = makeTournament(`Torneo ${tournaments.length + 1}`); setTournaments(items => [...items, next]); setActiveId(next.id); setTab('settings'); };
  const exportJson = () => { const blob = new Blob([JSON.stringify(tournament, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${tournament.name || 'torneo'}.json`; a.click(); URL.revokeObjectURL(url); };
  const importJson = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(String(reader.result)) as Tournament; if (!imported.settings || !Array.isArray(imported.players) || !Array.isArray(imported.matches)) throw new Error(); const next = { ...imported, id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) }; setTournaments(items => [...items, next]); setActiveId(next.id); setTab('dashboard'); } catch { window.alert('Il file non contiene un torneo Baraonda valido.'); } }; reader.readAsText(file); };
  const dashboardMatch = tournament?.matches.find(match => match.id === dashboardMatchId);
  const persistDashboard = useCallback((liveState: LiveMatchState, status: MatchStatus) => { if (!dashboardMatchId) return; update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatchId ? { ...match, liveState, status } : match) })); }, [dashboardMatchId, update]);
  const logout = async () => { try { await signOut(); } catch { setSyncError('La sessione è stata chiusa localmente.'); } finally { tournamentStore.save([]); setTournaments([]); window.location.assign('/login'); } };
  useTournamentRealtime(tournament?.id, reloadFromProvider);
  if (loading) return <main className="configuration-page"><h1>Connessione a Supabase…</h1><p>Caricamento dei tornei in corso.</p></main>;
  if (!tournament) return null;
  if (dashboardMatch) return <MatchDashboard tournament={tournament} match={dashboardMatch} index={tournament.matches.findIndex(match => match.id === dashboardMatch.id)} onClose={() => setDashboardMatchId(undefined)} onPersist={persistDashboard} onFinish={(score, liveState) => update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatch.id ? { ...match, liveState, status: 'completed', result: { aGames: score.teamAGames, bGames: score.teamBGames } } : match) }))} onReset={() => update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatch.id ? { ...match, status: 'scheduled', result: { aGames: null, bGames: null } } : match) }))} />;
  return <div className="app"><aside><div className="brand">🎾 <span>Baraonda<br />Padel</span></div><select aria-label="Torneo attivo" value={activeId} onChange={e => setActiveId(e.target.value)}>{tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="new" onClick={create}><Plus size={16} /> Nuovo torneo</button>{nav.map(([id, label, Icon]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><Icon size={18} />{label}</button>)}<div className="sidebar-tools"><button onClick={exportJson}><Download size={16} /> Esporta JSON</button><button onClick={() => importer.current?.click()}><Upload size={16} /> Importa JSON</button><input ref={importer} hidden type="file" accept="application/json" onChange={e => importJson(e.target.files?.[0])} /></div>{user && <div className="user-menu"><strong>Organizzatore</strong><span>{user.email}</span><button onClick={logout}><LogOut size={15} /> Esci</button></div>}</aside><main>{isLocalDemo && <section className="notice" role="status">Modalità demo locale. Configura Supabase in <code>.env.local</code> per sincronizzare i dispositivi.</section>}{syncError && <section className="notice" role="status">{syncError} <button className="small" onClick={reloadFromProvider}>Riprova</button></section>}
    {tab === 'dashboard' && <Dashboard tournament={tournament} exportPdf={() => exportTournamentPdf(tournament)} onOpenDashboard={setDashboardMatchId} />}
    {tab === 'players' && <Players tournament={tournament} update={update} />}
    {tab === 'settings' && <SettingsView tournament={tournament} update={update} />}
    {tab === 'schedule' && <Schedule tournament={tournament} update={update} onOpenDashboard={setDashboardMatchId} />}
    {tab === 'results' && <Results tournament={tournament} standings={standings} update={update} onOpenDashboard={setDashboardMatchId} />}
    {tab === 'display' && <PublicDisplay tournament={tournament} standings={standings} reloadTournament={reloadTournaments} storageKey={tournamentStore.storageKey} />}
  </main></div>;
}

function AppRouter() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => { const updatePath = () => setPath(window.location.pathname); window.addEventListener('popstate', updatePath); return () => window.removeEventListener('popstate', updatePath); }, []);
  if (path === '/login') return <LoginPage />;
  if (path === '/forgot-password') return <ForgotPasswordPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  const publicMatch = path.match(/^\/public\/([^/]+)(?:\/(?:schedule|standings))?$/);
  if (publicMatch) return <PublicTournamentPage slug={decodeURIComponent(publicMatch[1])} />;
  return <ProtectedRoute><OrganizerApp /></ProtectedRoute>;
}

createRoot(document.getElementById('root')!).render(<AuthProvider><AppRouter /></AuthProvider>);
