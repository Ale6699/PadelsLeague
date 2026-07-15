import { useCallback, useEffect, useState } from 'react';

export const refreshOptions = [0, 5_000, 10_000, 15_000, 30_000, 60_000] as const;
const refreshSettingKey = 'baraonda-padel-public-refresh-ms';

type Options = { storageKey: string; reloadTournament: () => boolean };

/** Timer and local-storage subscription for the public display. */
export function useTournamentAutoRefresh({ storageKey, reloadTournament }: Options) {
  const [refreshMs, setRefreshMs] = useState<number>(() => {
    const stored = Number(localStorage.getItem(refreshSettingKey));
    return refreshOptions.includes(stored as typeof refreshOptions[number]) ? stored : 10_000;
  });
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const refresh = useCallback(() => {
    if (reloadTournament()) setLastRefresh(new Date());
  }, [reloadTournament]);
  const refreshNow = useCallback(() => {
    reloadTournament();
    setLastRefresh(new Date());
  }, [reloadTournament]);

  useEffect(() => { localStorage.setItem(refreshSettingKey, String(refreshMs)); }, [refreshMs]);
  useEffect(() => {
    // Disabled means no polling and no cross-tab updates; the operator can use the manual button.
    if (!refreshMs) return undefined;
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh, refreshMs, storageKey]);
  useEffect(() => {
    if (!refreshMs) return undefined;
    const timer = window.setInterval(refresh, refreshMs);
    return () => window.clearInterval(timer);
  }, [refresh, refreshMs]);

  return { refreshMs, setRefreshMs, lastRefresh, refreshNow };
}
