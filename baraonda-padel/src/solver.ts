import { Match, Player, Quality, Settings, Tournament, levelValue, pairKey, toMin, toTime, uid } from './models';
import { balanceScoreFromLevels, calculateMatchBalance } from './services/matchBalance';
import { isMatchCompleted } from './services/matchResults';

const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.max(a1, b1) < Math.min(a2, b2);
export const isAvailable = (player: Player, start: number, end: number) =>
  !['assente', 'infortunato', 'ritirato'].includes(player.status) && player.availability.some(a => toMin(a.from) <= start && toMin(a.to) >= end);

export const buildSlots = (settings: Settings) => {
  const duration = settings.playMinutes + settings.warmupMinutes;
  const slots: { start: string; end: string }[] = [];
  for (let time = toMin(settings.start); time + duration <= toMin(settings.end); time += duration) {
    if (!settings.pauses.some(pause => overlap(time, time + duration, toMin(pause.from), toMin(pause.to)))) slots.push({ start: toTime(time), end: toTime(time + duration) });
  }
  return slots;
};

const teamMixed = (a: Player, b: Player) => a.gender !== 'Altro' && b.gender !== 'Altro' && a.gender !== b.gender;

const compareArrays = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

/**
 * Heuristic solver, deliberately isolated so it can be swapped for CP-SAT.
 *
 * Candidates are ranked by a LEXICOGRAPHIC key, not a weighted sum: earlier tiers strictly
 * dominate later ones, so no combination of soft penalties can ever outrank a fairness tier
 * (the old weighted formula let level-balance penalties outweigh attendance gaps, starving
 * awkward-level players while overloading mid-level ones). Tier order:
 *   k1  teammate avoid-pairs — effectively hard: nothing below can compensate one;
 *   k2  players pushed past settings.targetMatchesPerPlayer — the target is a priority, not
 *       a cap: slots keep filling past it, preferring candidates that overshoot for fewer players;
 *   k3  urgent players left out — a player whose remaining available slots are barely enough
 *       to reach the fair ceiling must play now or never (narrow-window scarcity);
 *   c1..c4  the four counts sorted descending — minimizing this vector IS "seat the four
 *       lowest-count available players", which keeps the attendance spread <= 1 whenever
 *       capacity and availability allow. Quality only chooses WHICH equally-behind players
 *       play, never WHETHER a behind player plays;
 *   k5  soft quality — level balance, partner variety, mixed teams, back-to-back rest.
 * Reordering these tiers changes the fairness guarantees: tune weights only inside k5.
 */
export function generateSchedule(tournament: Tournament, keepLocked = true): Match[] {
  const slots = buildSlots(tournament.settings);
  const locked = keepLocked ? tournament.matches.filter(match => match.locked || isMatchCompleted(match)) : [];
  const lockedByTime = new Map(locked.map(match => [match.start, match]));
  const players = tournament.players;
  const n = players.length;
  const indexOf = new Map(players.map((player, index) => [player.id, index]));

  const cnt = new Array<number>(n).fill(0);
  const lastPlayed = new Array<number>(n).fill(-2);
  const partnersMat: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  // Locked matches may reference players no longer in the roster; their counts still feed
  // the final uniformity message, as before.
  const staleCounts = new Map<string, number>();
  locked.forEach(match => {
    const slotIdx = slots.findIndex(slot => slot.start === match.start);
    match.players.forEach(id => { const p = indexOf.get(id); if (p !== undefined) { cnt[p] += 1; lastPlayed[p] = slotIdx; } else staleCounts.set(id, (staleCounts.get(id) ?? 0) + 1); });
    [[match.players[0], match.players[1]], [match.players[2], match.players[3]]].forEach(([a, b]) => { const pa = indexOf.get(a); const pb = indexOf.get(b); if (pa !== undefined && pb !== undefined) { partnersMat[pa][pb] += 1; partnersMat[pb][pa] += 1; } });
  });

  // Availability matrix, per-player remaining opportunities (suffix sums over feasible
  // slots) and the fair ceiling each player should be able to reach.
  const availMat = players.map(player => slots.map(slot => isAvailable(player, toMin(slot.start), toMin(slot.end))));
  const feasible = slots.map((slot, s) => !lockedByTime.has(slot.start) && availMat.reduce((total, row) => total + (row[s] ? 1 : 0), 0) >= 4);
  const remaining = players.map((_, p) => { const suffix = new Array<number>(slots.length + 1).fill(0); for (let s = slots.length - 1; s >= 0; s -= 1) suffix[s] = suffix[s + 1] + (feasible[s] && availMat[p][s] ? 1 : 0); return suffix; });
  const eligibleN = availMat.filter(row => row.some(Boolean)).length;
  const target = tournament.settings.targetMatchesPerPlayer > 0 ? tournament.settings.targetMatchesPerPlayer : Infinity;
  const fairCeil = eligibleN ? Math.min(Math.ceil((4 * slots.length) / eligibleN), target) : 0;

  // Per-player numeric features so the candidate loop stays pure arithmetic.
  const level = players.map(player => levelValue[player.level] ?? levelValue.Intermedio);
  const donna = players.map(player => player.gender === 'Donna');
  const mixedMat = players.map(a => players.map(b => teamMixed(a, b)));
  const avoidMat = players.map(a => players.map(b => a.avoidPartners.includes(b.id) || b.avoidPartners.includes(a.id)));

  const planned: Match[] = [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex]; const existing = lockedByTime.get(slot.start);
    if (existing) { planned.push(existing); continue; }
    const availIdx: number[] = [];
    for (let p = 0; p < n; p += 1) if (availMat[p][slotIndex]) availIdx.push(p);
    if (availIdx.length < 4) continue;
    // Fairness-first ordering: lowest count, then fewest remaining chances, then a
    // slot-rotating tiebreak so exact ties don't always favour the same roster positions.
    availIdx.sort((a, b) => (cnt[a] - cnt[b]) || (remaining[a][slotIndex] - remaining[b][slotIndex]) || (((a + slotIndex) % n) - ((b + slotIndex) % n)) || (a - b));
    const urgentFlag = players.map((_, p) => { const need = fairCeil - cnt[p]; return need > 0 && remaining[p][slotIndex] <= need; });
    const urgentTotal = availIdx.reduce((total, p) => total + (urgentFlag[p] ? 1 : 0), 0);

    let best: { pairing: [number, number, number, number]; k1: number; combo: number[]; quality: number } | undefined;
    // Tier ladder: enumerate a bounded rank window of the fairest candidates first. A
    // prefix of the fairness-sorted list always contains the true lowest-count players
    // (a global sort means the first 4 of any prefix >= 4 long ARE the 4 lowest overall),
    // so bounding the window loses nothing for the fairness tiers — it only limits how
    // many same-tier candidates compete on soft quality, which matters when many players
    // are tied on count (the common case early in a schedule) and keeps the combinatorial
    // search bounded regardless of roster size. Urgent players are force-included even
    // outside the window since they must play now or lose their only remaining chance.
    // Widen only while every candidate found so far contains an avoid-pair (k1 > 0), up to
    // the full available set, where the minimum-violation candidate is committed — same
    // fallback semantics as before.
    const basePoolSize = Math.min(availIdx.length, 12);
    for (let poolSize = basePoolSize; ; poolSize = Math.min(availIdx.length, poolSize + 8)) {
      const pool = poolSize === availIdx.length ? availIdx : [...availIdx.slice(0, poolSize), ...availIdx.slice(poolSize).filter(p => urgentFlag[p])];
      for (let a = 0; a < pool.length - 3; a += 1) for (let b = a + 1; b < pool.length - 2; b += 1) for (let c = b + 1; c < pool.length - 1; c += 1) for (let d = c + 1; d < pool.length; d += 1) {
        const group = [pool[a], pool[b], pool[c], pool[d]];
        const counts = group.map(p => cnt[p]).sort((x, y) => y - x);
        const overCap = Number.isFinite(target) ? group.reduce((total, p) => total + (cnt[p] >= target ? 1 : 0), 0) : 0;
        const urgencyMiss = urgentTotal - group.reduce((total, p) => total + (urgentFlag[p] ? 1 : 0), 0);
        const combo = [overCap, urgencyMiss, counts[0], counts[1], counts[2], counts[3]];
        // Pairing-independent prune: if the current best is avoid-free and this combo's
        // fairness tiers already lose, no pairing of it can win.
        if (best && best.k1 === 0 && compareArrays(combo, best.combo) > 0) continue;
        const rest = group.reduce((total, p) => total + (lastPlayed[p] === slotIndex - 1 ? 160 : 0), 0);
        for (const [i, j, k, l] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
          const [one, two, three, four] = [group[i], group[j], group[k], group[l]];
          const k1 = (avoidMat[one][two] ? 1 : 0) + (avoidMat[three][four] ? 1 : 0);
          const score = balanceScoreFromLevels(level[one], level[two], level[three], level[four], mixedMat[one][two] && mixedMat[three][four]);
          const womenA = (donna[one] ? 1 : 0) + (donna[two] ? 1 : 0);
          const womenB = (donna[three] ? 1 : 0) + (donna[four] ? 1 : 0);
          const twoWomenVsTwoMen = (womenA === 2 && womenB === 0) || (womenB === 2 && womenA === 0);
          const repeated = partnersMat[one][two] + partnersMat[three][four];
          let quality = rest + repeated * 230 + (100 - score) * 7 + (score < 60 ? 500 : 0) + (score < 40 ? 1500 : 0) + (twoWomenVsTwoMen ? 450 : 0);
          if (tournament.settings.prioritizeMixed) quality += (!mixedMat[one][two] ? 25 : 0) + (!mixedMat[three][four] ? 25 : 0);
          const comboCompare = best ? compareArrays(combo, best.combo) : 0;
          if (!best || k1 < best.k1 || (k1 === best.k1 && (comboCompare < 0 || (comboCompare === 0 && quality < best.quality)))) best = { pairing: [one, two, three, four], k1, combo, quality };
        }
      }
      if ((best && best.k1 === 0) || pool.length === availIdx.length) break;
    }

    if (best) {
      const [one, two, three, four] = best.pairing.map(p => players[p]);
      const violations: string[] = [];
      if (avoidMat[best.pairing[0]][best.pairing[1]]) violations.push(`${one.firstName} e ${two.firstName}: incompatibilità tra compagni`);
      if (avoidMat[best.pairing[2]][best.pairing[3]]) violations.push(`${three.firstName} e ${four.firstName}: incompatibilità tra compagni`);
      const ids: [string, string, string, string] = [one.id, two.id, three.id, four.id];
      violations.push(...calculateMatchBalance({ id: 'candidate', start: slot.start, end: slot.end, players: ids, locked: false, violations: [] }, players).warnings);
      const womenA = (donna[best.pairing[0]] ? 1 : 0) + (donna[best.pairing[1]] ? 1 : 0);
      const womenB = (donna[best.pairing[2]] ? 1 : 0) + (donna[best.pairing[3]] ? 1 : 0);
      if ((womenA === 2 && womenB === 0) || (womenB === 2 && womenA === 0)) violations.push('Due donne contro due uomini');
      best.pairing.forEach(p => { cnt[p] += 1; lastPlayed[p] = slotIndex; });
      partnersMat[best.pairing[0]][best.pairing[1]] += 1; partnersMat[best.pairing[1]][best.pairing[0]] += 1;
      partnersMat[best.pairing[2]][best.pairing[3]] += 1; partnersMat[best.pairing[3]][best.pairing[2]] += 1;
      planned.push({ id: uid(), ...slot, players: ids, locked: false, violations });
    }
  }
  const counts = [...cnt, ...staleCounts.values()];
  if (counts.length && Math.max(...counts) !== Math.min(...counts)) planned.forEach(match => match.violations.push('Numero di presenze non perfettamente uniforme: capacità non divisibile per 4 o vincoli di disponibilità'));
  // No player can arrive in this loop unless isAvailable returned true; this invariant is test-covered.
  return planned;
}

export function calendarQuality(tournament: Tournament): Quality {
  const counts = new Map(tournament.players.map(player => [player.id, 0]));
  const partnerCounts = new Map<string, number>(); let consecutive = 0; let imbalance = 0; let mixedTeams = 0; let teams = 0;
  tournament.matches.forEach((match, index) => {
    match.players.forEach(id => { counts.set(id, (counts.get(id) ?? 0) + 1); if (index && tournament.matches[index - 1].players.includes(id)) consecutive += 1; });
    [[match.players[0], match.players[1]], [match.players[2], match.players[3]]].forEach(([a, b]) => { partnerCounts.set(pairKey(a, b), (partnerCounts.get(pairKey(a, b)) ?? 0) + 1); const first = playerBy(a); const second = playerBy(b); if (first && second && teamMixed(first, second)) mixedTeams += 1; teams += 1; });
    const p = match.players.map(id => tournament.players.find(player => player.id === id));
    if (p.every(Boolean)) imbalance += Math.abs(levelValue[p[0]!.level] + levelValue[p[1]!.level] - levelValue[p[2]!.level] - levelValue[p[3]!.level]);
  });
  function playerBy(id: string) { return tournament.players.find(player => player.id === id); }
  const values = [...counts.values()]; const repetitions = [...partnerCounts.values()].map(value => Math.max(0, value - 1));
  return { min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0, consecutive, maxPartnerRepeats: repetitions.length ? Math.max(...repetitions) : 0, averagePartnerRepeats: repetitions.length ? repetitions.reduce((a, b) => a + b, 0) / repetitions.length : 0, levelImbalance: tournament.matches.length ? imbalance / tournament.matches.length : 0, violations: tournament.matches.reduce((sum, match) => sum + match.violations.length, 0), mixedPercent: teams ? Math.round((mixedTeams / teams) * 100) : 0 };
}
