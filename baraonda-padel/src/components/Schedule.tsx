import { Lock, MonitorPlay, Share2, Shuffle, Trash2, Undo2, Unlock } from 'lucide-react';
import { useState } from 'react';
import { Match, MatchStatus, Tournament, fullName } from '../models';
import { generateSchedule } from '../solver';
import { MATCH_BALANCE_LABELS, calculateMatchBalance, isBalanceWarning } from '../services/matchBalance';
import { ShareScheduleDialog } from './ShareScheduleDialog';
import { exportTournamentPdf } from '../services/pdf';
import { isMatchCompleted } from '../services/matchResults';

const statusLabels: Record<MatchStatus, string> = { scheduled: 'Programmata', in_progress: 'In corso', paused: 'In pausa', time_expired: 'Tempo scaduto', completed: 'Conclusa', cancelled: 'Annullata' };

export function Schedule({ tournament, update, onOpenDashboard, onGeneratePublicLink }: { tournament: Tournament; update: (fn: (t: Tournament) => Tournament) => void; onOpenDashboard: (matchId: string) => void; onGeneratePublicLink: () => Promise<string> }) {
  const names = new Map(tournament.players.map(player => [player.id, fullName(player)]));
  const [dragged, setDragged] = useState<{ matchId: string; position: number }>();
  const [sharing, setSharing] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<{ kind: 'success' | 'error'; text: string }>();
  const regenerate = () => {
    const result = generateSchedule(tournament, true);
    if (result.status === 'impossible') {
      const text = result.reason ?? 'Non è stato possibile generare un calendario uniforme.';
      setGenerationMessage({ kind: 'error', text });
      window.alert(text);
      return;
    }
    update(t => ({ ...t, previousMatches: t.matches, matches: result.matches, scheduleNeedsRegeneration: false }));
    const text = result.commonMatchesPerPlayer === result.requestedMax ? `Assegnate ${result.commonMatchesPerPlayer} partite a ogni giocatore.` : `Massimo configurato: ${result.requestedMax}; assegnate: ${result.commonMatchesPerPlayer} partite per giocatore.`;
    setGenerationMessage({ kind: 'success', text });
    if (result.commonMatchesPerPlayer !== result.requestedMax) window.alert(text);
  };
  const clearAll = () => { if (!window.confirm('Vuoi eliminare le partite del calendario? Quelle bloccate o già disputate restano invariate. Potrai annullare con "Annulla rigenerazione".')) return; update(t => ({ ...t, previousMatches: t.matches, matches: t.matches.filter(match => match.locked || isMatchCompleted(match)) })); };
  const changePlayers = (match: Match, players: Match['players']) => { const rating = calculateMatchBalance({ ...match, players }, tournament.players); if (rating.score < 40 && !window.confirm(`Questa modifica genera una partita molto sbilanciata (${rating.score}/100).\nVuoi continuare?`)) return false; update(t => ({ ...t, matches: t.matches.map(item => item.id === match.id ? { ...item, players, violations: [...item.violations.filter(warning => !isBalanceWarning(warning) && warning !== 'Modifica manuale: verifica disponibilità e incompatibilità'), ...rating.warnings, 'Modifica manuale: verifica disponibilità e incompatibilità'] } : item) })); return true; };
  const replace = (match: Match, index: number, playerId: string) => { if (changePlayers(match, match.players.map((id, itemIndex) => itemIndex === index ? playerId : id) as Match['players'])) update(t => ({ ...t, scheduleNeedsRegeneration: true })); };
  const swap = (match: Match, source: number, target: number) => changePlayers(match, match.players.map((id, index) => index === source ? match.players[target] : index === target ? match.players[source] : id) as Match['players']);

  return <>
    <header className="page-header schedule-header"><div><h1>Calendario</h1><p>Le partite bloccate e disputate restano identiche.</p></div><div className="actions schedule-page-actions"><button className="secondary" disabled={!tournament.previousMatches} onClick={() => update(t => t.previousMatches ? { ...t, matches: t.previousMatches, previousMatches: undefined } : t)}><Undo2 size={17} /> Annulla</button><button className="secondary" disabled={!tournament.matches.length} onClick={() => setSharing(true)}><Share2 size={17} /> Condividi</button><button className="danger" disabled={!tournament.matches.length} onClick={clearAll}><Trash2 size={17} /> Svuota</button><button onClick={regenerate}><Shuffle size={17} /> Genera / rigenera</button></div></header>
    {generationMessage && <section className={generationMessage.kind === 'success' ? 'success-notice' : 'notice'} role={generationMessage.kind === 'error' ? 'alert' : 'status'}>{generationMessage.text}<button className="small secondary" onClick={() => setGenerationMessage(undefined)}>Chiudi</button></section>}
    {!tournament.players.length && <section className="notice">Aggiungi almeno quattro giocatori per generare il calendario.</section>}
    {!tournament.matches.length && tournament.players.length > 0 && <section className="empty-panel"><span aria-hidden="true">📅</span><h2>Calendario non ancora generato</h2><p>Quando i giocatori sono pronti, crea tutte le partite con un solo tocco.</p><button onClick={regenerate}><Shuffle size={17} /> Genera calendario</button></section>}
    <div className="schedule">{tournament.matches.map((match, matchIndex) => {
      const rating = calculateMatchBalance(match, tournament.players);
      const locked = match.locked || isMatchCompleted(match);
      const matchStatus = match.status ?? 'scheduled';
      return <article className={`match${match.violations.length || rating.warnings.length ? ' has-warning' : ''}`} key={match.id}>
        <div className="match-head"><div className="time"><span>{match.start}</span><small>fino alle {match.end}</small></div><div><span className={`match-status status-${matchStatus}`}>{statusLabels[matchStatus]}</span><small>Partita {matchIndex + 1}</small></div></div>
        <div className="match-content">
          <div className="teams" aria-label="Coppie della partita"><span className="team team-a"><small>Coppia A</small><b>{names.get(match.players[0])}</b><b>{names.get(match.players[1])}</b></span><strong>VS</strong><span className="team team-b"><small>Coppia B</small><b>{names.get(match.players[2])}</b><b>{names.get(match.players[3])}</b></span></div>
          <details className="balance-details"><summary><span className={`balance-badge balance-${rating.label}`} role="status" aria-label={`Rating equilibrio partita: ${rating.score} su 100, ${MATCH_BALANCE_LABELS[rating.label]}.`}>{rating.score}/100 · {MATCH_BALANCE_LABELS[rating.label]}</span></summary><div className="balance-detail"><p>{rating.explanation}</p><p>Forza coppia A: <b>{rating.teamAStrength}</b> · Forza coppia B: <b>{rating.teamBStrength}</b> · Differenza: <b>{rating.strengthDifference}</b></p>{rating.warnings.map(warning => <p className="balance-warning" key={warning}>{warning}</p>)}</div></details>
          <details className="position-editor"><summary>Modifica le 4 posizioni</summary><div className="positions">{match.players.map((id, index) => <label className="draggable-position" draggable key={`${match.id}-${index}`} onDragStart={() => setDragged({ matchId: match.id, position: index })} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragged?.matchId === match.id && dragged.position !== index) swap(match, dragged.position, index); setDragged(undefined); }}><span>{index < 2 ? `Coppia A · ${index + 1}` : `Coppia B · ${index - 1}`}</span><select aria-label={`Posizione ${index + 1} partita ${matchIndex + 1}`} value={id} onChange={event => replace(match, index, event.target.value)}>{tournament.players.map(player => <option key={player.id} value={player.id}>{fullName(player)}</option>)}</select></label>)}</div></details>
          {match.violations.filter(warning => !isBalanceWarning(warning)).map((violation, index) => <em key={index}>{violation}</em>)}
        </div>
        <div className="match-actions"><button className="secondary" onClick={() => onOpenDashboard(match.id)}><MonitorPlay size={17} /> Cruscotto</button><button className="icon secondary" aria-label={locked ? 'Sblocca partita' : 'Blocca partita'} title={locked ? 'Sblocca partita' : 'Blocca partita'} onClick={() => update(t => ({ ...t, matches: t.matches.map(item => item.id === match.id ? { ...item, locked: !item.locked } : item) }))}>{locked ? <Lock /> : <Unlock />}</button></div>
      </article>;
    })}</div>
    <ShareScheduleDialog tournament={tournament} open={sharing} onClose={() => setSharing(false)} onDownloadPdf={() => exportTournamentPdf(tournament)} onGeneratePublicLink={onGeneratePublicLink} />
  </>;
}
