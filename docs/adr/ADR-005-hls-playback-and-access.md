# ADR-005 — HLS playback and authorization

- **Status:** Accepted for MVP
- **Date:** 2026-11-23

## Context

Direct MP4 playback offers limited adaptability. StreamLab requires seekable HTTP video playback with a path to adaptive quality selection.

## Decision

- Source-to-HLS via FFmpeg: first milestone output H.264/AAC, 720p **without upscaling smaller sources**, then 360p/720p/1080p adaptive bitrate depending on source characteristics.
- Generate master and variant playlists, plus media segments; manifest path/version recorded in storage metadata.
- React `features/playback` uses hls.js where supported and HTMLVideoElement native HLS fallback where applicable.
- `GET /api/v1/videos/:id/playback` performs access checks and returns a playback access strategy rather than raw storage credentials.
- Visibility `PUBLIC` is discoverable, `UNLISTED` is non-discoverable but anyone with link can view, `PRIVATE` restricted to owner/authorized admin. `READY` and published/availability conditions apply independently.
- Never expose original assets publicly. Production media origin remains restricted behind CDN. For PRIVATE HLS access, authorize **all** playlist and segment requests via a multi-resource mechanism such as CDN signed cookies or equivalent gateway/path authorization; do not assume signing `master.m3u8` alone secures segments.
- Local MinIO playback/access testing will use an explicit local media gateway/proxy strategy (selected and documented in STREAM-006), never direct public access to private originals.
- Initial scope: no DRM or commercial-grade copyright protection.

## Consequences

HLS manifests contain relative segment paths. CDN CORS/cookies/cache and browser behavior need integration tests. Unlisted URLs are obscurity rather than strong access control.

## Verification

Private media fails for unauthorized users even when its segment URL is known; authorized playback can request master + all segments; public video seeks and plays in supported browsers.

## References

https://github.com/video-dev/hls.js
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-choosing-signed-urls-cookies.html
https://ffmpeg.org/ffmpeg-formats.html
