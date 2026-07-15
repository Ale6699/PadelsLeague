import { Standing, Tournament, fullName } from '../models';

export function getStandings(tournament: Tournament): Standing[] {
  const rows = tournament.players.map(player => ({ id: player.id, name: fullName(player), points: 0, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 }));
  const byId = new Map(rows.map(row => [row.id, row]));
  tournament.matches.forEach(match => {
    const result = match.result; if (!result?.outcome) return;
    const write = (id: string, points: number, won: boolean, drawn: boolean, gf: number, ga: number) => { const row = byId.get(id)!; row.played += 1; row.points += points; row.gf += gf; row.ga += ga; if (won) row.wins += 1; else if (drawn) row.draws += 1; else row.losses += 1; };
    match.players.slice(0, 2).forEach(id => write(id, result.outcome === 'A' ? 3 : result.outcome === 'D' ? 1 : 0, result.outcome === 'A', result.outcome === 'D', result.aGames, result.bGames));
    match.players.slice(2).forEach(id => write(id, result.outcome === 'B' ? 3 : result.outcome === 'D' ? 1 : 0, result.outcome === 'B', result.outcome === 'D', result.bGames, result.aGames));
  });
  const sorted = rows.sort((a, b) => b.points - a.points || b.played - a.played || b.gf - a.gf || a.ga - b.ga || a.name.localeCompare(b.name));
  return sorted.map((row, index) => ({ ...row, coinToss: index > 0 && row.points === sorted[index - 1].points && row.played === sorted[index - 1].played && row.gf === sorted[index - 1].gf && row.ga === sorted[index - 1].ga }));
}
