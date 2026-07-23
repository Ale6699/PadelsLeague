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

/** L'algoritmo punta sempre a 100; questa è solo la soglia minima configurabile dal torneo sotto la quale una partita viene segnalata. */
export const DEFAULT_MIN_ACCEPTABLE_BALANCE = 60;
export const MIN_ACCEPTABLE_BALANCE_RANGE = { min: 40, max: 75, step: 5 };

export const isBalanceWarning = (warning: string) => warning === 'Due giocatori avanzati non possono giocare contro due principianti.' || warning === 'Due giocatori avanzati non possono giocare contro una coppia con un principiante.' || warning.startsWith('Rating di equilibrio basso:') || warning.startsWith('Il livello di uno o più giocatori');

const validLevels = new Set(Object.keys(levelValue));
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function playerLevel(player: Player | undefined) {
  return player && validLevels.has(player.level) ? levelValue[player.level] : levelValue.Intermedio;
}

function isMixedTeam(first: Player | undefined, second: Player | undefined) {
  return first?.gender !== 'Altro' && second?.gender !== 'Altro' && Boolean(first?.gender && second?.gender && first.gender !== second.gender);
}

const isAdvancedPair = (x1: number, x2: number) => x1 === 3 && x2 === 3;
const isBeginnerPair = (x1: number, x2: number) => x1 === 1 && x2 === 1;
const isAdvancedBeginnerMix = (x1: number, x2: number) => (x1 === 3 && x2 === 1) || (x1 === 1 && x2 === 3);
/** Una coppia di due avanzati non deve mai affrontare una coppia con un principiante dentro (da solo o con un avanzato). */
const isOutmatched = (a1: number, a2: number, b1: number, b2: number) =>
  (isAdvancedPair(a1, a2) && (isBeginnerPair(b1, b2) || isAdvancedBeginnerMix(b1, b2))) ||
  (isAdvancedPair(b1, b2) && (isBeginnerPair(a1, a2) || isAdvancedBeginnerMix(a1, a2)));

/** Pure score arithmetic, shared with the solver's hot loop so the two can never drift. */
export function balanceScoreFromLevels(a1: number, a2: number, b1: number, b2: number, bothTeamsMixed: boolean): number {
  const strengthDifference = Math.abs(a1 + a2 - b1 - b2);
  const internalPenalty = (Math.abs(a1 - a2) + Math.abs(b1 - b2)) * 3;
  let score = 100 - strengthDifference * 20 - internalPenalty + (bothTeamsMixed ? 2 : 0);
  if (isOutmatched(a1, a2, b1, b2)) score = Math.min(score, 35);
  return clamp(score);
}

export function calculateMatchBalance(match: Match, players: Player[], minAcceptableBalance: number = DEFAULT_MIN_ACCEPTABLE_BALANCE): MatchBalanceRating {
  const playerById = new Map(players.map(player => [player.id, player]));
  const selected = match.players.map(id => playerById.get(id));
  const levels = selected.map(playerLevel);
  const [a1, a2, b1, b2] = levels;
  const teamAStrength = a1 + a2; const teamBStrength = b1 + b2;
  const strengthDifference = Math.abs(teamAStrength - teamBStrength);
  const teamAInternalDifference = Math.abs(a1 - a2); const teamBInternalDifference = Math.abs(b1 - b2);
  const warnings: string[] = [];
  if (selected.some(player => !player || !validLevels.has(player.level))) warnings.push('Il livello di uno o più giocatori non è definito. È stato utilizzato il livello intermedio.');
  const outmatched = isOutmatched(a1, a2, b1, b2);
  const vsAllBeginners = (isAdvancedPair(a1, a2) && isBeginnerPair(b1, b2)) || (isAdvancedPair(b1, b2) && isBeginnerPair(a1, a2));
  if (outmatched) warnings.push(vsAllBeginners ? 'Due giocatori avanzati non possono giocare contro due principianti.' : 'Due giocatori avanzati non possono giocare contro una coppia con un principiante.');
  const score = balanceScoreFromLevels(a1, a2, b1, b2, isMixedTeam(selected[0], selected[1]) && isMixedTeam(selected[2], selected[3]));
  const label: MatchBalanceLabel = score >= 90 ? 'excellent' : score >= 75 ? 'balanced' : score >= minAcceptableBalance ? 'acceptable' : score >= 40 ? 'unbalanced' : 'very_unbalanced';
  if (score < minAcceptableBalance && !outmatched) warnings.push(`Rating di equilibrio basso: ${score}/100.`);
  const forceExplanation = strengthDifference === 0 ? 'Le due coppie hanno la stessa forza complessiva.' : `La coppia A ha una forza stimata di ${teamAStrength}, mentre la coppia B ha una forza stimata di ${teamBStrength}.`;
  const internalExplanation = teamAInternalDifference + teamBInternalDifference >= 2 ? ' Le coppie includono giocatori con livelli differenti, quindi ricevono una piccola penalità tecnica.' : '';
  const explanation = outmatched ? (vsAllBeginners ? 'Partita molto sbilanciata: due giocatori avanzati affrontano due principianti.' : 'Partita molto sbilanciata: due giocatori avanzati affrontano una coppia con un principiante.') : `${forceExplanation}${internalExplanation}`;
  return { score, label, teamAStrength, teamBStrength, strengthDifference, teamAInternalDifference, teamBInternalDifference, warnings, explanation };
}

export type CalendarBalanceSummary = { average: number; ratings: MatchBalanceRating[]; counts: Record<MatchBalanceLabel, number>; best?: { match: Match; rating: MatchBalanceRating }; worst?: { match: Match; rating: MatchBalanceRating } };

export function calculateCalendarBalance(tournament: Tournament): CalendarBalanceSummary {
  const minAcceptableBalance = tournament.settings.minAcceptableBalance ?? DEFAULT_MIN_ACCEPTABLE_BALANCE;
  const entries = tournament.matches.map(match => ({ match, rating: calculateMatchBalance(match, tournament.players, minAcceptableBalance) }));
  const counts: Record<MatchBalanceLabel, number> = { excellent: 0, balanced: 0, acceptable: 0, unbalanced: 0, very_unbalanced: 0 };
  entries.forEach(entry => { counts[entry.rating.label] += 1; });
  const sorted = [...entries].sort((a, b) => b.rating.score - a.rating.score);
  return { average: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.rating.score, 0) / entries.length) : 0, ratings: entries.map(entry => entry.rating), counts, best: sorted[0], worst: sorted[sorted.length - 1] };
}
