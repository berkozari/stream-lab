# STREAM-003.8 — Creator Video Management UI

## Scope

- Replaces the placeholder content of the existing protected `/creator` route.
- Reuses `useMyVideos`, `useCreateVideo`, `useUpdateVideo`, `useDeleteVideo` from STREAM-003.7 and existing auth-aware Axios instance.
- Video list with `q` title search (submit-only) and cursor pagination (`Daha fazla yükle`).
- Create video metadata (`DRAFT` + `PRIVATE`) with shared Zod contract validation.
- Edit title/description; edit visibility only for previously published `READY` videos.
- Confirm soft delete using native modal `<dialog>`; backend still enforces ownership.
- Loading, empty, error, pending and success states, plus user-facing error messages.

## Deliberate exclusions

- No video upload, transcoding, HLS playback or publish flow.
- No category selector yet: category discovery API is not available. Create sends `categoryIds: []`; existing metadata categories are **not** overwritten during edit.
- No change to Prisma, backend API, authentication, routing, or storage cleanup.
- E2E end-to-end CRUD/regression coverage will be expanded in STREAM-003.9.

## API expectations

- `GET /api/v1/videos/mine` with `limit=12`, optional `q` and `cursor`.
- `POST /api/v1/videos`, `PATCH /api/v1/videos/:videoId`, `DELETE /api/v1/videos/:videoId`.
- Successful create/update invalidate private and public query lists; delete removes cached detail and invalidates lists.
- Requests inherit memory-only access JWT and safe refresh from the existing shared Axios instance.

## Verification

```bash
pnpm format
pnpm verify:web:video:ui
pnpm test:web:video:ui
pnpm check
pnpm dev:api
pnpm dev:web
```

Manual acceptance: sign in, visit `/creator`, create draft, edit title/description, search, delete with confirmation and verify disappearing from list; refresh page to verify persistence. For READY/published video, visibility selection is available. Confirm unauthorized access still redirects to login. Avoid asserting new videos can be published before upload/processing milestones.
