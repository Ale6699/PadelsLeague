import { Session } from '@supabase/supabase-js';
import { requireSupabase } from '../lib/supabase';
import { mapAuthError } from './auth.errors';

export interface AuthService {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}

export const authService: AuthService = {
  async getSession() { const { data, error } = await requireSupabase().auth.getSession(); if (error) throw mapAuthError(error); return data.session; },
  async signIn(email, password) { const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password }); if (error || !data.session) throw mapAuthError(error); return data.session; },
  async signOut() { const client = requireSupabase(); const { error } = await client.auth.signOut(); if (error) { await client.auth.signOut({ scope: 'local' }); throw mapAuthError(error); } },
  async sendPasswordReset(email, redirectTo) { const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo }); if (error) throw mapAuthError(error); },
  async updatePassword(password) { const { error } = await requireSupabase().auth.updateUser({ password }); if (error) throw mapAuthError(error); },
};
