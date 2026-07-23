import { memo, useMemo, useState } from 'react';
import { CalendarDays, Circle, Radio, RefreshCw, Trophy } from 'lucide-react';
import { Match, Standing, Tournament, fullName } from '../models';
import { refreshOptions, useTournamentAutoRefresh } from '../hooks/useTournamentAutoRefresh';
import { calculateMatchBalance } from '../services/matchBalance';
import { isMatchCompleted } from '../services/matchResults';
import { PublicView } from '../publicView';

const formatTime = (date: Date) => date.toLocaleTimeString('it-IT');
const isLive = (match: Match) => match.status === 'in_progress' || match.status === 'paused' || match.status === 'time_expired';

type Props = {
  tournament: Tournament;
  standings: Standing[];
  reloadTournament: () => boolean;
  storageKey: string;
  view?: PublicView;
  onViewChange?: (view: PublicView) => void;
};

export const PublicDisplay = memo(function PublicDisplay({ tournament, standings, reloadTournament, storageKey, view = 'live', onViewChange }: Props) {
  const names = useMemo(() => new Map(tournament.players.map(player => [player.id, fullName(player)])), [tournament.players]);
  const sortedPlayers = useMemo(() => [...tournament.players].sort((a, b) => fullName(a).localeCompare(fullName(b), 'it')), [tournament.players]);
  const [filterPlayerId, setFilterPlayerId] = useState('');
  const filteredMatches = useMemo(() => filterPlayerId ? tournament.matches.filter(m => m.players.includes(filterPlayerId)) : tournament.matches, [tournament.matches, filterPlayerId]);
  const pendingMatches = useMemo(() => tournament.matches.filter(match => !isMatchCompleted(match)), [tournament.matches]);
  const featured = tournament.matches.find(isLive) ?? pendingMatches[0] ?? tournament.matches[0];
  const featuredRating = useMemo(() => featured ? calculateMatchBalance(featured, tournament.players) : undefined, [featured, tournament.players]);
  const upcoming = pendingMatches.filter(match => match.id !== featured?.id).slice(0, 3);
  const { refreshMs, setRefreshMs, lastRefresh, refreshNow } = useTournamentAutoRefresh({ storageKey, reloadTournament });

  return <div className={`public${onViewChange ? ' public-routed' : ''}`} data-mobile-view={view}>
    <div className="public-refresh"><label><span className={refreshMs ? 'online' : 'offline'}><Circle size={11} fill="currentColor" /></span><select aria-label="Frequenza aggiornamento automatico" value={refreshMs} onChange={event => setRefreshMs(Number(event.target.value))}>{refreshOptions.map(option => <option key={option} value={option}>{option ? `Ogni ${option / 1000} secondi` : 'Disattivato'}</option>)}</select></label><span>{refreshMs ? `Aggiornamento automatico ogni ${refreshMs / 1000} s` : 'Aggiornamento automatico disattivato'}</span><small>Ultimo aggiornamento: {formatTime(lastRefresh)}</small></div>
    <header className="public-heading"><h1>{tournament.settings.title}</h1><p>{tournament.settings.date}</p></header>
    {onViewChange && <nav className="public-mobile-tabs" aria-label="Viste del torneo"><button className={view === 'live' ? 'active' : ''} aria-current={view === 'live' ? 'page' : undefined} onClick={() => onViewChange('live')}><Radio size={17} /> Live</button><button className={view === 'schedule' ? 'active' : ''} aria-current={view === 'schedule' ? 'page' : undefined} onClick={() => onViewChange('schedule')}><CalendarDays size={17} /> Calendario</button><button className={view === 'standings' ? 'active' : ''} aria-current={view === 'standings' ? 'page' : undefined} onClick={() => onViewChange('standings')}><Trophy size={17} /> Classifica</button></nav>}

    <div className="public-view public-live-view">
      {featured ? <div className="next"><small>{isLive(featured) ? `PARTITA LIVE · ${featured.start}` : `PROSSIMA PARTITA · ${featured.start}`}</small><div><b>{names.get(featured.players[0])}<br />{names.get(featured.players[1])}</b><strong>VS</strong><b>{names.get(featured.players[2])}<br />{names.get(featured.players[3])}</b></div>{featured.liveState && <LiveScore match={featured} names={names} />}{featuredRating && !isLive(featured) && <p className="public-balance">Equilibrio: {featuredRating.score}/100</p>}</div> : <div className="public-empty"><span aria-hidden="true">🎾</span><h2>Partite non ancora disponibili</h2><p>Il calendario comparirà qui appena sarà pubblicato.</p></div>}
      <button className="public-refresh-button" onClick={refreshNow} title="Aggiorna ora"><RefreshCw size={16} /> Aggiorna</button>
    </div>

    {upcoming.length > 0 && <div className="upcoming public-desktop-upcoming"><h2>Prossime partite</h2>{upcoming.map(match => { const rating = calculateMatchBalance(match, tournament.players); return <div key={match.id}><span><b>{match.start}</b> · {names.get(match.players[0])} / {names.get(match.players[1])} — {names.get(match.players[2])} / {names.get(match.players[3])}</span><b>Equilibrio: {rating.score}/100</b></div>; })}</div>}

    <div className="public-view public-schedule-view"><div className="public-schedule-header"><h2>Calendario</h2><select className="public-player-filter" value={filterPlayerId} onChange={e => setFilterPlayerId(e.target.value)} aria-label="Filtra per giocatore"><option value="">Tutti i giocatori</option>{sortedPlayers.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></div><div className="public-schedule-list">{filteredMatches.length === 0 ? <p className="public-no-matches">Nessuna partita trovata.</p> : filteredMatches.map(match => { const idx = tournament.matches.indexOf(match); return <article key={match.id}><time>{match.start}<small>{match.end}</small></time><div><small>Partita {idx + 1}</small><b>{names.get(match.players[0])} / {names.get(match.players[1])}</b><span>contro</span><b>{names.get(match.players[2])} / {names.get(match.players[3])}</b></div>{match.result?.aGames != null && match.result.bGames != null ? <strong>{match.result.aGames}–{match.result.bGames}</strong> : <span className={`public-match-state state-${match.status}`}>{isLive(match) ? 'LIVE' : isMatchCompleted(match) ? 'Conclusa' : 'In programma'}</span>}</article>; })}</div></div>

    <div className="public-view public-standings-view"><h2>Classifica live</h2><ol>{standings.slice(0, 10).map((row, index) => <li key={row.id}><span className="public-position">{index + 1}</span><span>{row.name}<small>{row.played} partite · {row.gf}–{row.ga} game</small></span><b>{row.points} pt</b></li>)}</ol></div>
  </div>;
});

function LiveScore({ match, names }: { match: Match; names: Map<string, string> }) {
  const score = match.liveState!.score;
  const advantagePlayers = score.advantageTeam === 'team_a' ? `${names.get(match.players[0])} / ${names.get(match.players[1])}` : score.advantageTeam === 'team_b' ? `${names.get(match.players[2])} / ${names.get(match.players[3])}` : '';
  const pointLabel = advantagePlayers ? `Vantaggio ${advantagePlayers}` : score.teamAPoints === 40 && score.teamBPoints === 40 ? 'Parità' : `${score.teamAPoints}–${score.teamBPoints}`;
  return <section className="public-live-score" aria-label="Punteggio live"><div><b>{score.teamAGames}</b><span>GAME</span></div><strong>{pointLabel}</strong><div><b>{score.teamBGames}</b><span>GAME</span></div></section>;
}
