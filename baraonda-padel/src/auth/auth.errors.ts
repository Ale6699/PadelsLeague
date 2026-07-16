export type AuthErrorCode = 'invalid_credentials' | 'email_already_registered' | 'invalid_email' | 'weak_password' | 'email_not_confirmed' | 'too_many_requests' | 'network_error' | 'signup_disabled' | 'expired_link' | 'unknown';
export class AppAuthError extends Error { constructor(public readonly code: AuthErrorCode, message: string) { super(message); this.name = 'AppAuthError'; } }

export function mapAuthError(error: unknown): AppAuthError {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/signup.*disabled|signups not allowed|email provider.*disabled/.test(message)) return new AppAuthError('signup_disabled', 'La registrazione non è al momento disponibile.');
  if (/already registered|already exists|user.*registered/.test(message)) return new AppAuthError('email_already_registered', 'Non è stato possibile completare la registrazione. Controlla i dati inseriti oppure prova ad accedere.');
  if (/invalid email|email address.*invalid/.test(message)) return new AppAuthError('invalid_email', 'Inserisci un indirizzo email valido.');
  if (/invalid login|invalid credentials|email not confirmed/.test(message)) return new AppAuthError(message.includes('confirm') ? 'email_not_confirmed' : 'invalid_credentials', message.includes('confirm') ? 'Controlla la tua email per confermare l’account.' : 'Email o password non corrette.');
  if (/rate limit|too many|over_request_rate_limit/.test(message)) return new AppAuthError('too_many_requests', 'Sono state effettuate troppe richieste. Attendi e riprova.');
  if (/weak password|password should/.test(message)) return new AppAuthError('weak_password', 'La password scelta non rispetta i requisiti.');
  if (/expired|invalid.*token|otp/.test(message)) return new AppAuthError('expired_link', 'Il link non è valido o è scaduto. Richiedi un nuovo recupero password.');
  if (/network|fetch|connection|offline/.test(message)) return new AppAuthError('network_error', 'Non è stato possibile accedere. Controlla la connessione e riprova.');
  return new AppAuthError('unknown', 'Si è verificato un problema. Riprova tra poco.');
}
