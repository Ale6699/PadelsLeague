import type { Session, User } from '@supabase/supabase-js';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { authService, getAppBaseUrl, type ProfileUpdateInput, type SignUpInput, type SignUpResult, type UserProfile } from './auth.service';

export type AuthContextValue = {
  user: User | null; session: Session | null; profile: UserProfile | null; loading: boolean; isAuthenticated: boolean;
  signIn(email: string, password: string): Promise<void>; signUp(input: SignUpInput): Promise<SignUpResult>; signOut(): Promise<void>;
  resendConfirmation(email: string): Promise<void>; sendPasswordReset(email: string): Promise<void>; updatePassword(password: string): Promise<void>;
  reloadProfile(): Promise<void>; updateProfile(input: ProfileUpdateInput): Promise<void>;
};
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (nextSession: Session | null, ensure = false) => {
    if (!nextSession?.user || !isSupabaseConfigured) { setProfile(null); return; }
    if (ensure) await authService.ensureProfile();
    setProfile(await authService.loadProfile(nextSession.user.id));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    let active = true;
    void authService.getSession().then(async value => {
      if (!active) return; setSession(value);
      try { await loadProfile(value, Boolean(value)); } catch { if (active) setProfile(null); }
    }).catch(() => { if (active) { setSession(null); setProfile(null); } }).finally(() => { if (active) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return; setSession(nextSession); setLoading(false);
      window.setTimeout(() => { if (active) void loadProfile(nextSession, Boolean(nextSession)).catch(() => setProfile(null)); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [loadProfile]);

  const reloadProfile = useCallback(async () => { await loadProfile(session, Boolean(session)); }, [loadProfile, session]);
  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null, session, profile, loading,
    isAuthenticated: !isSupabaseConfigured || Boolean(session?.user),
    async signIn(email, password) { const next = await authService.signIn(email, password); setSession(next); await loadProfile(next, true); },
    async signUp(input) { const result = await authService.signUp(input); if (result.session) { setSession(result.session); await loadProfile(result.session, true); } return result; },
    async signOut() { try { await authService.signOut(); } finally { setSession(null); setProfile(null); } },
    resendConfirmation: email => authService.resendConfirmation(email),
    sendPasswordReset: email => authService.sendPasswordReset(email, `${getAppBaseUrl()}/reset-password`),
    updatePassword: password => authService.updatePassword(password), reloadProfile,
    async updateProfile(input) { setProfile(await authService.updateProfile(input)); },
  }), [loadProfile, loading, profile, reloadProfile, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
