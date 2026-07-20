import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock3, Expand, Minimize, Pause, Play, Redo2, RotateCcw, TimerReset, Undo2, Volume2 } from 'lucide-react';
import { AdvantageTeam, LiveMatchScore, LiveMatchState, LiveScoreValidationResult, Match, MatchPhase, MatchStatus, Tournament, fullName } from '../models';
import { formatRemainingTime } from '../services/liveMatch';
import { MATCH_OUTCOME_LABELS, calculateMatchOutcome } from '../services/matchResults';
import { useMatchDashboard } from '../hooks/useMatchDashboard';
import { TeamScorePanel } from './TeamScorePanel';

type Props = { tournament: Tournament; match: Match; index: number; onClose: () => void; onPersist: (live: LiveMatchState, status: MatchStatus) => void; onFinish: (score: LiveMatchScore, live: LiveMatchState) => void; onReset: (live: LiveMatchState) => void };
const statusLabel: Record<MatchStatus, string> = { scheduled: 'Programmato', in_progress: 'Partita in corso', paused: 'In pausa', time_expired: 'Tempo scaduto', completed: 'Partita conclusa', cancelled: 'Annullata' };
const phaseLabel: Record<MatchPhase, string> = { warmup: 'Riscaldamento / cambio campo', coin_toss: 'Per la palla', playing: '' };

export function MatchDashboard({ tournament, match, index, onClose, onPersist, onFinish, onReset }: Props) {
  const names = new Map(tournament.players.map(player => [player.id, fullName(player)]));
  const [feedback, setFeedback] = useState('');
  const maxGames = tournament.settings.maxGamesPerMatch ?? 6;
  const dashboard = useMatchDashboard({ match, durationMinutes: tournament.settings.playMinutes || 12, warmupMinutes: tournament.settings.warmupMinutes || 3, maxGames, onPersist });
  const completed = dashboard.status === 'completed';
  const phase = dashboard.live.phase;
  const outcome = calculateMatchOutcome(dashboard.live.score.teamAGames, dashboard.live.score.teamBGames);
  const unfinishedGame = describeUnfinishedGame(dashboard.live.score);
  const pointStatus = dashboard.live.score.advantageTeam === 'team_a'
    ? 'VANTAGGIO COPPIA A'
    : dashboard.live.score.advantageTeam === 'team_b'
      ? 'VANTAGGIO COPPIA B'
      : dashboard.live.score.teamAPoints === 40 && dashboard.live.score.teamBPoints === 40
        ? 'PARITÀ · 40–40'
        : null;
  const award = useCallback((team: 'team_a' | 'team_b') => {
    if (completed || phase !== 'playing') return;
    dashboard.point(team);
    setFeedback(`Punto coppia ${team === 'team_a' ? 'A' : 'B'}`);
    window.setTimeout(() => setFeedback(''), 700);
  }, [completed, dashboard, phase]);
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen?.(); } catch { /* Fullscreen is optional. */ } };
  const finish = () => {
    const incompleteMessage = unfinishedGame ? `\n\n${unfinishedGame}\nIl game incompleto non verrà conteggiato.` : '';
    if (!window.confirm(`Termina la partita?\n\nCoppia A: ${dashboard.live.score.teamAGames} game\nCoppia B: ${dashboard.live.score.teamBGames} game\nRisultato: ${MATCH_OUTCOME_LABELS[outcome]}\nTempo residuo: ${formatRemainingTime(dashboard.remainingMilliseconds)}${incompleteMessage}`)) return;
    dashboard.finish();
    onFinish(dashboard.live.score, dashboard.live);
  };
  const reset = () => { if (window.confirm('Vuoi azzerare completamente questa partita? Questa operazione cancellerà timer, punteggio e cronologia.')) onReset(dashboard.resetMatch()); };
  const reopen = () => { if (window.confirm('Stai modificando una partita già conclusa. La classifica verrà ricalcolata.')) dashboard.setStatus('in_progress'); };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); dashboard.redo(); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); dashboard.undo(); }
      else if (event.key.toLowerCase() === 'a') award('team_a');
      else if (event.key.toLowerCase() === 'l') award('team_b');
      else if (event.key === ' ') { event.preventDefault(); if (phase === 'warmup') dashboard.live.warmupTimer.status === 'running' ? dashboard.pauseWarmup() : dashboard.startWarmup(); else dashboard.live.timer.status === 'running' ? dashboard.pauseTimer() : dashboard.startTimer(); }
      else if (event.key.toLowerCase() === 'f') void toggleFullscreen();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [award, dashboard, phase]);

  return <div className="match-dashboard">
    <header className="dashboard-header">
      <button className="secondary" onClick={onClose}><ArrowLeft /> Torna al torneo</button>
      <div><b>{tournament.settings.title}</b><span>Partita {index + 1} · {match.start}–{match.end}</span></div>
      <div className="dashboard-status"><span>{phase !== 'playing' ? phaseLabel[phase] : statusLabel[dashboard.status]}</span><button className="secondary" onClick={() => void toggleFullscreen()}>{document.fullscreenElement ? <Minimize /> : <Expand />} Schermo intero</button></div>
    </header>
    <main className="dashboard-main">
      {phase === 'warmup' ? <div className={`timer-display timer-${dashboard.live.warmupTimer.status}`}>
        <small>{dashboard.live.warmupTimer.status === 'expired' ? 'RISCALDAMENTO TERMINATO' : phaseLabel.warmup.toUpperCase()}</small>
        <strong>{formatRemainingTime(dashboard.remainingWarmupMilliseconds)}</strong>
      </div> : <div className={`timer-display timer-${dashboard.live.timer.status}`}>
        <small>{dashboard.live.timer.status === 'expired' ? 'TEMPO SCADUTO' : phase === 'coin_toss' ? phaseLabel.coin_toss : statusLabel[dashboard.status]}</small>
        <strong>{formatRemainingTime(dashboard.remainingMilliseconds)}</strong>
        {phase === 'playing' && <span>{dashboard.live.servingTeam === 'team_a' ? 'Servizio: Coppia A' : 'Servizio: Coppia B'}</span>}
        {dashboard.live.timer.status === 'expired' && unfinishedGame && <em>{unfinishedGame}</em>}
      </div>}
      {phase === 'coin_toss' && <div className="coin-toss-prompt">
        <p>Chi serve per primo?</p>
        <div>
          <button onClick={() => dashboard.assignFirstServer('team_a')}>Coppia A</button>
          <button onClick={() => dashboard.assignFirstServer('team_b')}>Coppia B</button>
        </div>
      </div>}
      <div className="scoreboard">
        <TeamScorePanel team="A" players={[names.get(match.players[0]) ?? '—', names.get(match.players[1]) ?? '—']} games={dashboard.live.score.teamAGames} points={dashboard.live.score.teamAPoints} hasAdvantage={dashboard.live.score.advantageTeam === 'team_a'} serving={phase === 'playing' && dashboard.live.servingTeam === 'team_a'} disabled={completed || phase !== 'playing'} onPoint={() => award('team_a')} />
        <div className={`versus${pointStatus ? ' point-status' : ''}`}><b>VS</b><span>{pointStatus ?? (outcome === 'team_a' ? 'Coppia A avanti nei game' : outcome === 'team_b' ? 'Coppia B avanti nei game' : 'Pareggio nei game')}</span></div>
        <TeamScorePanel team="B" players={[names.get(match.players[2]) ?? '—', names.get(match.players[3]) ?? '—']} games={dashboard.live.score.teamBGames} points={dashboard.live.score.teamBPoints} hasAdvantage={dashboard.live.score.advantageTeam === 'team_b'} serving={phase === 'playing' && dashboard.live.servingTeam === 'team_b'} disabled={completed || phase !== 'playing'} onPoint={() => award('team_b')} />
      </div>
      {feedback && <div className="point-feedback" role="status">{feedback}</div>}
      {phase === 'warmup' ? <div className="dashboard-primary-controls">
        <button onClick={dashboard.live.warmupTimer.status === 'running' ? dashboard.pauseWarmup : dashboard.startWarmup}>{dashboard.live.warmupTimer.status === 'running' ? <Pause /> : <Play />}{dashboard.live.warmupTimer.status === 'paused' ? 'Riprendi' : dashboard.live.warmupTimer.status === 'running' ? 'Pausa' : 'Avvia riscaldamento'}</button>
        <button className="finish-button" disabled={dashboard.live.warmupTimer.status !== 'expired'} onClick={dashboard.confirmMatchStart}><Play /> Avvia partita</button>
      </div> : <div className="dashboard-primary-controls">
        <button disabled={completed} onClick={dashboard.live.timer.status === 'running' ? dashboard.pauseTimer : dashboard.startTimer}>{dashboard.live.timer.status === 'running' ? <Pause /> : <Play />}{dashboard.live.timer.status === 'paused' ? 'Riprendi' : dashboard.live.timer.status === 'running' ? 'Pausa' : 'Avvia'}</button>
        <button className="secondary" disabled={!dashboard.live.history.length || completed} onClick={dashboard.undo}><Undo2 /> Annulla punto</button>
        {completed ? <button onClick={reopen}>Modifica risultato</button> : <button className="finish-button" onClick={finish}>Termina partita</button>}
      </div>}
      {phase === 'warmup' ? <details className="secondary-controls"><summary>Altri controlli</summary><div className="dashboard-controls">
        <button className="secondary" onClick={dashboard.resetWarmup}><TimerReset /> Azzera riscaldamento</button>
        <button className="secondary" onClick={() => dashboard.adjustWarmup(-30_000)}><Clock3 /> −30 s</button>
        <button className="secondary" onClick={() => dashboard.adjustWarmup(30_000)}><Clock3 /> +30 s</button>
      </div></details> : <details className="secondary-controls"><summary>Altri controlli</summary><div className="dashboard-controls">
        <button className="secondary" disabled={completed} onClick={dashboard.resetTimer}><TimerReset /> Azzera timer</button>
        <button className="secondary" disabled={completed} onClick={() => dashboard.adjustTimer(-30_000)}><Clock3 /> −30 s</button>
        <button className="secondary" disabled={completed} onClick={() => dashboard.adjustTimer(30_000)}><Clock3 /> +30 s</button>
        <button className="secondary" disabled={!dashboard.live.redo.length || completed} onClick={dashboard.redo}><Redo2 /> Ripristina</button>
        <button className="secondary" disabled={completed} onClick={dashboard.resetCurrentGame}><RotateCcw /> Reset game</button>
        <button className="secondary" onClick={() => dashboard.setLive(current => ({ ...current, audioEnabled: !current.audioEnabled, lastUpdated: Date.now() }))}><Volume2 /> Suono {dashboard.live.audioEnabled ? 'attivo' : 'disattivo'}</button>
        <button className="danger" onClick={reset}>Reset partita</button>
      </div></details>}
      {phase === 'playing' && <details className="manual-editor">
        <summary>Correzione manuale e guida scorciatoie</summary>
        <p>A / L: punto coppia · Spazio: pausa/riprendi · Ctrl/Cmd+Z: annulla · Ctrl/Cmd+Shift+Z: ripristina · F: schermo intero.</p>
        <ManualEditor score={dashboard.live.score} maxGames={maxGames} onSave={dashboard.setManualScore} />
      </details>}
      {phase === 'playing' && <section className="score-history"><h2>Ultime azioni</h2>{dashboard.live.history.length ? dashboard.live.history.slice(-5).reverse().map(action => <p key={action.id}>{new Date(action.timestamp).toLocaleTimeString('it-IT')} · {action.type.replaceAll('_', ' ')}</p>) : <p>Nessuna azione</p>}</section>}
    </main>
  </div>;
}

function describeUnfinishedGame(score: LiveMatchScore) {
  if (score.teamAPoints === 0 && score.teamBPoints === 0) return '';
  if (score.advantageTeam) return `Game in corso: vantaggio coppia ${score.advantageTeam === 'team_a' ? 'A' : 'B'}.`;
  if (score.teamAPoints === 40 && score.teamBPoints === 40) return 'Game in corso: parità 40–40.';
  return `Game in corso: ${score.teamAPoints}–${score.teamBPoints}.`;
}

function ManualEditor({ score, maxGames, onSave }: { score: LiveMatchScore; maxGames: number; onSave: (score: LiveMatchScore) => LiveScoreValidationResult }) {
  const [draft, setDraft] = useState(score);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(score); setError(''); }, [score]);
  const setPoints = (team: 'team_a' | 'team_b', value: LiveMatchScore['teamAPoints']) => setDraft(current => {
    const teamAPoints = team === 'team_a' ? value : current.teamAPoints;
    const teamBPoints = team === 'team_b' ? value : current.teamBPoints;
    return { ...current, teamAPoints, teamBPoints, advantageTeam: teamAPoints === 40 && teamBPoints === 40 ? current.advantageTeam : null };
  });
  const save = () => { const result = onSave(draft); setError(result.errors.join(' ')); };
  const advantageEnabled = draft.teamAPoints === 40 && draft.teamBPoints === 40;
  return <div className="manual-fields">
    <label>Game A<input type="number" min="0" max={maxGames} value={draft.teamAGames} onChange={event => setDraft({ ...draft, teamAGames: Number(event.target.value) })} /></label>
    <label>Game B<input type="number" min="0" max={maxGames} value={draft.teamBGames} onChange={event => setDraft({ ...draft, teamBGames: Number(event.target.value) })} /></label>
    <label>Punti A<select value={draft.teamAPoints} onChange={event => setPoints('team_a', Number(event.target.value) as LiveMatchScore['teamAPoints'])}>{[0, 15, 30, 40].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>Punti B<select value={draft.teamBPoints} onChange={event => setPoints('team_b', Number(event.target.value) as LiveMatchScore['teamBPoints'])}>{[0, 15, 30, 40].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>Vantaggio<select disabled={!advantageEnabled} value={draft.advantageTeam ?? ''} onChange={event => setDraft({ ...draft, advantageTeam: (event.target.value || null) as AdvantageTeam })}><option value="">Nessuno</option><option value="team_a">Coppia A</option><option value="team_b">Coppia B</option></select></label>
    <button onClick={save}>Applica correzione</button>
    {error && <p className="manual-error" role="alert">{error}</p>}
  </div>;
}
