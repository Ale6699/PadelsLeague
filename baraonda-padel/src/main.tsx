import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, LogOut, Plus, Upload } from 'lucide-react';
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
import { resetMatchForReplay } from './services/liveMatch';
import { isMatchCompleted } from './services/matchResults';
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
import { BettingPage } from './pages/BettingPage';
import { BettingAdmin } from './components/betting/BettingAdmin';
import { DeleteTournamentDialog } from './components/tournaments/DeleteTournamentDialog';
import { TournamentFormValues } from './domain/tournaments/tournamentValidation';
import { TournamentSaveChoice } from './components/tournaments/TournamentForm';
import { applyTournamentFormValues, getTournamentChanges } from './domain/tournaments/tournamentChanges';
import { defaultTournamentSlug } from './data/mappers/tournament.mapper';
import { generateSchedule } from './solver';
import { MobileNavigation, OrganizerTab, organizerNavigation } from './components/MobileNavigation';
import { publicScheduleUrl } from './publicView';
import './styles.css';
import './balance.css';
import './share.css';
import './results.css';
import './match-dashboard.css';
import './supabase.css';
import './auth.css';
import './betting.css';

// L'ultimo torneo selezionato non era persistito: al reload activeId ripartiva sempre da
// requestedTournamentId (solo per /tournaments/:id/edit) o dal primo elemento di list(), che è
// ordinata per updated_at decrescente — quindi un qualsiasi salvataggio su UN ALTRO torneo (anche
// da un'altra scheda/dispositivo) lo faceva "saltare in cima" e ti ritrovavi lì dopo il refresh.
const ACTIVE_TOURNAMENT_KEY = 'baraonda-padel-active-tournament';
const readPersistedActiveId = () => { try { return localStorage.getItem(ACTIVE_TOURNAMENT_KEY) ?? undefined; } catch { return undefined; } };
const writePersistedActiveId = (id: string) => { try { localStorage.setItem(ACTIVE_TOURNAMENT_KEY, id); } catch { /* localStorage optional */ } };

function OrganizerApp({ requestedTournamentId }: { requestedTournamentId?: string }) {
  const { user, signOut } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>(() => { if (!isLocalDemo) return []; const saved = tournamentStore.load(); return saved.length ? saved : [makeTournament('Torneo 2026')]; });
  const [loading, setLoading] = useState(Boolean(dataProvider)); const [syncError, setSyncError] = useState<string | null>(null); const [hydrated, setHydrated] = useState(false);
  const persistedActiveId = readPersistedActiveId();
  const [activeId, setActiveId] = useState(requestedTournamentId ?? (persistedActiveId && tournaments.some(item => item.id === persistedActiveId) ? persistedActiveId : tournaments[0]?.id ?? '')); const [tab, setTab] = useState<OrganizerTab>(requestedTournamentId ? 'settings' : 'dashboard'); const importer = useRef<HTMLInputElement>(null);
  useEffect(() => { if (activeId) writePersistedActiveId(activeId); }, [activeId]);
  const [dashboardMatchId, setDashboardMatchId] = useState<string>();
  const [draftTournament, setDraftTournament] = useState<Tournament | null>(null); const [formDirty, setFormDirty] = useState(false); const [mutationBusy, setMutationBusy] = useState(false); const [mutationError, setMutationError] = useState<string | null>(null); const [deleteOpen, setDeleteOpen] = useState(false); const [toast, setToast] = useState('');
  const tournamentsRef = useRef(tournaments);
  const lastUpdatedRef = useRef(tournamentStore.loadSnapshot().lastUpdated);
  const skipNextRemoteSaveRef = useRef(false);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const reloadTimerRef = useRef<number | undefined>(undefined);
  const reloadRequestedRef = useRef(false);
  const localEditVersionRef = useRef(0);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryAttemptRef = useRef(0);
  // Il retry conta come "salvataggio in corso" agli occhi di reloadFromProvider: durante il backoff
  // un reload realtime deve aspettare, non riconciliare con lo snapshot server ancora vecchio
  // (altrimenti sovrascriverebbe in silenzio, es., una partita appena conclusa che non è ancora
  // arrivata al server per un errore transitorio).
  const saveScheduled = useCallback(() => savingRef.current || pendingSaveRef.current || saveTimerRef.current !== undefined || retryTimerRef.current !== undefined, []);
  // Every save echoes back as a burst of realtime events (one per touched table). The
  // reload is debounced to collapse the burst into a single list(), and skipped while a
  // local save is in flight or scheduled: local state is ahead of the server then, and
  // applying the server snapshot would wipe the edits being saved. A reload requested
  // during a save runs once the queue drains; a reload that resolves after a newer local
  // edit is discarded for the same reason.
  const reloadFromProvider = useCallback(() => {
    if (dataProvider.kind !== 'supabase') return;
    if (saveScheduled()) { reloadRequestedRef.current = true; return; }
    if (reloadTimerRef.current !== undefined) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = undefined;
      const editVersionAtRequest = localEditVersionRef.current;
      void dataProvider.list().then(items => {
        if (!items.length || editVersionAtRequest !== localEditVersionRef.current || saveScheduled()) return;
        setTournaments(current => { if (JSON.stringify(current) === JSON.stringify(items)) return current; skipNextRemoteSaveRef.current = true; setActiveId(currentId => items.some(item => item.id === currentId) ? currentId : items[0]?.id ?? ''); return items; });
      }).catch(error => setSyncError(isAppError(error) ? error.message : 'Connessione instabile.'));
    }, 400);
  }, [saveScheduled]);
  // Supabase saves fully replace availability/constraints/breaks for the tournament on
  // every call. Overlapping calls can resolve out of order and let a stale snapshot
  // clobber a newer one, so saves are serialized: at most one in flight, and any
  // change that arrives meanwhile is coalesced into a single follow-up save of the
  // latest state instead of firing its own overlapping request.
  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== undefined) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = undefined; }
    if (retryTimerRef.current !== undefined) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = undefined; }
    if (savingRef.current) { pendingSaveRef.current = true; return; }
    savingRef.current = true;
    dataProvider.save(tournamentsRef.current).then(() => { retryAttemptRef.current = 0; setSyncError(null); }).catch(error => {
      const appError = isAppError(error) ? error : undefined;
      setSyncError(appError?.message ?? 'Errore di salvataggio.');
      // Un conflitto di versione (un'altra schermata ha scritto nel frattempo) non va ritentato
      // con lo stesso payload, ormai basato su uno stato non più valido: si segnala e si lascia
      // riconciliare il prossimo reload. Ogni altro errore (rete/Supabase instabile) è quasi
      // sempre transitorio: senza retry il salvataggio andrebbe perso in silenzio (es. una
      // partita appena conclusa resterebbe completata solo in locale, per poi "ritornare"
      // indietro al primo reload che arriva con lo stato server non aggiornato).
      if (appError?.code !== 'conflict') {
        retryAttemptRef.current = Math.min(retryAttemptRef.current + 1, 5);
        retryTimerRef.current = window.setTimeout(() => { retryTimerRef.current = undefined; flushSave(); }, Math.min(2000 * retryAttemptRef.current, 15000));
      }
    }).finally(() => {
      savingRef.current = false;
      if (pendingSaveRef.current) { pendingSaveRef.current = false; flushSave(); }
      else if (retryTimerRef.current === undefined && reloadRequestedRef.current) { reloadRequestedRef.current = false; reloadFromProvider(); }
    });
  }, [reloadFromProvider]);
  const tournament = requestedTournamentId ? tournaments.find(item => item.id === requestedTournamentId) : tournaments.find(item => item.id === activeId) ?? tournaments[0];
  useEffect(() => { let disposed = false; dataProvider.list().then(async items => {
    if (!disposed) {
      const loaded = items.length ? items : (isLocalDemo ? [makeTournament('Torneo 2026', user?.id)] : []);
      skipNextRemoteSaveRef.current = true;
      setTournaments(loaded);
      const persisted = readPersistedActiveId();
      setActiveId(requestedTournamentId && loaded.some(item => item.id === requestedTournamentId) ? requestedTournamentId : persisted && loaded.some(item => item.id === persisted) ? persisted : loaded[0]?.id ?? '');
      setHydrated(true);
    }
  }).catch(error => { if (!disposed) { skipNextRemoteSaveRef.current = true; setSyncError(isAppError(error) ? error.message : 'Non è stato possibile caricare i tornei.'); setHydrated(true); } }).finally(() => { if (!disposed) setLoading(false); }); return () => { disposed = true; }; }, [requestedTournamentId, user?.id]);
  // Autosave is debounced so a burst of edits (typing, quick select changes) coalesces
  // into one write instead of one write per change.
  useEffect(() => { tournamentsRef.current = tournaments; if (isLocalDemo) lastUpdatedRef.current = tournamentStore.save(tournaments); if (hydrated && dataProvider.kind === 'supabase') { if (skipNextRemoteSaveRef.current) { skipNextRemoteSaveRef.current = false; return; } localEditVersionRef.current += 1; if (saveTimerRef.current !== undefined) window.clearTimeout(saveTimerRef.current); saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = undefined; flushSave(); }, 600); } }, [hydrated, tournaments, flushSave]);
  // The debounce must not lose the last edit when the user closes or switches tab.
  useEffect(() => {
    const flushOnHide = () => { if (document.visibilityState === 'hidden' && saveTimerRef.current !== undefined) flushSave(); };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => document.removeEventListener('visibilitychange', flushOnHide);
  }, [flushSave]);
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
  const update = useCallback((change: (tournament: Tournament) => Tournament) => setTournaments(items => items.map(item => item.id === activeId ? change(item) : item)), [activeId]);
  const generatePublicScheduleLink = useCallback(async () => {
    const current = tournamentsRef.current.find(item => item.id === activeId);
    if (!current) throw new Error('Torneo non trovato.');
    const publicSlug = current.publicSlug || defaultTournamentSlug(current);
    try {
      const updatedMetadata = await dataProvider.update(current.id, {
        name: current.name,
        settings: current.settings,
        notes: current.notes ?? '',
        status: current.status ?? 'draft',
        isPublic: true,
        publicSlug,
        scheduleNeedsRegeneration: current.scheduleNeedsRegeneration ?? false,
        timerSoundEnabled: current.timerSoundEnabled ?? true,
      }, current.version ?? 1);
      const published = { ...current, ...updatedMetadata, settings: current.settings, players: current.players, matches: current.matches, isPublic: true, publicSlug };
      if (dataProvider.kind === 'supabase') skipNextRemoteSaveRef.current = true;
      setTournaments(items => {
        const next = items.map(item => item.id === published.id ? published : item);
        tournamentsRef.current = next;
        return next;
      });
      return publicScheduleUrl(publicSlug, window.location.origin);
    } catch (error) {
      throw new Error(isAppError(error) ? error.message : 'Non è stato possibile pubblicare il calendario.');
    }
  }, [activeId]);
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
        const changes = getTournamentChanges(original, values); const generationResult = choice === 'regenerate' ? generateSchedule({ ...edited, players: original.players, matches: original.matches }, true, { randomize: true }) : undefined;
        if (generationResult?.status === 'impossible') throw { code: 'validation', message: generationResult.reason ?? 'Non è stato possibile generare un calendario uniforme.' };
        const needsRegeneration = choice === 'save' && changes.affectsSchedule && original.matches.length > 0;
        edited = { ...edited, scheduleNeedsRegeneration: needsRegeneration };
        const updatedMetadata = await dataProvider.update(edited.id, { name: edited.name, settings: edited.settings, notes: edited.notes ?? '', status: edited.status ?? 'draft', isPublic: edited.isPublic ?? false, publicSlug: edited.publicSlug ?? '', scheduleNeedsRegeneration: edited.scheduleNeedsRegeneration ?? false, timerSoundEnabled: edited.timerSoundEnabled ?? true }, original.version ?? 1);
        let merged = { ...edited, ...updatedMetadata, players: original.players, matches: original.matches };
        if (choice === 'regenerate' && generationResult?.status === 'generated') {
          merged = { ...merged, matches: generationResult.matches, scheduleNeedsRegeneration: false };
          await dataProvider.replaceSchedule(merged, updatedMetadata.version ?? (original.version ?? 1) + 1);
          const fresh = await dataProvider.list(); const reloaded = fresh.find(item => item.id === merged.id); if (reloaded) merged = reloaded;
        }
        const saveMessage = generationResult?.status === 'generated' && generationResult.commonMatchesPerPlayer !== generationResult.requestedMax ? `Torneo salvato. Massimo configurato: ${generationResult.requestedMax}; assegnate: ${generationResult.commonMatchesPerPlayer} partite per giocatore.` : choice === 'regenerate' ? 'Torneo salvato e calendario rigenerato.' : 'Modifiche salvate correttamente.';
        skipNextRemoteSaveRef.current = dataProvider.kind === 'supabase'; setTournaments(items => items.map(item => item.id === merged.id ? merged : item)); setFormDirty(false); setTab('dashboard'); setToast(saveMessage); window.history.replaceState({}, '', '/tournaments');
      }
    } catch (error) { setMutationError(isAppError(error) ? error.message : 'Non è stato possibile salvare le modifiche.'); }
    finally { setMutationBusy(false); }
  };
  const deleteTournament = async () => { if (!tournament || mutationBusy) return; setMutationBusy(true); try { await dataProvider.remove(tournament.id, tournament.version); skipNextRemoteSaveRef.current = dataProvider.kind === 'supabase'; const remaining = tournaments.filter(item => item.id !== tournament.id); setDashboardMatchId(undefined); setDeleteOpen(false); setTournaments(remaining); setActiveId(remaining[0]?.id ?? ''); setTab('dashboard'); setToast('Torneo eliminato correttamente.'); localStorage.removeItem(`baraonda-padel-draft:${tournament.id}`); sessionStorage.removeItem(`baraonda-padel-timer:${tournament.id}`); window.history.replaceState({}, '', '/tournaments'); } catch (error) { throw new Error(isAppError(error) ? error.message : 'Non è stato possibile eliminare il torneo. Controlla la connessione e riprova.'); } finally { setMutationBusy(false); } };
  const exportJson = () => { if (!tournament) return; const blob = new Blob([JSON.stringify(tournament, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${tournament.name || 'torneo'}.json`; a.click(); URL.revokeObjectURL(url); };
  const importJson = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(String(reader.result)) as Tournament; if (!imported.settings || !Array.isArray(imported.players) || !Array.isArray(imported.matches)) throw new Error(); const next = { ...imported, id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) }; setTournaments(items => [...items, next]); setActiveId(next.id); setTab('dashboard'); } catch { window.alert('Il file non contiene un torneo Baraonda valido.'); } }; reader.readAsText(file); };
  const dashboardMatch = tournament?.matches.find(match => match.id === dashboardMatchId);
  // L'id target arriva sempre dall'hook (matchIdRef), mai da dashboardMatchId: quest'ultimo può
  // già essere avanzato alla partita successiva nello stesso commit in cui live/status vengono
  // persistiti per quella appena conclusa (vedi commento in useMatchDashboard), e usarlo qui
  // scriverebbe lo stato sulla partita sbagliata.
  const persistDashboard = useCallback((liveState: LiveMatchState, status: MatchStatus, matchId: string) => { update(t => ({ ...t, matches: t.matches.map(match => match.id === matchId ? { ...match, liveState, status } : match) })); }, [update]);
  const logout = async () => { try { await signOut(); } catch { setSyncError('La sessione è stata chiusa localmente.'); } finally { tournamentStore.save([]); setTournaments([]); window.location.assign('/login'); } };
  useTournamentRealtime(tournament?.id, reloadFromProvider);
  if (loading) return <main className="configuration-page"><h1>Connessione a Supabase…</h1><p>Caricamento dei tornei in corso.</p></main>;
  if (requestedTournamentId && !tournament) return <main className="empty-state"><section><h1>Accesso non disponibile</h1><p>Non hai i permessi per accedere a questo torneo.</p><button onClick={() => window.location.assign('/tournaments')}>Torna ai tornei</button></section></main>;
  if (!tournament && !draftTournament) return <main className="empty-state"><section><span className="empty-state-icon">🎾</span><h1>Benvenuto in Baraonda Padel</h1><p>Crea il tuo primo torneo per iniziare.</p><button className="auth-submit" onClick={create}>Crea il primo torneo</button><div className="empty-state-links"><button onClick={() => window.location.assign('/profile')}>Il tuo profilo</button><button onClick={logout}>Esci</button></div></section></main>;
  if (dashboardMatch && tournament) return <MatchDashboard tournament={tournament} match={dashboardMatch} index={tournament.matches.findIndex(match => match.id === dashboardMatch.id)} onClose={() => setDashboardMatchId(undefined)} onPersist={persistDashboard} syncError={syncError} onRetrySync={dataProvider.kind === 'supabase' ? reloadFromProvider : undefined} onFinish={(score, liveState) => {
    update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatch.id ? { ...match, liveState, status: 'completed', result: { aGames: score.teamAGames, bGames: score.teamBGames } } : match) }));
    const finishedIndex = tournament.matches.findIndex(match => match.id === dashboardMatch.id);
    const nextMatch = tournament.matches.find((match, matchIndex) => matchIndex > finishedIndex && !isMatchCompleted(match));
    setDashboardMatchId(nextMatch?.id);
  }} onReset={liveState => update(t => ({ ...t, matches: t.matches.map(match => match.id === dashboardMatch.id ? resetMatchForReplay(match, t.settings.playMinutes, t.settings.warmupMinutes, liveState) : match) }))} />;
  const selectTournament = (id: string) => { if (!canLeaveForm()) return; setDraftTournament(null); setMutationError(null); setActiveId(id); setTab('dashboard'); window.history.replaceState({}, '', '/tournaments'); };
  const selectTab = (id: OrganizerTab) => { if (id !== tab && !canLeaveForm()) return; if (id === 'settings') { setDraftTournament(null); setMutationError(null); } setTab(id); };
  const shownTournament = draftTournament ?? tournament!;
  return <div className="app"><aside className="desktop-sidebar"><div className="brand">🎾 <span>Baraonda<br />Padel</span></div><select aria-label="Torneo attivo" value={activeId} onChange={event => selectTournament(event.target.value)} disabled={Boolean(draftTournament)}>{tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="new" onClick={create}><Plus size={16} /> Nuovo torneo</button>{organizerNavigation.map(([id, label, Icon]) => <button className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => selectTab(id)} disabled={Boolean(draftTournament) && id !== 'settings'} key={id}><Icon size={18} />{label}</button>)}<div className="sidebar-tools"><button onClick={exportJson}><Download size={16} /> Esporta JSON</button><button onClick={() => importer.current?.click()}><Upload size={16} /> Importa JSON</button><input ref={importer} hidden type="file" accept="application/json" onChange={e => importJson(e.target.files?.[0])} /></div>{user && <div className="user-menu"><strong>Organizzatore</strong><span>{user.email}</span><button onClick={() => window.location.assign('/profile')}>Il tuo profilo</button><button onClick={logout}><LogOut size={15} /> Esci</button></div>}</aside><MobileNavigation activeTab={tab} tournaments={tournaments} activeId={activeId} draftOpen={Boolean(draftTournament)} userEmail={user?.email} onSelectTournament={selectTournament} onSelectTab={selectTab} onCreate={create} onExport={exportJson} onImport={() => importer.current?.click()} onProfile={() => window.location.assign('/profile')} onLogout={logout} /><main className="app-main">{isLocalDemo && <section className="notice" role="status">Modalità demo locale. Configura Supabase in <code>.env.local</code> per sincronizzare i dispositivi.</section>}{syncError && <section className="notice" role="status">{syncError} <button className="small" onClick={reloadFromProvider}>Riprova</button></section>}{toast && <section className="success-notice" role="status">{toast}<button className="small secondary" onClick={() => setToast('')}>Chiudi</button></section>}
    {tab === 'dashboard' && <Dashboard tournament={tournament!} exportPdf={() => exportTournamentPdf(tournament!)} onOpenDashboard={setDashboardMatchId} onEdit={edit} onDelete={() => setDeleteOpen(true)} />}
    {tab === 'players' && <Players tournament={tournament!} update={update} />}
    {tab === 'settings' && <SettingsView mode={draftTournament ? 'create' : 'edit'} tournament={shownTournament} busy={mutationBusy} mutationError={mutationError} onSubmit={saveTournament} onCancel={cancelForm} onDirtyChange={setFormDirty} />}
    {tab === 'schedule' && <Schedule tournament={tournament!} update={update} onOpenDashboard={setDashboardMatchId} onGeneratePublicLink={generatePublicScheduleLink} />}
    {tab === 'results' && <Results tournament={tournament!} standings={standings} update={update} />}
    {tab === 'scommesse' && <BettingAdmin tournament={tournament!} />}
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
  const betMatch = path.match(/^\/public\/([^/]+)\/scommesse$/);
  if (betMatch) return <BettingPage slug={decodeURIComponent(betMatch[1])} />;
  const publicMatch = path.match(/^\/public\/([^/]+)(?:\/(?:schedule|standings))?$/);
  if (publicMatch) return <PublicTournamentPage slug={decodeURIComponent(publicMatch[1])} />;
  const editMatch = path.match(/^\/tournaments\/([^/]+)\/edit$/);
  return <ProtectedRoute><OrganizerApp requestedTournamentId={editMatch ? decodeURIComponent(editMatch[1]) : undefined} /></ProtectedRoute>;
}

createRoot(document.getElementById('root')!).render(<AuthProvider><AppRouter /></AuthProvider>);
