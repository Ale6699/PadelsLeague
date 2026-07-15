import { Match, Player, Tournament, fullName, toMin } from '../models';
import { calculateMatchBalance } from './matchBalance';
import { isMatchCompleted } from './matchResults';

export type ShareScheduleOptions = { includeLevels?: boolean; includeBalanceRating?: boolean; includeResults?: boolean; includeNotes?: boolean; includePauses?: boolean; compact?: boolean; lastUpdated?: number };
export const defaultShareScheduleOptions: Required<Omit<ShareScheduleOptions, 'lastUpdated'>> = { includeLevels: false, includeBalanceRating: false, includeResults: false, includeNotes: true, includePauses: true, compact: false };
export const TELEGRAM_SHARE_TEXT_WARNING_LENGTH = 3500;
export const MAILTO_WARNING_LENGTH = 6000;

const displayDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const displayUpdatedAt = (timestamp?: number) => new Date(timestamp ?? Date.now()).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });

function playerName(id: string | undefined, playerById: Map<string, Player>, includeLevels: boolean) {
  const player = id ? playerById.get(id) : undefined;
  if (!player) return 'Giocatore mancante';
  return includeLevels ? `${fullName(player)} (${player.level})` : fullName(player);
}

function formatMatch(match: Match, tournament: Tournament, playerById: Map<string, Player>, options: Required<Omit<ShareScheduleOptions, 'lastUpdated'>>) {
  const present = match.players.filter(id => Boolean(id) && playerById.has(id)); const missing = 4 - present.length;
  if (missing > 0) return options.compact ? `${match.start} — Partita incompleta: manca${missing === 1 ? '' : 'no'} ${missing} giocator${missing === 1 ? 'e' : 'i'}` : `${match.start}–${match.end}\nPartita incompleta: manca${missing === 1 ? '' : 'no'} ${missing} giocator${missing === 1 ? 'e' : 'i'}`;
  const [a1, a2, b1, b2] = match.players.map(id => playerName(id, playerById, options.includeLevels));
  const teams = `${a1} + ${a2} contro ${b1} + ${b2}`;
  const compact = `${match.start} — ${a1}/${a2} vs ${b1}/${b2}`;
  const details: string[] = [];
  if (options.includeResults) details.push(isMatchCompleted(match) ? `Risultato: ${match.result?.aGames ?? '–'}–${match.result?.bGames ?? '–'}` : 'Risultato: da giocare');
  if (options.includeBalanceRating) details.push(`Equilibrio: ${calculateMatchBalance(match, tournament.players).score}/100`);
  return options.compact ? [compact, ...details].join(' · ') : [`${match.start}–${match.end}`, teams.replace(' contro ', '\ncontro\n'), ...details].join('\n');
}

export function formatTournamentScheduleForSharing(tournament: Tournament, players: Player[], options: ShareScheduleOptions = {}) {
  const settings = { ...defaultShareScheduleOptions, ...options }; const playerById = new Map(players.map(player => [player.id, player]));
  if (!tournament.matches.length) return 'Non è ancora disponibile un calendario da condividere. Genera prima il calendario del torneo.';
  const events: { at: number; text: string }[] = tournament.matches.filter(match => match.players.some(Boolean)).map(match => ({ at: toMin(match.start), text: formatMatch(match, tournament, playerById, settings) }));
  if (settings.includePauses) tournament.settings.pauses.forEach(pause => events.push({ at: toMin(pause.from), text: settings.compact ? `🍝 Pausa ${pause.from}–${pause.to}` : `${pause.from}–${pause.to}\n🍝 Pausa` }));
  events.sort((a, b) => a.at - b.at);
  const header = [`🎾 ${tournament.settings.title || tournament.name}`, '', `📅 Data: ${displayDate(tournament.settings.date)}`, `🕘 Orario: ${tournament.settings.start}–${tournament.settings.end}`, `⏱ Partite: ${tournament.settings.playMinutes} minuti + ${tournament.settings.warmupMinutes} minuti di cambio`, `🎮 Totale partite: ${tournament.matches.length}`, '', 'CALENDARIO COMPLETO', ''];
  return [...header, events.map(event => event.text).join('\n\n'), '', `Ultimo aggiornamento: ${displayUpdatedAt(options.lastUpdated)}`].join('\n');
}

export function buildTelegramShareUrl(message: string, publicUrl?: string) {
  const query = publicUrl ? `url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(message)}` : `text=${encodeURIComponent(message)}`;
  return `https://t.me/share/url?${query}`;
}

export function validRecipients(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean).every(item => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)); }
export function buildMailtoUrl(tournament: Tournament, message: string, recipients = '') { return `mailto:${encodeURIComponent(recipients)}?subject=${encodeURIComponent(`Calendario ${tournament.name}`)}&body=${encodeURIComponent(message)}`; }
export async function copyScheduleToClipboard(message: string) { if (!navigator.clipboard?.writeText) throw new Error('Clipboard non disponibile'); await navigator.clipboard.writeText(message); }
export async function shareWithWebShareApi(tournament: Tournament, message: string, publicUrl?: string) { if (!navigator.share) return false; await navigator.share({ title: tournament.name, text: message, url: publicUrl }); return true; }
