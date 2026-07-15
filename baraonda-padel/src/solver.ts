import { Match, Player, Quality, Settings, Tournament, levelValue, pairKey, toMin, toTime, uid } from './models';
import { calculateMatchBalance } from './services/matchBalance';

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

/** Heuristic solver with a cost function, deliberately isolated so it can be swapped for CP-SAT. */
export function generateSchedule(tournament: Tournament, keepLocked = true): Match[] {
  const slots = buildSlots(tournament.settings);
  const locked = keepLocked ? tournament.matches.filter(match => match.locked || match.result?.outcome) : [];
  const lockedByTime = new Map(locked.map(match => [match.start, match]));
  const players = tournament.players;
  const count = new Map(players.map(player => [player.id, 0]));
  const partners = new Map<string, number>();
  const lastSlot = new Map<string, number>();

  locked.forEach(match => {
    const index = slots.findIndex(slot => slot.start === match.start);
    match.players.forEach(id => { count.set(id, (count.get(id) ?? 0) + 1); lastSlot.set(id, index); });
    [[match.players[0], match.players[1]], [match.players[2], match.players[3]]].forEach(([a, b]) => partners.set(pairKey(a, b), (partners.get(pairKey(a, b)) ?? 0) + 1));
  });

  const planned: Match[] = [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slot = slots[slotIndex]; const existing = lockedByTime.get(slot.start);
    if (existing) { planned.push(existing); continue; }
    const available = players.filter(player => isAvailable(player, toMin(slot.start), toMin(slot.end)));
    let best: { ids: [string, string, string, string]; score: number; violations: string[] } | undefined;
    for (let a = 0; a < available.length - 3; a += 1) for (let b = a + 1; b < available.length - 2; b += 1) for (let c = b + 1; c < available.length - 1; c += 1) for (let d = c + 1; d < available.length; d += 1) {
      const group = [available[a], available[b], available[c], available[d]];
      // Attendance fairness needs to outweigh soft pairing preferences, especially with 19 players / 36 slots.
      const base = group.reduce((score, player) => score + (count.get(player.id) ?? 0) * 1000 + (lastSlot.get(player.id) === slotIndex - 1 ? 160 : 0), 0);
      const groupSpread = Math.max(...group.map(player => count.get(player.id) ?? 0)) - Math.min(...group.map(player => count.get(player.id) ?? 0));
      for (const [i, j, k, l] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
        const [one, two, three, four] = [group[i], group[j], group[k], group[l]];
        const badA = one.avoidPartners.includes(two.id) || two.avoidPartners.includes(one.id);
        const badB = three.avoidPartners.includes(four.id) || four.avoidPartners.includes(three.id);
        const womenA = [one, two].filter(player => player.gender === 'Donna').length;
        const womenB = [three, four].filter(player => player.gender === 'Donna').length;
        const violations: string[] = [];
        if (badA) violations.push(`${one.firstName} e ${two.firstName}: incompatibilità tra compagni`);
        if (badB) violations.push(`${three.firstName} e ${four.firstName}: incompatibilità tra compagni`);
        const balance = calculateMatchBalance({ id: 'candidate', start: slot.start, end: slot.end, players: [one.id, two.id, three.id, four.id], locked: false, violations: [] }, players);
        violations.push(...balance.warnings);
        if ((womenA === 2 && womenB === 0) || (womenB === 2 && womenA === 0)) violations.push('Due donne contro due uomini');
        const repeated = (partners.get(pairKey(one.id, two.id)) ?? 0) + (partners.get(pairKey(three.id, four.id)) ?? 0);
        const balancePenalty = (100 - balance.score) * 7 + (balance.score < 60 ? 500 : 0) + (balance.score < 40 ? 1500 : 0);
        let score = base + groupSpread * 70 + repeated * 230 + balancePenalty + (badA || badB ? 100000 : 0);
        if (tournament.settings.prioritizeMixed) score += (!teamMixed(one, two) ? 25 : 0) + (!teamMixed(three, four) ? 25 : 0);
        if ((womenA === 2 && womenB === 0) || (womenB === 2 && womenA === 0)) score += 450;
        if (!best || score < best.score) best = { ids: [one.id, two.id, three.id, four.id], score, violations };
      }
    }
    if (best) {
      best.ids.forEach(id => { count.set(id, (count.get(id) ?? 0) + 1); lastSlot.set(id, slotIndex); });
      partners.set(pairKey(best.ids[0], best.ids[1]), (partners.get(pairKey(best.ids[0], best.ids[1])) ?? 0) + 1);
      partners.set(pairKey(best.ids[2], best.ids[3]), (partners.get(pairKey(best.ids[2], best.ids[3])) ?? 0) + 1);
      planned.push({ id: uid(), ...slot, players: best.ids, locked: false, violations: best.violations });
    }
  }
  const counts = [...count.values()];
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
