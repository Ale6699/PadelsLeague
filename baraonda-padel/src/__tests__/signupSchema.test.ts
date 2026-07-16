import { describe, expect, it } from 'vitest';
import { normalizeSignUpValues, validateSignUp, type SignUpFormValues } from '../auth/signup.schema';

const valid = (overrides: Partial<SignUpFormValues> = {}): SignUpFormValues => ({
  firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com', password: 'password1', passwordConfirmation: 'password1', acceptedTerms: true, marketingConsent: false, ...overrides,
});

describe('validateSignUp', () => {
  it('richiede tutti i campi obbligatori e i termini', () => {
    const errors = validateSignUp(valid({ firstName: '', lastName: '', email: '', password: '', passwordConfirmation: '', acceptedTerms: false }));
    expect(errors).toMatchObject({ firstName: 'Inserisci il nome.', lastName: 'Inserisci il cognome.', email: 'Inserisci un indirizzo email valido.', acceptedTerms: 'Devi accettare le condizioni d’uso.' });
  });
  it('rifiuta nome corto, email non valida, password debole e conferma diversa', () => {
    const errors = validateSignUp(valid({ firstName: 'A', email: 'mario@', password: 'solotesto', passwordConfirmation: 'diversa' }));
    expect(errors.firstName).toContain('2 a 80'); expect(errors.email).toContain('valido'); expect(errors.password).toContain('una lettera e un numero'); expect(errors.passwordConfirmation).toBe('Le password non coincidono.');
  });
  it('normalizza nomi ed email e lascia facoltativo il marketing', () => {
    const values = normalizeSignUpValues(valid({ firstName: '  Mario ', lastName: ' Rossi  ', email: ' MARIO@EXAMPLE.COM ', marketingConsent: false }));
    expect(values).toMatchObject({ firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com', marketingConsent: false });
    expect(validateSignUp(values)).toEqual({});
  });
});
