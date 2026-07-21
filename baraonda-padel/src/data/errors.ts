export type AppErrorCode = 'network_error' | 'not_found' | 'validation_error' | 'permission_denied' | 'conflict' | 'configuration_error' | 'unknown';
export type AppError = { code: AppErrorCode; message: string; cause?: unknown };
export function mapSupabaseError(error: unknown): AppError {
  const details = error as { code?: string; message?: string; status?: number }; const text = details?.message ?? '';
  if (text.includes('SUPABASE_CONFIGURATION_MISSING')) return { code: 'configuration_error', message: 'Supabase non è configurato.' };
  if (text.includes('INSUFFICIENT_FUNDS')) return { code: 'validation_error', message: 'Gettoni insufficienti per questa puntata.', cause: error };
  if (text.includes('MARKET_CLOSED')) return { code: 'validation_error', message: 'Il mercato non è aperto alle puntate.', cause: error };
  if (text.includes('VERSION_CONFLICT') || details?.status === 409) return { code: 'conflict', message: 'Il dato è stato modificato da un’altra schermata. Ricarica e riprova.', cause: error };
  if (details?.code === '23505' && text.includes('public_slug')) return { code: 'validation_error', message: 'Il link pubblico è già utilizzato da un altro torneo.', cause: error };
  if (text.includes('PERMISSION_DENIED') || details?.status === 401 || details?.status === 403) return { code: 'permission_denied', message: 'Non hai i permessi per questa operazione.', cause: error };
  if (text.includes('TOURNAMENT_NOT_FOUND')) return { code: 'not_found', message: 'Torneo non trovato.', cause: error };
  if (details?.status === 404) return { code: 'not_found', message: 'Dato non trovato.', cause: error };
  if (details?.status === 400) return { code: 'validation_error', message: 'Alcuni dati non sono validi.', cause: error };
  if (text.toLowerCase().includes('network') || text.toLowerCase().includes('fetch')) return { code: 'network_error', message: 'Connessione instabile o assente.', cause: error };
  return { code: 'unknown', message: 'Non è stato possibile sincronizzare i dati.', cause: error };
}
