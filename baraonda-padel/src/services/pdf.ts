import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tournament, fullName } from '../models';
import { getStandings } from './standings';

export function exportTournamentPdf(tournament: Tournament) {
  const names = new Map(tournament.players.map(player => [player.id, fullName(player)]));
  const standings = getStandings(tournament); const doc = new jsPDF();
  doc.setFontSize(18); doc.text(tournament.settings.title, 14, 18);
  doc.setFontSize(10); doc.text(`${tournament.settings.date} · ${tournament.settings.start}–${tournament.settings.end} · 1 campo`, 14, 25);
  autoTable(doc, { startY: 32, head: [['Ora', 'Coppia A', 'Coppia B', 'Risultato / avvisi']], body: tournament.matches.map(match => [
    `${match.start}–${match.end}`, `${names.get(match.players[0])} / ${names.get(match.players[1])}`, `${names.get(match.players[2])} / ${names.get(match.players[3])}`,
    match.result?.outcome ? `${match.result.aGames}-${match.result.bGames}` : (match.violations.join('; ') || 'Da giocare'),
  ]) });
  doc.addPage(); doc.setFontSize(16); doc.text('Classifica', 14, 18);
  autoTable(doc, { startY: 24, head: [['#', 'Giocatore', 'Pt', 'PG', 'V', 'N', 'P', 'GF', 'GS']], body: standings.map((row, i) => [i + 1, row.name, row.points, row.played, row.wins, row.draws, row.losses, row.gf, row.ga]) });
  const warnings = tournament.matches.flatMap(match => match.violations.map(violation => `${match.start}: ${violation}`));
  if (warnings.length) { doc.addPage(); doc.setFontSize(16); doc.text('Violazioni e note', 14, 18); autoTable(doc, { startY: 25, head: [['Dettaglio']], body: warnings.map(warning => [warning]) }); }
  doc.save(`${tournament.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'baraonda-padel'}.pdf`);
}
