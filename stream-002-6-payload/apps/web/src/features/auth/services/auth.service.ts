import axios from 'axios';
import type {
  AuthSessionResponse,
  AuthUser,
  CsrfTokenResponse,
  LoginRequest,
  RegisterRequest,
} from '@streamlab/contracts';
import { axiosInstance } from '@/lib/axios';
import { apiClient } from '@/services/api/api-client';
import { setAnonymous, setAuthenticated, setBootstrapError } from './auth-state';
import { singleFlight } from '../utils/auth.utils';

type Success<T> = { success: true; data: T };

async function csrfToken(): Promise<string> {
  const { data } = await axiosInstance.get<CsrfTokenResponse>('/auth/csrf');
  return data.data.csrfToken;
}

async function postWithCsrf<T>(path: string, body?: unknown): Promise<T> {
  // The backend rotates its HttpOnly CSRF context after each auth mutation.
  // Request a new matching token/cookie pair for every auth mutation.
  const csrf = await csrfToken();
  const { data } = await axiosInstance.post<Success<T>>(path, body, {
    headers: { 'x-csrf-token': csrf },
  });
  return data.data;
}

let pendingRefresh: Promise<string> | null = null;
let loggingOut = false;

const runRefresh = singleFlight(async (): Promise<string> => {
  try {
    const session = await postWithCsrf<AuthSessionResponse>('/auth/refresh');
    setAuthenticated(session);
    return session.accessToken;
  } catch (error) {
    // An invalid refresh cookie means no authenticated session remains.
    // A network/5xx error is not proof of logout; bootstrap handles it separately.
    if (axios.isAxiosError(error) && error.response?.status === 401) setAnonymous();
    throw error;
  }
});

function refresh(): Promise<string> {
  if (loggingOut) return Promise.reject(new Error('Logout in progress'));
  const work = runRefresh();
  pendingRefresh = work;
  void work
    .finally(() => {
      if (pendingRefresh === work) pendingRefresh = null;
    })
    .catch(() => undefined);
  return work;
}

let bootstrapPromise: Promise<void> | null = null;

export function bootstrapAuth(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = refresh().then(
      () => undefined,
      (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          setAnonymous();
        } else {
          setBootstrapError();
        }
      },
    );
  }
  return bootstrapPromise;
}

/** Allow an explicit retry after initial network failure, without concurrent bootstraps. */
export function retryBootstrapAuth(): Promise<void> {
  bootstrapPromise = null;
  return bootstrapAuth();
}

export const authService = {
  async login(input: LoginRequest): Promise<AuthSessionResponse> {
    const session = await postWithCsrf<AuthSessionResponse>('/auth/login', input);
    setAuthenticated(session);
    return session;
  },
  async register(input: RegisterRequest): Promise<AuthSessionResponse> {
    const session = await postWithCsrf<AuthSessionResponse>('/auth/register', input);
    setAuthenticated(session);
    return session;
  },
  refresh,
  async logout(): Promise<void> {
    // Block new refreshes while revoking the current cookie.
    loggingOut = true;
    try {
      if (pendingRefresh) {
        try {
          await pendingRefresh;
        } catch {
          /* Logout remains idempotent. */
        }
      }
      const csrf = await csrfToken();
      await axiosInstance.post('/auth/logout', undefined, { headers: { 'x-csrf-token': csrf } });
      setAnonymous();
    } finally {
      loggingOut = false;
    }
  },
  async currentUser(signal?: AbortSignal): Promise<AuthUser> {
    const result = await apiClient.get<Success<AuthUser>>('/users/me', { signal });
    return result.data;
  },
};
