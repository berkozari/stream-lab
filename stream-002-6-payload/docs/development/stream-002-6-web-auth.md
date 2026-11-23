# STREAM-002.6 — React Authentication Foundation

## Behavior

- Access JWT exists in memory only (`auth-state.ts`); never localStorage/sessionStorage.
- Refresh is via HttpOnly cookie. Browser bootstraps by POST /auth/refresh; 401 becomes anonymous.
- GET /auth/csrf is called before every auth mutation because the API rotates its CSRF context after login/register/refresh/logout.
- Concurrent refresh calls share a single promise. Axios retries failed authenticated GET/HEAD once, with a fresh Bearer token. It deliberately does not automatically replay POST/PATCH/DELETE requests.
- Creator routes are protected in React Router; backend enforces authorization independently.
- TanStack Query caches `/users/me` only while authenticated, and is cleared after login/logout/register to avoid cross-account cache exposure.
- React StrictMode may run effects twice. `bootstrapAuth()` memoizes its initial refresh promise.
- Local Vite proxy on `/api` provides same-origin API calls; production deployment must serve auth calls and cookies on a compatible origin.

## Run

```bash
pnpm install
pnpm format
pnpm verify:web:auth
pnpm test:web:auth
pnpm check
pnpm dev:api
# separate terminal
pnpm dev:web
```

## Browser acceptance

1. Anonymous `/creator` redirects to `/login?returnTo=%2Fcreator`.
2. Login redirects back to `/creator` and displays the user's name in the header.
3. Reloading `/creator` recovers the session via the refresh cookie without localStorage.
4. Logout revokes that session and redirects to login; refresh/reload does not resurrect the session.
5. Register creates a session and allows `/creator`.
6. With browser DevTools, verify refresh cookie is HttpOnly, access JWT is not in localStorage, and concurrent GET 401s produce one refresh request.

Note: Password/reset UI, React Hook Form + Zod form ergonomics, role-aware UI and richer component tests can be covered in a follow-up. Server-side permission checks are the final authority.
