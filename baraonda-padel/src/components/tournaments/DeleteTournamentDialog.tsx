import { useEffect, useRef, useState } from 'react';
import { Tournament } from '../../models';
import { normalizeTournamentConfirmation } from '../../domain/tournaments/tournamentChanges';

export function DeleteTournamentDialog({ tournament, open, onClose, onDelete }: { tournament: Tournament; open: boolean; onClose: () => void; onDelete: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState(''); const [deleting, setDeleting] = useState(false); const [error, setError] = useState(''); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    setConfirmation(''); setError(''); setDeleting(false); setTimeout(() => inputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  const confirmed = normalizeTournamentConfirmation(confirmation) === normalizeTournamentConfirmation(tournament.name);
  const results = tournament.matches.filter(match => match.status === 'completed' || (match.result?.aGames != null && match.result?.bGames != null)).length;
  const remove = async () => { if (!confirmed || deleting) return; setDeleting(true); setError(''); try { await onDelete(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Non è stato possibile eliminare il torneo. Controlla la connessione e riprova.'); setDeleting(false); } };
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !deleting) onClose(); }}><div className="modal delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="modal-body"><h2 id="delete-title">Eliminare definitivamente questo torneo?</h2><dl className="delete-summary"><div><dt>Nome</dt><dd>{tournament.name}</dd></div><div><dt>Data</dt><dd>{tournament.settings.date}</dd></div><div><dt>Giocatori</dt><dd>{tournament.players.length}</dd></div><div><dt>Partite</dt><dd>{tournament.matches.length}</dd></div><div><dt>Risultati registrati</dt><dd>{results}</dd></div></dl><div className="danger-notice"><b>Questa operazione eliminerà definitivamente:</b><p>configurazione, giocatori, disponibilità, incompatibilità, pause, calendario, risultati, classifica e cronologia del segnapunti.</p><b>L’operazione non può essere annullata.</b></div><label className="confirmation-label">Per confermare, scrivi: <b>{tournament.name}</b><input ref={inputRef} value={confirmation} disabled={deleting} onChange={event => setConfirmation(event.target.value)} /></label>{error && <p className="field-error" role="alert">{error}</p>}</div><div className="modal-actions"><button className="secondary" disabled={deleting} onClick={onClose}>Annulla</button><button className="danger-button" disabled={!confirmed || deleting} onClick={remove}>{deleting ? 'Eliminazione in corso…' : 'Elimina definitivamente'}</button></div></div></div>;
}
