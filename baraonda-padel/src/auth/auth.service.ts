import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { requireSupabase } from '../lib/supabase';
import { mapAuthError } from './auth.errors';

export type SignUpInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
  marketingConsent: boolean;
  captchaToken?: string;
};

export type SignUpResult = { user: User | null; session: Session | null; requiresEmailConfirmation: boolean };
export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  acceptedTermsAt: string | null;
  marketingConsent: boolean;
  termsVersion: string | null;
  privacyVersion: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ProfileUpdateInput = Pick<UserProfile, 'firstName' | 'lastName' | 'marketingConsent'>;

export interface AuthService {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  resendConfirmation(email: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  loadProfile(userId: string): Promise<UserProfile | null>;
  ensureProfile(): Promise<void>;
  updateProfile(input: ProfileUpdateInput): Promise<UserProfile>;
}

export const getAppBaseUrl = () => (import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
const profileFromRow = (row: Record<string, unknown>): UserProfile => ({
  id: String(row.id), firstName: String(row.first_name ?? ''), lastName: String(row.last_name ?? ''),
  acceptedTermsAt: row.accepted_terms_at ? String(row.accepted_terms_at) : null,
  marketingConsent: Boolean(row.marketing_consent), termsVersion: row.terms_version ? String(row.terms_version) : null,
  privacyVersion: row.privacy_version ? String(row.privacy_version) : null,
  createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});

export function createAuthService(client: SupabaseClient, baseUrl = getAppBaseUrl()): AuthService {
  const redirectUrl = `${baseUrl}/auth/confirm`;
  return {
    async getSession() { const { data, error } = await client.auth.getSession(); if (error) throw mapAuthError(error); return data.session; },
    async signIn(email, password) { const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (error || !data.session) throw mapAuthError(error); return data.session; },
    async signUp(input) {
      const { data, error } = await client.auth.signUp({
        email: input.email.trim().toLowerCase(), password: input.password,
        options: {
          emailRedirectTo: redirectUrl, captchaToken: input.captchaToken,
          data: {
            first_name: input.firstName.trim(), last_name: input.lastName.trim(), accepted_terms: input.acceptedTerms,
            marketing_consent: input.marketingConsent, terms_version: import.meta.env.VITE_TERMS_VERSION || '1', privacy_version: import.meta.env.VITE_PRIVACY_VERSION || '1',
          },
        },
      });
      if (error) throw mapAuthError(error);
      return { user: data.user, session: data.session, requiresEmailConfirmation: !data.session };
    },
    async resendConfirmation(email) { const { error } = await client.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: redirectUrl } }); if (error) throw mapAuthError(error); },
    async signOut() { const { error } = await client.auth.signOut(); if (error) { await client.auth.signOut({ scope: 'local' }); throw mapAuthError(error); } },
    async sendPasswordReset(email, redirectTo) { const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo }); if (error) throw mapAuthError(error); },
    async updatePassword(password) { const { error } = await client.auth.updateUser({ password }); if (error) throw mapAuthError(error); },
    async loadProfile(userId) {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw mapAuthError(error); return data ? profileFromRow(data as Record<string, unknown>) : null;
    },
    async ensureProfile() { const { error } = await client.rpc('ensure_own_profile'); if (error) throw mapAuthError(error); },
    async updateProfile(input) {
      const { data, error } = await client.from('profiles').update({ first_name: input.firstName.trim(), last_name: input.lastName.trim(), marketing_consent: input.marketingConsent }).select('*').single();
      if (error || !data) throw mapAuthError(error); return profileFromRow(data as Record<string, unknown>);
    },
  };
}

const configured = () => createAuthService(requireSupabase());
export const authService: AuthService = {
  getSession: () => configured().getSession(), signIn: (email, password) => configured().signIn(email, password), signUp: input => configured().signUp(input),
  resendConfirmation: email => configured().resendConfirmation(email), signOut: () => configured().signOut(),
  sendPasswordReset: (email, redirectTo) => configured().sendPasswordReset(email, redirectTo), updatePassword: password => configured().updatePassword(password),
  loadProfile: userId => configured().loadProfile(userId), ensureProfile: () => configured().ensureProfile(), updateProfile: input => configured().updateProfile(input),
};
