import { describe, expect, it } from 'vitest';
import { AdvantageTeam, LiveMatchScore, Match } from '../models';
import { addScoreAction, awardPoint, createLiveMatchState, normalizeLiveMatchScore, normalizeLiveMatchState, redoScoreAction, resetMatchForReplay, restorePersistedTimer, undoScoreAction, validateLiveMatchScore } from '../services/liveMatch';

const score = (a: LiveMatchScore['teamAPoints'] = 0, b: LiveMatchScore['teamBPoints'] = 0, gamesA = 0, gamesB = 0, advantageTeam: AdvantageTeam = null, lastUpdated = 0): LiveMatchScore => ({ teamAPoints: a, teamBPoints: b, advantageTeam, teamAGames: gamesA, teamBGames: gamesB, lastUpdated });

describe('punteggio live con vantaggi', () => {
  it('mantiene la sequenza 0, 15, 30, 40 e assegna il game prima della parità', () => {
    let next = score();
    next = awardPoint(next, 'team_a'); expect(next.teamAPoints).toBe(15);
    next = awardPoint(next, 'team_a'); expect(next.teamAPoints).toBe(30);
    next = awardPoint(next, 'team_a'); expect(next.teamAPoints).toBe(40);
    next = awardPoint(next, 'team_a');
    expect(next).toMatchObject({ teamAGames: 1, teamAPoints: 0, teamBPoints: 0, advantageTeam: null });
  });

  it('arriva al 40–40 senza assegnare un vantaggio', () => {
    expect(awardPoint(score(40, 30), 'team_b')).toMatchObject({ teamAPoints: 40, teamBPoints: 40, advantageTeam: null });
  });

  it('assegna vantaggio A e poi il game A con due punti consecutivi', () => {
    const advantage = awardPoint(score(40, 40), 'team_a');
    expect(advantage).toMatchObject({ teamAPoints: 40, teamBPoints: 40, advantageTeam: 'team_a' });
    expect(awardPoint(advantage, 'team_a')).toMatchObject({ teamAGames: 1, teamAPoints: 0, teamBPoints: 0, advantageTeam: null });
  });

  it('annulla il vantaggio avversario prima di assegnare il proprio', () => {
    const deuce = awardPoint(score(40, 40, 0, 0, 'team_a'), 'team_b');
    expect(deuce.advantageTeam).toBeNull();
    expect(awardPoint(deuce, 'team_b').advantageTeam).toBe('team_b');
  });

  it('gestisce uno scambio prolungato fino al game A', () => {
    let next = score(40, 40);
    const winners: Array<'team_a' | 'team_b'> = ['team_a', 'team_b', 'team_b', 'team_a', 'team_a', 'team_b', 'team_a', 'team_a'];
    const expected: AdvantageTeam[] = ['team_a', null, 'team_b', null, 'team_a', null, 'team_a', null];
    winners.forEach((winner, index) => { next = awardPoint(next, winner); expect(next.advantageTeam).toBe(expected[index]); });
    expect(next).toMatchObject({ teamAGames: 1, teamAPoints: 0, teamBPoints: 0 });
  });

  it('non modifica lo stato ricevuto e non supera il massimo dei game', () => {
    const original = score(40, 30, 6, 1);
    const snapshot = { ...original };
    const next = awardPoint(original, 'team_a', 6);
    expect(original).toEqual(snapshot);
    expect(next.teamAGames).toBe(6);
  });

  it('undo e redo del game ripristinano vantaggio, timestamp e servizio', () => {
    const live = { ...createLiveMatchState(), score: score(40, 40, 2, 1, 'team_a', 123), servingTeam: 'team_a' as const };
    const afterGame = awardPoint(live.score, 'team_a');
    const withAction = addScoreAction(live, 'point_team_a', afterGame);
    const undone = undoScoreAction(withAction);
    expect(undone.score).toEqual(live.score);
    expect(undone.servingTeam).toBe('team_a');
    const redone = redoScoreAction(undone);
    expect(redone.score).toEqual(afterGame);
    expect(redone.servingTeam).toBe('team_b');
  });

  it('rifiuta vantaggi fuori dal 40–40 e game non validi', () => {
    expect(validateLiveMatchScore(score(40, 30, 0, 0, 'team_a')).valid).toBe(false);
    expect(validateLiveMatchScore(score(40, 40, 7, 0, 'team_a'), 6).valid).toBe(false);
    expect(validateLiveMatchScore(score(40, 40, 6, 0, 'team_b'), 6).valid).toBe(true);
  });

  it('normalizza i vecchi salvataggi con advantage nei punti', () => {
    expect(normalizeLiveMatchScore({ teamAPoints: 'advantage', teamBPoints: 40, teamAGames: 2, teamBGames: 1, lastUpdated: 10 })).toEqual(score(40, 40, 2, 1, 'team_a', 10));
  });
});

describe('timer persistito', () => {
  it('usa endsAt per rilevare la scadenza senza valori negativi', () => {
    const restored = restorePersistedTimer({ status: 'running', durationMilliseconds: 60_000, remainingMilliseconds: 10_000, startedAt: 0, endsAt: 1_000, updatedAt: 0 }, 2_000);
    expect(restored.status).toBe('expired'); expect(restored.remainingMilliseconds).toBe(0);
  });
});

describe('reset partita', () => {
  it('azzera risultato, stato live, timer e cronologia per renderla nuovamente giocabile', () => {
    const previousLive = createLiveMatchState(12);
    previousLive.score = score(40, 30, 6, 4, null, previousLive.score.lastUpdated);
    previousLive.timer = { ...previousLive.timer, status: 'completed', remainingMilliseconds: 10_000 };
    previousLive.history = [{ id: 'action-1', timestamp: 1, type: 'point_team_a', previousScore: score(), nextScore: score(15), previousServingTeam: 'team_a', nextServingTeam: 'team_a' }];
    previousLive.redo = [...previousLive.history];
    const match: Match = { id: 'match-1', start: '10:00', end: '10:15', players: ['a', 'b', 'c', 'd'], locked: false, violations: [], status: 'completed', result: { aGames: 6, bGames: 4 }, liveState: previousLive };

    const reset = resetMatchForReplay(match, 12, 3);

    expect(reset.status).toBe('scheduled');
    expect(reset.result).toEqual({ aGames: null, bGames: null });
    expect(reset.liveState?.score).toMatchObject({ teamAPoints: 0, teamBPoints: 0, advantageTeam: null, teamAGames: 0, teamBGames: 0 });
    expect(reset.liveState?.timer).toMatchObject({ status: 'idle', durationMilliseconds: 720_000, remainingMilliseconds: 720_000, startedAt: null, endsAt: null });
    expect(reset.liveState?.history).toEqual([]);
    expect(reset.liveState?.redo).toEqual([]);
    expect(match.status).toBe('completed');
    expect(match.result).toEqual({ aGames: 6, bGames: 4 });
  });
});

describe('fase riscaldamento e per la palla', () => {
  it('crea lo stato live in fase di riscaldamento con il timer di riscaldamento già avviato e il timer di gioco fermo', () => {
    const live = createLiveMatchState(12, 5);
    expect(live.phase).toBe('warmup');
    expect(live.warmupTimer).toMatchObject({ status: 'running', durationMilliseconds: 300_000, remainingMilliseconds: 300_000 });
    expect(live.warmupTimer.startedAt).not.toBeNull();
    expect(live.timer).toMatchObject({ status: 'idle', durationMilliseconds: 720_000 });
  });

  it('normalizza i vecchi salvataggi senza fase/timer di riscaldamento portandoli direttamente in gioco', () => {
    const legacy = { timer: { status: 'running', durationMilliseconds: 720_000, remainingMilliseconds: 400_000, startedAt: 1, endsAt: 2, updatedAt: 3 }, score: score(15, 0, 1, 0), history: [], redo: [], servingTeam: 'team_a', audioEnabled: true, lastUpdated: 3 };
    const normalized = normalizeLiveMatchState(legacy, 12);
    expect(normalized.phase).toBe('playing');
    expect(normalized.warmupTimer.status).toBe('completed');
  });

  it('preserva fase e timer di riscaldamento già presenti nello stato salvato', () => {
    const saved = { ...createLiveMatchState(12, 3), phase: 'coin_toss' as const };
    const normalized = normalizeLiveMatchState(saved, 12);
    expect(normalized.phase).toBe('coin_toss');
    expect(normalized.warmupTimer.status).toBe('running');
  });
});
