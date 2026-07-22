import { useEffect, useMemo, useState } from 'react';
import { Tournament } from '../../models';
import { TOURNAMENT_FIELD_LABELS, formatChangeValue, getTournamentChanges, tournamentToFormValues } from '../../domain/tournaments/tournamentChanges';
import { TournamentFormErrors, TournamentFormValues, validateTournament } from '../../domain/tournaments/tournamentValidation';

export type TournamentSaveChoice = 'save' | 'regenerate';

export function TournamentForm({ mode, tournament, busy = false, mutationError, onSubmit, onCancel, onDirtyChange }: {
  mode: 'create' | 'edit'; tournament: Tournament; busy?: boolean; mutationError?: string | null;
  onSubmit: (values: TournamentFormValues, choice: TournamentSaveChoice) => Promise<void> | void;
  onCancel: () => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const initial = useMemo(() => tournamentToFormValues(tournament), [tournament]);
  const [values, setValues] = useState(initial); const [errors, setErrors] = useState<TournamentFormErrors>({}); const [reviewing, setReviewing] = useState(false);
  useEffect(() => { setValues(initial); setErrors({}); setReviewing(false); }, [initial]);
  const changes = useMemo(() => getTournamentChanges(tournament, values), [tournament, values]);
  const dirty = mode === 'create' || changes.hasChanges;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!dirty) return undefined; const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload); }, [dirty]);
  const patch = <K extends keyof TournamentFormValues>(key: K, value: TournamentFormValues[K]) => setValues(current => ({ ...current, [key]: value }));
  const validate = () => { const next = validateTournament(values); setErrors(next); return !Object.keys(next).length; };
  const requestSave = () => { if (!validate()) return; if (mode === 'edit' && changes.affectsSchedule && tournament.matches.length) setReviewing(true); else void onSubmit(values, 'save'); };
  const cancel = () => { if (!dirty || window.confirm('Hai modifiche non salvate. Vuoi davvero uscire?')) onCancel(); };
  const fieldError = (key: keyof TournamentFormValues) => errors[key] ? <small className="field-error" role="alert">{errors[key]}</small> : null;
  const completedMatches = tournament.matches.filter(match => match.status === 'completed').length;

  return <>
    <header><div><h1>{mode === 'create' ? 'Nuovo torneo' : 'Modifica torneo'}</h1><p>{mode === 'create' ? 'Configura il torneo usando le stesse regole applicate alle modifiche.' : `Versione ${tournament.version ?? 1} · Le modifiche vengono salvate solo alla conferma.`}</p></div></header>
    {tournament.status === 'completed' && <section className="notice">Questo torneo è concluso. Le modifiche alla configurazione non cambieranno i risultati già registrati.</section>}
    {mutationError && <section className="notice" role="alert">{mutationError}</section>}
    <section className="tournament-form">
      <fieldset className="form-group"><legend>Identità del torneo</legend><div className="form-group-grid">
        <label>Nome torneo<input value={values.name} onChange={event => patch('name', event.target.value)} />{fieldError('name')}</label>
        <label>Titolo pubblico<input value={values.publicTitle} onChange={event => patch('publicTitle', event.target.value)} /></label>
        <label>Data<input type="date" value={values.date} onChange={event => patch('date', event.target.value)} />{fieldError('date')}</label>
        <label>Stato<select value={values.status} onChange={event => patch('status', event.target.value as TournamentFormValues['status'])}><option value="draft">Bozza</option><option value="scheduled">Programmato</option><option value="in_progress">In corso</option><option value="completed">Concluso</option><option value="cancelled">Annullato</option></select></label>
      </div></fieldset>
      <fieldset className="form-group"><legend>Orari e formato</legend><div className="form-group-grid">
        <label>Inizio<input type="time" value={values.start} onChange={event => patch('start', event.target.value)} /></label>
        <label>Fine<input type="time" value={values.end} onChange={event => patch('end', event.target.value)} />{fieldError('end')}</label>
        <label>Minuti di gioco<input type="number" min="1" value={values.playMinutes} onChange={event => patch('playMinutes', Number(event.target.value))} />{fieldError('playMinutes')}</label>
        <label>Minuti cambio/riscaldamento<input type="number" min="0" value={values.warmupMinutes} onChange={event => patch('warmupMinutes', Number(event.target.value))} />{fieldError('warmupMinutes')}</label>
        <label>Massimo partite per giocatore<input type="number" min="1" step="1" value={values.targetMatchesPerPlayer} onChange={event => patch('targetMatchesPerPlayer', Number(event.target.value))} />{fieldError('targetMatchesPerPlayer')}</label>
        <label>Massimo game<input type="number" min="1" value={values.maxGamesPerMatch} onChange={event => patch('maxGamesPerMatch', Number(event.target.value))} />{fieldError('maxGamesPerMatch')}</label>
        <label className="check"><input type="checkbox" checked={values.killerPoint} onChange={event => patch('killerPoint', event.target.checked)} /> Punto killer (punto secco dopo le parità)</label>
        <label>Parità a vantaggio prima del punto killer<input type="number" min="0" step="1" disabled={!values.killerPoint} value={values.killerPointAfterDeuces} onChange={event => patch('killerPointAfterDeuces', Number(event.target.value))} />{fieldError('killerPointAfterDeuces')}<small>0 = punto secco già dal primo 40–40 · 1 = dopo il primo vantaggio</small></label>
      </div></fieldset>
      <fieldset className="form-group"><legend>Pubblicazione</legend><div className="form-group-grid">
        <label>Slug pubblico<input value={values.publicSlug} placeholder="torneo-estate-2026" onChange={event => patch('publicSlug', event.target.value)} />{fieldError('publicSlug')}<small>/public/{values.publicSlug || '…'}</small></label>
        <label className="check"><input type="checkbox" checked={values.isPublic} onChange={event => patch('isPublic', event.target.checked)} /> Pubblica schermo, calendario e classifica</label>
        <label className="form-wide">Note pubbliche<textarea maxLength={2000} value={values.notes} onChange={event => patch('notes', event.target.value)} />{fieldError('notes')}<small>{values.notes.length}/2000</small></label>
      </div></fieldset>
      <fieldset className="form-group"><legend>Preferenze</legend><div className="preference-grid">
        <label className="check"><input type="checkbox" checked={values.prioritizeMixed} onChange={event => patch('prioritizeMixed', event.target.checked)} /> Prediligi coppie miste</label>
        <label className="check"><input type="checkbox" checked={values.timerSoundEnabled} onChange={event => patch('timerSoundEnabled', event.target.checked)} /> Suono del timer</label>
      </div></fieldset>
    </section>
    <section><h2>Pause</h2>{values.pauses.map((pause, index) => <div className="pause" key={index}><input aria-label={`Inizio pausa ${index + 1}`} type="time" value={pause.from} onChange={event => patch('pauses', values.pauses.map((item, itemIndex) => itemIndex === index ? { ...item, from: event.target.value } : item))} /><input aria-label={`Fine pausa ${index + 1}`} type="time" value={pause.to} onChange={event => patch('pauses', values.pauses.map((item, itemIndex) => itemIndex === index ? { ...item, to: event.target.value } : item))} /><button type="button" className="secondary" onClick={() => patch('pauses', values.pauses.filter((_, itemIndex) => itemIndex !== index))}>Rimuovi</button></div>)}{fieldError('pauses')}<button type="button" className="secondary" onClick={() => patch('pauses', [...values.pauses, { from: '13:00', to: '14:00' }])}>+ Aggiungi pausa</button></section>
    {mode === 'edit' && changes.hasChanges && <section><h2>Modifiche rilevate</h2><ul className="change-list">{changes.changedFields.map(field => <li key={field}><b>{TOURNAMENT_FIELD_LABELS[field]}</b><span>{formatChangeValue(field, initial[field as keyof TournamentFormValues])} → {formatChangeValue(field, values[field as keyof TournamentFormValues])}</span></li>)}</ul></section>}
    {mode === 'edit' && changes.changedFields.includes('publicSlug') && <section className="notice">Modificando il link pubblico, il precedente collegamento non sarà più valido.</section>}
    <div className="form-actions sticky-form-actions"><button type="button" className="secondary" disabled={busy} onClick={cancel}>Annulla</button><button type="button" disabled={busy || (mode === 'edit' && !changes.hasChanges)} onClick={requestSave}>{busy ? 'Salvataggio in corso…' : 'Salva torneo'}</button></div>
    {reviewing && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="changes-dialog-title"><h2 id="changes-dialog-title">Queste modifiche potrebbero rendere non valido il calendario esistente.</h2>{tournament.status === 'in_progress' && <p className="notice">Il torneo è già in corso. Orari e durata possono influire sulle partite future; le concluse non verranno cambiate.</p>}{tournament.status === 'completed' && <p className="notice">Il torneo è concluso: la configurazione non cambierà risultati o classifica.</p>}{completedMatches > 0 && <p>Il torneo contiene {completedMatches} partit{completedMatches === 1 ? 'a già conclusa' : 'e già concluse'}. La rigenerazione modificherà solo le partite future non bloccate.</p>}<ul className="change-list">{changes.changedFields.map(field => <li key={field}><b>{TOURNAMENT_FIELD_LABELS[field]}</b><span>{formatChangeValue(field, initial[field as keyof TournamentFormValues])} → {formatChangeValue(field, values[field as keyof TournamentFormValues])}</span></li>)}</ul><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setReviewing(false)}>Annulla</button><button className="secondary" disabled={busy} onClick={() => void onSubmit(values, 'save')}>Salva senza rigenerare</button><button disabled={busy || tournament.status === 'completed'} title={tournament.status === 'completed' ? 'Un torneo concluso non viene rigenerato automaticamente.' : undefined} onClick={() => void onSubmit(values, 'regenerate')}>Salva e rigenera</button></div></div></div>}
  </>;
}
