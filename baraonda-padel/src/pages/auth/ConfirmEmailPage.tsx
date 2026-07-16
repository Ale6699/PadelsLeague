import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { AuthShell, navigate } from './AuthPages';

export function ConfirmEmailPage() {
  const { loading, session, reloadProfile } = useAuth(); const started = useRef(false); const [ready, setReady] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(`${window.location.search}&${window.location.hash.replace(/^#/, '')}`);
    if (params.get('error') || params.get('error_code')) setFailed(true);
  }, []);
  useEffect(() => { if (loading || failed || started.current) return; if (!session) { setFailed(true); return; } started.current = true; void reloadProfile().then(() => { setReady(true); window.setTimeout(() => navigate('/tournaments'), 1400); }).catch(() => setFailed(true)); }, [failed, loading, reloadProfile, session]);
  return <AuthShell title={failed ? 'Conferma non riuscita' : 'Conferma email'}>{failed ? <div className="auth-message"><p className="auth-error" role="alert">Il link di conferma non è valido oppure è scaduto. Richiedi una nuova email di conferma.</p><button className="auth-link" type="button" onClick={() => navigate('/login')}>Torna al login</button></div> : <div className="auth-message" role="status"><p>{ready ? 'Email confermata correttamente.' : 'Verifica della conferma in corso…'}</p>{ready && <p>Il tuo account è pronto.</p>}</div>}</AuthShell>;
}
