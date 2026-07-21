import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isAppError } from '../data/tournaments.repository';
import { Bet, BetMarket, BettingConfig, LeaderboardEntry, Wallet, bettingProvider } from '../data/betting';

export type BettingState = {
  config: BettingConfig; wallet: Wallet | null; markets: BetMarket[]; myBets: Bet[]; wallets: Wallet[];
  leaderboard: LeaderboardEntry[]; loading: boolean; error: string | null;
};

// Carica lo stato scommesse di un torneo e lo aggiorna in realtime. `asOrganizer` include l'elenco
// completo dei wallet (visibile solo all'owner via RLS) per il pannello di gestione.
export function useBetting(tournamentId: string | undefined, asOrganizer = false) {
  const [state, setState] = useState<BettingState>({ config: { enabled: false, initialBalance: 1000, overUnderEnabled: true }, wallet: null, markets: [], myBets: [], wallets: [], leaderboard: [], loading: Boolean(tournamentId), error: null });

  const reload = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const [config, wallet, markets, myBets, leaderboard, wallets] = await Promise.all([
        bettingProvider.getConfig(tournamentId), bettingProvider.getWallet(tournamentId), bettingProvider.listMarkets(tournamentId),
        bettingProvider.listMyBets(tournamentId), bettingProvider.listLeaderboard(tournamentId),
        asOrganizer ? bettingProvider.listWallets(tournamentId) : Promise.resolve([]),
      ]);
      setState({ config, wallet, markets, myBets, leaderboard, wallets, loading: false, error: null });
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: isAppError(error) ? error.message : 'Non è stato possibile caricare le scommesse.' }));
    }
  }, [tournamentId, asOrganizer]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!supabase || !tournamentId) return undefined;
    const channel = supabase.channel(`betting:${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bet_markets', filter: `tournament_id=eq.${tournamentId}` }, () => { void reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'betting_wallets', filter: `tournament_id=eq.${tournamentId}` }, () => { void reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bet_selections' }, () => { void reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => { void reload(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [reload, tournamentId]);

  return { ...state, reload };
}
