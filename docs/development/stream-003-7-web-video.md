# STREAM-003.7 — React Video Management API & Hooks

This milestone adds a feature-based client layer without changing Creator pages yet.

## Components

- `features/videos/services/video-client.ts`: pure injectable HTTP adapter for testability; validates request inputs and response envelopes using shared contracts
- `features/videos/services/video.service.ts`: production adapter that reuses `@/lib/axios` with memory-only JWT and safe GET retry
- `features/videos/utils/video-query.utils.ts`: shared Zod query parsing, safe `URLSearchParams` encoding
- `features/videos/hooks/video.keys.ts`: canonical query keys; private lists are owner-scoped
- `features/videos/hooks/useVideoQueries.ts`: public discovery, current-owner videos, video detail; infinite cursor pagination
- `features/videos/hooks/useVideoMutations.ts`: create, update and soft-delete; list invalidation and detail cache maintenance

## Examples

```tsx
const publicVideos = usePublicVideos({ q: 'React', limit: 12 });
const mine = useMyVideos({ limit: 12 });
const detail = useVideoDetail(videoId);
const create = useCreateVideo();
const update = useUpdateVideo();
const remove = useDeleteVideo();

// Fetch next page, if available:
if (mine.hasNextPage) void mine.fetchNextPage();

// Video items are mine.data?.pages.flatMap((page) => page.items) ?? []
// mutations: create.mutate({ title: 'My video' });
// update.mutate({ videoId, data: { title: 'New title' } });
// remove.mutate(videoId);
```

## Security and caching

- No access JWT is stored in browser storage; the existing Axios auth interceptor handles requests.
- POST/PATCH/DELETE requests are **never automatically retried** by the auth interceptor.
- Backend validates ownership; frontend route guards and cache keys are not authorization controls.
- `useMyVideos` is disabled until authentication completes; its query key includes `userId`.
- Existing login/register/logout flows clear the TanStack Query cache. A successful delete also removes the video detail cache.
- Use cursor pagination with `fetchNextPage()`; the cursor is **not** part of the infinite-query cache key.
- UI integration remains in STREAM-003.8. E2E coverage is STREAM-003.9.

## Verification

```bash
pnpm format
pnpm verify:web:video
pnpm test:web:video
pnpm check
```

No Prisma migration or new dependency is required.
