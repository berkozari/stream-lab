# STREAM-003.6 — Delete Video & Ownership Authorization

## Design

- `DELETE /api/v1/videos/:videoId`, bearer JWT + live session required.
- `202 {"success":true,"data":{"status":"DELETING"}}` on first successful owner request.
- Atomic `updateMany` with `id`, `ownerId`, `deletedAt:null`, `status != DELETING`.
- Set `status=DELETING`, `visibility=PRIVATE`, `deletedAt=now`, without hard-deleting metadata.
- Missing/foreign/already deleted videos return indistinguishable 404 responses.
- Existing public, owner-list, detail and PATCH queries already filter `deletedAt:null`.
- **IMPORTANT:** S3 objects, renditions, uploads and related DB rows are **not physically removed** in this milestone. Deferred background cleanup is future work; do not promise it is scheduled by a queue yet.
- No migration or new dependencies needed.

## Install

1. Commit your project changes, unzip the patch **without overwriting** existing files, then run `node apply-stream-003-6.mjs` from the repository root.
2. `pnpm format`
3. `pnpm verify:video:delete && pnpm test:video:delete && pnpm check`
4. Start infra and API, then run `pnpm smoke:video:delete`.
5. After successful tests, remove `stream-003-6-payload`, `apply-stream-003-6.mjs` and this install note if desired. **Do not remove your source or test files.**

## Expected smoke output

`PASS: owner-only DELETE 202 -> DELETING/soft delete -> public/mine/detail 404 -> repeat 404 -> related records retained`

## Next milestone

STREAM-003.7 Web Video Management API & Hooks. Physical object deletion belongs to a later background-job/storage lifecycle milestone; verify worker code checks `deletedAt` before processing.
