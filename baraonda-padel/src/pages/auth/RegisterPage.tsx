import { type FormEvent, useEffect, useRef, useState } from 'react';
import { getSafeRedirect } from '../../auth/ProtectedRoute';
import { firstInvalidSignUpField, normalizeSignUpValues, validateSignUp, type SignUpField, type SignUpFormValues, type SignUpValidationErrors } from '../../auth/signup.schema';
import { useAuth } from '../../auth/useAuth';
import { AuthShell, navigate, PasswordInput } from './AuthPages';

const initialValues: SignUpFormValues = { firstName: '', lastName: '', email: '', password: '', passwordConfirmation: '', acceptedTerms: false, marketingConsent: false };
const legalUrl = (configured: string | undefined, fallback: string) => configured?.trim() || fallback;

export function RegisterPage() {
  const { isAuthenticated, loading, signUp } = useAuth();
  const [values, setValues] = useState(initialValues); const [errors, setErrors] = useState<SignUpValidationErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  const fields = useRef<Partial<Record<SignUpField, HTMLInputElement | null>>>({});
  const submissionLock = useRef(false);
  const redirectParam = new URLSearchParams(window.location.search).get('redirect');
  const redirect = getSafeRedirect(redirectParam);
  useEffect(() => { if (!loading && isAuthenticated) navigate('/tournaments'); }, [isAuthenticated, loading]);
  const set = <K extends keyof SignUpFormValues>(key: K, value: SignUpFormValues[K]) => setValues(current => ({ ...current, [key]: value }));
  const errorProps = (field: SignUpField) => ({ 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `${field}-error` : undefined });
  const fieldError = (field: SignUpField) => errors[field] ? <span className="field-error" id={`${field}-error`}>{errors[field]}</span> : null;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (submissionLock.current) return;
    const normalized = normalizeSignUpValues(values); const nextErrors = validateSignUp(normalized); setValues(normalized); setErrors(nextErrors); setRequestError(null);
    const firstError = firstInvalidSignUpField(nextErrors); if (firstError) { window.setTimeout(() => (fields.current[firstError] ?? document.getElementById(firstError))?.focus(), 0); return; }
    submissionLock.current = true; setSubmitting(true);
    try {
      const result = await signUp(normalized);
      if (result.session) { navigate(redirect === '/' ? '/tournaments' : redirect); return; }
      sessionStorage.setItem('baraonda.registration.email', normalized.email);
      sessionStorage.setItem('baraonda.registration.lastSentAt', String(Date.now()));
      navigate('/registration-complete');
    } catch (reason) {
      setRequestError(reason instanceof Error ? reason.message : 'Non è stato possibile completare la registrazione.');
    } finally { submissionLock.current = false; setSubmitting(false); }
  };
  if (loading || isAuthenticated) return <main className="auth-loading">Caricamento…</main>;
  return <AuthShell title="Crea il tuo account" wide><form onSubmit={submit} noValidate>
    <div className="auth-form-grid"><label htmlFor="firstName">Nome<input ref={node => { fields.current.firstName = node; }} id="firstName" value={values.firstName} onChange={event => set('firstName', event.target.value)} autoComplete="given-name" maxLength={80} {...errorProps('firstName')} />{fieldError('firstName')}</label>
      <label htmlFor="lastName">Cognome<input ref={node => { fields.current.lastName = node; }} id="lastName" value={values.lastName} onChange={event => set('lastName', event.target.value)} autoComplete="family-name" maxLength={80} {...errorProps('lastName')} />{fieldError('lastName')}</label></div>
    <label htmlFor="email">Email<input ref={node => { fields.current.email = node; }} id="email" type="email" value={values.email} onChange={event => set('email', event.target.value)} autoComplete="email" {...errorProps('email')} />{fieldError('email')}</label>
    <PasswordInput id="password" value={values.password} onChange={value => set('password', value)} autoComplete="new-password" error={errors.password} />
    <PasswordInput id="passwordConfirmation" label="Conferma password" value={values.passwordConfirmation} onChange={value => set('passwordConfirmation', value)} autoComplete="new-password" error={errors.passwordConfirmation} />
    <p className="password-help">Almeno 8 caratteri, una lettera e un numero.</p>
    <label className="auth-checkbox"><input ref={node => { fields.current.acceptedTerms = node; }} type="checkbox" checked={values.acceptedTerms} onChange={event => set('acceptedTerms', event.target.checked)} {...errorProps('acceptedTerms')} /><span>Accetto le <a href={legalUrl(import.meta.env.VITE_TERMS_URL, '/terms')} target="_blank" rel="noreferrer">condizioni d’uso</a> e l’<a href={legalUrl(import.meta.env.VITE_PRIVACY_URL, '/privacy')} target="_blank" rel="noreferrer">informativa privacy</a>.</span></label>{fieldError('acceptedTerms')}
    <label className="auth-checkbox"><input type="checkbox" checked={values.marketingConsent} onChange={event => set('marketingConsent', event.target.checked)} /><span>Desidero ricevere aggiornamenti sul servizio.</span></label>
    <p className="auth-error" role="alert">{requestError}</p><button className="auth-submit" disabled={submitting}>{submitting ? 'Registrazione in corso…' : 'Registrati'}</button>
    <p className="auth-switch">Hai già un account? <button type="button" onClick={() => navigate(`/login${redirectParam ? `?redirect=${encodeURIComponent(redirect)}` : ''}`)}>Accedi</button></p>
  </form></AuthShell>;
}
