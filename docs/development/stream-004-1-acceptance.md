# STREAM-004.1 — Acceptance and handoff

## Scope

Architecture & security design **only**. No API, S3 upload or database schema migration is introduced by this patch. Prior STREAM-003 video management behavior remains unchanged.

## Accepted decisions

- [x] Retain existing ADR-003 direct-to-private-S3 upload flow.
- [x] Authenticated & owner-authorized session creation/completion; no client-chosen storage key.
- [x] Define short presigned URL and separate upload-session TTL.
- [x] Define MIME/extension, size, rate and concurrency policy (machine-readable JSON).
- [x] Define immutable original promotion / signing replay threat and controls.
- [x] Define `VideoUpload` lifecycle, idempotency, failure and cleanup rules.
- [x] Define 100 MiB single PUT / multipart threshold and 8 MiB part size.
- [x] Separate uploaded/verified from READY/published; FFmpeg deferred.
- [x] Identify S3-compatible conditional-copy/checksum compatibility as a release gate.

## Local verification

```bash
pnpm verify:upload:architecture
pnpm test:upload:architecture
pnpm check
```

Expected: architecture verifier passes, 5 policy tests pass, and existing checks remain unchanged. No Docker or Prisma migration is required to validate this architecture task.

## Next steps

1. **STREAM-004.2 — Upload Contracts & Validation:** implement Zod request/response DTOs corresponding to the policy; keep OpenAPI operations as planned until actually implemented.
2. **STREAM-004.3 — S3-Compatible Storage Service:** AWS SDK v3 client, SigV4 signing, private buckets, storage key generation and SILO compatibility tests; test conditional copy/immutability rather than assuming support.
3. **STREAM-004.4–004.6:** upload session endpoint, direct single PUT and verified completion; verify storage size and checksum, then durable queue intent.
4. **STREAM-004.7:** multipart initialize/sign/complete/abort, recovery and cleanup.
5. **STREAM-004.8–004.9:** React upload UI and complete integration/security/E2E validation.

## Security acceptance gates for later milestones

Do not mark upload endpoints implemented or queue an original until: ownership, actual object size, byte/media validation, staging-to-verified isolation, expired upload rejection, replay/concurrency and deletion races are covered by behavioral tests.
