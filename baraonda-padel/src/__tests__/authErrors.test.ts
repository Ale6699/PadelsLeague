import { describe, expect, it } from 'vitest';
import { mapAuthError } from '../auth/auth.errors';

describe('mapAuthError', () => {
  it('does not expose technical invalid-login messages', () => {
    const error = mapAuthError(new Error('Invalid login credentials'));
    expect(error.code).toBe('invalid_credentials');
    expect(error.message).toBe('Email o password non corrette.');
  });
  it('maps rate limits and expired links to actionable Italian messages', () => {
    expect(mapAuthError(new Error('rate limit exceeded')).code).toBe('too_many_requests');
    expect(mapAuthError(new Error('OTP expired')).code).toBe('expired_link');
  });
  it('maps registration-specific failures', () => {
    expect(mapAuthError(new Error('User already registered')).code).toBe('email_already_registered');
    expect(mapAuthError(new Error('Signups not allowed')).code).toBe('signup_disabled');
    expect(mapAuthError(new Error('Invalid email address')).code).toBe('invalid_email');
  });
});
