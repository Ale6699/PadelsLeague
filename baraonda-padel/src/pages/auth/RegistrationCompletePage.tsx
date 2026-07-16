import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { AuthShell, navigate } from './AuthPages';

const cooldownSeconds = 60;
export function RegistrationCompletePage() {
  const { resendConfirmation } = useAuth(); const email = sessionStorage.getItem('baraonda.registration.email') ?? '';
  const initialRemaining = useMemo(() => Math.max(0, cooldownSeconds - Math.floor((Date.now() - Number(sessionStorage.getItem('baraonda.registration.lastSentAt') || 0)) / 1000)), []);
  const [remaining, setRemaining] = useState(initialRemaining); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  useEffect(() => { if (!remaining) return; const timer = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [remaining > 0]);
  const resend = async () => { if (!email || remaining || sending) return; setSending(true); setError(null); try { await resendConfirmation(email); sessionStorage.setItem('baraonda.registration.lastSentAt', String(Date.now())); setRemaining(cooldownSeconds); setMessage('Se l’indirizzo può essere registrato, riceverai una nuova email di conferma.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Non è stato possibile inviare una nuova email.'); } finally { setSending(false); } };
  return <AuthShell title="Controlla la tua email"><div className="auth-message"><p>Ti abbiamo inviato un link per confermare l’indirizzo.</p><p>Dopo la conferma potrai accedere alla tua area personale.</p>{message && <p className="auth-success" role="status">{message}</p>}<p className="auth-error" role="alert">{error}</p><button className="auth-submit" type="button" onClick={resend} disabled={!email || sending || remaining > 0}>{sending ? 'Invio in corso…' : remaining ? `Invia di nuovo l’email (${remaining}s)` : 'Invia di nuovo l’email'}</button><button className="auth-link" type="button" onClick={() => navigate('/login')}>Torna al login</button></div></AuthShell>;
}
