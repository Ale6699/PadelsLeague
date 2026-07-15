import { describe, expect, it } from 'vitest';
import { LiveMatchScore } from '../models';
import { addScoreAction, awardPoint, createLiveMatchState, restorePersistedTimer, undoScoreAction, validateLiveMatchScore } from '../services/liveMatch';

const score = (a: LiveMatchScore['teamAPoints'] = 0, b: LiveMatchScore['teamBPoints'] = 0, gamesA = 0, gamesB = 0): LiveMatchScore => ({ teamAPoints: a, teamBPoints: b, teamAGames: gamesA, teamBGames: gamesB, lastUpdated: 0 });

describe('punteggio live padel', () => {
  it('avanza da 0 a game e azzera i punti', () => {
    let next = score(); [15, 30, 40].forEach(() => { next = awardPoint(next, 'team_a'); }); expect(next.teamAPoints).toBe(40);
    next = awardPoint(next, 'team_a'); expect(next.teamAGames).toBe(1); expect(next.teamAPoints).toBe(0); expect(next.teamBPoints).toBe(0);
  });
  it('assegna il game con golden point sul 40 pari', () => { const next = awardPoint(score(40, 40), 'team_a', 'golden_point'); expect(next.teamAGames).toBe(1); });
  it('gestisce i vantaggi', () => {
    let next = awardPoint(score(40, 40), 'team_a', 'advantages'); expect(next.teamAPoints).toBe('advantage');
    next = awardPoint(next, 'team_b', 'advantages'); expect(next.teamAPoints).toBe(40); expect(next.teamBPoints).toBe(40);
    next = awardPoint(next, 'team_b', 'advantages'); next = awardPoint(next, 'team_b', 'advantages'); expect(next.teamBGames).toBe(1);
  });
  it('non supera il limite massimo di game automatico', () => { const next = awardPoint(score(40, 30, 6, 1), 'team_a', 'golden_point', 6); expect(next.teamAGames).toBe(6); });
  it('annulla anche un punto che aveva assegnato un game', () => { const live = createLiveMatchState(); const afterGame = awardPoint(score(40, 30), 'team_a'); const withAction = addScoreAction(live, 'point_team_a', afterGame); expect(undoScoreAction(withAction).score).toMatchObject({ teamAGames: 0, teamAPoints: 0 }); });
  it('valida la correzione manuale', () => { expect(validateLiveMatchScore(score('advantage', 'advantage'))).toBe(false); expect(validateLiveMatchScore(score(40, 30, 7))).toBe(false); expect(validateLiveMatchScore(score(40, 30, 6))).toBe(true); });
});

describe('timer persistito', () => {
  it('usa endsAt per rilevare la scadenza senza valori negativi', () => {
    const restored = restorePersistedTimer({ status: 'running', durationMilliseconds: 60_000, remainingMilliseconds: 10_000, startedAt: 0, endsAt: 1_000, updatedAt: 0 }, 2_000);
    expect(restored.status).toBe('expired'); expect(restored.remainingMilliseconds).toBe(0);
  });
});
