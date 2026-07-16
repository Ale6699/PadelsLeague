import { AuthShell, navigate } from './AuthPages';

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const terms = kind === 'terms';
  return <AuthShell title={terms ? 'Condizioni d’uso' : 'Informativa privacy'} wide><article className="legal-copy"><p>{terms ? 'Usa Baraonda Padel nel rispetto delle persone partecipanti e conserva solo i dati necessari alla gestione del torneo.' : 'I dati dell’account e dei tornei sono trattati per fornire il servizio. Password e sessioni sono gestite esclusivamente da Supabase Auth.'}</p><p>Prima della pubblicazione, sostituisci questa pagina con il testo legale approvato e configura il relativo URL nelle variabili d’ambiente.</p><button className="auth-link" type="button" onClick={() => navigate('/register')}>Torna alla registrazione</button></article></AuthShell>;
}
