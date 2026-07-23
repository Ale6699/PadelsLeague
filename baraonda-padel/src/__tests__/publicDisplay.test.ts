import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PublicDisplay, selectPublicLiveMatches } from '../components/PublicDisplay';
import { defaultSettings, type Match, type MatchStatus, type Player, type Tournament } from '../models';

const makeMatch = (id: string, status: MatchStatus = 'scheduled'): Match => ({
  id,
  start: '10:00',
  end: '10:12',
  players: ['p1', 'p2', 'p3', 'p4'],
  locked: false,
  violations: [],
  status,
});

const players: Player[] = [
  { id: 'p1', firstName: 'Anna', lastName: 'Uno', level: 'Intermedio', gender: 'Donna', notes: '', availability: [], avoidPartners: [], status: 'attivo' },
  { id: 'p2', firstName: 'Bruno', lastName: 'Due', level: 'Intermedio', gender: 'Uomo', notes: '', availability: [], avoidPartners: [], status: 'attivo' },
  { id: 'p3', firstName: 'Carla', lastName: 'Tre', level: 'Intermedio', gender: 'Donna', notes: '', availability: [], avoidPartners: [], status: 'attivo' },
  { id: 'p4', firstName: 'Diego', lastName: 'Quattro', level: 'Intermedio', gender: 'Uomo', notes: '', availability: [], avoidPartners: [], status: 'attivo' },
];

beforeAll(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('partite successive nel pannello pubblico', () => {
  it('mostra al massimo le prime tre partite successive', () => {
    const matches = [makeMatch('live', 'in_progress'), ...Array.from({ length: 4 }, (_, index) => makeMatch(`next-${index + 1}`))];
    const selection = selectPublicLiveMatches(matches);

    expect(selection.featured?.id).toBe('live');
    expect(selection.upcoming.map(match => match.id)).toEqual(['next-1', 'next-2', 'next-3']);
  });

  it.each([3, 2, 1, 0])('mostra tutte le %i partite rimanenti quando sono al massimo tre', remaining => {
    const matches = [makeMatch('live', 'in_progress'), ...Array.from({ length: remaining }, (_, index) => makeMatch(`next-${index + 1}`))];
    const selection = selectPublicLiveMatches(matches);

    expect(selection.upcoming).toHaveLength(remaining);
  });

  it('usa la prima partita da giocare come principale quando non c’è una partita live', () => {
    const matches = [makeMatch('next-1'), makeMatch('next-2'), makeMatch('next-3'), makeMatch('next-4')];
    const selection = selectPublicLiveMatches(matches);

    expect(selection.featured?.id).toBe('next-1');
    expect(selection.upcoming.map(match => match.id)).toEqual(['next-2', 'next-3', 'next-4']);
  });

  it('esclude dall’elenco le partite concluse e annullate', () => {
    const completedWithScore = { ...makeMatch('completed-with-score'), result: { aGames: 6, bGames: 2 } };
    const matches = [
      completedWithScore,
      makeMatch('live', 'in_progress'),
      makeMatch('completed-by-status', 'completed'),
      makeMatch('cancelled', 'cancelled'),
      makeMatch('next'),
    ];
    const selection = selectPublicLiveMatches(matches);

    expect(selection.upcoming.map(match => match.id)).toEqual(['next']);
  });

  it('renderizza le partite successive soltanto nella vista Live', () => {
    const tournament: Tournament = { id: 'tournament', name: 'Torneo', settings: defaultSettings, players, matches: [makeMatch('live', 'in_progress'), makeMatch('next')] };
    const renderView = (view: 'live' | 'schedule' | 'standings') => renderToStaticMarkup(createElement(PublicDisplay, {
      tournament,
      standings: [],
      reloadTournament: () => true,
      storageKey: 'test',
      view,
      onViewChange: () => undefined,
    }));

    expect(renderView('live')).toContain('Prossime partite');
    expect(renderView('schedule')).not.toContain('Prossime partite');
    expect(renderView('standings')).not.toContain('Prossime partite');
  });
});
