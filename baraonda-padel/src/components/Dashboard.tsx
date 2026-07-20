import { AlertTriangle, FileDown, MonitorPlay, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Tournament, fullName } from '../models';
import { buildSlots, calendarQuality } from '../solver';
import { MATCH_BALANCE_LABELS, calculateCalendarBalance } from '../services/matchBalance';
import { isMatchCompleted } from '../services/matchResults';
import { TournamentActionsMenu } from './tournaments/TournamentActionsMenu';

export function Dashboard({ tournament, exportPdf, onOpenDashboard, onEdit, onDelete }: { tournament: Tournament; exportPdf: () => void; onOpenDashboard: (matchId: string) => void; onEdit: () => void; onDelete: () => void }) {
  const quality = calendarQuality(tournament);
  const counts = new Map(tournament.players.map(player => [player.id, 0]));
  const balance = calculateCalendarBalance(tournament);
  tournament.matches.forEach(match => match.players.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
  const currentMatch = tournament.matches.find(match => !isMatchCompleted(match));

  return <>
    <header className="page-header dashboard-page-header"><div><h1>{tournament.settings.title}</h1><p>{tournament.settings.date} · {tournament.settings.start}–{tournament.settings.end} · 1 campo</p></div><div className="actions desktop-page-actions">{currentMatch && <button className="secondary" onClick={() => onOpenDashboard(currentMatch.id)}><MonitorPlay size={17} /> Apri cruscotto</button>}<button onClick={exportPdf}><FileDown size={17} /> Esporta PDF</button><TournamentActionsMenu onEdit={onEdit} onDelete={onDelete} /></div><details className="mobile-page-menu"><summary aria-label="Altre azioni"><MoreHorizontal /></summary><div><button className="secondary" onClick={exportPdf}><FileDown size={17} /> Esporta PDF</button><button className="secondary" onClick={onEdit}><Pencil size={17} /> Modifica torneo</button><button className="danger" onClick={onDelete}><Trash2 size={17} /> Elimina torneo</button></div></details></header>
    {tournament.scheduleNeedsRegeneration && <section className="notice"><AlertTriangle size={18} /> Il calendario potrebbe non rispettare più la configurazione corrente.</section>}
    {currentMatch && <section className="current-match-cta"><div><small>PROSSIMA PARTITA · {currentMatch.start}</small><b>{currentMatch.players.slice(0, 2).map(id => tournament.players.find(player => player.id === id)).filter(Boolean).map(player => fullName(player!)).join(' / ')}</b><span>contro</span><b>{currentMatch.players.slice(2).map(id => tournament.players.find(player => player.id === id)).filter(Boolean).map(player => fullName(player!)).join(' / ')}</b></div><button onClick={() => onOpenDashboard(currentMatch.id)}><MonitorPlay size={18} /> Apri cruscotto</button></section>}
    <div className="cards"><div className="card"><b>{tournament.players.length}</b><span>giocatori</span></div><div className="card"><b>{tournament.matches.length}</b><span>partite</span></div><div className="card"><b>{buildSlots(tournament.settings).length}</b><span>slot disponibili</span></div><div className="card warning"><b>{quality.violations}</b><span>segnalazioni</span></div></div>
    <section className="content-panel"><h2>Qualità del calendario</h2><div className="quality"><span>Presenze <b>{quality.min}–{quality.max}</b></span><span>Turni consecutivi <b>{quality.consecutive}</b></span><span>Ripetizioni compagno <b>max {quality.maxPartnerRepeats} · media {quality.averagePartnerRepeats.toFixed(1)}</b></span><span>Squilibrio livello <b>{quality.levelImbalance.toFixed(1)}</b></span><span>Coppie miste <b>{quality.mixedPercent}%</b></span></div></section>
    <section className="content-panel"><h2>Equilibrio delle partite</h2><p>Equilibrio medio del calendario: <b>{balance.average}/100</b></p><div className="calendar-balance">{(['excellent', 'balanced', 'acceptable', 'unbalanced', 'very_unbalanced'] as const).map(label => <div key={label}><b>{balance.counts[label]}</b><span>{MATCH_BALANCE_LABELS[label]}</span></div>)}</div>{balance.best && <p>Migliore: <b>{balance.best.rating.score}/100</b> · {balance.best.match.start} — Peggiore: <b>{balance.worst!.rating.score}/100</b> · {balance.worst!.match.start}</p>}</section>
    <section className="content-panel"><h2>Distribuzione partite</h2><div className="distribution">{tournament.players.map(player => <div key={player.id}><span>{fullName(player)}</span><div className="bar"><i style={{ width: `${Math.min(100, (counts.get(player.id) ?? 0) / Math.max(1, tournament.settings.targetMatchesPerPlayer) * 100)}%` }} /></div><strong>{counts.get(player.id) ?? 0}</strong></div>)}</div></section>
    {quality.violations > 0 && <section className="notice"><AlertTriangle size={18} /> Le segnalazioni descrivono la soluzione migliore trovata quando tutti i criteri non sono compatibili.</section>}
  </>;
}
