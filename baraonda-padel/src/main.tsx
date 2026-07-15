import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Download, Plus, SlidersHorizontal, Trophy, Tv, Upload, Users, Shuffle } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { Players } from './components/Players';
import { PublicDisplay } from './components/PublicDisplay';
import { Results } from './components/Results';
import { Schedule } from './components/Schedule';
import { SettingsView } from './components/SettingsView';
import { Tournament, makeTournament } from './models';
import { exportTournamentPdf } from './services/pdf';
import { getStandings } from './services/standings';
import { tournamentStore } from './storage';
import './styles.css';

const nav = [
  ['dashboard', 'Panoramica', CalendarDays], ['players', 'Giocatori', Users], ['settings', 'Configurazione', SlidersHorizontal],
  ['schedule', 'Calendario', Shuffle], ['results', 'Risultati', Trophy], ['display', 'Schermo pubblico', Tv],
] as const;

function App() {
  const [tournaments, setTournaments] = useState<Tournament[]>(() => tournamentStore.load().length ? tournamentStore.load() : [makeTournament('Torneo 2026')]);
  const [activeId, setActiveId] = useState(tournaments[0]?.id ?? ''); const [tab, setTab] = useState<(typeof nav)[number][0]>('dashboard'); const importer = useRef<HTMLInputElement>(null);
  const tournament = tournaments.find(item => item.id === activeId) ?? tournaments[0];
  useEffect(() => tournamentStore.save(tournaments), [tournaments]);
  const update = (change: (tournament: Tournament) => Tournament) => setTournaments(items => items.map(item => item.id === tournament.id ? change(item) : item));
  const standings = useMemo(() => getStandings(tournament), [tournament]);
  const create = () => { const next = makeTournament(`Torneo ${tournaments.length + 1}`); setTournaments(items => [...items, next]); setActiveId(next.id); setTab('settings'); };
  const exportJson = () => { const blob = new Blob([JSON.stringify(tournament, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${tournament.name || 'torneo'}.json`; a.click(); URL.revokeObjectURL(url); };
  const importJson = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(String(reader.result)) as Tournament; if (!imported.settings || !Array.isArray(imported.players) || !Array.isArray(imported.matches)) throw new Error(); const next = { ...imported, id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) }; setTournaments(items => [...items, next]); setActiveId(next.id); setTab('dashboard'); } catch { window.alert('Il file non contiene un torneo Baraonda valido.'); } }; reader.readAsText(file); };
  if (!tournament) return null;
  return <div className="app"><aside><div className="brand">🎾 <span>Baraonda<br />Padel</span></div><select aria-label="Torneo attivo" value={activeId} onChange={e => setActiveId(e.target.value)}>{tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="new" onClick={create}><Plus size={16} /> Nuovo torneo</button>{nav.map(([id, label, Icon]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><Icon size={18} />{label}</button>)}<div className="sidebar-tools"><button onClick={exportJson}><Download size={16} /> Esporta JSON</button><button onClick={() => importer.current?.click()}><Upload size={16} /> Importa JSON</button><input ref={importer} hidden type="file" accept="application/json" onChange={e => importJson(e.target.files?.[0])} /></div></aside><main>
    {tab === 'dashboard' && <Dashboard tournament={tournament} exportPdf={() => exportTournamentPdf(tournament)} />}
    {tab === 'players' && <Players tournament={tournament} update={update} />}
    {tab === 'settings' && <SettingsView tournament={tournament} update={update} />}
    {tab === 'schedule' && <Schedule tournament={tournament} update={update} />}
    {tab === 'results' && <Results tournament={tournament} standings={standings} update={update} />}
    {tab === 'display' && <PublicDisplay tournament={tournament} standings={standings} />}
  </main></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
