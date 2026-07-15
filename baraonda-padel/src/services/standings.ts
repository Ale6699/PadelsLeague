import { Standing, Tournament, fullName } from '../models';
import { getMatchOutcome, isMatchCompleted } from './matchResults';

export function getStandings(tournament: Tournament): Standing[] {
  const rows = tournament.players.map(player => ({ id: player.id, name: fullName(player), points: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 }));
  const byId = new Map(rows.map(row => [row.id, row]));
  tournament.matches.forEach(match => {
    if (match.status && match.status !== 'completed') return;
    if (!isMatchCompleted(match)) return;
    const outcome = getMatchOutcome(match); const aGames = match.result?.aGames ?? 0; const bGames = match.result?.bGames ?? 0;
    const write = (id: string, points: number, won: boolean, drawn: boolean, gf: number, ga: number) => { const row = byId.get(id)!; row.played += 1; row.points += points; row.gf += gf; row.ga += ga; if (won) row.wins += 1; else if (drawn) row.draws += 1; else row.losses += 1; };
    match.players.slice(0, 2).forEach(id => write(id, outcome === 'team_a' ? 3 : outcome === 'draw' ? 1 : 0, outcome === 'team_a', outcome === 'draw', aGames, bGames));
    match.players.slice(2).forEach(id => write(id, outcome === 'team_b' ? 3 : outcome === 'draw' ? 1 : 0, outcome === 'team_b', outcome === 'draw', bGames, aGames));
  });
  const sorted = rows.sort((a, b) => b.points - a.points || b.played - a.played || b.gf - a.gf || a.ga - b.ga || a.name.localeCompare(b.name));
  return sorted.map((row, index) => ({ ...row, coinToss: index > 0 && row.points === sorted[index - 1].points && row.played === sorted[index - 1].played && row.gf === sorted[index - 1].gf && row.ga === sorted[index - 1].ga }));
}
