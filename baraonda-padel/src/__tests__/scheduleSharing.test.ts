import { describe, expect, it } from 'vitest';
import { Match, Player, Tournament, defaultSettings } from '../models';
import { buildMailtoUrl, buildTelegramShareUrl, formatTournamentScheduleForSharing } from '../services/scheduleSharing';

const player = (id: string, name: string): Player => ({ id, firstName: name, lastName: 'Test', level: 'Intermedio', gender: 'Uomo', notes: 'Nota privata da non condividere', availability: [{ from: '09:00', to: '18:00' }], avoidPartners: ['other'], status: 'attivo' });
const match = (id: string, start: string, players: [string, string, string, string], result?: Match['result']): Match => ({ id, start, end: '10:15', players, locked: false, violations: [], result });
const players = [player('a', 'Anna'), player('b', 'Bruno'), player('c', 'Carla'), player('d', 'Diego')];
const tournament = (matches: Match[], pauses: Tournament['settings']['pauses'] = []): Tournament => ({ id: 't', name: 'Torneo test', settings: { ...defaultSettings, title: 'Torneo test', date: '2026-09-20', start: '10:00', end: '19:00', pauses }, players, matches });

describe('formatTournamentScheduleForSharing', () => {
  it('ordina le partite e risolve i nomi delle coppie', () => {
    const text = formatTournamentScheduleForSharing(tournament([match('late', '11:00', ['a', 'b', 'c', 'd']), match('early', '10:00', ['c', 'd', 'a', 'b'])]), players, { lastUpdated: 0 });
    expect(text.indexOf('10:00–10:15')).toBeLessThan(text.indexOf('11:00–10:15')); expect(text).toContain('Carla Test + Diego Test'); expect(text).toContain('contro');
  });
  it('inserisce le pause nella posizione cronologica corretta', () => {
    const text = formatTournamentScheduleForSharing(tournament([match('a', '10:00', ['a', 'b', 'c', 'd']), match('b', '14:00', ['a', 'b', 'c', 'd'])], [{ from: '12:00', to: '13:00' }]), players);
    expect(text.indexOf('10:00–10:15')).toBeLessThan(text.indexOf('🍝 Pausa')); expect(text.indexOf('🍝 Pausa')).toBeLessThan(text.indexOf('14:00–10:15'));
  });
  it('genera una riga per partita nel formato compatto', () => {
    const text = formatTournamentScheduleForSharing(tournament([match('a', '10:00', ['a', 'b', 'c', 'd'])]), players, { compact: true });
    expect(text).toContain('10:00 — Anna Test/Bruno Test vs Carla Test/Diego Test');
  });
  it('include risultati e rating solo se richiesti', () => {
    const t = tournament([match('a', '10:00', ['a', 'b', 'c', 'd'], { aGames: 6, bGames: 4, outcome: 'A' })]);
    expect(formatTournamentScheduleForSharing(t, players)).not.toContain('Risultato:');
    const text = formatTournamentScheduleForSharing(t, players, { includeResults: true, includeBalanceRating: true });
    expect(text).toContain('Risultato: 6–4'); expect(text).toContain('Equilibrio:');
  });
  it('segnala una partita incompleta senza fallire', () => {
    const text = formatTournamentScheduleForSharing(tournament([match('a', '10:00', ['a', '', 'c', 'd'])]), players);
    expect(text).toContain('Partita incompleta: manca 1 giocatore');
  });
  it('non condivide dati privati dei giocatori', () => {
    const text = formatTournamentScheduleForSharing(tournament([match('a', '10:00', ['a', 'b', 'c', 'd'])]), players);
    expect(text).not.toContain('Nota privata'); expect(text).not.toContain('other'); expect(text).not.toContain('attivo');
  });
  it('restituisce un messaggio per il calendario vuoto', () => expect(formatTournamentScheduleForSharing(tournament([]), players)).toContain('Non è ancora disponibile'));
});

describe('URL di condivisione', () => {
  it('codifica il testo Telegram', () => expect(buildTelegramShareUrl('Ciao & calendario')).toBe('https://t.me/share/url?text=Ciao%20%26%20calendario'));
  it('codifica oggetto, corpo e destinatari email', () => {
    const url = buildMailtoUrl(tournament([]), 'Ciao & calendario', 'anna@example.com,bruno@example.com');
    expect(url).toContain('anna%40example.com%2Cbruno%40example.com'); expect(url).toContain('Ciao%20%26%20calendario');
  });
});
