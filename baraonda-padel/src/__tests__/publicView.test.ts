import { describe, expect, it } from 'vitest';
import { makeTournament } from '../models';
import { findPublicTournamentBySlug, publicScheduleUrl, publicViewFromPath, publicViewPath } from '../publicView';

describe('public tournament mobile views', () => {
  it('maps public routes to the requested view', () => {
    expect(publicViewFromPath('/public/estate-2026')).toBe('live');
    expect(publicViewFromPath('/public/estate-2026/schedule')).toBe('schedule');
    expect(publicViewFromPath('/public/estate-2026/standings')).toBe('standings');
  });

  it('builds shareable routes and encodes the slug', () => {
    expect(publicViewPath('estate 2026', 'live')).toBe('/public/estate%202026');
    expect(publicViewPath('estate 2026', 'schedule')).toBe('/public/estate%202026/schedule');
    expect(publicViewPath('estate 2026', 'standings')).toBe('/public/estate%202026/standings');
  });

  it('builds the absolute public schedule URL from the configured origin', () => {
    expect(publicScheduleUrl('estate 2026', 'http://localhost:5173/')).toBe('http://localhost:5173/public/estate%202026/schedule');
  });

  it('returns only a published tournament with the exact requested slug', () => {
    const privateTournament = { ...makeTournament('Privato'), publicSlug: 'privato', isPublic: false };
    const publicTournament = { ...makeTournament('Estate'), publicSlug: 'estate-2026', isPublic: true };
    expect(findPublicTournamentBySlug([privateTournament, publicTournament], 'estate-2026')).toBe(publicTournament);
    expect(findPublicTournamentBySlug([privateTournament, publicTournament], 'privato')).toBeUndefined();
    expect(findPublicTournamentBySlug([privateTournament, publicTournament], 'inesistente')).toBeUndefined();
  });
});
