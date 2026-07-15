import { Match, Player, Tournament, levelValue } from '../models';

export type MatchBalanceLabel = 'excellent' | 'balanced' | 'acceptable' | 'unbalanced' | 'very_unbalanced';
export type MatchBalanceRating = {
  score: number;
  label: MatchBalanceLabel;
  teamAStrength: number;
  teamBStrength: number;
  strengthDifference: number;
  teamAInternalDifference: number;
  teamBInternalDifference: number;
  warnings: string[];
  explanation: string;
};

export const MATCH_BALANCE_LABELS: Record<MatchBalanceLabel, string> = {
  excellent: 'Equilibrio eccellente', balanced: 'Partita equilibrata', acceptable: 'Equilibrio accettabile',
  unbalanced: 'Partita sbilanciata', very_unbalanced: 'Partita molto sbilanciata',
};

export const isBalanceWarning = (warning: string) => warning === 'Due giocatori avanzati non possono giocare contro due principianti.' || warning.startsWith('Rating di equilibrio basso:') || warning.startsWith('Il livello di uno o più giocatori');

const validLevels = new Set(Object.keys(levelValue));
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function playerLevel(player: Player | undefined) {
  return player && validLevels.has(player.level) ? levelValue[player.level] : levelValue.Intermedio;
}

function isMixedTeam(first: Player | undefined, second: Player | undefined) {
  return first?.gender !== 'Altro' && second?.gender !== 'Altro' && Boolean(first?.gender && second?.gender && first.gender !== second.gender);
}

export function calculateMatchBalance(match: Match, players: Player[]): MatchBalanceRating {
  const playerById = new Map(players.map(player => [player.id, player]));
  const selected = match.players.map(id => playerById.get(id));
  const levels = selected.map(playerLevel);
  const [a1, a2, b1, b2] = levels;
  const teamAStrength = a1 + a2; const teamBStrength = b1 + b2;
  const strengthDifference = Math.abs(teamAStrength - teamBStrength);
  const teamAInternalDifference = Math.abs(a1 - a2); const teamBInternalDifference = Math.abs(b1 - b2);
  const warnings: string[] = [];
  if (selected.some(player => !player || !validLevels.has(player.level))) warnings.push('Il livello di uno o più giocatori non è definito. È stato utilizzato il livello intermedio.');
  const advancedVsBeginners = (a1 === 3 && a2 === 3 && b1 === 1 && b2 === 1) || (b1 === 3 && b2 === 3 && a1 === 1 && a2 === 1);
  if (advancedVsBeginners) warnings.push('Due giocatori avanzati non possono giocare contro due principianti.');
  const internalPenalty = (teamAInternalDifference + teamBInternalDifference) * 3;
  const mixedTeamsBonus = isMixedTeam(selected[0], selected[1]) && isMixedTeam(selected[2], selected[3]) ? 2 : 0;
  let score = 100 - strengthDifference * 20 - internalPenalty + mixedTeamsBonus;
  if (advancedVsBeginners) score = Math.min(score, 35);
  score = clamp(score);
  const label: MatchBalanceLabel = score >= 90 ? 'excellent' : score >= 75 ? 'balanced' : score >= 60 ? 'acceptable' : score >= 40 ? 'unbalanced' : 'very_unbalanced';
  if (score < 60 && !advancedVsBeginners) warnings.push(`Rating di equilibrio basso: ${score}/100.`);
  const forceExplanation = strengthDifference === 0 ? 'Le due coppie hanno la stessa forza complessiva.' : `La coppia A ha una forza stimata di ${teamAStrength}, mentre la coppia B ha una forza stimata di ${teamBStrength}.`;
  const internalExplanation = teamAInternalDifference + teamBInternalDifference >= 2 ? ' Le coppie includono giocatori con livelli differenti, quindi ricevono una piccola penalità tecnica.' : '';
  const explanation = advancedVsBeginners ? 'Partita molto sbilanciata: due giocatori avanzati affrontano due principianti.' : `${forceExplanation}${internalExplanation}`;
  return { score, label, teamAStrength, teamBStrength, strengthDifference, teamAInternalDifference, teamBInternalDifference, warnings, explanation };
}

export type CalendarBalanceSummary = { average: number; ratings: MatchBalanceRating[]; counts: Record<MatchBalanceLabel, number>; best?: { match: Match; rating: MatchBalanceRating }; worst?: { match: Match; rating: MatchBalanceRating } };

export function calculateCalendarBalance(tournament: Tournament): CalendarBalanceSummary {
  const entries = tournament.matches.map(match => ({ match, rating: calculateMatchBalance(match, tournament.players) }));
  const counts: Record<MatchBalanceLabel, number> = { excellent: 0, balanced: 0, acceptable: 0, unbalanced: 0, very_unbalanced: 0 };
  entries.forEach(entry => { counts[entry.rating.label] += 1; });
  const sorted = [...entries].sort((a, b) => b.rating.score - a.rating.score);
  return { average: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.rating.score, 0) / entries.length) : 0, ratings: entries.map(entry => entry.rating), counts, best: sorted[0], worst: sorted[sorted.length - 1] };
}
