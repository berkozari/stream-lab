import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useLogin, useRegister } from '../hooks/useAuthMutations';
import { safeReturnTo } from '../utils/auth.utils';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [search] = useSearchParams();
  const returnTo = safeReturnTo(search.get('returnTo'));
  const navigate = useNavigate();
  const auth = useAuth();
  const login = useLogin();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const busy = login.isPending || register.isPending;

  if (auth.status === 'authenticated') return <Navigate to={returnTo} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (mode === 'login') {
        await login.mutateAsync({ email: email.trim(), password });
      } else {
        await register.mutateAsync({
          email: email.trim(),
          displayName: displayName.trim(),
          password,
        });
      }
      navigate(returnTo, { replace: true });
    } catch (failure) {
      if (axios.isAxiosError(failure)) {
        const code = (failure.response?.data as { error?: { code?: string } } | undefined)?.error
          ?.code;
        if (code === 'INVALID_CREDENTIALS') {
          setError('E-posta veya şifre hatalı.');
          return;
        }
        if (code === 'EMAIL_ALREADY_EXISTS') {
          setError('Bu e-posta adresi zaten kayıtlı.');
          return;
        }
      }
      setError('İşlem tamamlanamadı. Lütfen tekrar dene.');
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <section className="rounded-2xl border border-border bg-card p-8">
        <h1 className="text-2xl font-semibold">
          {mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">StreamLab hesabınla devam et.</p>
        <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
          {mode === 'register' && (
            <label className="block text-sm">
              Görünen ad
              <input
                autoComplete="name"
                required
                maxLength={100}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2"
              />
            </label>
          )}
          <label className="block text-sm">
            E-posta
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Şifre
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 12 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || auth.status === 'loading'}
            className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? 'İşleniyor…' : mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === 'login' ? 'Hesabın yok mu? ' : 'Zaten hesabın var mı? '}
          <Link className="text-sky-400 underline" to={mode === 'login' ? '/register' : '/login'}>
            {mode === 'login' ? 'Kayıt ol' : 'Giriş yap'}
          </Link>
        </p>
      </section>
    </main>
  );
}
