import { AlertTriangle, FileDown } from 'lucide-react';
import { Tournament, fullName } from '../models';
import { buildSlots, calendarQuality } from '../solver';

export function Dashboard({ tournament, exportPdf }: { tournament: Tournament; exportPdf: () => void }) {
  const quality = calendarQuality(tournament); const counts = new Map(tournament.players.map(player => [player.id, 0]));
  tournament.matches.forEach(match => match.players.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
  return <><header><div><h1>{tournament.settings.title}</h1><p>{tournament.settings.date} · {tournament.settings.start}–{tournament.settings.end} · 1 campo</p></div><button onClick={exportPdf}><FileDown size={17} /> Esporta PDF</button></header>
    <div className="cards"><div className="card"><b>{tournament.players.length}</b><span>giocatori</span></div><div className="card"><b>{tournament.matches.length}</b><span>partite</span></div><div className="card"><b>{buildSlots(tournament.settings).length}</b><span>slot disponibili</span></div><div className="card warning"><b>{quality.violations}</b><span>segnalazioni</span></div></div>
    <section><h2>Qualità del calendario</h2><div className="quality"><span>Presenze <b>{quality.min}–{quality.max}</b></span><span>Turni consecutivi <b>{quality.consecutive}</b></span><span>Ripetizioni compagno <b>max {quality.maxPartnerRepeats} · media {quality.averagePartnerRepeats.toFixed(1)}</b></span><span>Squilibrio livello <b>{quality.levelImbalance.toFixed(1)}</b></span><span>Coppie miste <b>{quality.mixedPercent}%</b></span></div></section>
    <section><h2>Distribuzione partite</h2><div className="distribution">{tournament.players.map(player => <div key={player.id}><span>{fullName(player)}</span><div className="bar"><i style={{ width: `${Math.min(100, (counts.get(player.id) ?? 0) / Math.max(1, tournament.settings.targetMatchesPerPlayer) * 100)}%` }} /></div><strong>{counts.get(player.id) ?? 0}</strong></div>)}</div></section>
    {quality.violations > 0 && <section className="notice"><AlertTriangle size={18} /> Le segnalazioni descrivono la soluzione migliore trovata quando tutti i criteri non sono compatibili.</section>}
  </>;
}
