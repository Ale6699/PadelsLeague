import { Tournament } from '../../models';
import { TournamentFormValues, normalizeSlug } from './tournamentValidation';

export type TournamentChangeSet = { hasChanges: boolean; affectsSchedule: boolean; changedFields: string[] };

export const TOURNAMENT_FIELD_LABELS: Record<string, string> = {
  name: 'Nome torneo', publicTitle: 'Titolo pubblico', date: 'Data', start: 'Ora di inizio', end: 'Ora di fine',
  playMinutes: 'Durata partita', warmupMinutes: 'Cambio/riscaldamento', targetMatchesPerPlayer: 'Partite per giocatore',
  maxGamesPerMatch: 'Massimo game', prioritizeMixed: 'Preferenza coppie miste', gameScoringMode: 'Regole di punteggio',
  notes: 'Note pubbliche', status: 'Stato', isPublic: 'Visibilità pubblica', publicSlug: 'Link pubblico',
  timerSoundEnabled: 'Suono timer', pauses: 'Pause',
};

const scheduleFields = new Set(['date', 'start', 'end', 'playMinutes', 'warmupMinutes', 'targetMatchesPerPlayer', 'maxGamesPerMatch', 'prioritizeMixed', 'gameScoringMode', 'pauses']);

export function tournamentToFormValues(tournament: Tournament): TournamentFormValues {
  return {
    name: tournament.name, publicTitle: tournament.settings.title, date: tournament.settings.date,
    start: tournament.settings.start, end: tournament.settings.end, playMinutes: tournament.settings.playMinutes,
    warmupMinutes: tournament.settings.warmupMinutes, targetMatchesPerPlayer: tournament.settings.targetMatchesPerPlayer,
    maxGamesPerMatch: tournament.settings.maxGamesPerMatch ?? 6, prioritizeMixed: tournament.settings.prioritizeMixed,
    gameScoringMode: 'advantages', notes: tournament.notes ?? '', status: tournament.status ?? 'draft',
    isPublic: tournament.isPublic ?? false, publicSlug: tournament.publicSlug ?? '',
    timerSoundEnabled: tournament.timerSoundEnabled ?? true, pauses: tournament.settings.pauses.map(pause => ({ ...pause })),
  };
}

export function applyTournamentFormValues(tournament: Tournament, values: TournamentFormValues): Tournament {
  return {
    ...tournament, name: values.name.trim(), notes: values.notes.trim(), status: values.status,
    isPublic: values.isPublic, publicSlug: normalizeSlug(values.publicSlug), timerSoundEnabled: values.timerSoundEnabled,
    settings: { ...tournament.settings, title: values.publicTitle.trim(), date: values.date, start: values.start, end: values.end,
      playMinutes: values.playMinutes, warmupMinutes: values.warmupMinutes, targetMatchesPerPlayer: values.targetMatchesPerPlayer,
      maxGamesPerMatch: values.maxGamesPerMatch, prioritizeMixed: values.prioritizeMixed,
      gameScoringMode: values.gameScoringMode, pauses: values.pauses.map(pause => ({ ...pause })) },
  };
}

export function getTournamentChanges(original: Tournament, edited: TournamentFormValues): TournamentChangeSet {
  const initial = tournamentToFormValues(original);
  const changedFields = (Object.keys(initial) as (keyof TournamentFormValues)[]).filter(key => JSON.stringify(initial[key]) !== JSON.stringify(edited[key]));
  return { hasChanges: changedFields.length > 0, affectsSchedule: changedFields.some(field => scheduleFields.has(field)), changedFields };
}

export function formatChangeValue(field: string, value: unknown) {
  if (field === 'playMinutes' || field === 'warmupMinutes') return `${value} minuti`;
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  if (field === 'pauses') return `${(value as unknown[]).length} pause`;
  return String(value ?? '');
}

export const normalizeTournamentConfirmation = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
