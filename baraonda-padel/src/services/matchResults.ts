import { Match, MatchResult } from '../models';

export const MAX_GAMES_PER_MATCH = 6;
export type MatchOutcome = 'team_a' | 'team_b' | 'draw' | 'not_played' | 'incomplete';
export const MATCH_OUTCOME_LABELS: Record<MatchOutcome, string> = { team_a: 'Vince A', team_b: 'Vince B', draw: 'Pareggio', not_played: 'Da giocare', incomplete: 'Punteggio incompleto' };

export function validateMatchScore(value: number | null) { return value === null || (Number.isInteger(value) && value >= 0 && value <= MAX_GAMES_PER_MATCH); }
export function calculateMatchOutcome(teamAGames: number | null, teamBGames: number | null): MatchOutcome {
  if (teamAGames === null && teamBGames === null) return 'not_played';
  if (teamAGames === null || teamBGames === null) return 'incomplete';
  if (teamAGames > teamBGames) return 'team_a';
  if (teamBGames > teamAGames) return 'team_b';
  return 'draw';
}

const legacyOutcome = (outcome: MatchResult['outcome']): MatchOutcome | undefined => outcome === 'A' ? 'team_a' : outcome === 'B' ? 'team_b' : outcome === 'D' ? 'draw' : undefined;
/** Scores are authoritative. Legacy outcomes are only kept when historical records have no scores. */
export function getMatchOutcome(match: Match): MatchOutcome {
  const result = match.result; if (!result) return 'not_played';
  const a = validateMatchScore(result.aGames) ? result.aGames : null; const b = validateMatchScore(result.bGames) ? result.bGames : null;
  const calculated = calculateMatchOutcome(a, b);
  if (calculated === 'not_played') return legacyOutcome(result.outcome) ?? calculated;
  if (result.outcome && legacyOutcome(result.outcome) !== calculated) console.warn('Risultato incoerente rilevato: il vincitore salvato non corrisponde ai game. Il risultato è stato ricalcolato.');
  return calculated;
}
export function isMatchCompleted(match: Match) { return ['team_a', 'team_b', 'draw'].includes(getMatchOutcome(match)); }
export function scoreFromInput(value: string): number | null { if (value === '') return null; const parsed = Number(value); return validateMatchScore(parsed) ? parsed : null; }
