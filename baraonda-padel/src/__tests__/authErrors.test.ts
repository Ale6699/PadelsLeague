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
});
