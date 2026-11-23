import { Navigate, Outlet, useLocation } from 'react-router';
import { retryBootstrapAuth } from '../services/auth.service';
import { useAuth } from '../hooks/useAuth';
import { protectedLoginLink } from '../utils/auth-navigation.utils';

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
      <main className="mx-auto max-w-lg space-y-4 p-8 text-center" role="alert">
        <h1 className="text-xl font-semibold">Oturum doğrulanamadı</h1>
        <p className="text-muted-foreground">
          Sunucuya şu anda ulaşılamıyor. Bağlantını kontrol edip yeniden dene.
        </p>
        <button
          type="button"
          onClick={() => void retryBootstrapAuth()}
          className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Yeniden dene
        </button>
      </main>
    );
  }
  if (auth.status !== 'authenticated') {
    return <Navigate to={protectedLoginLink(location.pathname, location.search)} replace />;
  }
  return <Outlet />;
}
