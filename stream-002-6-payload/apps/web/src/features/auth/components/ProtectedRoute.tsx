import { Navigate, Outlet, useLocation } from 'react-router';
import { retryBootstrapAuth } from '../services/auth.service';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <main className="p-8 text-center" role="status">
        Oturum kontrol ediliyor…
      </main>
    );
  }
  if (auth.status === 'error') {
    return (
      <main className="mx-auto max-w-lg p-8 text-center" role="alert">
        <p>Oturum sunucusuna ulaşılamadı.</p>
        <button
          type="button"
          onClick={() => void retryBootstrapAuth()}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
        >
          Yeniden dene
        </button>
      </main>
    );
  }
  if (auth.status !== 'authenticated') {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <Outlet />;
}
