import { MonitorPlay, RotateCcw } from 'lucide-react';
import { Standing, Tournament, fullName } from '../models';
import { resetMatchForReplay } from '../services/liveMatch';
import { MATCH_OUTCOME_LABELS, getMatchOutcome, isMatchCompleted, scoreFromInput } from '../services/matchResults';

export function Results({ tournament, standings, update, onOpenDashboard }: { tournament: Tournament; standings: Standing[]; update: (fn: (t: Tournament) => Tournament) => void; onOpenDashboard: (matchId: string) => void }) {
  const names = new Map(tournament.players.map(player => [player.id, fullName(player)]));
  const maxGames = tournament.settings.maxGamesPerMatch ?? 6;
  const setScore = (id: string, side: 'aGames' | 'bGames', raw: string) => { const score = scoreFromInput(raw); if (raw !== '' && score === null) return; update(t => ({ ...t, matches: t.matches.map(match => match.id === id ? { ...match, result: { aGames: side === 'aGames' ? score : match.result?.aGames ?? null, bGames: side === 'bGames' ? score : match.result?.bGames ?? null } } : match) })); };
  const reset = (id: string, completed: boolean) => { if (!completed || window.confirm('Vuoi cancellare il risultato di questa partita?')) update(t => ({ ...t, matches: t.matches.map(match => match.id === id ? resetMatchForReplay(match, t.settings.playMinutes) : match) })); };

  return <>
    <header className="page-header"><div><h1>Risultati e classifica</h1><p>Inserisci i game: risultato e classifica si aggiornano automaticamente.</p></div></header>
    <div className="results-layout">
      <section className="results-list" aria-labelledby="matches-results-title"><h2 id="matches-results-title">Partite</h2>
        {!tournament.matches.length && <div className="inline-empty"><span aria-hidden="true">🎾</span><p>Genera il calendario per inserire i risultati.</p></div>}
        {tournament.matches.map((match, index) => {
          const result = match.result ?? { aGames: null, bGames: null };
          const outcome = getMatchOutcome(match);
          const canReset = Boolean(match.result || isMatchCompleted(match));
          return <article className="result" key={match.id}>
            <div className="result-head"><span><b>{match.start}</b><small>Partita {index + 1}</small></span><span className={`outcome-badge outcome-${outcome}`} role="status" aria-label={`Risultato partita: ${MATCH_OUTCOME_LABELS[outcome]}.`}>{MATCH_OUTCOME_LABELS[outcome]}{outcome === 'incomplete' && <small>Completa i punteggi</small>}</span></div>
            <div className="result-team result-team-a"><span><small>Coppia A</small><b>{names.get(match.players[0])}</b><b>{names.get(match.players[1])}</b></span><label>Game A<input aria-label={`Game coppia A, partita ${index + 1}`} inputMode="numeric" type="number" min="0" max={maxGames} step="1" placeholder="—" value={result.aGames ?? ''} onChange={event => setScore(match.id, 'aGames', event.target.value)} /></label></div>
            <div className="result-divider"><span>VS</span></div>
            <div className="result-team result-team-b"><span><small>Coppia B</small><b>{names.get(match.players[2])}</b><b>{names.get(match.players[3])}</b></span><label>Game B<input aria-label={`Game coppia B, partita ${index + 1}`} inputMode="numeric" type="number" min="0" max={maxGames} step="1" placeholder="—" value={result.bGames ?? ''} onChange={event => setScore(match.id, 'bGames', event.target.value)} /></label></div>
            <div className="result-actions"><button className="secondary" onClick={() => onOpenDashboard(match.id)}><MonitorPlay size={16} /> Cruscotto</button>{canReset && <button className="secondary" aria-label={`Annulla risultato partita ${index + 1}`} onClick={() => reset(match.id, isMatchCompleted(match))}><RotateCcw size={16} /> Annulla</button>}</div>
          </article>;
        })}
      </section>
      <section className="standings-panel" aria-labelledby="standings-title"><h2 id="standings-title">Classifica</h2>
        <table className="desktop-standings"><thead><tr><th>#</th><th>Giocatore</th><th>Pt</th><th>PG</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th></tr></thead><tbody>{standings.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.name}{row.coinToss && <small className="coin"> monetina necessaria</small>}</td><td><b>{row.points}</b></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.gf}</td><td>{row.ga}</td></tr>)}</tbody></table>
        <ol className="mobile-leaderboard">{standings.map((row, index) => <li key={row.id}><details><summary><span className="leaderboard-position">{index + 1}</span><span className="leaderboard-name"><b>{row.name}</b><small>{row.played} partite · differenza game {row.gf - row.ga >= 0 ? '+' : ''}{row.gf - row.ga}</small>{row.coinToss && <em>Monetina necessaria</em>}</span><span className="leaderboard-points"><b>{row.points}</b><small>PT</small></span></summary><dl><div><dt>Vittorie</dt><dd>{row.wins}</dd></div><div><dt>Pareggi</dt><dd>{row.draws}</dd></div><div><dt>Sconfitte</dt><dd>{row.losses}</dd></div><div><dt>Game fatti</dt><dd>{row.gf}</dd></div><div><dt>Game subiti</dt><dd>{row.ga}</dd></div></dl></details></li>)}</ol>
      </section>
    </div>
  </>;
}
