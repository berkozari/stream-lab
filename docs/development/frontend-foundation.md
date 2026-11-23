# StreamLab Frontend Foundation — STREAM-001.7

**Architecture:** feature-based React/Vite app. API stays in `apps/api/src/{routes,controllers,services,repositories,...}`. `apps/worker` remains independent.

## Conventions

- `app/providers`: BrowserRouter and QueryClientProvider lifecycle
- `app/router`: Declarative React Router v7 routes
- `layout`: page shells; `components/layout`: building blocks (Header, Sidebar)
- `features/<domain>/{components,hooks,services,schemas,types,utils}`: create only directories in actual use
- `pages/<domain>`: route composition, not business logic
- `services/api`: HTTP utilities, `lib/axios`: configured Axios singleton
- TanStack Query stores server state. Zustand is deferred until there's genuine global _client_ state.
- The health endpoint returns a **direct** `HealthResponse`, not `{ success: true, data }`; avoid an incorrect global unwrap interceptor.
- `/creator` is a **UI placeholder** and deliberately unauthenticated. STREAM-002 must introduce both frontend guard and API authorization. A UI guard alone is not security.
- HLS player, upload controls, auth flow and video feed are **not** implemented yet.

## shadcn/ui

Compatible `components.json`, Tailwind v4 theme variables and `@/` alias are included. To install the official Button component, after `pnpm install`, run from the repository root:

```sh
pnpm dlx shadcn@latest add button -c apps/web
```

Review changes to `apps/web/src/index.css` / `components.json` produced by the CLI, then run `pnpm format && pnpm check`. No unofficial hand-written substitute is provided. The base scaffold functions without the Button component.

## API connection

In dev, Vite forwards `/api/*` to `http://localhost:4000`. `src/lib/axios.ts` defaults to `/api/v1`. `VITE_API_BASE_URL` is available when the production API is on another origin. With `withCredentials: true` a future cookie-based session can be supported, but the API's CORS/cookie/CSRF policies must be configured before enabling cross-origin auth.

Use the browser at `http://127.0.0.1:5173` (consistent with `vite --host 127.0.0.1`). `pnpm dev` starts API and Web together, and worker remains scaffold-only.
