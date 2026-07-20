import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveMatchScore, LiveMatchState, Match, MatchStatus } from '../models';
import { addScoreAction, awardPoint, createLiveMatchState, getLiveStateUpdatedAt, getRemainingMilliseconds, normalizeLiveMatchState, redoScoreAction, restorePersistedTimer, undoScoreAction, validateLiveMatchScore } from '../services/liveMatch';

type Options = { match: Match; durationMinutes: number; maxGames: number; onPersist: (live: LiveMatchState, status: MatchStatus) => void };
const playExpirySignal = () => { try { const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AudioContextClass) return; const context = new AudioContextClass(); const oscillator = context.createOscillator(); oscillator.frequency.value = 880; oscillator.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .22); } catch { /* Audio is optional. */ } };

export function useMatchDashboard({ match, durationMinutes, maxGames, onPersist }: Options) {
  const matchIdRef = useRef(match.id);
  const [live, setLive] = useState<LiveMatchState>(() => match.liveState ? normalizeLiveMatchState({ ...match.liveState, timer: restorePersistedTimer(match.liveState.timer) }, durationMinutes, maxGames) : createLiveMatchState(durationMinutes));
  const [status, setStatus] = useState<MatchStatus>(match.status ?? 'scheduled'); const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const isDifferentMatch = matchIdRef.current !== match.id;
    matchIdRef.current = match.id;
    const incoming = match.liveState ? normalizeLiveMatchState(match.liveState, durationMinutes, maxGames) : isDifferentMatch ? createLiveMatchState(durationMinutes) : null;
    if (incoming) setLive(current => isDifferentMatch || getLiveStateUpdatedAt(incoming) > getLiveStateUpdatedAt(current) ? incoming : current);
    setStatus(match.status ?? 'scheduled');
  }, [durationMinutes, match.id, match.liveState, match.status, maxGames]);
  useEffect(() => { onPersist(live, status); }, [live, onPersist, status]);
  const remainingMilliseconds = useMemo(() => getRemainingMilliseconds(live.timer, now), [live.timer, now]);
  useEffect(() => { if (live.timer.status !== 'running') return undefined; const interval = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(interval); }, [live.timer.status]);
  useEffect(() => { if (live.timer.status !== 'running' || remainingMilliseconds > 0) return; setLive(current => { const updatedAt = Date.now(); return { ...current, timer: { ...current.timer, status: 'expired', remainingMilliseconds: 0, endsAt: null, updatedAt }, lastUpdated: updatedAt }; }); setStatus('time_expired'); if (live.audioEnabled) playExpirySignal(); navigator.vibrate?.([180, 80, 180]); }, [live.audioEnabled, live.timer.status, remainingMilliseconds]);
  useEffect(() => { let wakeLock: { release: () => Promise<void> } | undefined; const request = async () => { try { const api = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }; if (live.timer.status === 'running' && api.wakeLock) wakeLock = await api.wakeLock.request('screen'); } catch { /* Wake lock is optional. */ } }; void request(); return () => { void wakeLock?.release(); }; }, [live.timer.status]);
  const updateTimer = useCallback((change: (current: LiveMatchState) => LiveMatchState) => setLive(change), []);
  const startTimer = useCallback(() => updateTimer(current => { const remaining = getRemainingMilliseconds(current.timer); const nowTime = Date.now(); setStatus('in_progress'); return { ...current, timer: { ...current.timer, status: 'running', remainingMilliseconds: remaining, startedAt: nowTime, endsAt: nowTime + remaining, updatedAt: nowTime }, lastUpdated: nowTime }; }), [updateTimer]);
  const pauseTimer = useCallback(() => updateTimer(current => { const remaining = getRemainingMilliseconds(current.timer); const updatedAt = Date.now(); setStatus('paused'); return { ...current, timer: { ...current.timer, status: 'paused', remainingMilliseconds: remaining, endsAt: null, updatedAt }, lastUpdated: updatedAt }; }), [updateTimer]);
  const resetTimer = useCallback(() => updateTimer(current => { const updatedAt = Date.now(); return { ...current, timer: { ...current.timer, status: 'idle', remainingMilliseconds: current.timer.durationMilliseconds, startedAt: null, endsAt: null, updatedAt }, lastUpdated: updatedAt }; }), [updateTimer]);
  const adjustTimer = useCallback((milliseconds: number) => updateTimer(current => { const remaining = Math.max(0, getRemainingMilliseconds(current.timer) + milliseconds); const nowTime = Date.now(); return { ...current, timer: { ...current.timer, status: remaining === 0 ? 'expired' : current.timer.status === 'running' ? 'running' : 'paused', remainingMilliseconds: remaining, endsAt: current.timer.status === 'running' ? nowTime + remaining : null, updatedAt: nowTime }, lastUpdated: nowTime }; }), [updateTimer]);
  const point = useCallback((team: 'team_a' | 'team_b') => { if (status === 'completed') return; setLive(current => addScoreAction(current, team === 'team_a' ? 'point_team_a' : 'point_team_b', awardPoint(current.score, team, maxGames))); }, [maxGames, status]);
  const setManualScore = useCallback((score: LiveMatchScore) => { const validation = validateLiveMatchScore(score, maxGames); if (validation.valid) setLive(current => addScoreAction(current, 'manual_score_change', { ...score, lastUpdated: Date.now() })); return validation; }, [maxGames]);
  const resetCurrentGame = useCallback(() => setLive(current => addScoreAction(current, 'reset_current_game', { ...current.score, teamAPoints: 0, teamBPoints: 0, advantageTeam: null, lastUpdated: Date.now() })), []);
  const undo = useCallback(() => setLive(undoScoreAction), []); const redo = useCallback(() => setLive(redoScoreAction), []);
  const finish = useCallback(() => { setStatus('completed'); setLive(current => { const updatedAt = Date.now(); return { ...current, timer: { ...current.timer, status: 'completed', remainingMilliseconds: getRemainingMilliseconds(current.timer), endsAt: null, updatedAt }, lastUpdated: updatedAt }; }); }, []);
  const resetMatch = useCallback(() => { const reset = createLiveMatchState(durationMinutes); setStatus('scheduled'); setLive(reset); return reset; }, [durationMinutes]);
  return { live, status, remainingMilliseconds, startTimer, pauseTimer, resetTimer, adjustTimer, point, undo, redo, setManualScore, resetCurrentGame, finish, resetMatch, setStatus, setLive };
}
