import { Tournament } from '../models';
import { TournamentFormValues } from '../domain/tournaments/tournamentValidation';
import { TournamentForm, TournamentSaveChoice } from './tournaments/TournamentForm';

export function SettingsView({ mode, tournament, busy, mutationError, onSubmit, onCancel, onDirtyChange }: {
  mode: 'create' | 'edit'; tournament: Tournament; busy: boolean; mutationError: string | null;
  onSubmit: (values: TournamentFormValues, choice: TournamentSaveChoice) => Promise<void>;
  onCancel: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  return <TournamentForm mode={mode} tournament={tournament} busy={busy} mutationError={mutationError} onSubmit={onSubmit} onCancel={onCancel} onDirtyChange={onDirtyChange} />;
}
