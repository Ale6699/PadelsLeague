import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Download,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  Shuffle,
  Trophy,
  Tv,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Tournament } from '../models';

export type OrganizerTab = 'dashboard' | 'players' | 'settings' | 'schedule' | 'results' | 'display';

export const organizerNavigation = [
  ['dashboard', 'Panoramica', CalendarDays],
  ['players', 'Giocatori', Users],
  ['settings', 'Configurazione', Settings],
  ['schedule', 'Calendario', Shuffle],
  ['results', 'Risultati', Trophy],
  ['display', 'Schermo pubblico', Tv],
] as const;

const primaryNavigation = [
  organizerNavigation[0],
  organizerNavigation[3],
  organizerNavigation[4],
  organizerNavigation[1],
] as const;

type Props = {
  activeTab: OrganizerTab;
  tournaments: Tournament[];
  activeId: string;
  draftOpen: boolean;
  userEmail?: string;
  onSelectTournament: (id: string) => void;
  onSelectTab: (id: OrganizerTab) => void;
  onCreate: () => void;
  onExport: () => void;
  onImport: () => void;
  onProfile: () => void;
  onLogout: () => void;
};

export function MobileNavigation(props: Props) {
  const [open, setOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        moreButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const selectTab = (tab: OrganizerTab) => {
    props.onSelectTab(tab);
    setOpen(false);
  };

  const close = () => {
    setOpen(false);
    moreButton.current?.focus();
  };

  return <>
    <header className="mobile-app-header">
      <div className="mobile-brand" aria-label="Baraonda Padel"><span aria-hidden="true">🎾</span><strong>Baraonda Padel</strong></div>
      <label className="mobile-tournament-picker">
        <span>Torneo</span>
        <select aria-label="Torneo attivo" value={props.activeId} onChange={event => props.onSelectTournament(event.target.value)} disabled={props.draftOpen}>
          {props.tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    </header>

    <nav className="mobile-bottom-nav" aria-label="Navigazione principale">
      {primaryNavigation.map(([id, label, Icon]) => <button key={id} type="button" className={props.activeTab === id ? 'active' : ''} aria-current={props.activeTab === id ? 'page' : undefined} disabled={props.draftOpen} onClick={() => selectTab(id)}><Icon size={20} /><span>{label}</span></button>)}
      <button ref={moreButton} type="button" className={open || ['settings', 'display'].includes(props.activeTab) ? 'active' : ''} aria-expanded={open} aria-controls="mobile-more-panel" onClick={() => setOpen(true)}><MoreHorizontal size={21} /><span>Altro</span></button>
    </nav>

    {open && <div className="mobile-sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section id="mobile-more-panel" className="mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
        <div className="mobile-sheet-handle" aria-hidden="true" />
        <header><div><h2 id="mobile-more-title">Altro</h2><p>Gestisci torneo, dati e account.</p></div><button ref={closeButton} type="button" className="icon secondary" aria-label="Chiudi menu" onClick={close}><X /></button></header>
        <div className="mobile-sheet-grid">
          <button type="button" className={props.activeTab === 'settings' ? 'active' : ''} onClick={() => selectTab('settings')}><Settings /><span><b>Configurazione</b><small>Regole, orari e pubblicazione</small></span></button>
          <button type="button" className={props.activeTab === 'display' ? 'active' : ''} disabled={props.draftOpen} onClick={() => selectTab('display')}><Tv /><span><b>Schermo pubblico</b><small>Anteprima live del torneo</small></span></button>
          <button type="button" onClick={() => { props.onCreate(); setOpen(false); }}><Plus /><span><b>Nuovo torneo</b><small>Crea una nuova baraonda</small></span></button>
          <button type="button" disabled={props.draftOpen} onClick={() => { props.onExport(); setOpen(false); }}><Download /><span><b>Esporta JSON</b><small>Scarica una copia dei dati</small></span></button>
          <button type="button" onClick={() => { props.onImport(); setOpen(false); }}><Upload /><span><b>Importa JSON</b><small>Carica un torneo salvato</small></span></button>
          <button type="button" onClick={props.onProfile}><UserRound /><span><b>Il tuo profilo</b><small>{props.userEmail ?? 'Impostazioni account'}</small></span></button>
        </div>
        <button type="button" className="mobile-logout danger" onClick={props.onLogout}><LogOut /> Esci</button>
      </section>
    </div>}
  </>;
}
