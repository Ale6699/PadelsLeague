import { GameScoringMode, LiveMatchScore, LiveMatchState, MatchTimerState, PointScore, ScoreAction, uid } from '../models';

export const DEFAULT_MAX_GAMES = 6;
export const pointOrder: PointScore[] = [0, 15, 30, 40];
const nextPoint = (point: PointScore): PointScore => point === 0 ? 15 : point === 15 ? 30 : 40;
export const formatRemainingTime = (milliseconds: number) => `${String(Math.floor(Math.max(0, milliseconds) / 60000)).padStart(2, '0')}:${String(Math.floor((Math.max(0, milliseconds) % 60000) / 1000)).padStart(2, '0')}`;
export const getRemainingMilliseconds = (timer: MatchTimerState, now = Date.now()) => timer.status === 'running' && timer.endsAt ? Math.max(0, timer.endsAt - now) : Math.max(0, timer.remainingMilliseconds);

export function createLiveMatchState(durationMinutes = 12): LiveMatchState {
  const now = Date.now(); const durationMilliseconds = Math.max(1, durationMinutes) * 60_000;
  return { timer: { status: 'idle', durationMilliseconds, remainingMilliseconds: durationMilliseconds, startedAt: null, endsAt: null, updatedAt: now }, score: { teamAPoints: 0, teamBPoints: 0, teamAGames: 0, teamBGames: 0, lastUpdated: now }, history: [], redo: [], servingTeam: 'team_a', audioEnabled: true };
}

export function awardPoint(score: LiveMatchScore, winningTeam: 'team_a' | 'team_b', scoringMode: GameScoringMode = 'golden_point', maxGames = DEFAULT_MAX_GAMES): LiveMatchScore {
  const winnerPoints = winningTeam === 'team_a' ? score.teamAPoints : score.teamBPoints; const loserPoints = winningTeam === 'team_a' ? score.teamBPoints : score.teamAPoints;
  let gameWon = false; let nextWinner: PointScore = winnerPoints; let nextLoser: PointScore = loserPoints;
  if (winnerPoints === 'advantage') gameWon = true;
  else if (winnerPoints === 40) {
    if (scoringMode === 'golden_point' || loserPoints !== 40 && loserPoints !== 'advantage') gameWon = true;
    else if (loserPoints === 'advantage') { nextWinner = 40; nextLoser = 40; }
    else nextWinner = 'advantage';
  } else nextWinner = nextPoint(winnerPoints);
  if (gameWon) {
    const games = winningTeam === 'team_a' ? score.teamAGames : score.teamBGames;
    if (games >= maxGames) return { ...score, lastUpdated: Date.now() };
    return { teamAPoints: 0, teamBPoints: 0, teamAGames: score.teamAGames + (winningTeam === 'team_a' ? 1 : 0), teamBGames: score.teamBGames + (winningTeam === 'team_b' ? 1 : 0), lastUpdated: Date.now() };
  }
  return { ...score, teamAPoints: winningTeam === 'team_a' ? nextWinner : nextLoser, teamBPoints: winningTeam === 'team_b' ? nextWinner : nextLoser, lastUpdated: Date.now() };
}

export function validateLiveMatchScore(score: LiveMatchScore, maxGames = DEFAULT_MAX_GAMES) {
  const validPoints = (value: PointScore) => pointOrder.includes(value) || value === 'advantage';
  return Number.isInteger(score.teamAGames) && Number.isInteger(score.teamBGames) && score.teamAGames >= 0 && score.teamBGames >= 0 && score.teamAGames <= maxGames && score.teamBGames <= maxGames && validPoints(score.teamAPoints) && validPoints(score.teamBPoints) && !(score.teamAPoints === 'advantage' && score.teamBPoints === 'advantage');
}

export function addScoreAction(live: LiveMatchState, type: ScoreAction['type'], nextScore: LiveMatchScore): LiveMatchState {
  const action: ScoreAction = { id: uid(), timestamp: Date.now(), type, previousScore: live.score, nextScore };
  return { ...live, score: nextScore, history: [...live.history, action].slice(-100), redo: [], servingTeam: nextScore.teamAGames + nextScore.teamBGames !== live.score.teamAGames + live.score.teamBGames ? (live.servingTeam === 'team_a' ? 'team_b' : 'team_a') : live.servingTeam };
}
export function undoScoreAction(live: LiveMatchState): LiveMatchState { const action = live.history[live.history.length - 1]; return action ? { ...live, score: action.previousScore, history: live.history.slice(0, -1), redo: [...live.redo, action] } : live; }
export function redoScoreAction(live: LiveMatchState): LiveMatchState { const action = live.redo[live.redo.length - 1]; return action ? { ...live, score: action.nextScore, redo: live.redo.slice(0, -1), history: [...live.history, action] } : live; }
export function restorePersistedTimer(timer: MatchTimerState, now = Date.now()): MatchTimerState { const remaining = getRemainingMilliseconds(timer, now); return timer.status === 'running' && remaining === 0 ? { ...timer, status: 'expired', remainingMilliseconds: 0, endsAt: null, updatedAt: now } : { ...timer, remainingMilliseconds: remaining, updatedAt: now }; }
