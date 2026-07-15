import { memo, useMemo } from 'react';
import { Circle, RefreshCw } from 'lucide-react';
import { Standing, Tournament, fullName } from '../models';
import { refreshOptions, useTournamentAutoRefresh } from '../hooks/useTournamentAutoRefresh';

const formatTime = (date: Date) => date.toLocaleTimeString('it-IT');

export const PublicDisplay = memo(function PublicDisplay({ tournament, standings, reloadTournament, storageKey }: { tournament: Tournament; standings: Standing[]; reloadTournament: () => boolean; storageKey: string }) {
  const names = useMemo(() => new Map(tournament.players.map(player => [player.id, fullName(player)])), [tournament.players]);
  const next = useMemo(() => tournament.matches.find(match => !match.result?.outcome) ?? tournament.matches[0], [tournament.matches]);
  const { refreshMs, setRefreshMs, lastRefresh, refreshNow } = useTournamentAutoRefresh({ storageKey, reloadTournament });

  return <div className="public"><div className="public-refresh"><label><span className={refreshMs ? 'online' : 'offline'}><Circle size={11} fill="currentColor" /></span><select aria-label="Frequenza aggiornamento automatico" value={refreshMs} onChange={event => setRefreshMs(Number(event.target.value))}>{refreshOptions.map(option => <option key={option} value={option}>{option ? `Ogni ${option / 1000} secondi` : 'Disattivato'}</option>)}</select></label><span>{refreshMs ? `Aggiornamento automatico ogni ${refreshMs / 1000} s` : 'Aggiornamento automatico disattivato'}</span><small>Ultimo aggiornamento: {formatTime(lastRefresh)}</small></div><h1>{tournament.settings.title}</h1><p>{tournament.settings.date}</p>{next && <div className="next"><small>PROSSIMA PARTITA · {next.start}</small><div><b>{names.get(next.players[0])}<br />{names.get(next.players[1])}</b><strong>VS</strong><b>{names.get(next.players[2])}<br />{names.get(next.players[3])}</b></div></div>}<h2>Classifica live</h2><ol>{standings.slice(0, 10).map(row => <li key={row.id}><span>{row.name}</span><b>{row.points} pt</b></li>)}</ol><button className="public-refresh-button" onClick={refreshNow} title="Aggiorna ora"><RefreshCw size={16} /> Aggiorna</button></div>;
});
