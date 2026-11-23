import { useId, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useLogin, useRegister } from '../hooks/useAuthMutations';
import { retryBootstrapAuth } from '../services/auth.service';
import {
  authSubmitErrorMessage,
  validateAuthFields,
  type AuthFieldErrors,
  type AuthFieldName,
  type AuthMode,
} from '../utils/auth-form.utils';
import { authPageLink, authReturnTo } from '../utils/auth-navigation.utils';

const inputClass =
  'mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [search] = useSearchParams();
  const returnTo = authReturnTo(search.get('returnTo'));
  const auth = useAuth();
  const login = useLogin();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const busy = login.isPending || register.isPending;
  const unavailable = busy || auth.status === 'loading';
  const isRegister = mode === 'register';

  if (auth.status === 'authenticated') return <Navigate to={returnTo} replace />;

  function clearError(field: AuthFieldName) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable) return;
    setSubmitError('');

    const fieldErrors = validateAuthFields(mode, { email, password, displayName });
    setErrors(fieldErrors);
    const firstInvalid = (['displayName', 'email', 'password'] as const).find(
      (field) => fieldErrors[field],
    );
    if (firstInvalid) {
      ({ email: emailRef, password: passwordRef, displayName: displayNameRef })[
        firstInvalid
      ].current?.focus();
      return;
    }

    try {
      if (mode === 'login') {
        await login.mutateAsync({ email: email.trim(), password });
      } else {
        await register.mutateAsync({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
        });
      }
      // useAuth publishes the new session; authenticated form redirects via Navigate.
    } catch (failure) {
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      const code = axios.isAxiosError(failure)
        ? (failure.response?.data as { error?: { code?: string } } | undefined)?.error?.code
        : undefined;
      setSubmitError(authSubmitErrorMessage(mode, status, code));
    }
  }

  const emailErrorId = `${id}-email-error`;
  const passwordErrorId = `${id}-password-error`;
  const passwordHintId = `${id}-password-hint`;
  const displayNameErrorId = `${id}-name-error`;
  const title = isRegister ? 'Hesap oluştur' : 'Giriş yap';

  return (
    <main className="mx-auto w-full max-w-md px-5 py-12 sm:py-16">
      <section
        className="rounded-2xl border border-border bg-card p-6 shadow-lg shadow-black/10 sm:p-8"
        aria-labelledby={`${id}-heading`}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">StreamLab</p>
        <h1 id={`${id}-heading`} className="mt-3 text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isRegister
            ? 'İçeriklerini yönetmek için hesabını oluştur.'
            : 'İçerik paneline erişmek için hesabınla devam et.'}
        </p>

        {auth.status === 'loading' && (
          <p role="status" className="mt-5 text-sm text-muted-foreground">
            Oturum kontrol ediliyor…
          </p>
        )}
        {auth.status === 'error' && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            Oturum sunucusuna ulaşılamadı.{' '}
            <button
              type="button"
              onClick={() => void retryBootstrapAuth()}
              className="font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Yeniden dene
            </button>
          </div>
        )}

        <form
          noValidate
          aria-busy={busy}
          className="mt-7 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          {isRegister && (
            <div>
              <label htmlFor={`${id}-name`} className="block text-sm font-medium">
                Görünen ad
              </label>
              <input
                id={`${id}-name`}
                ref={displayNameRef}
                type="text"
                name="displayName"
                autoComplete="name"
                maxLength={100}
                required
                disabled={unavailable}
                value={displayName}
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={errors.displayName ? displayNameErrorId : undefined}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  clearError('displayName');
                }}
                className={inputClass}
              />
              {errors.displayName && (
                <p id={displayNameErrorId} className="mt-1 text-sm text-destructive">
                  {errors.displayName}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor={`${id}-email`} className="block text-sm font-medium">
              E-posta
            </label>
            <input
              id={`${id}-email`}
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={255}
              required
              disabled={unavailable}
              value={email}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? emailErrorId : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                clearError('email');
              }}
              className={inputClass}
            />
            {errors.email && (
              <p id={emailErrorId} className="mt-1 text-sm text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${id}-password`} className="block text-sm font-medium">
              Şifre
            </label>
            <div className="relative">
              <input
                id={`${id}-password`}
                ref={passwordRef}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 12 : 1}
                maxLength={128}
                required
                disabled={unavailable}
                value={password}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  [isRegister ? passwordHintId : null, errors.password ? passwordErrorId : null]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearError('password');
                }}
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                disabled={unavailable}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
            {isRegister && (
              <p id={passwordHintId} className="mt-1 text-xs text-muted-foreground">
                12–128 karakter kullan.
              </p>
            )}
            {errors.password && (
              <p id={passwordErrorId} className="mt-1 text-sm text-destructive">
                {errors.password}
              </p>
            )}
          </div>

          {submitError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
            >
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={unavailable}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {busy ? 'İşleniyor…' : isRegister ? 'Kayıt ol' : 'Giriş yap'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isRegister ? 'Zaten hesabın var mı? ' : 'Hesabın yok mu? '}
          <Link
            className="font-semibold text-sky-400 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            to={authPageLink(isRegister ? 'login' : 'register', returnTo)}
          >
            {isRegister ? 'Giriş yap' : 'Kayıt ol'}
          </Link>
        </p>
      </section>
    </main>
  );
}
