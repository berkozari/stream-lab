# STREAM-006.2 — Playback API

The media bucket stays private. Frontend requests playback metadata using the existing
REST API; do not expose S3 credentials or original object keys.

## Environment (API)

Generate a dedicated secret: `openssl rand -base64 48`, and add it to the **untracked** root `.env`:

```
PLAYBACK_SIGNING_SECRET=<independent random secret, at least 32 bytes>
PLAYBACK_PUBLIC_BASE_URL=http://localhost:4000
PLAYBACK_S3_PUBLIC_ENDPOINT=http://127.0.0.1:9000
# optional, defaults to 900 seconds, maximum 3600 seconds
PLAYBACK_TOKEN_TTL_SECONDS=900
```

These origins must be reachable by the browser. For production they must use HTTPS, and both
origin variables must be explicitly configured. Do not use Docker-internal `minio:9000`
as the public endpoint. The S3_PUBLIC endpoint must route to the same bucket/object data as
`S3_ENDPOINT`. Configure **private bucket CORS** to allow the React origin to GET/HEAD the
signed objects and relevant response headers; **do not make the bucket public**.

## Routes

- `GET /api/v1/videos/:videoId/playback` — optional `Authorization: Bearer …` and the
  existing active-session check. Returns `{success:true,data:{videoId,protocol:'HLS',manifestUrl,expiresAt}}`.
  Anonymous guests can watch only published `READY` `PUBLIC` or `UNLISTED` videos.
  `PRIVATE` requires owner or admin. Non-ready owner/admin gets `409`, hidden videos `404`.
- `GET /api/v1/videos/:videoId/playback/hls/master.m3u8?token=…` — signed capability.
  Master manifest generated from committed renditions, each variant URL scoped to the token.
- `GET /api/v1/videos/:videoId/playback/hls/:label/index.m3u8?token=…` — reads private
  S3 playlist and rewrites trusted segment lines into capability-protected API URLs.
- `GET /api/v1/videos/:videoId/playback/hls/:label/:segment?token=…` — validates the
  token, version, active visibility and committed rendition, then `302` to a fresh
  **60-second** presigned S3 GET URL. The API never proxies segment bytes.

Tokens are time-limited bearer capabilities. Never log them, store them persistently,
add them to analytics URLs or embed them in social previews. HTTP request logging strips
query strings. Additional edge-proxy access logs must do the same. Playlists and redirect
responses use `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.
A token cannot mint another token. Session logout/role revocation does **not** immediately
revoke an already-issued playback capability; maximum exposure is the configured TTL.
Visibility/version/status changes are checked on each media request.

## Remaining (STREAM-006.3–006.6)

- React + hls.js and Safari native HLS fallback.
- Refresh capability before expiry for long VOD playback and retries on expiry.
- Browser CORS, redirect and manual quality E2E testing, production edge/CDN design.
- Add explicit OpenAPI specification for media URLs and response MIME types.

Run API unit/HTTP tests with `pnpm --filter @streamlab/api test:playback` and existing
`pnpm --filter @streamlab/api test:video:read` regression.
