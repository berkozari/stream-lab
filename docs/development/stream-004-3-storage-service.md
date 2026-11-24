# STREAM-004.3 — S3-Compatible Storage Service

This milestone supplies server-side S3 primitives only. It **does not** implement upload sessions or publicly expose signed URLs. It does not prove a file is a valid video, and it does not promote or publish a staging object.

## Environment

API runs on the host in the local Compose setup. Existing `S3_ROOT_USER` / `S3_ROOT_PASSWORD` from root `.env` may be used **only in non-production** to talk to local SILO. In production, use a dedicated restricted storage principal or the SDK credential provider chain. Never expose these values to React.

- `S3_ENDPOINT=http://127.0.0.1:9000` (must be browser-reachable when URLs are issued; server must sign with the same host clients PUT to)
- `S3_REGION=us-east-1`
- `S3_FORCE_PATH_STYLE=true` (SILO/MinIO-style local bucket routing)
- Existing `S3_UPLOAD_BUCKET=streamlab-uploads`, `S3_MEDIA_BUCKET=streamlab-media`
- Optional `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` as a pair; production also supports AWS SDK provider chain when both are absent
- Production custom endpoint must be HTTPS, with no credentials in the URL

Run `pnpm install` to install AWS SDK v3 and update the pnpm lockfile. Run `bash scripts/infra-up.sh` to create local private buckets. The API must not log presigned URLs or secrets.

## API for STREAM-004.4/004.5

```ts
const storage = createUploadStorageService();
const signed = await storage.signStagingPut({ videoId, uploadId, contentType: 'video/mp4' });
// Only return signed.url, signed.headers, signed.method and expiry as part of an
// authorized, server-owned upload session response. Never let clients choose keys.
```

- `createStagingObjectKey(videoId, uploadId)` derives a staging key from validated UUIDs.
- `createVerifiedOriginalKey` generates a fresh internal-only destination; **not** a verified/published asset. Copy/validation comes later.
- `signStagingPut` signs PUT for exactly 600 seconds with a signed Content-Type. Optional SHA-256 digest is signed as `x-amz-checksum-sha256`; compatibility is provider-dependent.
- `headStaging` checks remote presence and returns metadata **without trusting MIME or ETag for content verification**.
- `deleteStaging` removes a single derived staging key; no list or broad delete privileges.
- S3 requests are created lazily. Existing API health endpoints can boot without storage credentials.

## Verification

```bash
pnpm verify:upload:storage
pnpm test:upload:storage
pnpm check
bash scripts/infra-up.sh
pnpm smoke:upload:storage
```

The SILO smoke writes a small non-video probe using presigned PUT, HEADs its metadata, and deletes it; it does not exercise transcoding or file verification. Browser CORS, replay/overwrite, checksum verification, staging promotion, multipart, lifecycle cleanup and ownership protection remain to be implemented and integration-tested in 004.4–004.9.

Relevant references: [AWS JS v3 presigner](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/) and [S3 code examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).
