export type Level = 'Principiante' | 'Intermedio' | 'Avanzato';
export type Gender = 'Uomo' | 'Donna' | 'Altro';
export type PlayerStatus = 'attivo' | 'ritardo' | 'assente' | 'infortunato' | 'ritirato';

export type Availability = { from: string; to: string };
export type Pause = { from: string; to: string };
export type Player = {
  id: string; firstName: string; lastName: string; level: Level; gender: Gender;
  notes: string; availability: Availability[]; avoidPartners: string[]; status: PlayerStatus;
};
/** outcome remains optional only to read tournaments saved by older app versions. */
export type MatchResult = { aGames: number | null; bGames: number | null; outcome?: 'A' | 'B' | 'D' | '' };
export type Match = {
  id: string; start: string; end: string; players: [string, string, string, string];
  locked: boolean; violations: string[]; result?: MatchResult;
};
export type Settings = {
  title: string; date: string; start: string; end: string; playMinutes: number; warmupMinutes: number;
  pauses: Pause[]; targetMatchesPerPlayer: number; prioritizeMixed: boolean;
};
export type Tournament = {
  id: string; name: string; settings: Settings; players: Player[]; matches: Match[];
  previousMatches?: Match[];
};
export type Standing = { id: string; name: string; points: number; played: number; wins: number; draws: number; losses: number; gf: number; ga: number; coinToss?: boolean };
export type Quality = { min: number; max: number; consecutive: number; maxPartnerRepeats: number; averagePartnerRepeats: number; levelImbalance: number; violations: number; mixedPercent: number };

export const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
export const levelValue: Record<Level, number> = { Principiante: 1, Intermedio: 2, Avanzato: 3 };
export const toMin = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const pairKey = (a: string, b: string) => [a, b].sort().join('|');
export const fullName = (player: Player) => `${player.firstName} ${player.lastName}`.trim();

export const defaultSettings: Settings = {
  title: 'Baraonda Padel Sistemi Tre', date: new Date().toISOString().slice(0, 10), start: '10:00', end: '19:00',
  playMinutes: 12, warmupMinutes: 3, pauses: [], targetMatchesPerPlayer: 8, prioritizeMixed: true,
};

export const makeTournament = (name = 'Nuovo torneo'): Tournament => ({
  id: uid(), name, settings: { ...defaultSettings, pauses: [] }, players: [], matches: [],
});
