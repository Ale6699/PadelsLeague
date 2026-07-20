import { toMin } from '../../models';

export const TOURNAMENT_NOTES_MAX_LENGTH = 2000;

export type TournamentFormValues = {
  name: string;
  publicTitle: string;
  date: string;
  start: string;
  end: string;
  playMinutes: number;
  warmupMinutes: number;
  targetMatchesPerPlayer: number;
  maxGamesPerMatch: number;
  prioritizeMixed: boolean;
  gameScoringMode: 'advantages';
  notes: string;
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  isPublic: boolean;
  publicSlug: string;
  timerSoundEnabled: boolean;
  pauses: { from: string; to: string }[];
};

export type TournamentFormErrors = Partial<Record<keyof TournamentFormValues, string>>;

export const normalizeSlug = (value: string) => value.trim().toLowerCase();
export const isValidSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export function validateTournament(values: TournamentFormValues): TournamentFormErrors {
  const errors: TournamentFormErrors = {};
  if (!values.name.trim()) errors.name = 'Il nome del torneo è obbligatorio.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || Number.isNaN(Date.parse(`${values.date}T00:00:00`))) errors.date = 'Inserisci una data valida.';
  if (!values.start || !values.end || toMin(values.end) <= toMin(values.start)) errors.end = 'L’ora di fine deve essere successiva all’ora di inizio.';
  if (!Number.isFinite(values.playMinutes) || values.playMinutes <= 0) errors.playMinutes = 'La durata della partita deve essere maggiore di zero.';
  if (!Number.isFinite(values.warmupMinutes) || values.warmupMinutes < 0) errors.warmupMinutes = 'La durata del cambio non può essere negativa.';
  if (!Number.isInteger(values.targetMatchesPerPlayer) || values.targetMatchesPerPlayer <= 0) errors.targetMatchesPerPlayer = 'Il massimo di partite deve essere un numero intero maggiore di zero.';
  if (!Number.isFinite(values.maxGamesPerMatch) || values.maxGamesPerMatch <= 0) errors.maxGamesPerMatch = 'Il massimo di game deve essere maggiore di zero.';
  if (values.publicSlug && !isValidSlug(normalizeSlug(values.publicSlug))) errors.publicSlug = 'Usa solo lettere minuscole, numeri e trattini.';
  if (values.notes.length > TOURNAMENT_NOTES_MAX_LENGTH) errors.notes = `Le note non possono superare ${TOURNAMENT_NOTES_MAX_LENGTH} caratteri.`;
  if (values.pauses.some(pause => !pause.from || !pause.to || toMin(pause.to) <= toMin(pause.from))) errors.pauses = 'Ogni pausa deve avere una fine successiva all’inizio.';
  return errors;
}
