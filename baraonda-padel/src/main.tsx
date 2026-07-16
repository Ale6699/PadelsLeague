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
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuth } from './auth/useAuth';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/auth/AuthPages';
import { RegisterPage } from './pages/auth/RegisterPage';
import { RegistrationCompletePage } from './pages/auth/RegistrationCompletePage';
import { ConfirmEmailPage } from './pages/auth/ConfirmEmailPage';
import { LegalPage } from './pages/auth/LegalPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { PublicTournamentPage } from './pages/PublicTournamentPage';
import { DeleteTournamentDialog } from './components/tournaments/DeleteTournamentDialog';
import { TournamentFormValues } from './domain/tournaments/tournamentValidation';
import { TournamentSaveChoice } from './components/tournaments/TournamentForm';
import { applyTournamentFormValues, getTournamentChanges } from './domain/tournaments/tournamentChanges';
import { defaultTournamentSlug } from './data/mappers/tournament.mapper';
import { generateSchedule } from './solver';
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

function OrganizerApp({ requestedTournamentId }: { requestedTournamentId?: string }) {
  const { user, signOut } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>(() => { if (!isLocalDemo) return []; const saved = tournamentStore.load(); return saved.length ? saved : [makeTournament('Torneo 2026')]; });
  const [loading, setLoading] = useState(Boolean(dataProvider)); const [syncError, setSyncError] = useState<string | null>(null); const [hydrated, setHydrated] = useState(false);
  const [activeId, setActiveId] = useState(requestedTournamentId ?? tournaments[0]?.id ?? ''); const [tab, setTab] = useState<(typeof nav)[number][0]>(requestedTournamentId ? 'settings' : 'dashboard'); const importer = useRef<HTMLInputElement>(null);
  const [dashboardMatchId, setDashboardMatchId] = useState<string>();
  const [draftTournament, setDraftTournament] = useState<Tournament | null>(null); const [formDirty, setFormDirty] = useState(false); const [mutationBusy, setMutationBusy] = useState(false); const [mutationError, setMutationError] = useState<string | null>(null); const [deleteOpen, setDeleteOpen] = useState(false); const [toast, setToast] = useState('');
  const tournamentsRef = useRef(tournaments);
  const lastUpdatedRef = useRef(tournamentStore.loadSnapshot().lastUpdated);
  const skipNextRemoteSaveRef = useRef(false);
  const tournament = requestedTournamentId ? tournaments.find(item => item.id === requestedTournamentId) : tournaments.find(item => item.id === activeId) ?? tournaments[0];
  useEffect(() => { let disposed = false; dataProvider.list().then(async items => {
    if (!disposed) { const loaded = items.length ? items : (isLocalDemo ? [makeTournament('Torneo 2026', user?.id)] : []); skipNextRemoteSaveRef.current = true; setTournaments(loaded); setActiveId(requestedTournamentId && loaded.some(item => item.id === requestedTournamentId) ? requestedTournamentId : loaded[0]?.id ?? ''); setHydrated(true); }
  }).catch(error => { if (!disposed) { skipNextRemoteSaveRef.current = true; setSyncError(isAppError(error) ? error.message : 'Non è stato possibile caricare i tornei.'); setHydrated(true); } }).finally(() => { if (!disposed) setLoading(false); }); return () => { disposed = true; }; }, [requestedTournamentId, user?.id]);
  useEffect(() => { tournamentsRef.current = tournaments; if (isLocalDemo) lastUpdatedRef.current = tournamentStore.save(tournaments); if (hydrated && dataProvider.kind === 'supabase') { if (skipNextRemoteSaveRef.current) { skipNextRemoteSaveRef.current = false; return; } dataProvider.save(tournaments).catch(error => setSyncError(isAppError(error) ? error.message : 'Errore di salvataggio.')); } }, [hydrated, tournaments]);
  const reloadTournaments = useCallback(() => {
    if (!isLocalDemo) return false;
    const snapshot = tournamentStore.reloadTournament(lastUpdatedRef.current, tournamentsRef.current);
    if (!snapshot) return false;
    tournamentsRef.current = snapshot.tournaments;
    lastUpdatedRef.current = snapshot.lastUpdated;
    setTournaments(snapshot.tournaments);
    setActiveId(currentId => snapshot.tournaments.some(item => item.id === currentId) ? currentId : snapshot.tournaments[0]?.id ?? '');
    return true;
  }, []);
  const reloadFromProvider = useCallback(() => { if (dataProvider.kind !== 'supabase') return; void dataProvider.list().then(items => { setTournaments(current => { if (JSON.stringify(current) === JSON.stringify(items)) return current; skipNextRemoteSaveRef.current = true; setActiveId(currentId => items.some(item => item.id === currentId) ? currentId : items[0]?.id ?? ''); return items; }); }).catch(error => setSyncError(isAppError(error) ? error.message : 'Connessione instabile.')); }, []);
  const update = useCallback((change: (tournament: Tournament) => Tournament) => setTournaments(items => items.map(item => item.id === activeId ? change(item) : item)), [activeId]);
  const standings = useMemo(() => tournament ? getStandings(tournament) : [], [tournament]);
  const canLeaveForm = () => !formDirty || window.confirm('Hai modifiche non salvate. Vuoi davvero uscire?');
  const create = () => { if (!canLeaveForm()) return; const next = makeTournament(`Torneo ${tournaments.length + 1}`, user?.id); next.publicSlug = defaultTournamentSlug(next); setDraftTournament(next); setMutationError(null); setTab('settings'); };
  const edit = () => { if (!tournament || !canLeaveForm()) return; setDraftTournament(null); setMutationError(null); setTab('settings'); window.history.replaceState({}, '', `/tournaments/${tournament.id}/edit`); };
  const cancelForm = () => { setDraftTournament(null); setMutationError(null); setFormDirty(false); setTab('dashboard'); window.history.replaceState({}, '', '/tournaments'); };
  const saveTournament = async (values: TournamentFormValues, choice: TournamentSaveChoice) => {
    const original = draftTournament ?? tournament; if (!original || mutationBusy) return;
    setMutationBusy(true); setMutationError(null);
    try {
      let edited = applyTournamentFormValues(original, values); if (!edited.publicSlug) edited = { ...edited, publicSlug: defaultTournamentSlug(edited) };
      if (draftTournament) {
        await dataProvider.save([edited]); if (dataProvider.kind === 'supabase') { const fresh = await dataProvider.list(); edited = fresh.find(item => item.id === edited.id) ?? edited; skipNextRemoteSaveRef.current = true; } setTournaments(items => [...items, edited]); setActiveId(edited.id); setDraftTournament(null); setFormDirty(false); setTab('dashboard'); setToast('Torneo creato correttamente.');
      } else {
        const changes = getTournamentChanges(original, values); const needsRegeneration = choice === 'save' && changes.affectsSchedule && original.matches.length > 0;
        edited = { ...edited, scheduleNeedsRegeneration: needsRegeneration };
        const updatedMetadata = await dataProvider.update(edited.id, { name: edited.name, settings: edited.settings, notes: edited.notes ?? '', status: edited.status ?? 'draft', isPublic: edited.isPublic ?? false, publicSlug: edited.publicSlug ?? '', scheduleNeedsRegeneration: edited.scheduleNeedsRegeneration ?? false, timerSoundEnabled: edited.timerSoundEnabled ?? true }, original.version ?? 1);
        let merged = { ...edited, ...updatedMetadata, players: original.players, matches: original.matches };
        if (choice === 'regenerate') {
          const regenerated = generateSchedule(merged, true); const protectedMatches = original.matches.filter(match => match.locked || match.status === 'completed'); const protectedIds = new Set(protectedMatches.map(match => match.id)); const protectedStarts = new Set(protectedMatches.map(match => match.start));
          merged = { ...merged, matches: [...protectedMatches, ...regenerated.filter(match => !protectedIds.has(match.id) && !protectedStarts.has(match.start))].sort((a, b) => a.start.localeCompare(b.start)), scheduleNeedsRegeneration: false };
          await dataProvider.replaceSchedule(merged, updatedMetadata.version ?? (original.version ?? 1) + 1);
          const fresh = await dataProvider.list(); const reloaded = fresh.find(item => item.id === merged.id); if (reloaded) merged = reloaded;
        }
        skipNextRemoteSaveRef.current = dataProvider.kind === 'supabase'; setTournaments(items => items.map(item => item.id === merged.id ? merged : item)); setFormDirty(false); setTab('dashboard'); setToast(choice === 'regenerate' ? 'Torneo salvato e calendario rigenerato.' : 'Modifiche salvate correttamente.'); window.history.replaceState({}, '', '/tournaments');
      }
    } catch (error) { setMutationError(isAppError(error) ? error.message : 'Non è stato possibile salvare le modifiche.'); }
    finally { setMutationBusy(false); }
  };
  const deleteTournament = async () => { if (!tournament || mutationBusy) return; setMutationBusy(true); try { await dataProvider.remove(tournament.id, tournament.version); skipNextRemoteSaveRef.current = dataProvider.kind === 'supabase'; const remaining = tournaments.filter(item => item.id !== tournament.id); setDashboardMatchId(undefined); setDeleteOpen(false); setTournaments(remaining); setActiveId(remaining[0]?.id ?? ''); setTab('dashboard'); setToast('Torneo eliminato correttamente.'); localStorage.removeItem(`baraonda-padel-draft:${tournament.id}`); sessionStorage.removeItem(`baraonda-padel-timer:${tournament.id}`); window.history.replaceState({}, '', '/tournaments'); } catch (error) { throw new Error(isAppError(error) ? error.message : 'Non è stato possibile eliminare il torneo. Controlla la connessione e riprova.'); } finally { setMutationBusy(false); } };
  const exportJson = () => { if (!tournament) return; const blob = new Blob([JSON.stringify(tournament, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${tournament.name || 'torneo'}.json`; a.click(); URL.revokeObjectURL(url); };
  const importJson = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(String(reader.result)) as Tournament; if (!imported.settings || !Array.isArray(imported.players) || !Array.isArray(imported.matches)) throw new Error(); const next = { ...imported, id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) }; setTournaments(items => [...items, next]); setActiveId(next.id); setTab('dashboard'); } catch { window.alert('Il file non contiene un torneo Baraonda valido.'); } }; reader.readAsText(file); };
  const dashboardMatch = tournament?.matches.find(match => match.id === dashboardMatchId);
  const persistDashboard = useCallback((liveState: LiveMatchState, status: MatchStatus) => { if (!dashboardMatchId) return; update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatchId ? { ...match, liveState, status } : match) })); }, [dashboardMatchId, update]);
  const logout = async () => { try { await signOut(); } catch { setSyncError('La sessione è stata chiusa localmente.'); } finally { tournamentStore.save([]); setTournaments([]); window.location.assign('/login'); } };
  useTournamentRealtime(tournament?.id, reloadFromProvider);
  if (loading) return <main className="configuration-page"><h1>Connessione a Supabase…</h1><p>Caricamento dei tornei in corso.</p></main>;
  if (requestedTournamentId && !tournament) return <main className="empty-state"><section><h1>Accesso non disponibile</h1><p>Non hai i permessi per accedere a questo torneo.</p><button onClick={() => window.location.assign('/tournaments')}>Torna ai tornei</button></section></main>;
  if (!tournament && !draftTournament) return <main className="empty-state"><section><span className="empty-state-icon">🎾</span><h1>Benvenuto in Baraonda Padel</h1><p>Crea il tuo primo torneo per iniziare.</p><button className="auth-submit" onClick={create}>Crea il primo torneo</button><div className="empty-state-links"><button onClick={() => window.location.assign('/profile')}>Il tuo profilo</button><button onClick={logout}>Esci</button></div></section></main>;
  if (dashboardMatch && tournament) return <MatchDashboard tournament={tournament} match={dashboardMatch} index={tournament.matches.findIndex(match => match.id === dashboardMatch.id)} onClose={() => setDashboardMatchId(undefined)} onPersist={persistDashboard} onFinish={(score, liveState) => update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatch.id ? { ...match, liveState, status: 'completed', result: { aGames: score.teamAGames, bGames: score.teamBGames } } : match) }))} onReset={() => update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatch.id ? { ...match, status: 'scheduled', result: { aGames: null, bGames: null } } : match) }))} />;
  const selectTournament = (id: string) => { if (!canLeaveForm()) return; setDraftTournament(null); setMutationError(null); setActiveId(id); setTab('dashboard'); window.history.replaceState({}, '', '/tournaments'); };
  const selectTab = (id: (typeof nav)[number][0]) => { if (id !== tab && !canLeaveForm()) return; if (id === 'settings') { setDraftTournament(null); setMutationError(null); } setTab(id); };
  const shownTournament = draftTournament ?? tournament!;
  return <div className="app"><aside><div className="brand">🎾 <span>Baraonda<br />Padel</span></div><select aria-label="Torneo attivo" value={activeId} onChange={event => selectTournament(event.target.value)} disabled={Boolean(draftTournament)}>{tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="new" onClick={create}><Plus size={16} /> Nuovo torneo</button>{nav.map(([id, label, Icon]) => <button className={tab === id ? 'active' : ''} onClick={() => selectTab(id)} disabled={Boolean(draftTournament) && id !== 'settings'} key={id}><Icon size={18} />{label}</button>)}<div className="sidebar-tools"><button onClick={exportJson}><Download size={16} /> Esporta JSON</button><button onClick={() => importer.current?.click()}><Upload size={16} /> Importa JSON</button><input ref={importer} hidden type="file" accept="application/json" onChange={e => importJson(e.target.files?.[0])} /></div>{user && <div className="user-menu"><strong>Organizzatore</strong><span>{user.email}</span><button onClick={() => window.location.assign('/profile')}>Il tuo profilo</button><button onClick={logout}><LogOut size={15} /> Esci</button></div>}</aside><main>{isLocalDemo && <section className="notice" role="status">Modalità demo locale. Configura Supabase in <code>.env.local</code> per sincronizzare i dispositivi.</section>}{syncError && <section className="notice" role="status">{syncError} <button className="small" onClick={reloadFromProvider}>Riprova</button></section>}{toast && <section className="success-notice" role="status">{toast}<button className="small secondary" onClick={() => setToast('')}>Chiudi</button></section>}
    {tab === 'dashboard' && <Dashboard tournament={tournament!} exportPdf={() => exportTournamentPdf(tournament!)} onOpenDashboard={setDashboardMatchId} onEdit={edit} onDelete={() => setDeleteOpen(true)} />}
    {tab === 'players' && <Players tournament={tournament!} update={update} />}
    {tab === 'settings' && <SettingsView mode={draftTournament ? 'create' : 'edit'} tournament={shownTournament} busy={mutationBusy} mutationError={mutationError} onSubmit={saveTournament} onCancel={cancelForm} onDirtyChange={setFormDirty} />}
    {tab === 'schedule' && <Schedule tournament={tournament!} update={update} onOpenDashboard={setDashboardMatchId} />}
    {tab === 'results' && <Results tournament={tournament!} standings={standings} update={update} onOpenDashboard={setDashboardMatchId} />}
    {tab === 'display' && <PublicDisplay tournament={tournament!} standings={standings} reloadTournament={reloadTournaments} storageKey={tournamentStore.storageKey} />}
  </main><DeleteTournamentDialog tournament={tournament!} open={deleteOpen} onClose={() => setDeleteOpen(false)} onDelete={deleteTournament} /></div>;
}

function AppRouter() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => { const updatePath = () => setPath(window.location.pathname); window.addEventListener('popstate', updatePath); return () => window.removeEventListener('popstate', updatePath); }, []);
  if (path === '/login') return <LoginPage />;
  if (path === '/register') return <RegisterPage />;
  if (path === '/registration-complete') return <RegistrationCompletePage />;
  if (path === '/auth/confirm') return <ConfirmEmailPage />;
  if (path === '/forgot-password') return <ForgotPasswordPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  if (path === '/terms') return <LegalPage kind="terms" />;
  if (path === '/privacy') return <LegalPage kind="privacy" />;
  if (path === '/profile') return <ProtectedRoute><ProfilePage /></ProtectedRoute>;
  const publicMatch = path.match(/^\/public\/([^/]+)(?:\/(?:schedule|standings))?$/);
  if (publicMatch) return <PublicTournamentPage slug={decodeURIComponent(publicMatch[1])} />;
  const editMatch = path.match(/^\/tournaments\/([^/]+)\/edit$/);
  return <ProtectedRoute><OrganizerApp requestedTournamentId={editMatch ? decodeURIComponent(editMatch[1]) : undefined} /></ProtectedRoute>;
}

createRoot(document.getElementById('root')!).render(<AuthProvider><AppRouter /></AuthProvider>);
