# STREAM-007.7 — First publication state fix

## Root cause

Original `Video` records are created `DRAFT`/`PRIVATE` with `publishedAt=null`.
The transcode worker transitions status to `READY` but does not publish them.
The creator UI disabled visibility editing until `publishedAt` was set, while the
backend rejected first visibility changes when `publishedAt=null`. Public
listing, correctly, requires `READY`, `PUBLIC`, `publishedAt != null`, `deletedAt=null`.
As a result, a regular user could not publish a freshly transcoded video.

## Resolution

- An owner may explicitly set a `READY` video to `PUBLIC` or `UNLISTED`.
- On first publication only, set `publishedAt` within the existing transaction.
- Re-publication retains the original publication timestamp.
- Existing `READY` guard is kept in `updateMany`, to prevent transcoding/deletion races.
- Creator UI offers visibility selection for `READY` videos, even before first publication.
- No automatic publication when transcoding completes; private-by-default remains.
- No migration or new dependency.

## Manual smoke

1. Upload a video, wait until `READY`; verify it remains `PRIVATE`.
2. Creator -> Edit -> visibility `PUBLIC` -> Save; verify response has non-null `publishedAt`.
3. Open `/` with all search/category filters cleared; public video must show.
4. Switch back to `PRIVATE`; it must leave the public list.
5. For a `DRAFT` or `PROCESSING` video, public option must not be available; direct API request should be rejected with HTTP 409.
6. `UNLISTED` video must be playable via direct URL but not appear in public discovery.
7. Re-publish READY video and verify initial `publishedAt` is preserved.

Note: this fix cannot infer an original publish date for records manually set to
PUBLIC in the database without a timestamp. Re-save such a READY video as PUBLIC
through the creator UI; avoid mass SQL updates in environments holding real content.
