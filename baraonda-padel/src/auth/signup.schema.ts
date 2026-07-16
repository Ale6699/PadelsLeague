import type { SignUpInput } from './auth.service';

export type SignUpField = 'firstName' | 'lastName' | 'email' | 'password' | 'passwordConfirmation' | 'acceptedTerms';
export type SignUpFormValues = SignUpInput & { passwordConfirmation: string };
export type SignUpValidationErrors = Partial<Record<SignUpField, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function normalizeSignUpValues(values: SignUpFormValues): SignUpFormValues {
  return {
    ...values,
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim().toLowerCase(),
  };
}

export function validateSignUp(values: SignUpFormValues): SignUpValidationErrors {
  const normalized = normalizeSignUpValues(values);
  const errors: SignUpValidationErrors = {};
  if (!normalized.firstName) errors.firstName = 'Inserisci il nome.';
  else if (normalized.firstName.length < 2 || normalized.firstName.length > 80) errors.firstName = 'Il nome deve contenere da 2 a 80 caratteri.';
  if (!normalized.lastName) errors.lastName = 'Inserisci il cognome.';
  else if (normalized.lastName.length < 2 || normalized.lastName.length > 80) errors.lastName = 'Il cognome deve contenere da 2 a 80 caratteri.';
  if (!normalized.email || !emailPattern.test(normalized.email)) errors.email = 'Inserisci un indirizzo email valido.';
  if (!passwordPattern.test(normalized.password)) errors.password = 'La password deve contenere almeno 8 caratteri, una lettera e un numero.';
  if (normalized.password !== normalized.passwordConfirmation) errors.passwordConfirmation = 'Le password non coincidono.';
  if (!normalized.acceptedTerms) errors.acceptedTerms = 'Devi accettare le condizioni d’uso.';
  return errors;
}

export function firstInvalidSignUpField(errors: SignUpValidationErrors): SignUpField | undefined {
  return (['firstName', 'lastName', 'email', 'password', 'passwordConfirmation', 'acceptedTerms'] as SignUpField[]).find(field => errors[field]);
}
