# STREAM-006.6B — Playback security and performance review

Changes in this installer:

1. Limit concurrent HLS segment URL presigning to 12 promises instead of one per segment. Preserve segment order, token expiry and media path checks.
2. Lazy-load `/watch/:videoId` route (hls.js was already dynamically loaded) to reduce initial application bundle work.
3. Add isolated tests for ordering, concurrency limits and error propagation.

**Not changed:** storage bucket visibility, authorization, playback capability TTL, signed URL TTL, HTTP security headers, other API routes.

## Security tradeoff to verify before production

Variant playlists currently contain presigned S3 URLs valid for up to the remaining capability lifetime (capped at 900 seconds). Changing a video's visibility does not immediately revoke an already issued presigned S3 URL. This is an explicit bounded revocation window, not equivalent to per-segment API authorization. Review the acceptable TTL and media-delivery architecture before production.

Verify `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, and query string redaction in API request logs. Never share `token=` or `X-Amz-Signature=` values from browser Network logs.

## Local verification

```bash
node --experimental-strip-types --test apps/api/tests/unit/hls-segment-signing.test.mjs
pnpm --filter @streamlab/api test:playback
pnpm --filter @streamlab/web test:playback
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @streamlab/web build
ls -lh apps/web/dist/assets/*.js
```

Then run a long READY video through normal playback, seek, manual quality selection, and 60-second token renewal checks. No production or database mutation is required.
