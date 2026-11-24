# STREAM-003.2 — Video Metadata & Shared Contracts

## Scope

Extend **existing** `@streamlab/contracts` DTOs in `packages/contracts/src/api/video.ts`. Do not introduce a duplicate Video schema, database migration, API endpoint or React form in this task. `Video`, `VideoStatus` and `VideoVisibility` already exist. The Prisma model is unchanged.

## Input contracts

| Schema                     | Input rules                                                                                                                           | Parsed output                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `CreateVideoRequestSchema` | Required title (trimmed, 1–160 characters); nullable/optional description (max 10,000); optional category UUID array (max 10, unique) | `categoryIds` defaults to `[]`                                                                    |
| `UpdateVideoRequestSchema` | At least one allowed property; same title/description/category validation; optional `PRIVATE`, `UNLISTED` or `PUBLIC` visibility      | No implicit defaults; `description: null` clears description; `categoryIds: []` clears categories |
| `VideoListQuerySchema`     | `limit` 1–50 (default 20), optional cursor (1–512 chars), trimmed `q` and category (1–100 chars)                                      | Coerces `limit` from string; trims search/category values                                         |
| `VideoResponseSchema`      | Public metadata DTO only; media object keys are not part of the public contract                                                       | Parsing removes extra fields; serialize the parsed DTO, not the raw Prisma entity                 |

**Mass-assignment boundary:** Create/update use Zod strict objects and reject unknown properties. In particular, clients cannot set `ownerId`, `status`, `processingVersion`, `publishedAt` or `deletedAt`. Even a valid request must be authorized by the API and ownership enforced by `ownerId` from `req.auth`, not supplied JSON.

**Publication boundary:** A `PATCH` request containing `visibility: 'PUBLIC'` is only syntactically valid. The API service must still enforce the `READY` + `publishedAt` + non-deleted publication policy from STREAM-003.1. Zod should not look up the database to enforce it. Do not auto-publish a `READY` video.

**Category boundary:** Zod checks UUID format, uniqueness and count. The service/repository in STREAM-003.3/003.5 must verify the referenced categories actually exist, and handle missing category IDs atomically.

**Response boundary:** Zod strips unknown fields when parsing `VideoResponseSchema`, including `storageKey`, `deletedAt`, and `processingVersion`. The API must construct or parse a sanitized DTO before sending; simply calling `safeParse` without using `result.data` does not sanitize the response.

## OpenAPI and compatibility

OpenAPI `CreateVideoRequest` and `UpdateVideoRequest` use `additionalProperties: false`, `maxItems: 10`, and `uniqueItems: true` on category IDs. Existing route `x-streamlab-status` values remain `planned`; request parsing is not endpoint implementation.

Existing export names and wire shapes remain stable. The previous `CreateVideoRequestSchema.parse({ title: 'Example' }).categoryIds` continues to return `[]`; `UpdateVideoRequestSchema` still rejects empty objects. A previously ignored unrecognized property now raises a validation error deliberately.

## Acceptance

```bash
pnpm verify:video:contracts
pnpm test:video:contracts
pnpm check
```

No database or running API is needed for these contracts-only tests. Next is **STREAM-003.3 — Create Video API**, using these schemas as the single source of truth.
