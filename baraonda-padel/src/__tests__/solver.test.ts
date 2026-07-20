import { describe, expect, it } from 'vitest';
import { Match, Player, Tournament, defaultSettings } from '../models';
import { buildSlots, generateSchedule, isAvailable, scheduleRespectsPlayerLimit } from '../solver';

const player = (id: string, availability = [{ from: '09:00', to: '18:00' }]): Player => ({ id, firstName: id, lastName: '', level: 'Intermedio', gender: id.endsWith('d') ? 'Donna' : 'Uomo', notes: '', availability, avoidPartners: [], status: 'attivo' });
const tournament = (players: Player[], changes = {}): Tournament => ({ id: 't', name: 'Test', players, matches: [], settings: { ...defaultSettings, date: '2026-07-15', start: '09:00', end: '14:00', playMinutes: 12, warmupMinutes: 3, pauses: [], targetMatchesPerPlayer: 8, prioritizeMixed: true, ...changes } });
const generated = (value: Tournament, keepLocked = true) => {
  const result = generateSchedule(value, keepLocked);
  expect(result.status, result.reason).toBe('generated');
  return result.status === 'generated' ? result : { ...result, matches: [] as Match[] };
};
const countsFor = (players: Player[], matches: Match[]) => {
  const counts = new Map(players.map(item => [item.id, 0]));
  matches.forEach(match => match.players.forEach(id => { if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1); }));
  return counts;
};
const maxConsecutiveRun = (playerId: string, matches: Match[], slots: ReturnType<typeof buildSlots>) => {
  const indices = matches.filter(match => match.players.includes(playerId)).map(match => slots.findIndex(slot => slot.start === match.start)).sort((a, b) => a - b);
  let run = indices.length ? 1 : 0; let maximum = run;
  for (let index = 1; index < indices.length; index += 1) { run = slots[indices[index - 1]].end === slots[indices[index]].start ? run + 1 : 1; maximum = Math.max(maximum, run); }
  return maximum;
};

describe('generatore baraonda', () => {
  it('non schiera un giocatore disponibile solo fino alle 13:00 oltre tale orario', () => {
    const early = player('early', [{ from: '09:00', to: '13:00' }]);
    const result = generated(tournament([early, ...['a', 'b', 'c', 'd'].map(id => player(id))]));
    expect(result.matches.filter(match => match.players.includes('early')).every(match => match.start < '13:00')).toBe(true);
  });

  it('non schiera un giocatore che arriva dopo le 12:00 prima del suo arrivo', () => {
    const late = player('late', [{ from: '12:00', to: '14:00' }]);
    const result = generated(tournament([late, ...['a', 'b', 'c', 'd'].map(id => player(id))]));
    expect(result.matches.filter(match => match.players.includes('late')).every(match => match.start >= '12:00')).toBe(true);
  });

  it('non crea slot dentro la pausa pranzo', () => {
    const value = tournament(['a', 'b', 'c', 'd'].map(id => player(id)), { pauses: [{ from: '12:00', to: '13:00' }] });
    expect(buildSlots(value.settings).every(slot => slot.end <= '12:00' || slot.start >= '13:00')).toBe(true);
  });

  it("non mette due incompatibili nella stessa coppia quando esiste un'alternativa", () => {
    const a = player('a'); const b = player('b'); a.avoidPartners = ['b']; b.avoidPartners = ['a'];
    const matches = generated(tournament([a, b, player('c'), player('d')])).matches;
    expect(matches.every(match => !((match.players[0] === 'a' && match.players[1] === 'b') || (match.players[0] === 'b' && match.players[1] === 'a') || (match.players[2] === 'a' && match.players[3] === 'b') || (match.players[2] === 'b' && match.players[3] === 'a')))).toBe(true);
  });

  it('con 19 giocatori, 36 slot e massimo 8 assegna 4 partite a tutti', () => {
    const players = Array.from({ length: 19 }, (_, index) => player(`p${index}`));
    const result = generated(tournament(players, { end: '18:00' }));
    expect(result.commonMatchesPerPlayer).toBe(4);
    expect(result.matches).toHaveLength(19);
    expect([...countsFor(players, result.matches).values()]).toEqual(new Array(19).fill(4));
  });

  it('indica il giocatore attivo senza fasce e conserva il calendario', () => {
    const players = Array.from({ length: 18 }, (_, index) => player(`p${index}`));
    players[9] = { ...players[9], firstName: 'Daniele', lastName: 'Sacco', availability: [] };
    const existing: Match = { id: 'existing', start: '10:00', end: '10:15', players: ['p0', 'p1', 'p2', 'p3'], locked: false, violations: [] };
    const value = { ...tournament(players, { start: '10:00', end: '19:00', targetMatchesPerPlayer: 10 }), matches: [existing] };
    const result = generateSchedule(value);
    expect(result.status).toBe('impossible');
    expect(result.reason).toBe('Impossibile generare il calendario: Daniele Sacco non ha fasce di disponibilità. Aggiungine almeno una nella sezione Giocatori.');
    expect(result.matches).toEqual(value.matches);
  });

  it('con lo snapshot da 18 giocatori completo genera 36 partite e 8 presenze ciascuno', () => {
    const players = Array.from({ length: 18 }, (_, index) => player(`p${index}`, [{ from: '10:00', to: '19:00' }]));
    const result = generated(tournament(players, { start: '10:00', end: '19:00', targetMatchesPerPlayer: 10 }));
    expect(result.commonMatchesPerPlayer).toBe(8);
    expect(result.matches).toHaveLength(36);
    expect([...countsFor(players, result.matches).values()]).toEqual(new Array(18).fill(8));
  });

  it('distribuisce le presenze nell’intera disponibilità dello snapshot reale', () => {
    const players = Array.from({ length: 17 }, (_, index) => player(`p${index}`, [{ from: '10:00', to: '19:00' }]));
    players[0] = { ...players[0], firstName: 'Alessandro', lastName: 'Russo', availability: [{ from: '10:00', to: '17:00' }] };
    players[5] = { ...players[5], firstName: 'Andrea', lastName: 'Anolli', availability: [{ from: '10:00', to: '12:30' }] };
    players[12] = { ...players[12], firstName: 'Nikolas', lastName: 'Parisi', availability: [{ from: '10:00', to: '12:30' }] };
    const value = tournament(players, { start: '10:00', end: '19:00', targetMatchesPerPlayer: 10 });
    const result = generated(value); const slots = buildSlots(value.settings);
    expect(result.commonMatchesPerPlayer).toBe(8);
    expect(result.matches).toHaveLength(34);
    expect([...countsFor(players, result.matches).values()]).toEqual(new Array(17).fill(8));
    expect(result.matches.every(match => match.players.every(id => isAvailable(players.find(item => item.id === id)!, Number(match.start.slice(0, 2)) * 60 + Number(match.start.slice(3)), Number(match.end.slice(0, 2)) * 60 + Number(match.end.slice(3)))))).toBe(true);

    const alessandroSlots = result.matches.filter(match => match.players.includes(players[0].id)).map(match => slots.findIndex(slot => slot.start === match.start)).sort((a, b) => a - b);
    const availableAlessandroSlots = slots.map((slot, index) => isAvailable(players[0], Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3)), Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3))) ? index : -1).filter(index => index >= 0);
    expect(maxConsecutiveRun(players[0].id, result.matches, slots)).toBe(1);
    expect((alessandroSlots[alessandroSlots.length - 1] - alessandroSlots[0]) / (availableAlessandroSlots[availableAlessandroSlots.length - 1] - availableAlessandroSlots[0])).toBeGreaterThanOrEqual(0.75);
    expect(maxConsecutiveRun(players[5].id, result.matches, slots)).toBeLessThanOrEqual(3);
    expect(maxConsecutiveRun(players[12].id, result.matches, slots)).toBeLessThanOrEqual(3);

    const usedStarts = new Set(result.matches.map(match => match.start));
    const unusedIndices = slots.flatMap((slot, index) => usedStarts.has(slot.start) ? [] : [index]);
    expect(unusedIndices.some(index => index < slots.length - unusedIndices.length)).toBe(true);
  });

  it('elenca in ordine di rosa tutti i giocatori senza fasce', () => {
    const players = ['Ada', 'Bruno', 'Carla', 'Diego'].map(name => ({ ...player(name), firstName: name, availability: [] }));
    const result = generateSchedule(tournament(players));
    expect(result.status).toBe('impossible');
    expect(result.reason).toBe('Impossibile generare il calendario: Ada, Bruno, Carla, Diego non hanno fasce di disponibilità. Aggiungine almeno una per ciascuno nella sezione Giocatori.');
  });

  it('distingue una fascia che non comprende alcuno slot valido', () => {
    const outside = { ...player('outside', [{ from: '08:00', to: '09:00' }]), firstName: 'Fuori', lastName: 'Orario' };
    const result = generateSchedule(tournament([outside, ...['a', 'b', 'c', 'd'].map(id => player(id))]));
    expect(result.status).toBe('impossible');
    expect(result.reason).toBe('Impossibile generare il calendario: Fuori Orario non ha una fascia di disponibilità che comprenda uno slot valido del torneo. Correggi gli orari nella sezione Giocatori.');
  });

  it('raggiunge il massimo configurato quando la capacit\u00e0 \u00e8 sufficiente', () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`p${index}`));
    const result = generated(tournament(players));
    expect(result.commonMatchesPerPlayer).toBe(8);
    expect([...countsFor(players, result.matches).values()]).toEqual(new Array(8).fill(8));
  });

  it('conserva e conteggia le partite bloccate durante la rigenerazione', () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map(id => player(id));
    const firstPass = generated(tournament(players)).matches;
    const locked = { ...firstPass[0], locked: true };
    const result = generated({ ...tournament(players), matches: [locked] });
    expect(result.matches.find(match => match.start === locked.start)).toEqual(locked);
    expect(new Set(countsFor(players, result.matches).values()).size).toBe(1);
  });

  it('non sostituisce il calendario se una partita protetta ha gi\u00e0 superato il massimo', () => {
    const players = ['a', 'b', 'c', 'd', 'e'].map(id => player(id));
    const first: Match = { id: 'm1', start: '09:00', end: '09:15', players: ['a', 'b', 'c', 'd'], locked: true, violations: [] };
    const second: Match = { id: 'm2', start: '09:15', end: '09:30', players: ['a', 'b', 'c', 'e'], locked: true, violations: [] };
    const value = { ...tournament(players, { targetMatchesPerPlayer: 1 }), matches: [first, second] };
    const result = generateSchedule(value);
    expect(result.status).toBe('impossible');
    expect(result.matches).toEqual(value.matches);
  });

  it('la disponibilit\u00e0 \u00e8 un vincolo duro del solver', () => expect(isAvailable(player('a', [{ from: '09:00', to: '10:00' }]), 600, 615)).toBe(false));

  it('include attivi e ritardo, escludendo assenti, infortunati e ritirati', () => {
    const active = ['a', 'b', 'c', 'd'].map(id => player(id));
    const late = { ...player('late'), status: 'ritardo' as const };
    const excluded = (['assente', 'infortunato', 'ritirato'] as const).map((status, index) => ({ ...player(`x${index}`), status }));
    const result = generated(tournament([...active, late, ...excluded], { targetMatchesPerPlayer: 4 }));
    expect(result.excludedPlayerIds).toEqual(excluded.map(item => item.id));
    expect([...countsFor([...active, late], result.matches).values()]).toEqual(new Array(5).fill(4));
    expect(result.matches.every(match => match.players.every(id => !result.excludedPlayerIds.includes(id)))).toBe(true);
  });

  it('un giocatore con finestra stretta riceve lo stesso numero dentro la propria finestra', () => {
    const narrow = player('narrow', [{ from: '12:00', to: '14:00' }]);
    const players = [...Array.from({ length: 12 }, (_, index) => player(`p${index}`)), narrow];
    const result = generated(tournament(players));
    const narrowMatches = result.matches.filter(match => match.players.includes('narrow'));
    expect(narrowMatches).toHaveLength(result.commonMatchesPerPlayer ?? 0);
    expect(narrowMatches.every(match => match.start >= '12:00')).toBe(true);
  });

  it('se nessun numero comune positivo \u00e8 possibile restituisce un errore', () => {
    const result = generateSchedule(tournament(['a', 'b', 'c', 'd', 'e'].map(id => player(id)), { targetMatchesPerPlayer: 2 }));
    expect(result.status).toBe('impossible');
    expect(result.commonMatchesPerPlayer).toBeNull();
  });

  it('riconosce una modifica manuale che rompe tetto o uguaglianza', () => {
    const players = ['a', 'b', 'c', 'd'].map(id => player(id));
    const result = generated(tournament(players, { targetMatchesPerPlayer: 2 }));
    const valid = { ...tournament(players, { targetMatchesPerPlayer: 2 }), matches: result.matches };
    expect(scheduleRespectsPlayerLimit(valid)).toBe(true);
    const changed = { ...valid, matches: valid.matches.map((match, index) => index === 0 ? { ...match, players: ['a', 'a', match.players[2], match.players[3]] as Match['players'] } : match) };
    expect(scheduleRespectsPlayerLimit(changed)).toBe(false);
  });

  it('il calendario generato \u00e8 deterministico', () => {
    const build = () => generated(tournament(Array.from({ length: 19 }, (_, index) => player(`p${index}`)), { end: '18:00' })).matches.map(match => ({ start: match.start, players: match.players }));
    expect(build()).toEqual(build());
  });

  it('genera in meno di un secondo con 30 giocatori e circa 40 slot', () => {
    const players = Array.from({ length: 30 }, (_, index) => ({ ...player(`p${index}`, index % 7 === 0 ? [{ from: '12:00', to: '16:00' }] : [{ from: '09:00', to: '19:00' }]), level: (['Principiante', 'Intermedio', 'Avanzato'] as const)[index % 3] }));
    players[0].avoidPartners = ['p1']; players[1].avoidPartners = ['p0'];
    const started = performance.now();
    const result = generated(tournament(players, { end: '19:00' }));
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.matches.length).toBeGreaterThan(0);
  });
});
