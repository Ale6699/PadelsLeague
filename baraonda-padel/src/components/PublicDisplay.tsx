import { Standing, Tournament, fullName } from '../models';

export function PublicDisplay({ tournament, standings }: { tournament: Tournament; standings: Standing[] }) {
  const names = new Map(tournament.players.map(player => [player.id, fullName(player)])); const next = tournament.matches.find(match => !match.result?.outcome) ?? tournament.matches[0];
  return <div className="public"><h1>{tournament.settings.title}</h1><p>{tournament.settings.date}</p>{next && <div className="next"><small>PROSSIMA PARTITA · {next.start}</small><div><b>{names.get(next.players[0])}<br />{names.get(next.players[1])}</b><strong>VS</strong><b>{names.get(next.players[2])}<br />{names.get(next.players[3])}</b></div></div>}<h2>Classifica live</h2><ol>{standings.slice(0, 10).map(row => <li key={row.id}><span>{row.name}</span><b>{row.points} pt</b></li>)}</ol></div>;
}
