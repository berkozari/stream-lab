# STREAM-004.2 — Upload contracts and validation

**Status:** Shared Zod and OpenAPI schemas are defined; upload endpoints are **not implemented** in this milestone. No Prisma migration, object-store write, or new package dependency.

## Compatible with existing STREAM-001.9 exports

The public exports `SizeBytesSchema`, `UploadStatusSchema`, `CreateUploadRequestSchema`, `CreateUploadResponseSchema`, `CompleteUploadResponseSchema` and their existing TS types remain. The shared package's existing `src/api/index.ts` re-exports `upload.js`.

- `SizeBytesSchema` intentionally remains a generic positive decimal **string** (e.g. also valid for byte counts outside upload policy); do **not** change it to a JS number or constrain it globally.
- `UploadSizeBytesSchema` adds the agreed **1 byte–2 GiB** validation, with safe `BigInt` comparisons after string validation.
- `CreateUploadRequestSchema` is a strict object and requires a permitted extension/content-type pair, size and optional lowercase SHA-256 (64 hex chars). Extra client-controlled IDs, storage keys, statuses, and permissions are rejected. Filename is **display-only** and may never form an object key.
- `CreateSinglePutUploadRequestSchema` is the server-side gate for single PUT attempts **≤100 MiB**; `CreateMultipartUploadRequestSchema` is the planned **>100 MiB–2 GiB** gate.
- The existing `CreateUploadResponseSchema` remains a **SINGLE** PUT response with URL and signed headers. Its shape must not be silently expanded while the actual API is only planned.
- Multipart DTOs are defined in advance (`SignMultipartPartRequestSchema`, `CompleteMultipartUploadRequestSchema`, and related response/part schemas) for **STREAM-004.7**, without adding or advertising working multipart routes.

## Wire constraints

| Field            | Contract                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `fileName`       | Trimmed, 1–255 characters, no path separators or ASCII control characters; extension `.mp4` or `.webm` must agree with content type |
| `contentType`    | Exactly `video/mp4` or `video/webm`                                                                                                 |
| `sizeBytes`      | Positive JSON decimal string, up to `2147483648` bytes; never use JS `Number` for untrusted byte strings                            |
| `checksumSha256` | Optional, exactly 64 lowercase hex digits; if supplied must be verified against **actual bytes** at completion                      |
| Single PUT       | `1..104857600` bytes, separate stricter request schema                                                                              |
| Multipart        | `104857601..2147483648` bytes, fixed 8 MiB non-final parts, max 256 receipts for this 2 GiB policy                                  |
| Part numbers     | Ascending consecutive `1..N` in completion DTO; storage ETag is not equivalent to SHA-256                                           |

The request-schema checks are _early filters_. Real object size, signature headers, actual media bytes, checksum, replay/overwrite races and staging-to-verified promotion remain the server's responsibility in STREAM-004.3–004.7. The client never selects S3 keys, controls bucket permissions or receives server storage credentials.

## API status and OpenAPI

`POST /api/v1/videos/{videoId}/uploads` and `POST /api/v1/uploads/{uploadId}/complete` remain `x-streamlab-status: planned`. OpenAPI retains the existing single PUT `UploadSession` response and documents the stricter `CreateUploadRequest` plus _planned_ multipart component schemas. When implementing a route, validate using the appropriate single/multipart schema, **not** the generic `CreateUploadRequestSchema` alone.

## Local checks

```bash
pnpm format
pnpm verify:upload:contracts
pnpm test:upload:contracts
pnpm check
```

`test:upload:contracts` builds `@streamlab/contracts` and runs Node's test runner against compiled exports. No live API or S3 is necessary. The existing `packages/contracts/tests/api-contracts.test.mjs` is updated only where it previously expected an oversize (1 TiB) upload request to succeed; `SizeBytesSchema` itself still permits that string.
