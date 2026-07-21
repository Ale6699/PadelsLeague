import { useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import { Tournament, fullName } from '../../models';
import { isAppError } from '../../data/tournaments.repository';
import { BetMarket, bettingProvider } from '../../data/betting';
import { useBetting } from '../../hooks/useBetting';

const KIND_LABEL: Record<BetMarket['kind'], string> = {
  match_outcome: 'Esito partita', over_under_games: 'Over / Under game', tournament_winner: 'Vincitore torneo', head_to_head: 'Testa a testa',
};

export function BettingAdmin({ tournament }: { tournament: Tournament }) {
  const { config, markets, wallets, leaderboard, loading, error, reload } = useBetting(tournament.id, true);
  const [enabled, setEnabled] = useState(tournament.bettingEnabled ?? false);
  const [initialBalance, setInitialBalance] = useState(tournament.bettingInitialBalance ?? 1000);
  const [overUnder, setOverUnder] = useState(tournament.bettingOverUnderEnabled ?? true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [h2h, setH2h] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [adjust, setAdjust] = useState<Record<string, number>>({});
  const [settleChoice, setSettleChoice] = useState<Record<string, string>>({});

  const playerName = useMemo(() => new Map(tournament.players.map(player => [player.id, fullName(player)])), [tournament.players]);
  const marketsByMatch = useMemo(() => { const set = new Set(markets.map(market => market.matchId).filter(Boolean)); return set; }, [markets]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setActionError(null);
    try { await action(); await reload(); }
    catch (error) { setActionError(isAppError(error) ? error.message : 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  };

  const matchLabel = (matchId: string | null) => {
    if (!matchId) return '';
    const index = tournament.matches.findIndex(match => match.id === matchId);
    const match = tournament.matches[index]; if (!match) return '';
    return `#${index + 1} ${playerName.get(match.players[0]) ?? '?'}/${playerName.get(match.players[1]) ?? '?'} vs ${playerName.get(match.players[2]) ?? '?'}/${playerName.get(match.players[3]) ?? '?'}`;
  };

  return <div className="betting-admin">
    <h1><Coins size={22} /> Scommesse</h1>
    {!tournament.isPublic && <section className="notice" role="status">Pubblica il torneo (link pubblico) affinché gli scommettitori possano accedere al tavolo.</section>}
    {(error || actionError) && <section className="notice" role="alert">{actionError ?? error}</section>}

    <section className="betting-admin-config">
      <h2>Configurazione</h2>
      <label className="switch"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Scommesse attive</label>
      <label className="switch"><input type="checkbox" checked={overUnder} onChange={event => setOverUnder(event.target.checked)} /> Abilita mercati Over/Under</label>
      <label>Gettoni iniziali<input type="number" min={0} value={initialBalance} onChange={event => setInitialBalance(Math.max(0, Number(event.target.value) || 0))} /></label>
      <button className="auth-submit" disabled={busy} onClick={() => run(() => bettingProvider.setConfig(tournament.id, enabled, initialBalance, overUnder))}>Salva configurazione</button>
      <p className="hint">Stato attuale: {config.enabled ? 'attive' : 'non attive'} · saldo iniziale {config.initialBalance} · Over/Under {config.overUnderEnabled ? 'sì' : 'no'}.</p>
    </section>

    <section className="betting-admin-generate">
      <h2>Genera mercati</h2>
      <button disabled={busy} onClick={() => run(() => bettingProvider.generateTournamentMarkets(tournament.id))}>Vincitore torneo</button>
      <div className="h2h">
        <select value={h2h.a} onChange={event => setH2h(current => ({ ...current, a: event.target.value }))}><option value="">Giocatore A…</option>{tournament.players.map(player => <option key={player.id} value={player.id}>{fullName(player)}</option>)}</select>
        <select value={h2h.b} onChange={event => setH2h(current => ({ ...current, b: event.target.value }))}><option value="">Giocatore B…</option>{tournament.players.map(player => <option key={player.id} value={player.id}>{fullName(player)}</option>)}</select>
        <button disabled={busy || !h2h.a || !h2h.b || h2h.a === h2h.b} onClick={() => run(() => bettingProvider.createHeadToHead(tournament.id, h2h.a, h2h.b))}>Crea testa a testa</button>
      </div>
      <ul className="match-generate">
        {tournament.matches.map((match, index) => <li key={match.id}>
          <span>{matchLabel(match.id)}</span>
          <button disabled={busy || marketsByMatch.has(match.id)} onClick={() => run(() => bettingProvider.generateMatchMarkets(match.id, tournament.id))}>{marketsByMatch.has(match.id) ? 'Creati' : `Genera (#${index + 1})`}</button>
        </li>)}
      </ul>
    </section>

    <section className="betting-admin-markets">
      <h2>Mercati ({markets.length})</h2>
      {loading && <p>Caricamento…</p>}
      {markets.map(market => <article key={market.id} className={`bet-market ${market.status}`}>
        <header><span className="bet-kind">{KIND_LABEL[market.kind]} {market.matchId ? matchLabel(market.matchId) : ''}</span><span className={`bet-status ${market.status}`}>{market.status}</span></header>
        <ul className="bet-selections compact">{market.selections.map(selection => <li key={selection.id}>{selection.label} · <b>{selection.odds.toFixed(2)}</b> <small>({selection.stakePool} puntati)</small>{selection.isWinner === true ? ' ✓' : ''}</li>)}</ul>
        <div className="market-actions">
          <button disabled={busy} onClick={() => run(() => bettingProvider.openMarket(market.id))}>Apri</button>
          <button disabled={busy} onClick={() => run(() => bettingProvider.closeMarket(market.id))}>Chiudi</button>
          <button disabled={busy} className="danger" onClick={() => run(() => bettingProvider.voidMarket(market.id))}>Annulla</button>
          <select value={settleChoice[market.id] ?? ''} onChange={event => setSettleChoice(current => ({ ...current, [market.id]: event.target.value }))}><option value="">Vincitore…</option>{market.selections.map(selection => <option key={selection.id} value={selection.id}>{selection.label}</option>)}</select>
          <button disabled={busy || !settleChoice[market.id]} onClick={() => run(() => bettingProvider.settleMarket(market.id, settleChoice[market.id]))}>Liquida</button>
        </div>
      </article>)}
    </section>

    <section className="betting-admin-wallets">
      <h2>Saldi giocatori</h2>
      {!wallets.length && <p className="empty">Nessuno si è ancora unito al tavolo.</p>}
      <ul>{wallets.map(wallet => <li key={wallet.id}>
        <span>{wallet.displayName}</span><strong>{wallet.balance}</strong>
        <input type="number" placeholder="±" value={adjust[wallet.id] ?? ''} onChange={event => setAdjust(current => ({ ...current, [wallet.id]: Number(event.target.value) || 0 }))} />
        <button disabled={busy || !adjust[wallet.id]} onClick={() => run(async () => { await bettingProvider.adjustBalance(wallet.id, adjust[wallet.id]); setAdjust(current => ({ ...current, [wallet.id]: 0 })); })}>Applica</button>
      </li>)}</ul>
      <div className="betting-leaderboard"><h3>Classifica</h3><ol>{leaderboard.map((entry, index) => <li key={index}><span>{entry.displayName}</span><strong>{entry.balance}</strong></li>)}</ol></div>
    </section>
  </div>;
}
