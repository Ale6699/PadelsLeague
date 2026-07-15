import { memo, useMemo } from 'react';
import { Circle, RefreshCw } from 'lucide-react';
import { Standing, Tournament, fullName } from '../models';
import { refreshOptions, useTournamentAutoRefresh } from '../hooks/useTournamentAutoRefresh';
import { calculateMatchBalance } from '../services/matchBalance';
import { isMatchCompleted } from '../services/matchResults';

const formatTime = (date: Date) => date.toLocaleTimeString('it-IT');

export const PublicDisplay = memo(function PublicDisplay({ tournament, standings, reloadTournament, storageKey }: { tournament: Tournament; standings: Standing[]; reloadTournament: () => boolean; storageKey: string }) {
  const names = useMemo(() => new Map(tournament.players.map(player => [player.id, fullName(player)])), [tournament.players]);
  const pendingMatches = useMemo(() => tournament.matches.filter(match => !isMatchCompleted(match)), [tournament.matches]);
  const next = pendingMatches[0] ?? tournament.matches[0];
  const nextRating = useMemo(() => next ? calculateMatchBalance(next, tournament.players) : undefined, [next, tournament.players]);
  const upcoming = pendingMatches.slice(1, 4);
  const { refreshMs, setRefreshMs, lastRefresh, refreshNow } = useTournamentAutoRefresh({ storageKey, reloadTournament });

  return <div className="public"><div className="public-refresh"><label><span className={refreshMs ? 'online' : 'offline'}><Circle size={11} fill="currentColor" /></span><select aria-label="Frequenza aggiornamento automatico" value={refreshMs} onChange={event => setRefreshMs(Number(event.target.value))}>{refreshOptions.map(option => <option key={option} value={option}>{option ? `Ogni ${option / 1000} secondi` : 'Disattivato'}</option>)}</select></label><span>{refreshMs ? `Aggiornamento automatico ogni ${refreshMs / 1000} s` : 'Aggiornamento automatico disattivato'}</span><small>Ultimo aggiornamento: {formatTime(lastRefresh)}</small></div><h1>{tournament.settings.title}</h1><p>{tournament.settings.date}</p>{next && <div className="next"><small>PROSSIMA PARTITA · {next.start}</small><div><b>{names.get(next.players[0])}<br />{names.get(next.players[1])}</b><strong>VS</strong><b>{names.get(next.players[2])}<br />{names.get(next.players[3])}</b></div>{nextRating && <p className="public-balance">Equilibrio: {nextRating.score}/100</p>}</div>}{upcoming.length > 0 && <div className="upcoming"><h2>Prossime partite</h2>{upcoming.map(match => { const rating = calculateMatchBalance(match, tournament.players); return <div key={match.id}><span><b>{match.start}</b> · {names.get(match.players[0])} / {names.get(match.players[1])} — {names.get(match.players[2])} / {names.get(match.players[3])}</span><b>Equilibrio: {rating.score}/100</b></div>; })}</div>}<h2>Classifica live</h2><ol>{standings.slice(0, 10).map(row => <li key={row.id}><span>{row.name}</span><b>{row.points} pt</b></li>)}</ol><button className="public-refresh-button" onClick={refreshNow} title="Aggiorna ora"><RefreshCw size={16} /> Aggiorna</button></div>;
});
