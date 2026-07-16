import { memo, useMemo } from 'react';
import { Circle, RefreshCw } from 'lucide-react';
import { Match, Standing, Tournament, fullName } from '../models';
import { refreshOptions, useTournamentAutoRefresh } from '../hooks/useTournamentAutoRefresh';
import { calculateMatchBalance } from '../services/matchBalance';
import { isMatchCompleted } from '../services/matchResults';

const formatTime = (date: Date) => date.toLocaleTimeString('it-IT');
const isLive = (match: Match) => match.status === 'in_progress' || match.status === 'paused' || match.status === 'time_expired';

export const PublicDisplay = memo(function PublicDisplay({ tournament, standings, reloadTournament, storageKey }: { tournament: Tournament; standings: Standing[]; reloadTournament: () => boolean; storageKey: string }) {
  const names = useMemo(() => new Map(tournament.players.map(player => [player.id, fullName(player)])), [tournament.players]);
  const pendingMatches = useMemo(() => tournament.matches.filter(match => !isMatchCompleted(match)), [tournament.matches]);
  const featured = tournament.matches.find(isLive) ?? pendingMatches[0] ?? tournament.matches[0];
  const featuredRating = useMemo(() => featured ? calculateMatchBalance(featured, tournament.players) : undefined, [featured, tournament.players]);
  const upcoming = pendingMatches.filter(match => match.id !== featured?.id).slice(0, 3);
  const { refreshMs, setRefreshMs, lastRefresh, refreshNow } = useTournamentAutoRefresh({ storageKey, reloadTournament });

  return <div className="public">
    <div className="public-refresh"><label><span className={refreshMs ? 'online' : 'offline'}><Circle size={11} fill="currentColor" /></span><select aria-label="Frequenza aggiornamento automatico" value={refreshMs} onChange={event => setRefreshMs(Number(event.target.value))}>{refreshOptions.map(option => <option key={option} value={option}>{option ? `Ogni ${option / 1000} secondi` : 'Disattivato'}</option>)}</select></label><span>{refreshMs ? `Aggiornamento automatico ogni ${refreshMs / 1000} s` : 'Aggiornamento automatico disattivato'}</span><small>Ultimo aggiornamento: {formatTime(lastRefresh)}</small></div>
    <h1>{tournament.settings.title}</h1><p>{tournament.settings.date}</p>
    {featured && <div className="next">
      <small>{isLive(featured) ? `PARTITA LIVE · ${featured.start}` : `PROSSIMA PARTITA · ${featured.start}`}</small>
      <div><b>{names.get(featured.players[0])}<br />{names.get(featured.players[1])}</b><strong>VS</strong><b>{names.get(featured.players[2])}<br />{names.get(featured.players[3])}</b></div>
      {featured.liveState && <LiveScore match={featured} names={names} />}
      {featuredRating && !isLive(featured) && <p className="public-balance">Equilibrio: {featuredRating.score}/100</p>}
    </div>}
    {upcoming.length > 0 && <div className="upcoming"><h2>Prossime partite</h2>{upcoming.map(match => { const rating = calculateMatchBalance(match, tournament.players); return <div key={match.id}><span><b>{match.start}</b> · {names.get(match.players[0])} / {names.get(match.players[1])} — {names.get(match.players[2])} / {names.get(match.players[3])}</span><b>Equilibrio: {rating.score}/100</b></div>; })}</div>}
    <h2>Classifica live</h2><ol>{standings.slice(0, 10).map(row => <li key={row.id}><span>{row.name}</span><b>{row.points} pt</b></li>)}</ol>
    <button className="public-refresh-button" onClick={refreshNow} title="Aggiorna ora"><RefreshCw size={16} /> Aggiorna</button>
  </div>;
});

function LiveScore({ match, names }: { match: Match; names: Map<string, string> }) {
  const score = match.liveState!.score;
  const advantagePlayers = score.advantageTeam === 'team_a'
    ? `${names.get(match.players[0])} / ${names.get(match.players[1])}`
    : score.advantageTeam === 'team_b'
      ? `${names.get(match.players[2])} / ${names.get(match.players[3])}`
      : '';
  const pointLabel = advantagePlayers
    ? `Vantaggio ${advantagePlayers}`
    : score.teamAPoints === 40 && score.teamBPoints === 40
      ? 'Parità'
      : `${score.teamAPoints}–${score.teamBPoints}`;
  return <section className="public-live-score" aria-label="Punteggio live">
    <div><b>{score.teamAGames}</b><span>GAME</span></div>
    <strong>{pointLabel}</strong>
    <div><b>{score.teamBGames}</b><span>GAME</span></div>
  </section>;
}
