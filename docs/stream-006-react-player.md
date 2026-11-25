# STREAM-006.3 — React HLS player

- The `/watch/:videoId` route reads video metadata with the existing `useVideoDetail` query.
- For `READY` videos, `usePlayback` obtains a short-lived manifest URL using the existing authenticated Axios client. The query is keyed by video and user and is not persisted.
- The HTML `<video>` element uses native HLS when available (Safari). Otherwise hls.js is lazy-loaded and attached to the element; the hls.js instance is destroyed and the video source removed on unmount.
- Built-in HTML video controls provide baseline play/pause, seeking and volume. Explicit quality selection and advanced player controls belong to STREAM-006.4/006.5.
- Playback token refresh during long sessions belongs to STREAM-006.6. The current 15-minute server token can expire during extended playback; do not treat this stage as production-ready for long sessions.
- S3/MinIO browser-reachable endpoint and bucket CORS must be configured separately. A private bucket remains private.

## Verification

```sh
pnpm install --no-frozen-lockfile
pnpm install --frozen-lockfile
pnpm --filter @streamlab/contracts build
pnpm --filter @streamlab/web test:playback
pnpm --filter @streamlab/web typecheck
pnpm lint
pnpm format:check
```

For a browser smoke test, navigate to `/watch/<ready-video-id>` and inspect the network: the playback API responds with a capability URL; master/variant `.m3u8` requests and `.ts` requests succeed without revealing storage credentials. Verify Safari native playback and a browser using hls.js separately. Ensure cleanup when navigating away.
