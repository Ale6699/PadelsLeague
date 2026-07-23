import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, ListChecks, Ticket, Trophy, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { tournamentStore } from '../storage';
import { findPublicTournamentBySlug, publicViewPath } from '../publicView';
import { isLocalDemo } from '../data/provider';
import { isAppError } from '../data/tournaments.repository';
import { BetMarket, BetSelection, bettingProvider } from '../data/betting';
import { useAuth } from '../auth/useAuth';
import { useBetting } from '../hooks/useBetting';

type MatchInfo = { id: string; index: number; start: string; teamA: string; teamB: string; status: string; teamAGames: number | null; teamBGames: number | null };
type Pending = { market: BetMarket; selection: BetSelection };
type Tab = 'markets' | 'leaderboard' | 'mybets';

const KIND_LABEL: Record<BetMarket['kind'], string> = {
  match_outcome: 'Esito partita', over_under_games: 'Over / Under', tournament_winner: 'Vincitore torneo', head_to_head: 'Testa a testa',
};

function SelectionRow({ market, canBet, activeId, onSelect }: { market: BetMarket; canBet: boolean; activeId?: string; onSelect: (selection: BetSelection) => void }) {
  const open = market.status === 'open';
  return <div className="bet-market-block">
    <div className="bet-market-title"><span>{KIND_LABEL[market.kind]}{market.kind === 'over_under_games' && market.line ? ` (${market.line})` : ''}</span>{market.status !== 'open' && <span className={`bet-status ${market.status}`}>{market.status === 'settled' ? 'Liquidato' : market.status === 'void' ? 'Annullato' : 'Chiuso'}</span>}</div>
    <div className="bet-odds-grid">
      {market.selections.map(selection => <button key={selection.id} type="button" className={`odds-cell ${activeId === selection.id ? 'selected' : ''} ${selection.isWinner === true ? 'winner' : selection.isWinner === false ? 'loser' : ''}`} disabled={!open || !canBet} aria-pressed={activeId === selection.id} onClick={() => onSelect(selection)}>
        <span className="odds-cell-label">{selection.label}</span>
        <span className="odds-cell-odds">{selection.odds.toFixed(2)}</span>
      </button>)}
    </div>
  </div>;
}

export function BettingPage({ slug }: { slug: string }) {
  const { isAuthenticated } = useAuth();
  const [tournament, setTournament] = useState<{ id: string; name: string } | null>(null);
  const [resolving, setResolving] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [players, setPlayers] = useState<Map<string, string>>(new Map());
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [tab, setTab] = useState<Tab>('markets');
  const [pending, setPending] = useState<Pending | null>(null);
  const [stake, setStake] = useState(50);
  const [actionError, setActionError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) {
        const local = findPublicTournamentBySlug(tournamentStore.load(), slug);
        if (!disposed) {
          setTournament(local ? { id: local.id, name: local.name } : null); setNotFound(!local);
          if (local) {
            const nameMap = new Map(local.players.map(player => [player.id, `${player.firstName} ${player.lastName}`.trim()]));
            const name = (id: string) => nameMap.get(id) || '?';
            setPlayers(nameMap);
            setMatches(local.matches.map((match, index) => ({ id: match.id, index, start: match.start, teamA: `${name(match.players[0])} / ${name(match.players[1])}`, teamB: `${name(match.players[2])} / ${name(match.players[3])}`, status: match.status ?? 'scheduled', teamAGames: match.result?.aGames ?? null, teamBGames: match.result?.bGames ?? null })));
          }
          setResolving(false);
        }
        return;
      }
      const { data: row } = await supabase.from('public_tournaments').select('id, name').eq('public_slug', slug).maybeSingle();
      if (disposed) return;
      if (!row) { setTournament(null); setNotFound(true); setResolving(false); return; }
      setTournament({ id: row.id, name: row.name });
      const [{ data: playerRows }, { data: matchRows }] = await Promise.all([
        supabase.from('public_players').select('id, first_name, last_name').eq('tournament_id', row.id),
        supabase.from('public_matches').select('id, sequence_number, starts_at, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, team_a_games, team_b_games, status').eq('tournament_id', row.id).order('starts_at'),
      ]);
      if (disposed) return;
      const nameMap = new Map((playerRows ?? []).map(player => [player.id, `${player.first_name} ${player.last_name}`.trim()]));
      const name = (id: string | null) => (id && nameMap.get(id)) || '?';
      setPlayers(nameMap);
      setMatches((matchRows ?? []).map((match, index) => ({ id: match.id, index, start: new Date(match.starts_at).toISOString().slice(11, 16), teamA: `${name(match.team_a_player_1_id)} / ${name(match.team_a_player_2_id)}`, teamB: `${name(match.team_b_player_1_id)} / ${name(match.team_b_player_2_id)}`, status: match.status, teamAGames: match.team_a_games, teamBGames: match.team_b_games })));
      setResolving(false);
    })();
    return () => { disposed = true; };
  }, [slug]);

  useEffect(() => {
    if (!supabase || !tournament?.id) return undefined;
    const client = supabase;
    const reloadMatches = async () => {
      const { data } = await client.from('public_matches').select('id, sequence_number, starts_at, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, team_a_games, team_b_games, status').eq('tournament_id', tournament.id).order('starts_at');
      const name = (id: string | null) => (id && players.get(id)) || '?';
      setMatches((data ?? []).map((match, index) => ({ id: match.id, index, start: new Date(match.starts_at).toISOString().slice(11, 16), teamA: `${name(match.team_a_player_1_id)} / ${name(match.team_a_player_2_id)}`, teamB: `${name(match.team_b_player_1_id)} / ${name(match.team_b_player_2_id)}`, status: match.status, teamAGames: match.team_a_games, teamBGames: match.team_b_games })));
    };
    const channel = client.channel(`betting-matches:${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` }, () => { void reloadMatches(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [players, tournament?.id]);

  const { config, wallet, markets, myBets, leaderboard, loading, error, reload } = useBetting(tournament?.id, false, isAuthenticated);
  const returnTo = encodeURIComponent(`/public/${encodeURIComponent(slug)}/scommesse`);

  const join = useCallback(async () => {
    if (!tournament) return; setJoining(true); setActionError(null);
    try { await bettingProvider.join(tournament.id); await reload(); }
    catch (error) { setActionError(isAppError(error) ? error.message : 'Non è stato possibile entrare al tavolo.'); }
    finally { setJoining(false); }
  }, [tournament, reload]);

  const confirmBet = useCallback(async () => {
    if (!pending) return; setActionError(null);
    try { await bettingProvider.placeBet(pending.market.id, pending.selection.id, stake); setPending(null); await reload(); }
    catch (error) { setActionError(isAppError(error) ? error.message : 'Non è stato possibile piazzare la puntata.'); }
  }, [pending, stake, reload]);

  const matchOf = useMemo(() => new Map(matches.map(match => [match.id, match])), [matches]);
  // Per ogni selezione: cosa/chi rappresenta e in quale mercato, per l'elenco "Le tue puntate".
  const betContext = useMemo(() => {
    const map = new Map<string, { selection: string; context: string }>();
    markets.forEach(market => {
      const info = market.matchId ? matchOf.get(market.matchId) : undefined;
      const context = market.kind === 'tournament_winner' ? 'Vincitore torneo' : market.kind === 'head_to_head' ? 'Testa a testa' : `${KIND_LABEL[market.kind]}${info ? ` · Partita ${info.index + 1}` : ''}`;
      market.selections.forEach(selection => {
        let label = selection.label;
        if (market.kind === 'match_outcome' && info) { if (selection.code === 'A') label = `Coppia A — ${info.teamA}`; else if (selection.code === 'B') label = `Coppia B — ${info.teamB}`; }
        map.set(selection.id, { selection: label, context });
      });
    });
    return map;
  }, [markets, matchOf]);
  const grouped = useMemo(() => {
    const byMatch = new Map<string, BetMarket[]>();
    const winner: BetMarket[] = []; const h2h: BetMarket[] = [];
    markets.forEach(market => {
      if (market.kind === 'tournament_winner') winner.push(market);
      else if (market.kind === 'head_to_head') h2h.push(market);
      else if (market.matchId) { const list = byMatch.get(market.matchId) ?? []; list.push(market); byMatch.set(market.matchId, list); }
    });
    const matchCards = [...byMatch.entries()].sort((a, b) => (matchOf.get(a[0])?.index ?? 0) - (matchOf.get(b[0])?.index ?? 0));
    return { matchCards, winner, h2h };
  }, [markets, matchOf]);

  if (resolving) return <main className="auth-loading">Caricamento tavolo scommesse…</main>;
  if (notFound || !tournament) return <main className="auth-loading">Questo torneo non è disponibile.</main>;

  const canBet = Boolean(wallet);
  const selectSelection = (market: BetMarket) => (selection: BetSelection) => { setPending({ market, selection }); setStake(Math.min(50, wallet?.balance ?? 50) || 1); };

  return <main className="betting-page">
    <header className="betting-topbar">
      <div className="betting-topbar-title"><a href={publicViewPath(slug, 'live')} className="betting-back" aria-label="Torna al torneo">←</a><h1>{tournament.name}</h1></div>
      {wallet && <div className="wallet-badge"><Coins size={16} /> <strong>{wallet.balance}</strong></div>}
    </header>

    {isLocalDemo && <section className="notice" role="status">Demo locale: le scommesse multi-utente richiedono Supabase. Qui puoi provare da solo.</section>}
    {!config.enabled && <section className="notice" role="status">Le scommesse non sono attive per questo torneo.</section>}
    {(error || actionError) && <section className="notice" role="alert">{actionError ?? error} <button className="small" onClick={() => { setActionError(null); void reload(); }}>Riprova</button></section>}

    {config.enabled && !isAuthenticated && <section className="betting-cta">
      <p>Per scommettere accedi o crea un account gratuito. Dopo l'accesso torni qui e ricevi i gettoni.</p>
      <div><a className="auth-submit" href={`/login?redirect=${returnTo}`}>Accedi</a><a className="auth-submit secondary" href={`/register?redirect=${returnTo}`}>Registrati</a></div>
    </section>}

    {config.enabled && isAuthenticated && !wallet && <section className="betting-cta">
      <p>Entra al tavolo e ricevi <strong>{config.initialBalance}</strong> gettoni per iniziare.</p>
      <button className="auth-submit" onClick={join} disabled={joining}>{joining ? 'Ingresso…' : `Entra e gioca (${config.initialBalance} gettoni)`}</button>
    </section>}

    {config.enabled && wallet && <>
      <nav className="betting-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'markets'} className={tab === 'markets' ? 'active' : ''} onClick={() => setTab('markets')}><ListChecks size={16} /> Mercati</button>
        <button role="tab" aria-selected={tab === 'leaderboard'} className={tab === 'leaderboard' ? 'active' : ''} onClick={() => setTab('leaderboard')}><Trophy size={16} /> Classifica</button>
        <button role="tab" aria-selected={tab === 'mybets'} className={tab === 'mybets' ? 'active' : ''} onClick={() => setTab('mybets')}><Ticket size={16} /> Puntate</button>
      </nav>

      {tab === 'markets' && <section className="betting-cards">
        {loading && <p>Caricamento mercati…</p>}
        {!loading && !markets.length && <p className="empty">Nessun mercato disponibile. L'organizzatore deve ancora aprirli.</p>}
        {grouped.winner.map(market => <article key={market.id} className="bet-card"><header className="bet-card-head"><Trophy size={16} /> <b>Vincitore torneo</b></header><SelectionRow market={market} canBet={canBet} activeId={pending?.market.id === market.id ? pending?.selection.id : undefined} onSelect={selectSelection(market)} /></article>)}
        {grouped.matchCards.map(([matchId, matchMarkets]) => { const info = matchOf.get(matchId); const hasFinalScore = info?.status === 'completed' && info.teamAGames !== null && info.teamBGames !== null; return <article key={matchId} className="bet-card">
          <header className="bet-card-match">
            <span className="bet-card-when">{info ? `Partita ${info.index + 1} · ore ${info.start}` : 'Partita'}{hasFinalScore && <strong className="bet-final-score">Finale {info.teamAGames}–{info.teamBGames}</strong>}</span>
            {info && <div className="bet-card-teams"><span><em>A</em> {info.teamA}</span><span className="vs">vs</span><span><em>B</em> {info.teamB}</span></div>}
          </header>
          {matchMarkets.map(market => <SelectionRow key={market.id} market={market} canBet={canBet} activeId={pending?.market.id === market.id ? pending?.selection.id : undefined} onSelect={selectSelection(market)} />)}
        </article>; })}
        {grouped.h2h.map(market => <article key={market.id} className="bet-card"><header className="bet-card-head"><b>Testa a testa</b></header><SelectionRow market={market} canBet={canBet} activeId={pending?.market.id === market.id ? pending?.selection.id : undefined} onSelect={selectSelection(market)} /></article>)}
      </section>}

      {tab === 'leaderboard' && <section className="betting-cards">
        <article className="bet-card"><header className="bet-card-head"><Trophy size={16} /> <b>Classifica gettoni</b></header>
          <ol className="leaderboard-list">{leaderboard.map((entry, index) => <li key={index}><span className="rank">{index + 1}</span><span className="who">{entry.displayName}</span><strong>{entry.balance}</strong></li>)}</ol>
        </article>
      </section>}

      {tab === 'mybets' && <section className="betting-cards">
        <article className="bet-card"><header className="bet-card-head"><Ticket size={16} /> <b>Le tue puntate</b></header>
          {!myBets.length && <p className="empty">Nessuna puntata.</p>}
          <ul className="mybets-list">{myBets.map(bet => { const ctx = betContext.get(bet.selectionId); return <li key={bet.id} className={`bet-${bet.status}`}>
            <span className="bet-desc"><b>{ctx?.selection ?? 'Esito'}</b><small>{ctx?.context ?? ''} · {bet.stake} gettoni @ {bet.oddsAtPlacement.toFixed(2)}</small></span>
            <span className="bet-outcome">{bet.status === 'pending' ? `possibile +${bet.potentialPayout}` : bet.status === 'won' ? `✓ +${bet.potentialPayout}` : bet.status === 'lost' ? '✗ persa' : '↩ rimborsata'}</span>
          </li>; })}</ul>
        </article>
      </section>}
    </>}

    {pending && wallet && <div className="betslip-sheet" role="dialog" aria-label="Conferma puntata">
      <button className="betslip-close" aria-label="Annulla" onClick={() => setPending(null)}><X size={18} /></button>
      <div className="betslip-info"><span className="betslip-sel">{pending.selection.label}</span><span className="betslip-odds">{pending.selection.odds.toFixed(2)}</span></div>
      <div className="betslip-controls">
        <div className="stake-stepper">
          <button type="button" onClick={() => setStake(value => Math.max(1, value - 10))}>−</button>
          <input type="number" min={1} max={wallet.balance} value={stake} onChange={event => setStake(Math.max(1, Math.min(wallet.balance, Number(event.target.value) || 0)))} />
          <button type="button" onClick={() => setStake(value => Math.min(wallet.balance, value + 10))}>+</button>
        </div>
        <span className="betslip-potential">Vincita: <strong>{Math.floor(stake * pending.selection.odds)}</strong></span>
      </div>
      <button className="auth-submit betslip-confirm" disabled={stake > wallet.balance || stake < 1} onClick={confirmBet}>Punta {stake} gettoni</button>
    </div>}
  </main>;
}
