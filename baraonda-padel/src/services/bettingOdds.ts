// Calcolo puro delle quote a partire dai livelli (1-3) dei giocatori. È la fonte di verità
// per la modalità demo locale e per i test; in produzione le stesse formule sono replicate in
// SQL (migrazione betting) perché la vista pubblica non espone i livelli reali. Se cambi una
// formula qui, aggiorna anche la funzione SQL corrispondente: i due calcoli non devono divergere.

export const OUTCOME_K = 0.6;
export const MAX_DRAW_PROBABILITY = 0.15;
export const DEFAULT_MARGIN = 0.08;
export const MIN_ODDS = 1.01;
// Liquidità = pseudo-monte del prior nel blend bayesiano: più è alta, più le quote si muovono
// lentamente rispetto alle puntate reali. Il vincitore torneo usa una liquidità maggiore perché
// ha molte selezioni. MAX_WINNER_ODDS comprime il campo evitando quote enormi.
export const DEFAULT_LIQUIDITY = 300;
export const WINNER_LIQUIDITY = 800;
export const MAX_WINNER_ODDS = 15;

const clampProbability = (p: number) => Math.min(0.99, Math.max(0.01, p));
const round2 = (value: number) => Math.round(value * 100) / 100;
const logistic = (x: number, k = OUTCOME_K) => 1 / (1 + Math.exp(-k * x));

/** Forza di una coppia = somma dei livelli (Principiante 1, Intermedio 2, Avanzato 3), range 2-6. */
export const teamStrength = (level1: number, level2: number) => level1 + level2;

/** Quota decimale a partire da una probabilità, con margine "banco" (overround). Mai sotto MIN_ODDS,
 *  eventualmente limitata verso l'alto da maxOdds (usato per comprimere il vincitore torneo). */
export function probabilityToOdds(probability: number, margin = DEFAULT_MARGIN, maxOdds = Infinity): number {
  const fair = 1 / clampProbability(probability);
  return Math.min(maxOdds, Math.max(MIN_ODDS, round2(fair / (1 + margin))));
}

/** Blend bayesiano prior↔denaro: la probabilità corrente di un esito dato il prior e le puntate. */
export function blendedProbability(prior: number, stakeOn: number, totalStake: number, liquidity = DEFAULT_LIQUIDITY): number {
  return (liquidity * prior + stakeOn) / (liquidity + totalStake);
}

/** Quota corrente di un esito: prior spostato dal denaro puntato, con margine ed eventuale tetto. */
export function currentOdds(prior: number, stakeOn: number, totalStake: number, liquidity = DEFAULT_LIQUIDITY, margin = DEFAULT_MARGIN, maxOdds = Infinity): number {
  return probabilityToOdds(blendedProbability(prior, stakeOn, totalStake, liquidity), margin, maxOdds);
}

/** Payout intero di una puntata: gettoni sempre interi, si arrotonda per difetto. */
export const payout = (stake: number, odds: number) => Math.floor(stake * odds);

export type OutcomeProbabilities = { pA: number; pB: number; pDraw: number };

/** Esito partita: differenza di forza → probabilità di A/B/pareggio. Il pareggio è più probabile
 *  a forze pari (fino a MAX_DRAW_PROBABILITY) e svanisce quando lo squilibrio è massimo. */
export function matchOutcomeProbabilities(strengthA: number, strengthB: number): OutcomeProbabilities {
  const difference = strengthA - strengthB;
  const pDraw = MAX_DRAW_PROBABILITY * (1 - Math.min(4, Math.abs(difference)) / 4);
  const core = logistic(difference);
  return { pA: (1 - pDraw) * core, pB: (1 - pDraw) * (1 - core), pDraw };
}

export function matchOutcomeOdds(strengthA: number, strengthB: number, margin = DEFAULT_MARGIN) {
  const { pA, pB, pDraw } = matchOutcomeProbabilities(strengthA, strengthB);
  return { A: probabilityToOdds(pA, margin), B: probabilityToOdds(pB, margin), draw: probabilityToOdds(pDraw, margin) };
}

export type OverUnderProbabilities = { pOver: number; pUnder: number };

/** Over/Under sui game totali: le partite equilibrate tendono a più game giocati (over), quelle
 *  sbilanciate finiscono in blowout (under). Euristica, non un modello statistico dei game. */
export function overUnderProbabilities(strengthA: number, strengthB: number): OverUnderProbabilities {
  const balance = 1 - Math.min(4, Math.abs(strengthA - strengthB)) / 4;
  const pOver = 0.35 + 0.3 * balance;
  return { pOver, pUnder: 1 - pOver };
}

export function overUnderOdds(strengthA: number, strengthB: number, margin = DEFAULT_MARGIN) {
  const { pOver, pUnder } = overUnderProbabilities(strengthA, strengthB);
  return { over: probabilityToOdds(pOver, margin), under: probabilityToOdds(pUnder, margin) };
}

/** Linea over/under di default derivata dal formato partita (game massimi per match). */
export const defaultOverUnderLine = (maxGamesPerMatch: number) => Math.max(1, maxGamesPerMatch) - 0.5;

/** Testa-a-testa: probabilità che il primo giocatore chiuda più in alto in classifica, dai livelli
 *  e dai punti attuali. Il pareggio in classifica viene gestito come annullamento lato server.
 *  Logistica con k=1 (i pesi sono già nei coefficienti); l'SQL replica la stessa espressione. */
export function headToHeadProbability(levelDifference: number, pointDifference: number): number {
  return 1 / (1 + Math.exp(-(levelDifference * 0.7 + pointDifference * 0.35)));
}

export function headToHeadOdds(levelDifference: number, pointDifference: number, margin = DEFAULT_MARGIN) {
  const pFirst = headToHeadProbability(levelDifference, pointDifference);
  return { first: probabilityToOdds(pFirst, margin), second: probabilityToOdds(1 - pFirst, margin) };
}

export type WinnerEntry = { id: string; level: number; points: number };
export const WINNER_ALPHA = 1.4;

/** Vincitore torneo: prior compresso via softmax (α alto) così il favorito parte basso (~2.5-3.5)
 *  senza schiacciare troppo il resto del campo. Normalizzato sul campo. */
export function tournamentWinnerProbabilities(entries: WinnerEntry[]): Map<string, number> {
  const weights = entries.map(entry => Math.exp(WINNER_ALPHA * entry.level + 0.14 * entry.points));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return new Map(entries.map((entry, index) => [entry.id, weights[index] / total]));
}

/** Quote iniziali (pool a zero) del vincitore torneo, limitate a MAX_WINNER_ODDS per comprimere il campo. */
export function tournamentWinnerOdds(entries: WinnerEntry[], margin = DEFAULT_MARGIN): Map<string, number> {
  const probabilities = tournamentWinnerProbabilities(entries);
  return new Map(entries.map(entry => [entry.id, probabilityToOdds(probabilities.get(entry.id) ?? 0, margin, MAX_WINNER_ODDS)]));
}
