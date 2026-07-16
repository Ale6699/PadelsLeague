import { Pencil, Trash2 } from 'lucide-react';

export function TournamentActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <details className="tournament-actions"><summary>Azioni torneo</summary><div><button className="secondary" onClick={onEdit}><Pencil size={16} /> Modifica torneo</button><button className="danger-button" onClick={onDelete}><Trash2 size={16} /> Elimina torneo</button></div></details>;
}
