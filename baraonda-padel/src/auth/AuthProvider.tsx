import { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { authService } from './auth.service';

export type AuthContextValue = { user: User | null; session: Session | null; loading: boolean; isAuthenticated: boolean; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>; sendPasswordReset: (email: string) => Promise<void>; updatePassword: (password: string) => Promise<void> };
export const AuthContext = createContext<AuthContextValue | null>(null);
const appUrl = () => import.meta.env.VITE_APP_URL || window.location.origin;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    let active = true;
    void authService.getSession().then(value => { if (active) setSession(value); }).catch(() => { if (active) setSession(null); }).finally(() => { if (active) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (active) { setSession(nextSession); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null, session, loading,
    // The local provider intentionally stays usable as an offline demo.
    isAuthenticated: !isSupabaseConfigured || Boolean(session?.user),
    async signIn(email, password) { const next = await authService.signIn(email, password); setSession(next); },
    async signOut() { try { await authService.signOut(); } finally { setSession(null); } },
    sendPasswordReset: email => authService.sendPasswordReset(email, `${appUrl()}/reset-password`),
    updatePassword: password => authService.updatePassword(password),
  }), [loading, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
