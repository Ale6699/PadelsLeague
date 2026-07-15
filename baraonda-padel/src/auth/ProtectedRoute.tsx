import { ReactNode, useEffect } from 'react';
import { useAuth } from './useAuth';

const safeRedirect = (path: string) => path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/';
export function redirectPath(path = `${window.location.pathname}${window.location.search}`) { return `/login?redirect=${encodeURIComponent(safeRedirect(path))}`; }
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  useEffect(() => { if (!loading && !isAuthenticated) window.location.replace(redirectPath()); }, [isAuthenticated, loading]);
  if (loading) return <main className="auth-loading">Caricamento sessione…</main>;
  if (!isAuthenticated) return <main className="auth-loading">Reindirizzamento al login…</main>;
  return <>{children}</>;
}
export function getSafeRedirect(value: string | null) { return value ? safeRedirect(value) : '/'; }
