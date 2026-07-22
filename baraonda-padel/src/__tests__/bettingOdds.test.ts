import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARGIN, MAX_ODDS, MAX_WINNER_ODDS, MIN_ODDS, blendedProbability, currentOdds, defaultOverUnderLine,
  headToHeadOdds, matchOutcomeOdds, matchOutcomeProbabilities, overUnderProbabilities, payout,
  probabilityToOdds, teamStrength, tournamentWinnerOdds, tournamentWinnerProbabilities,
} from '../services/bettingOdds';

describe('probabilityToOdds', () => {
  it('applica il margine banco (overround) sulle quote', () => {
    const p = 0.5;
    expect(probabilityToOdds(p, 0)).toBeCloseTo(2, 2);
    expect(probabilityToOdds(p, DEFAULT_MARGIN)).toBeLessThan(2);
  });
  it('la somma delle probabilità implicite supera 1 del margine', () => {
    const { A, B, draw } = matchOutcomeOdds(4, 4, DEFAULT_MARGIN);
    const overround = 1 / A + 1 / B + 1 / draw;
    expect(overround).toBeGreaterThan(1);
    expect(overround).toBeCloseTo(1 + DEFAULT_MARGIN, 2);
  });
  it('non scende mai sotto la quota minima', () => {
    expect(probabilityToOdds(0.999)).toBeGreaterThanOrEqual(MIN_ODDS);
    expect(probabilityToOdds(1.5)).toBe(MIN_ODDS);
  });
});

describe('matchOutcomeProbabilities', () => {
  it('a forze pari A e B sono equiprobabili e il pareggio non domina', () => {
    const { pA, pB, pDraw } = matchOutcomeProbabilities(4, 4);
    expect(pA).toBeCloseTo(pB, 6);
    expect(pDraw).toBeCloseTo(0.15, 6);
    expect(pDraw).toBeLessThan(pA);
    expect(pA + pB + pDraw).toBeCloseTo(1, 6);
  });
  it('la coppia più forte ha probabilità maggiore e quota più bassa', () => {
    const { pA, pB } = matchOutcomeProbabilities(teamStrength(3, 3), teamStrength(1, 2));
    expect(pA).toBeGreaterThan(pB);
    const odds = matchOutcomeOdds(teamStrength(3, 3), teamStrength(1, 2));
    expect(odds.A).toBeLessThan(odds.B);
  });
  it('azzera il pareggio quando lo squilibrio è massimo', () => {
    expect(matchOutcomeProbabilities(6, 2).pDraw).toBeCloseTo(0, 6);
  });
});

describe('overUnderProbabilities', () => {
  it('over più probabile a forze pari, under quando è sbilanciata', () => {
    expect(overUnderProbabilities(4, 4).pOver).toBeGreaterThan(overUnderProbabilities(6, 2).pOver);
  });
  it('le probabilità sommano a 1', () => {
    const { pOver, pUnder } = overUnderProbabilities(5, 3);
    expect(pOver + pUnder).toBeCloseTo(1, 6);
  });
  it('linea di default derivata dai game massimi', () => {
    expect(defaultOverUnderLine(6)).toBe(5.5);
  });
});

describe('headToHeadOdds', () => {
  it('favorisce chi ha livello e punti più alti', () => {
    const odds = headToHeadOdds(1, 3);
    expect(odds.first).toBeLessThan(odds.second);
  });
  it('non supera il tetto generale MAX_ODDS sui longshot', () => {
    expect(headToHeadOdds(2, 4).second).toBeLessThanOrEqual(MAX_ODDS);
  });
});

describe('tetto generale delle quote (MAX_ODDS)', () => {
  it('taglia i longshot dell’esito partita', () => {
    const odds = matchOutcomeOdds(6, 2);
    expect(odds.B).toBeLessThanOrEqual(MAX_ODDS);
    expect(Math.max(odds.A, odds.B, odds.draw)).toBeLessThanOrEqual(MAX_ODDS);
  });
});

describe('tournamentWinnerProbabilities', () => {
  it('normalizza a 1 e premia livello e punti', () => {
    const probabilities = tournamentWinnerProbabilities([
      { id: 'a', level: 3, points: 12 }, { id: 'b', level: 2, points: 6 }, { id: 'c', level: 1, points: 0 },
    ]);
    const total = [...probabilities.values()].reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(probabilities.get('a')!).toBeGreaterThan(probabilities.get('c')!);
  });
});

describe('payout', () => {
  it('arrotonda i gettoni per difetto', () => {
    expect(payout(100, 1.87)).toBe(187);
    expect(payout(33, 2.5)).toBe(82);
  });
});

describe('quote dinamiche (blend prior ↔ denaro)', () => {
  it('a pool zero la quota corrisponde al prior', () => {
    expect(currentOdds(0.5, 0, 0, 300)).toBeCloseTo(probabilityToOdds(0.5), 2);
  });
  it('la quota di un esito scende quando ci si punta sopra', () => {
    const base = currentOdds(0.5, 0, 0, 300);
    const afterBets = currentOdds(0.5, 600, 600, 300);
    expect(afterBets).toBeLessThan(base);
  });
  it('puntare su un esito alza la probabilità di quello e abbassa gli altri', () => {
    const before = blendedProbability(0.5, 0, 0, 300);
    const onIt = blendedProbability(0.5, 300, 300, 300);
    const onOther = blendedProbability(0.5, 0, 300, 300);
    expect(onIt).toBeGreaterThan(before);
    expect(onOther).toBeLessThan(before);
  });
  it('con liquidità alta le quote si muovono meno', () => {
    const soft = currentOdds(0.5, 200, 200, 100);
    const stiff = currentOdds(0.5, 200, 200, 2000);
    expect(Math.abs(stiff - 2)).toBeLessThan(Math.abs(soft - 2));
  });
  it('testa a testa a livelli pari: quote iniziali uguali, poi divergono con le puntate', () => {
    const start = headToHeadOdds(0, 0);
    expect(start.first).toBeCloseTo(start.second, 2);
    const prior = 0.5;
    const firstAfter = currentOdds(prior, 400, 500, 300);
    const secondAfter = currentOdds(1 - prior, 100, 500, 300);
    expect(firstAfter).toBeLessThan(secondAfter);
  });
});

describe('vincitore torneo compresso', () => {
  const field = [
    { id: 'adv', level: 3, points: 0 },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `int${i}`, level: 2, points: 0 })),
    { id: 'beg', level: 1, points: 0 },
  ];
  it('il favorito parte basso (~2.5-3.5)', () => {
    const favorite = tournamentWinnerOdds(field).get('adv')!;
    expect(favorite).toBeGreaterThan(2);
    expect(favorite).toBeLessThan(4);
  });
  it('nessuna quota supera il tetto massimo', () => {
    const odds = tournamentWinnerOdds(field);
    expect(Math.max(...odds.values())).toBeLessThanOrEqual(MAX_WINNER_ODDS);
  });
});
