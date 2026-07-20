import { AdvantageTeam, LiveMatchScore, LiveMatchState, LiveScoreValidationResult, Match, MatchTimerState, PadelPointValue, ScoreAction, uid } from '../models';

export const DEFAULT_MAX_GAMES = 6;
export const pointOrder: PadelPointValue[] = [0, 15, 30, 40];
const nextPoint = (point: PadelPointValue): PadelPointValue => point === 0 ? 15 : point === 15 ? 30 : 40;
export const formatRemainingTime = (milliseconds: number) => `${String(Math.floor(Math.max(0, milliseconds) / 60000)).padStart(2, '0')}:${String(Math.floor((Math.max(0, milliseconds) % 60000) / 1000)).padStart(2, '0')}`;
export const getRemainingMilliseconds = (timer: MatchTimerState, now = Date.now()) => timer.status === 'running' && timer.endsAt ? Math.max(0, timer.endsAt - now) : Math.max(0, timer.remainingMilliseconds);
export const getLiveStateUpdatedAt = (live: LiveMatchState) => Math.max(live.lastUpdated, live.score.lastUpdated, live.timer.updatedAt);

export function createLiveMatchState(durationMinutes = 12): LiveMatchState {
  const now = Date.now(); const durationMilliseconds = Math.max(1, durationMinutes) * 60_000;
  return { timer: { status: 'idle', durationMilliseconds, remainingMilliseconds: durationMilliseconds, startedAt: null, endsAt: null, updatedAt: now }, score: { teamAPoints: 0, teamBPoints: 0, advantageTeam: null, teamAGames: 0, teamBGames: 0, lastUpdated: now }, history: [], redo: [], servingTeam: 'team_a', audioEnabled: true, lastUpdated: now };
}

export function resetMatchForReplay(match: Match, durationMinutes: number, liveState = createLiveMatchState(durationMinutes)): Match {
  return { ...match, status: 'scheduled', result: { aGames: null, bGames: null }, liveState };
}

export function normalizeLiveMatchScore(value: unknown, maxGames = DEFAULT_MAX_GAMES): LiveMatchScore {
  const score = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawA = score.teamAPoints;
  const rawB = score.teamBPoints;
  const teamAPoints = pointOrder.includes(rawA as PadelPointValue) ? rawA as PadelPointValue : rawA === 'advantage' ? 40 : 0;
  const teamBPoints = pointOrder.includes(rawB as PadelPointValue) ? rawB as PadelPointValue : rawB === 'advantage' ? 40 : 0;
  const inferredAdvantage: AdvantageTeam = rawA === 'advantage' ? 'team_a' : rawB === 'advantage' ? 'team_b' : null;
  const requestedAdvantage = score.advantageTeam === 'team_a' || score.advantageTeam === 'team_b' ? score.advantageTeam : inferredAdvantage;
  const advantageTeam = teamAPoints === 40 && teamBPoints === 40 ? requestedAdvantage : null;
  const limit = Number.isInteger(maxGames) && maxGames >= 0 ? maxGames : DEFAULT_MAX_GAMES;
  const games = (candidate: unknown) => Number.isInteger(candidate) ? Math.min(limit, Math.max(0, candidate as number)) : 0;
  return {
    teamAPoints,
    teamBPoints,
    advantageTeam,
    teamAGames: games(score.teamAGames),
    teamBGames: games(score.teamBGames),
    lastUpdated: typeof score.lastUpdated === 'number' && Number.isFinite(score.lastUpdated) ? score.lastUpdated : Date.now(),
  };
}

export function normalizeLiveMatchState(value: unknown, durationMinutes = 12, maxGames = DEFAULT_MAX_GAMES): LiveMatchState {
  const fallback = createLiveMatchState(durationMinutes);
  if (!value || typeof value !== 'object') return fallback;
  const live = value as Partial<LiveMatchState>;
  const normalizeAction = (action: ScoreAction): ScoreAction => ({
    ...action,
    previousScore: normalizeLiveMatchScore(action.previousScore, maxGames),
    nextScore: normalizeLiveMatchScore(action.nextScore, maxGames),
    previousServingTeam: action.previousServingTeam ?? 'team_a',
    nextServingTeam: action.nextServingTeam ?? action.previousServingTeam ?? 'team_a',
  });
  return {
    ...fallback,
    ...live,
    timer: live.timer ? { ...fallback.timer, ...live.timer } : fallback.timer,
    score: normalizeLiveMatchScore(live.score, maxGames),
    history: Array.isArray(live.history) ? live.history.map(normalizeAction) : [],
    redo: Array.isArray(live.redo) ? live.redo.map(normalizeAction) : [],
    servingTeam: live.servingTeam === 'team_b' ? 'team_b' : 'team_a',
    audioEnabled: live.audioEnabled !== false,
    lastUpdated: typeof live.lastUpdated === 'number' && Number.isFinite(live.lastUpdated) ? live.lastUpdated : Math.max(fallback.lastUpdated, normalizeLiveMatchScore(live.score, maxGames).lastUpdated, live.timer?.updatedAt ?? 0),
  };
}

export function awardPoint(score: LiveMatchScore, winningTeam: 'team_a' | 'team_b', maxGames = DEFAULT_MAX_GAMES): LiveMatchScore {
  const limit = Number.isInteger(maxGames) && maxGames >= 0 ? maxGames : DEFAULT_MAX_GAMES;
  const next = normalizeLiveMatchScore(score, limit);
  const winnerPointsKey = winningTeam === 'team_a' ? 'teamAPoints' : 'teamBPoints';
  const loserPointsKey = winningTeam === 'team_a' ? 'teamBPoints' : 'teamAPoints';
  const winnerGamesKey = winningTeam === 'team_a' ? 'teamAGames' : 'teamBGames';
  const losingTeam = winningTeam === 'team_a' ? 'team_b' : 'team_a';

  if (next.teamAPoints === 40 && next.teamBPoints === 40) {
    if (next.advantageTeam === winningTeam) return winGame(next, winnerGamesKey, limit);
    return { ...next, advantageTeam: next.advantageTeam === losingTeam ? null : winningTeam, lastUpdated: Date.now() };
  }

  if (next[winnerPointsKey] === 40) return winGame(next, winnerGamesKey, limit);
  return { ...next, [winnerPointsKey]: nextPoint(next[winnerPointsKey]), advantageTeam: null, lastUpdated: Date.now() };
}

function winGame(score: LiveMatchScore, winnerGamesKey: 'teamAGames' | 'teamBGames', maxGames: number): LiveMatchScore {
  const games = Math.min(maxGames, score[winnerGamesKey] + 1);
  return { ...score, [winnerGamesKey]: games, teamAPoints: 0, teamBPoints: 0, advantageTeam: null, lastUpdated: Date.now() };
}

export function validateLiveMatchScore(score: LiveMatchScore, maxGames = DEFAULT_MAX_GAMES): LiveScoreValidationResult {
  const errors: string[] = [];
  if (!pointOrder.includes(score.teamAPoints) || !pointOrder.includes(score.teamBPoints)) errors.push('I punti ammessi sono 0, 15, 30 e 40.');
  if (score.advantageTeam !== null && score.advantageTeam !== 'team_a' && score.advantageTeam !== 'team_b') errors.push('La coppia in vantaggio non è valida.');
  if (score.advantageTeam && (score.teamAPoints !== 40 || score.teamBPoints !== 40)) errors.push('Il vantaggio è consentito solamente sul 40–40.');
  if (!Number.isInteger(score.teamAGames) || !Number.isInteger(score.teamBGames) || score.teamAGames < 0 || score.teamBGames < 0) errors.push('I game devono essere numeri interi non negativi.');
  if (score.teamAGames > maxGames || score.teamBGames > maxGames) errors.push(`I game non possono superare ${maxGames}.`);
  return { valid: errors.length === 0, errors };
}

export function addScoreAction(live: LiveMatchState, type: ScoreAction['type'], nextScore: LiveMatchScore): LiveMatchState {
  const nextServingTeam = nextScore.teamAGames + nextScore.teamBGames !== live.score.teamAGames + live.score.teamBGames ? (live.servingTeam === 'team_a' ? 'team_b' : 'team_a') : live.servingTeam;
  const action: ScoreAction = { id: uid(), timestamp: Date.now(), type, previousScore: live.score, nextScore, previousServingTeam: live.servingTeam, nextServingTeam };
  return { ...live, score: nextScore, history: [...live.history, action].slice(-100), redo: [], servingTeam: nextServingTeam, lastUpdated: Date.now() };
}
export function undoScoreAction(live: LiveMatchState): LiveMatchState { const action = live.history[live.history.length - 1]; return action ? { ...live, score: action.previousScore, servingTeam: action.previousServingTeam ?? live.servingTeam, history: live.history.slice(0, -1), redo: [...live.redo, action], lastUpdated: Date.now() } : live; }
export function redoScoreAction(live: LiveMatchState): LiveMatchState { const action = live.redo[live.redo.length - 1]; return action ? { ...live, score: action.nextScore, servingTeam: action.nextServingTeam ?? live.servingTeam, redo: live.redo.slice(0, -1), history: [...live.history, action], lastUpdated: Date.now() } : live; }
export function restorePersistedTimer(timer: MatchTimerState, now = Date.now()): MatchTimerState { const remaining = getRemainingMilliseconds(timer, now); return timer.status === 'running' && remaining === 0 ? { ...timer, status: 'expired', remainingMilliseconds: 0, endsAt: null, updatedAt: now } : { ...timer, remainingMilliseconds: remaining, updatedAt: now }; }
