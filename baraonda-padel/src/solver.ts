import { Match, Player, Quality, Settings, Tournament, fullName, levelValue, pairKey, toMin, toTime, uid } from './models';
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

export type ScheduleGenerationResult = {
  status: 'generated' | 'impossible';
  matches: Match[];
  requestedMax: number;
  commonMatchesPerPlayer: number | null;
  excludedPlayerIds: string[];
  reason?: string;
};

export type ScheduleGenerationOptions = { randomize?: boolean; seed?: number };

const randomSeed = () => {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(values)[0];
  return Math.floor(Math.random() * 0x100000000);
};

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
};

const isEligiblePlayer = (player: Player) => player.status === 'attivo' || player.status === 'ritardo';

export function scheduleRespectsPlayerLimit(tournament: Tournament) {
  if (!tournament.matches.length) return true;
  const eligibleIds = new Set(tournament.players.filter(isEligiblePlayer).map(player => player.id));
  const counts = new Map([...eligibleIds].map(id => [id, 0]));
  tournament.matches.forEach(match => match.players.forEach(id => { if (eligibleIds.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1); }));
  const values = [...counts.values()];
  if (!values.length) return true;
  const maximum = Math.max(1, Math.floor(tournament.settings.targetMatchesPerPlayer));
  return Math.max(...values) <= maximum && Math.min(...values) === Math.max(...values);
}

/**
 * Heuristic solver, deliberately isolated so it can be swapped for CP-SAT.
 *
 * The configured number is a hard ceiling. The solver tries common totals from that ceiling
 * down to one and only returns a schedule when every eligible player reaches the same total.
 * Availability and protected-match counts are hard constraints; pairing variety, balance,
 * mixed teams and rest are secondary quality criteria.
 */
export function generateSchedule(tournament: Tournament, keepLocked = true, options: ScheduleGenerationOptions = {}): ScheduleGenerationResult {
  const slots = buildSlots(tournament.settings);
  const protectedMatches = keepLocked ? tournament.matches.filter(match => match.locked || isMatchCompleted(match)) : [];
  const protectedByTime = new Map(protectedMatches.map(match => [match.start, match]));
  const players = tournament.players.filter(isEligiblePlayer);
  const excludedPlayerIds = tournament.players.filter(player => !isEligiblePlayer(player)).map(player => player.id);
  const requestedMax = Math.max(1, Math.floor(tournament.settings.targetMatchesPerPlayer));
  const n = players.length;
  const indexOf = new Map(players.map((player, index) => [player.id, index]));
  const impossible = (reason: string): ScheduleGenerationResult => ({ status: 'impossible', matches: tournament.matches, requestedMax, commonMatchesPerPlayer: null, excludedPlayerIds, reason });
  const randomize = Boolean(options.randomize);
  const random = seededRandom(options.seed ?? (randomize ? randomSeed() : 0));

  if (!n) return impossible('Non ci sono giocatori attivi o in ritardo da inserire nel calendario.');
  const listNames = (items: Player[]) => items.map(fullName).join(', ');
  const withoutAvailability = players.filter(player => player.availability.length === 0);
  if (withoutAvailability.length) {
    const names = listNames(withoutAvailability);
    return impossible(withoutAvailability.length === 1
      ? `Impossibile generare il calendario: ${names} non ha fasce di disponibilità. Aggiungine almeno una nella sezione Giocatori.`
      : `Impossibile generare il calendario: ${names} non hanno fasce di disponibilità. Aggiungine almeno una per ciascuno nella sezione Giocatori.`);
  }
  const withoutPlayableSlot = players.filter(player => !slots.some(slot => isAvailable(player, toMin(slot.start), toMin(slot.end))));
  if (withoutPlayableSlot.length) {
    const names = listNames(withoutPlayableSlot);
    return impossible(withoutPlayableSlot.length === 1
      ? `Impossibile generare il calendario: ${names} non ha una fascia di disponibilità che comprenda uno slot valido del torneo. Correggi gli orari nella sezione Giocatori.`
      : `Impossibile generare il calendario: ${names} non hanno fasce di disponibilità che comprendano uno slot valido del torneo. Correggi gli orari nella sezione Giocatori.`);
  }

  const protectedCounts = new Array<number>(n).fill(0);
  const protectedSlots = Array.from({ length: n }, () => new Set<number>());
  const protectedPartners: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  protectedMatches.forEach(match => {
    const slotIndex = slots.findIndex(slot => slot.start === match.start);
    match.players.forEach(id => {
      const playerIndex = indexOf.get(id);
      if (playerIndex !== undefined) {
        protectedCounts[playerIndex] += 1;
        if (slotIndex >= 0) protectedSlots[playerIndex].add(slotIndex);
      }
    });
    [[match.players[0], match.players[1]], [match.players[2], match.players[3]]].forEach(([a, b]) => {
      const first = indexOf.get(a); const second = indexOf.get(b);
      if (first !== undefined && second !== undefined) { protectedPartners[first][second] += 1; protectedPartners[second][first] += 1; }
    });
  });
  if (protectedCounts.some(count => count > requestedMax)) return impossible('Una o pi\u00f9 partite bloccate o concluse portano gi\u00e0 un giocatore oltre il massimo configurato.');

  const openSlot = slots.map(slot => !protectedByTime.has(slot.start));
  const availMat = players.map(player => slots.map(slot => isAvailable(player, toMin(slot.start), toMin(slot.end))));
  const availabilityPrefix = availMat.map(row => {
    const prefix = new Array<number>(slots.length + 1).fill(0);
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) prefix[slotIndex + 1] = prefix[slotIndex] + (row[slotIndex] ? 1 : 0);
    return prefix;
  });
  const remaining = players.map((_, playerIndex) => {
    const suffix = new Array<number>(slots.length + 1).fill(0);
    for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) suffix[slotIndex] = suffix[slotIndex + 1] + (openSlot[slotIndex] && availMat[playerIndex][slotIndex] ? 1 : 0);
    return suffix;
  });
  const remainingOpenSlots = new Array<number>(slots.length + 1).fill(0);
  for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) remainingOpenSlots[slotIndex] = remainingOpenSlots[slotIndex + 1] + (openSlot[slotIndex] ? 1 : 0);

  const level = players.map(player => levelValue[player.level] ?? levelValue.Intermedio);
  const donna = players.map(player => player.gender === 'Donna');
  const mixedMat = players.map(a => players.map(b => teamMixed(a, b)));
  const avoidMat = players.map(a => players.map(b => a.avoidPartners.includes(b.id) || b.avoidPartners.includes(a.id)));
  const slotIndexByStart = new Map(slots.map((slot, slotIndex) => [slot.start, slotIndex]));
  const protectedIds = new Set(protectedMatches.map(match => match.id));
  const previousPairCounts = new Map<string, number>(); const previousGroupCounts = new Map<string, number>(); const previousTimedGroupCounts = new Map<string, number>();
  tournament.matches.filter(match => !protectedIds.has(match.id)).forEach(match => {
    [[match.players[0], match.players[1]], [match.players[2], match.players[3]]].forEach(([a, b]) => { const key = pairKey(a, b); previousPairCounts.set(key, (previousPairCounts.get(key) ?? 0) + 1); });
    const group = [...match.players].sort().join('|'); previousGroupCounts.set(group, (previousGroupCounts.get(group) ?? 0) + 1); previousTimedGroupCounts.set(`${match.start}|${group}`, (previousTimedGroupCounts.get(`${match.start}|${group}`) ?? 0) + 1);
  });
  const balanceBand = (score: number) => score >= 90 ? 4 : score >= 75 ? 3 : score >= 60 ? 2 : score >= 40 ? 1 : 0;
  const randomOrder = players.map(() => slots.map(() => random()));
  const noveltyScore = (pairing: [number, number, number, number], start: string) => {
    const ids = pairing.map(playerIndex => players[playerIndex].id);
    const samePairs = (previousPairCounts.get(pairKey(ids[0], ids[1])) ?? 0) + (previousPairCounts.get(pairKey(ids[2], ids[3])) ?? 0);
    const group = [...ids].sort().join('|');
    return [samePairs, previousGroupCounts.get(group) ?? 0, previousTimedGroupCounts.get(`${start}|${group}`) ?? 0];
  };

  const rebuildPairings = (matches: Match[]) => {
    const partnerCounts = protectedPartners.map(row => [...row]);
    return matches.map(match => {
      const group = match.players.map(id => indexOf.get(id));
      if (!group.every((value): value is number => value !== undefined)) return match;
      type PairingCandidate = { pairing: [number, number, number, number]; score: number[]; avoid: number; repeated: number; balance: number; mixedPenalty: number; novelty: number[] };
      const candidates: PairingCandidate[] = [];
      for (const [i, j, k, l] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
        const pairing: [number, number, number, number] = [group[i], group[j], group[k], group[l]];
        const [one, two, three, four] = pairing;
        const avoid = Number(avoidMat[one][two]) + Number(avoidMat[three][four]); const repeated = partnerCounts[one][two] + partnerCounts[three][four];
        const balance = balanceScoreFromLevels(level[one], level[two], level[three], level[four], mixedMat[one][two] && mixedMat[three][four]); const mixedPenalty = tournament.settings.prioritizeMixed ? Number(!mixedMat[one][two]) + Number(!mixedMat[three][four]) : 0;
        candidates.push({ pairing, score: [avoid, repeated, 100 - balance, mixedPenalty], avoid, repeated, balance, mixedPenalty, novelty: noveltyScore(pairing, match.start) });
      }
      let best: PairingCandidate;
      if (randomize) {
        let shortlist = candidates;
        const minimumAvoid = Math.min(...shortlist.map(candidate => candidate.avoid)); shortlist = shortlist.filter(candidate => candidate.avoid === minimumAvoid);
        const minimumRepeated = Math.min(...shortlist.map(candidate => candidate.repeated)); shortlist = shortlist.filter(candidate => candidate.repeated === minimumRepeated);
        const bestBalance = Math.max(...shortlist.map(candidate => candidate.balance)); const bestBand = balanceBand(bestBalance);
        shortlist = shortlist.filter(candidate => balanceBand(candidate.balance) === bestBand && candidate.balance >= bestBalance - 5);
        const minimumMixedPenalty = Math.min(...shortlist.map(candidate => candidate.mixedPenalty)); shortlist = shortlist.filter(candidate => candidate.mixedPenalty === minimumMixedPenalty);
        const bestNovelty = shortlist.reduce((current, candidate) => compareArrays(candidate.novelty, current) < 0 ? candidate.novelty : current, shortlist[0].novelty);
        shortlist = shortlist.filter(candidate => compareArrays(candidate.novelty, bestNovelty) === 0);
        best = shortlist[Math.floor(random() * shortlist.length)];
      } else best = candidates.reduce((current, candidate) => compareArrays(candidate.score, current.score) < 0 ? candidate : current);
      const [one, two, three, four] = best!.pairing; partnerCounts[one][two] += 1; partnerCounts[two][one] += 1; partnerCounts[three][four] += 1; partnerCounts[four][three] += 1;
      const ids: Match['players'] = [players[one].id, players[two].id, players[three].id, players[four].id];
      const violations: string[] = [];
      if (avoidMat[one][two]) violations.push(`${players[one].firstName} e ${players[two].firstName}: incompatibilit\u00e0 tra compagni`);
      if (avoidMat[three][four]) violations.push(`${players[three].firstName} e ${players[four].firstName}: incompatibilit\u00e0 tra compagni`);
      violations.push(...calculateMatchBalance({ ...match, players: ids, violations: [] }, players).warnings);
      const womenA = Number(donna[one]) + Number(donna[two]); const womenB = Number(donna[three]) + Number(donna[four]);
      if ((womenA === 2 && womenB === 0) || (womenB === 2 && womenA === 0)) violations.push('Due donne contro due uomini');
      return { ...match, players: ids, violations };
    });
  };

  for (let target = requestedMax; target >= 1; target -= 1) {
    const deficits = protectedCounts.map(count => target - count);
    if (deficits.some(deficit => deficit < 0)) continue;
    const requiredSeats = deficits.reduce((sum, deficit) => sum + deficit, 0);
    if (requiredSeats % 4 !== 0 || requiredSeats / 4 > remainingOpenSlots[0]) continue;
    if (deficits.some((deficit, playerIndex) => deficit > remaining[playerIndex][0])) continue;

    const playedSlots = protectedSlots.map(items => new Set(items));
    const generatedCounts = new Array<number>(n).fill(0);
    const partnersMat = protectedPartners.map(row => [...row]);
    const generated: Match[] = [];
    let failed = false;

    for (let slotIndex = 0; slotIndex < slots.length && deficits.some(Boolean); slotIndex += 1) {
      if (!openSlot[slotIndex]) continue;
      const seatsLeft = deficits.reduce((sum, deficit) => sum + deficit, 0);
      if (seatsLeft > remainingOpenSlots[slotIndex] * 4) { failed = true; break; }
      if (Math.max(...deficits) > seatsLeft / 4) { failed = true; break; }

      const available: number[] = [];
      for (let playerIndex = 0; playerIndex < n; playerIndex += 1) if (deficits[playerIndex] > 0 && availMat[playerIndex][slotIndex]) available.push(playerIndex);
      if (available.length < 4) continue;

      const urgent = players.map((_, playerIndex) => deficits[playerIndex] > remaining[playerIndex][slotIndex + 1]);
      const urgentTotal = urgent.reduce((sum, value) => sum + (value ? 1 : 0), 0);
      if (urgentTotal > 4) { failed = true; break; }
      const progressDelta = (playerIndex: number) => {
        const protectedPlayed = [...protectedSlots[playerIndex]].reduce((sum, protectedSlot) => sum + (protectedSlot <= slotIndex ? 1 : 0), 0);
        const actual = protectedPlayed + generatedCounts[playerIndex];
        const expected = target * availabilityPrefix[playerIndex][slotIndex + 1] / availabilityPrefix[playerIndex][slots.length];
        return ((actual + 1) - expected) ** 2 - (actual - expected) ** 2;
      };
      const playedImmediatelyBefore = (playerIndex: number) => slotIndex > 0 && slots[slotIndex - 1].end === slots[slotIndex].start && playedSlots[playerIndex].has(slotIndex - 1);
      available.sort((a, b) => Number(urgent[b]) - Number(urgent[a]) || Number(playedImmediatelyBefore(a)) - Number(playedImmediatelyBefore(b)) || progressDelta(a) - progressDelta(b) || (remaining[a][slotIndex + 1] - deficits[a]) - (remaining[b][slotIndex + 1] - deficits[b]) || (randomize ? randomOrder[a][slotIndex] - randomOrder[b][slotIndex] : ((a + slotIndex) % n) - ((b + slotIndex) % n)) || a - b);
      const pool = [...available.slice(0, Math.min(12, available.length)), ...available.slice(12).filter(playerIndex => urgent[playerIndex])];

      type Candidate = { pairing: [number, number, number, number]; avoid: number; priority: number[]; progress: number; quality: number; repeated: number; balance: number; mixedPenalty: number; genderPenalty: number; novelty: number[] };
      const candidates: Candidate[] = [];
      let best: Candidate | undefined;
      for (let a = 0; a < pool.length - 3; a += 1) for (let b = a + 1; b < pool.length - 2; b += 1) for (let c = b + 1; c < pool.length - 1; c += 1) for (let d = c + 1; d < pool.length; d += 1) {
        const group = [pool[a], pool[b], pool[c], pool[d]];
        if (group.filter(playerIndex => urgent[playerIndex]).length !== urgentTotal) continue;
        const nextDeficits = deficits.map((deficit, playerIndex) => deficit - (group.includes(playerIndex) ? 1 : 0));
        if (nextDeficits.some((deficit, playerIndex) => deficit > remaining[playerIndex][slotIndex + 1])) continue;
        const nextSeats = nextDeficits.reduce((sum, deficit) => sum + deficit, 0);
        if (nextSeats && Math.max(...nextDeficits) > nextSeats / 4) continue;
        const runLength = (playerIndex: number) => {
          let run = 1;
          for (let previous = slotIndex - 1; previous >= 0 && slots[previous].end === slots[previous + 1].start && playedSlots[playerIndex].has(previous); previous -= 1) run += 1;
          return run;
        };
        const maxRun = Math.max(...group.map(runLength));
        const consecutive = group.reduce((sum, playerIndex) => sum + (playedImmediatelyBefore(playerIndex) ? 1 : 0), 0);
        const progress = group.reduce((sum, playerIndex) => sum + progressDelta(playerIndex), 0);
        const scarcity = group.reduce((sum, playerIndex) => sum + Math.max(0, remaining[playerIndex][slotIndex + 1] - nextDeficits[playerIndex]), 0);
        const priority = [maxRun, consecutive, Math.round(progress * 1000), scarcity, -group.reduce((sum, playerIndex) => sum + deficits[playerIndex], 0)];
        const rest = consecutive * 160;

        for (const [i, j, k, l] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
          const [one, two, three, four] = [group[i], group[j], group[k], group[l]];
          const avoid = (avoidMat[one][two] ? 1 : 0) + (avoidMat[three][four] ? 1 : 0);
          const score = balanceScoreFromLevels(level[one], level[two], level[three], level[four], mixedMat[one][two] && mixedMat[three][four]);
          const womenA = (donna[one] ? 1 : 0) + (donna[two] ? 1 : 0);
          const womenB = (donna[three] ? 1 : 0) + (donna[four] ? 1 : 0);
          const twoWomenVsTwoMen = (womenA === 2 && womenB === 0) || (womenB === 2 && womenA === 0);
          const repeated = partnersMat[one][two] + partnersMat[three][four];
          const mixedPenalty = tournament.settings.prioritizeMixed ? Number(!mixedMat[one][two]) + Number(!mixedMat[three][four]) : 0;
          let quality = rest + repeated * 230 + (100 - score) * 7 + (score < 60 ? 500 : 0) + (score < 40 ? 1500 : 0) + (twoWomenVsTwoMen ? 450 : 0);
          quality += mixedPenalty * 25;
          const candidate: Candidate = { pairing: [one, two, three, four], avoid, priority, progress, quality, repeated, balance: score, mixedPenalty, genderPenalty: Number(twoWomenVsTwoMen), novelty: randomize ? noveltyScore([one, two, three, four], slots[slotIndex].start) : [] };
          if (randomize) candidates.push(candidate);
          else {
            const priorityComparison = best ? compareArrays(candidate.priority, best.priority) : 0;
            if (!best || priorityComparison < 0 || (priorityComparison === 0 && (candidate.avoid < best.avoid || (candidate.avoid === best.avoid && candidate.quality < best.quality)))) best = candidate;
          }
        }
      }

      if (randomize && candidates.length) {
        let shortlist = candidates;
        const bestPriority = shortlist.reduce((current, candidate) => compareArrays(candidate.priority, current) < 0 ? candidate.priority : current, shortlist[0].priority);
        shortlist = shortlist.filter(candidate => compareArrays(candidate.priority, bestPriority) === 0);
        const minimumAvoid = Math.min(...shortlist.map(candidate => candidate.avoid)); shortlist = shortlist.filter(candidate => candidate.avoid === minimumAvoid);
        const minimumRepeated = Math.min(...shortlist.map(candidate => candidate.repeated)); shortlist = shortlist.filter(candidate => candidate.repeated === minimumRepeated);
        const minimumGenderPenalty = Math.min(...shortlist.map(candidate => candidate.genderPenalty)); shortlist = shortlist.filter(candidate => candidate.genderPenalty === minimumGenderPenalty);
        const bestBalance = Math.max(...shortlist.map(candidate => candidate.balance)); const bestBand = balanceBand(bestBalance);
        shortlist = shortlist.filter(candidate => balanceBand(candidate.balance) === bestBand && candidate.balance >= bestBalance - 5);
        const minimumMixedPenalty = Math.min(...shortlist.map(candidate => candidate.mixedPenalty)); shortlist = shortlist.filter(candidate => candidate.mixedPenalty === minimumMixedPenalty);
        const bestNovelty = shortlist.reduce((current, candidate) => compareArrays(candidate.novelty, current) < 0 ? candidate.novelty : current, shortlist[0].novelty);
        shortlist = shortlist.filter(candidate => compareArrays(candidate.novelty, bestNovelty) === 0);
        best = shortlist[Math.floor(random() * shortlist.length)];
      }
      if (!best) continue;
      // Calendario compatto: riempi ogni slot aperto con una partita valida (niente slot vuoti).
      // Il riposo tra i turni resta una penalità nella scelta dei 4 giocatori (priority/rest), non un buco nel calendario.
      const slot = slots[slotIndex];
      const [one, two, three, four] = best.pairing.map(playerIndex => players[playerIndex]);
      const violations: string[] = [];
      if (avoidMat[best.pairing[0]][best.pairing[1]]) violations.push(`${one.firstName} e ${two.firstName}: incompatibilit\u00e0 tra compagni`);
      if (avoidMat[best.pairing[2]][best.pairing[3]]) violations.push(`${three.firstName} e ${four.firstName}: incompatibilit\u00e0 tra compagni`);
      const ids: [string, string, string, string] = [one.id, two.id, three.id, four.id];
      violations.push(...calculateMatchBalance({ id: 'candidate', start: slot.start, end: slot.end, players: ids, locked: false, violations: [] }, players).warnings);
      const womenA = (donna[best.pairing[0]] ? 1 : 0) + (donna[best.pairing[1]] ? 1 : 0);
      const womenB = (donna[best.pairing[2]] ? 1 : 0) + (donna[best.pairing[3]] ? 1 : 0);
      if ((womenA === 2 && womenB === 0) || (womenB === 2 && womenA === 0)) violations.push('Due donne contro due uomini');
      best.pairing.forEach(playerIndex => { deficits[playerIndex] -= 1; generatedCounts[playerIndex] += 1; playedSlots[playerIndex].add(slotIndex); });
      partnersMat[best.pairing[0]][best.pairing[1]] += 1; partnersMat[best.pairing[1]][best.pairing[0]] += 1;
      partnersMat[best.pairing[2]][best.pairing[3]] += 1; partnersMat[best.pairing[3]][best.pairing[2]] += 1;
      generated.push({ id: uid(), ...slot, players: ids, locked: false, violations });
    }

    if (!failed && deficits.every(deficit => deficit === 0)) {
      const optimized = rebuildPairings(generated);
      return { status: 'generated', matches: [...protectedMatches, ...optimized].sort((a, b) => a.start.localeCompare(b.start)), requestedMax, commonMatchesPerPlayer: target, excludedPlayerIds };
    }
  }

  return impossible('Non esiste un numero comune positivo di partite che rispetti massimo, disponibilit\u00e0 e partite protette.');
}

export function calendarQuality(tournament: Tournament): Quality {
  const counts = new Map(tournament.players.filter(isEligiblePlayer).map(player => [player.id, 0]));
  const partnerCounts = new Map<string, number>(); let consecutive = 0; let imbalance = 0; let mixedTeams = 0; let teams = 0;
  tournament.matches.forEach((match, index) => {
    match.players.forEach(id => { if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1); if (index && tournament.matches[index - 1].players.includes(id)) consecutive += 1; });
    [[match.players[0], match.players[1]], [match.players[2], match.players[3]]].forEach(([a, b]) => { partnerCounts.set(pairKey(a, b), (partnerCounts.get(pairKey(a, b)) ?? 0) + 1); const first = playerBy(a); const second = playerBy(b); if (first && second && teamMixed(first, second)) mixedTeams += 1; teams += 1; });
    const p = match.players.map(id => tournament.players.find(player => player.id === id));
    if (p.every(Boolean)) imbalance += Math.abs(levelValue[p[0]!.level] + levelValue[p[1]!.level] - levelValue[p[2]!.level] - levelValue[p[3]!.level]);
  });
  function playerBy(id: string) { return tournament.players.find(player => player.id === id); }
  const values = [...counts.values()]; const repetitions = [...partnerCounts.values()].map(value => Math.max(0, value - 1));
  return { min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0, consecutive, maxPartnerRepeats: repetitions.length ? Math.max(...repetitions) : 0, averagePartnerRepeats: repetitions.length ? repetitions.reduce((a, b) => a + b, 0) / repetitions.length : 0, levelImbalance: tournament.matches.length ? imbalance / tournament.matches.length : 0, violations: tournament.matches.reduce((sum, match) => sum + match.violations.length, 0), mixedPercent: teams ? Math.round((mixedTeams / teams) * 100) : 0 };
}
