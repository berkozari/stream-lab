import { Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useLogout } from '../hooks/useAuthMutations';

export function AuthHeaderActions() {
  const auth = useAuth();
  const logout = useLogout();
  if (auth.status === 'loading' || auth.status === 'error') return null;
  if (auth.status !== 'authenticated') {
    return (
      <Link
        to="/login"
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
      >
        Giriş yap
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-32 truncate text-muted-foreground sm:inline">
        {auth.user?.displayName}
      </span>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="rounded-lg border border-border px-3 py-2 disabled:opacity-60"
      >
        Çıkış
      </button>
      {logout.isError && (
        <span role="alert" className="text-red-400">
          Çıkış yapılamadı
        </span>
      )}
    </div>
  );
}
