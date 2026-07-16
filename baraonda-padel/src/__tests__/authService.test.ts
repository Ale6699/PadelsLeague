import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../auth/auth.service';

const clientWithSignUp = (result: unknown) => {
  const signUp = vi.fn().mockResolvedValue(result);
  return { client: { auth: { signUp } } as any, signUp };
};

const input = { firstName: ' Mario ', lastName: ' Rossi ', email: ' MARIO@EXAMPLE.COM ', password: 'password1', acceptedTerms: true, marketingConsent: false };

describe('AuthService.signUp', () => {
  it('normalizza email, passa metadati e callback di conferma', async () => {
    const { client, signUp } = clientWithSignUp({ data: { user: { id: 'user-1' }, session: null }, error: null });
    const result = await createAuthService(client, 'http://localhost:5173').signUp(input);
    expect(result.requiresEmailConfirmation).toBe(true);
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'mario@example.com', password: 'password1', options: expect.objectContaining({ emailRedirectTo: 'http://localhost:5173/auth/confirm', data: expect.objectContaining({ first_name: 'Mario', last_name: 'Rossi', accepted_terms: true, marketing_consent: false }) }) }));
  });
  it('supporta la sessione immediata quando la conferma email è disattivata', async () => {
    const session = { access_token: 'token', user: { id: 'user-1' } };
    const { client } = clientWithSignUp({ data: { user: session.user, session }, error: null });
    await expect(createAuthService(client, 'http://localhost:5173').signUp(input)).resolves.toMatchObject({ session, requiresEmailConfirmation: false });
  });
  it.each([
    ['rate limit exceeded', 'too_many_requests'], ['Signups not allowed for this instance', 'signup_disabled'], ['Failed to fetch', 'network_error'],
  ])('mappa %s senza esporre dettagli tecnici', async (message, code) => {
    const { client } = clientWithSignUp({ data: { user: null, session: null }, error: new Error(message) });
    await expect(createAuthService(client, 'http://localhost:5173').signUp(input)).rejects.toMatchObject({ code });
  });
});

describe('AuthService.resendConfirmation', () => {
  it('normalizza email e riusa il redirect autorizzato', async () => {
    const resend = vi.fn().mockResolvedValue({ error: null });
    await createAuthService({ auth: { resend } } as any, 'https://app.example.com').resendConfirmation(' USER@EXAMPLE.COM ');
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'user@example.com', options: { emailRedirectTo: 'https://app.example.com/auth/confirm' } });
  });
});
