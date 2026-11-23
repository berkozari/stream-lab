# STREAM-001.9 — API Contracts and Documentation

Status: **Design complete; domain routes are not implemented in STREAM-001.**

## Single responsibilities

- `apps/api/docs/openapi/openapi.yaml`: human-readable REST wire contract (OpenAPI 3.1.1).
- `packages/contracts/src/api/*.ts`: reusable Zod 4 runtime input/response schemas and inferred TypeScript DTOs.
- `apps/api/prisma/schema.prisma`: database models; **never** return Prisma models directly as API DTOs.
- `apps/web/src/features/<domain>/services`: consume the endpoint contracts when STREAM-002+ is implemented.
- `apps/api/src/schemas`: import/reuse shared request schemas and add API-specific authorization and business validation.
- `packages/contracts/src/queue.ts`: **existing** BullMQ job contract, separate from HTTP contracts.

OpenAPI and Zod express the same intended wire shape but are maintained as separate declarations in this milestone. Before implementing an endpoint, compare both definitions and add response tests. Automated one-source generation can be introduced if drift becomes an issue.

## Endpoint ownership and release plan

| Group    | Operations                                                | Planned milestone           |
| -------- | --------------------------------------------------------- | --------------------------- |
| Health   | GET /health, GET /health/ready                            | Implemented in STREAM-001.6 |
| Auth     | register, login, refresh, logout; GET /users/me           | STREAM-002                  |
| Videos   | list, create, details, patch, delete, publish, processing | STREAM-003 / 005 / 007      |
| Upload   | create upload session, verify completion                  | STREAM-004                  |
| Playback | HLS access grant                                          | STREAM-006                  |
| History  | upsert watch progress                                     | STREAM-007                  |

Paths in OpenAPI include the `/api/v1` prefix. A route carrying `x-streamlab-status: planned` **does not exist in Express yet**.

## API conventions

- JSON envelope for domain successes: `{ "success": true, "data": ... }`.
- JSON envelope for errors: `{ "success": false, "error": { "code": "...", "message": "...", "details": ... }, "requestId": "..." }`.
- The two health endpoints deliberately use their **existing bare responses**; they are not wrapped in the standard domain envelope.
- `401` = unauthenticated, `403` = authenticated but unauthorized, `404` = absent/inaccessible per security policy, `409` = state conflict, `422` = invalid structured input, `429` = rate limit.
- Cursor paging defaults to `limit=20` and max `50`. The cursor is opaque. Never rely on database offsets encoded in clients.
- All timestamps are ISO 8601 UTC; nullable properties are represented as JSON `null`, not undefined.
- Upload `sizeBytes` is a **decimal string** over the wire (PostgreSQL BigInt). Server converts safely after input validation and enforces actual maximum upload size.
- Uploaded binaries go directly to private object storage with presigned URLs, not through Express.
- `PRIVATE` videos require authorization, `UNLISTED` videos are link-accessible but not discoverable, `PUBLIC` videos are discoverable only when READY.
- Do not return `storageKey`, `refreshTokenHash`, or other internal credentials/keys in public DTOs.
- Auth: short-lived bearer access token in response body; refresh token in HttpOnly cookie, **not** JSON. Cookie name in this OpenAPI draft is provisional. CSRF header is required for refresh/logout.
- Playback grant must protect **all** `.m3u8` playlists and segments for PRIVATE assets, not only master playlist. `manifestUrl` is a logical temporary delivery URL, not an origin storage credential.

## Video lifecycle and HTTP status

`DRAFT -> UPLOADING -> UPLOADED -> QUEUED -> PROCESSING -> READY` with `FAILED` and `DELETING` branches. `status` and `visibility` are independent. `POST /publish` requires `READY`; successful response returns `PUBLIC` plus `publishedAt`.

Deletion is asynchronous: DELETE returns `202` with `{ "success": true, "data": { "status": "DELETING" } }`. Source cleanup, renditions and database records will be handled by dedicated workflow.

`POST /uploads/{uploadId}/complete` verifies presence/integrity before returning `202`; a client's completion notification alone is never sufficient. Retry and lost-queue reconciliation is implemented in later milestones.

## Example — typed contract consumer

```ts
import { CreateVideoRequestSchema, type Video } from '@streamlab/contracts';

const request = CreateVideoRequestSchema.parse({ title: 'Architecture 101' });
// API client sends request and validates/handles the response at the boundary.
// `Video` is a DTO, never a direct Prisma entity.
const handle = (video: Video) => video.id;
```

## Validation

```bash
pnpm install
pnpm verify:api:contracts
pnpm test:api:contracts
pnpm format
pnpm check
```

The verifier parses YAML, checks references, ensures planned routes are marked, and checks package manifests. It is a **structural contract check**, not full semantic OpenAPI certification or proof of implemented endpoints. Contract unit tests validate sample Zod inputs.
