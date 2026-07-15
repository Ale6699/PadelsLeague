export type AuthErrorCode = 'invalid_credentials' | 'too_many_requests' | 'email_not_confirmed' | 'weak_password' | 'expired_link' | 'network_error' | 'unknown';
export class AppAuthError extends Error { constructor(public readonly code: AuthErrorCode, message: string) { super(message); this.name = 'AppAuthError'; } }

export function mapAuthError(error: unknown): AppAuthError {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/invalid login|invalid credentials|email not confirmed/.test(message)) return new AppAuthError(message.includes('confirm') ? 'email_not_confirmed' : 'invalid_credentials', message.includes('confirm') ? 'Controlla la tua email per confermare l’account.' : 'Email o password non corrette.');
  if (/rate limit|too many|over_request_rate_limit/.test(message)) return new AppAuthError('too_many_requests', 'Troppi tentativi. Attendi qualche minuto e riprova.');
  if (/weak password|password should/.test(message)) return new AppAuthError('weak_password', 'La password non soddisfa i requisiti di sicurezza.');
  if (/expired|invalid.*token|otp/.test(message)) return new AppAuthError('expired_link', 'Il link non è valido o è scaduto. Richiedi un nuovo recupero password.');
  if (/network|fetch|connection|offline/.test(message)) return new AppAuthError('network_error', 'Non è stato possibile accedere. Controlla la connessione e riprova.');
  return new AppAuthError('unknown', 'Si è verificato un problema. Riprova tra poco.');
}
