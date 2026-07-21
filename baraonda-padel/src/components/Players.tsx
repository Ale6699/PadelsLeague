import { useState } from 'react';
import { ChevronDown, FileDown, Plus, Trash2 } from 'lucide-react';
import { Gender, Level, Player, PlayerStatus, Tournament, fullName, uid } from '../models';
import { scheduleRespectsPlayerLimit } from '../solver';
import { exportPlayersPdf } from '../services/pdf';

export function Players({ tournament, update: persist }: { tournament: Tournament; update: (fn: (t: Tournament) => Tournament) => void }) {
  const [expandedPlayer, setExpandedPlayer] = useState<string>();
  const withScheduleCheck = (next: Tournament) => ({ ...next, scheduleNeedsRegeneration: Boolean(next.scheduleNeedsRegeneration) || (next.matches.length > 0 && !scheduleRespectsPlayerLimit(next)) });
  const update = (change: (tournament: Tournament) => Tournament) => persist(current => withScheduleCheck(change(current)));
  const add = () => {
    const id = uid();
    update(t => ({ ...t, players: [...t.players, { id, firstName: 'Nuovo', lastName: 'Giocatore', level: 'Intermedio', gender: 'Uomo', notes: '', availability: [{ from: t.settings.start, to: t.settings.end }], avoidPartners: [], status: 'attivo' }] }));
    setExpandedPlayer(id);
  };
  const patch = (id: string, changes: Partial<Player>) => update(t => ({ ...t, players: t.players.map(player => player.id === id ? { ...player, ...changes } : player), scheduleNeedsRegeneration: Boolean(t.scheduleNeedsRegeneration) || (t.matches.length > 0 && ('status' in changes || 'availability' in changes)) }));
  const remove = (player: Player) => {
    if (!window.confirm(`Eliminare ${fullName(player)}? Verranno rimosse anche le partite in cui è presente.`)) return;
    update(t => ({ ...t, players: t.players.filter(item => item.id !== player.id), matches: t.matches.filter(match => !match.players.includes(player.id)) }));
  };
  const togglePartner = (player: Player, partnerId: string) => patch(player.id, { avoidPartners: player.avoidPartners.includes(partnerId) ? player.avoidPartners.filter(id => id !== partnerId) : [...player.avoidPartners, partnerId] });

  return <>
    <header className="page-header"><div><h1>Giocatori</h1><p>Disponibilità, livello, genere e incompatibilità di coppia.</p></div><div className="actions">{tournament.players.length > 0 && <button className="secondary" onClick={() => exportPlayersPdf(tournament)}><FileDown size={17} /> Esporta PDF</button>}<button onClick={add}><Plus size={17} /> Aggiungi</button></div></header>
    {!tournament.players.length && <section className="empty-panel"><span aria-hidden="true">👥</span><h2>Nessun giocatore</h2><p>Aggiungi almeno quattro partecipanti per creare il calendario.</p><button onClick={add}><Plus size={17} /> Aggiungi il primo giocatore</button></section>}
    <div className="player-list">{[...tournament.players].sort((a, b) => fullName(a).localeCompare(fullName(b), 'it', { sensitivity: 'base' })).map(player => {
      const expanded = expandedPlayer === player.id;
      return <article className={`player${expanded ? ' is-expanded' : ''}`} key={player.id}>
        <button type="button" className="player-summary" aria-expanded={expanded} aria-controls={`player-${player.id}`} onClick={() => setExpandedPlayer(expanded ? undefined : player.id)}>
          <span className="player-avatar" aria-hidden="true">{player.firstName.charAt(0)}{player.lastName.charAt(0)}</span>
          <span><b>{fullName(player)}</b><small>{player.level} · {player.status}</small></span>
          <ChevronDown className="player-chevron" size={20} />
        </button>
        <div className="player-body" id={`player-${player.id}`}>
          <div className="player-fields">
            <label>Nome<input key={`first-${player.firstName}`} defaultValue={player.firstName} onBlur={event => patch(player.id, { firstName: event.target.value })} /></label>
            <label>Cognome<input key={`last-${player.lastName}`} defaultValue={player.lastName} onBlur={event => patch(player.id, { lastName: event.target.value })} /></label>
            <label>Livello<select value={player.level} onChange={event => patch(player.id, { level: event.target.value as Level })}><option>Principiante</option><option>Intermedio</option><option>Avanzato</option></select></label>
            <label>Genere<select value={player.gender} onChange={event => patch(player.id, { gender: event.target.value as Gender })}><option>Uomo</option><option>Donna</option><option>Altro</option></select></label>
            <label>Stato<select value={player.status} onChange={event => patch(player.id, { status: event.target.value as PlayerStatus })}><option value="attivo">Attivo</option><option value="ritardo">In ritardo</option><option value="assente">Assente</option><option value="infortunato">Infortunato</option><option value="ritirato">Ritirato</option></select></label>
          </div>
          <label className="player-notes">Note<textarea key={`notes-${player.notes}`} defaultValue={player.notes} onBlur={event => patch(player.id, { notes: event.target.value })} /></label>
          <fieldset className="player-section availability-editor"><legend>Disponibilità</legend>
            {player.availability.map((availability, index) => <div className="availability-row" key={`${availability.from}-${availability.to}-${index}`}>
              <label>Da<input aria-label={`Disponibile dalle, fascia ${index + 1}`} type="time" key={`from-${availability.from}`} defaultValue={availability.from} onBlur={event => patch(player.id, { availability: player.availability.map((item, itemIndex) => itemIndex === index ? { ...item, from: event.target.value } : item) })} /></label>
              <label>A<input aria-label={`Disponibile fino alle, fascia ${index + 1}`} type="time" key={`to-${availability.to}`} defaultValue={availability.to} onBlur={event => patch(player.id, { availability: player.availability.map((item, itemIndex) => itemIndex === index ? { ...item, to: event.target.value } : item) })} /></label>
              <button type="button" className="icon danger" aria-label={`Rimuovi fascia ${index + 1}`} onClick={() => patch(player.id, { availability: player.availability.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={17} /></button>
            </div>)}
            <button type="button" className="small secondary" onClick={() => patch(player.id, { availability: [...player.availability, { from: tournament.settings.start, to: tournament.settings.end }] })}>+ Aggiungi fascia</button>
          </fieldset>
          <fieldset className="player-section"><legend>Non può essere compagno di</legend>
            <div className="partner-checklist">{tournament.players.filter(other => other.id !== player.id).map(other => <label key={other.id}><input type="checkbox" checked={player.avoidPartners.includes(other.id)} onChange={() => togglePartner(player, other.id)} /><span>{fullName(other)}</span></label>)}</div>
            {tournament.players.length < 2 && <p className="muted">Aggiungi altri giocatori per impostare incompatibilità.</p>}
          </fieldset>
          <div className="player-danger-zone"><button type="button" className="danger" onClick={() => remove(player)}><Trash2 size={17} /> Elimina giocatore</button></div>
        </div>
      </article>;
    })}</div>
  </>;
}
