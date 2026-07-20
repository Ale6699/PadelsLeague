import type { Tournament } from './models';

export type PublicView = 'live' | 'schedule' | 'standings';

export function publicViewFromPath(pathname: string): PublicView {
  if (pathname.endsWith('/schedule')) return 'schedule';
  if (pathname.endsWith('/standings')) return 'standings';
  return 'live';
}

export function publicViewPath(slug: string, view: PublicView) {
  const base = `/public/${encodeURIComponent(slug)}`;
  return view === 'live' ? base : `${base}/${view}`;
}

export function publicScheduleUrl(slug: string, origin: string) {
  return `${origin.replace(/\/$/, '')}${publicViewPath(slug, 'schedule')}`;
}

export function findPublicTournamentBySlug(tournaments: Tournament[], slug: string) {
  return tournaments.find(tournament => tournament.isPublic === true && tournament.publicSlug === slug);
}
