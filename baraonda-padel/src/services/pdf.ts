import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PlayerStatus, Tournament, fullName } from '../models';
import { getStandings } from './standings';
import { MATCH_OUTCOME_LABELS, getMatchOutcome, isMatchCompleted } from './matchResults';

const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = { attivo: 'Attivo', ritardo: 'In ritardo', assente: 'Assente', infortunato: 'Infortunato', ritirato: 'Ritirato' };

export function exportTournamentPdf(tournament: Tournament) {
  const names = new Map(tournament.players.map(player => [player.id, fullName(player)]));
  const standings = getStandings(tournament); const doc = new jsPDF();
  doc.setFontSize(18); doc.text(tournament.settings.title, 14, 18);
  doc.setFontSize(10); doc.text(`${tournament.settings.date} · ${tournament.settings.start}–${tournament.settings.end} · 1 campo`, 14, 25);
  autoTable(doc, { startY: 32, head: [['Ora', 'Coppia A', 'Coppia B', 'Risultato / avvisi']], body: tournament.matches.map(match => [
    `${match.start}–${match.end}`, `${names.get(match.players[0])} / ${names.get(match.players[1])}`, `${names.get(match.players[2])} / ${names.get(match.players[3])}`,
    isMatchCompleted(match) ? `${match.result?.aGames ?? '–'}-${match.result?.bGames ?? '–'} · ${MATCH_OUTCOME_LABELS[getMatchOutcome(match)]}` : (match.violations.join('; ') || MATCH_OUTCOME_LABELS[getMatchOutcome(match)]),
  ]) });
  doc.addPage(); doc.setFontSize(16); doc.text('Classifica', 14, 18);
  autoTable(doc, { startY: 24, head: [['#', 'Giocatore', 'Pt', 'PG', 'V', 'N', 'P', 'GF', 'GS']], body: standings.map((row, i) => [i + 1, row.name, row.points, row.played, row.wins, row.draws, row.losses, row.gf, row.ga]) });
  const warnings = tournament.matches.flatMap(match => match.violations.map(violation => `${match.start}: ${violation}`));
  if (warnings.length) { doc.addPage(); doc.setFontSize(16); doc.text('Violazioni e note', 14, 18); autoTable(doc, { startY: 25, head: [['Dettaglio']], body: warnings.map(warning => [warning]) }); }
  doc.save(`${tournament.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'baraonda-padel'}.pdf`);
}

export function exportPlayersPdf(tournament: Tournament) {
  const players = [...tournament.players].sort((a, b) => fullName(a).localeCompare(fullName(b), 'it', { sensitivity: 'base' }));
  const doc = new jsPDF();
  doc.setFontSize(18); doc.text(`Giocatori · ${tournament.settings.title}`, 14, 18);
  doc.setFontSize(10); doc.text(`${tournament.settings.date} · ${players.length} giocatori`, 14, 25);
  autoTable(doc, { startY: 32, styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [30, 41, 59] }, head: [['Cognome Nome', 'Livello', 'Genere', 'Stato', 'Disponibilità', 'Note']], body: players.map(player => [
    `${player.lastName} ${player.firstName}`.trim(), player.level, player.gender, PLAYER_STATUS_LABELS[player.status] ?? player.status,
    player.availability.map(slot => `${slot.from}–${slot.to}`).join(', ') || '–', player.notes || '–',
  ]) });
  doc.save(`giocatori-${tournament.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'baraonda-padel'}.pdf`);
}
