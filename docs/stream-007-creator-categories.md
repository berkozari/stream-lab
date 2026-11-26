# STREAM-007.3 — Creator category assignment

## Scope

- Reuses the existing `GET /api/v1/categories` public list and authenticated create/update video API. No new endpoint or migration.
- Adds `categoryIds` to the shared video DTO and selects category links in create/read/update repository responses. IDs are public category metadata, not access-control data.
- Category options are rendered as labeled multi-select checkboxes in the creator's create/edit form (maximum 10 unique IDs, enforced in UI and shared Zod contract).
- Edit form starts with the category IDs returned in owner-scoped `GET /videos/mine` results. It does not reset categories to empty on edits.
- Category fetch failure disables saving so that a transient failure cannot delete existing associations. Existing server-side category existence validation and transaction replacement logic remain unchanged.

## Tests

```bash
pnpm --filter @streamlab/contracts build
pnpm --filter @streamlab/contracts test
pnpm --filter @streamlab/api exec node --import tsx --test tests/unit/video-category-response.service.test.ts
pnpm --filter @streamlab/api test:video:create
pnpm --filter @streamlab/api test:video:read
pnpm --filter @streamlab/api test:video:update
node --experimental-strip-types --test apps/web/tests/creator-categories.test.ts
pnpm --filter @streamlab/web test:video:client
pnpm --filter @streamlab/web test:video:ui
pnpm typecheck && pnpm lint && pnpm format:check
pnpm --filter @streamlab/web build
```

## Browser acceptance

1. Sign in, open creator dashboard, start a new draft and choose one or more categories; save.
2. Reopen the draft; its chosen categories must be selected.
3. Remove one category and add another, save and reopen; the new set must persist.
4. Set a READY video to PUBLIC where appropriate; confirm its discoverability under the matching category filter on HomePage.
5. Simulate a categories request failure; verify the form explains the error, offers retry and does not allow saving.
6. Confirm an old video with no categories still opens and saves normally.

## Security/compatibility

- Ownership and authorization are still enforced by the existing video update repository and auth middleware.
- Public `Video` DTO now includes only category UUIDs, not hidden category data or storage details.
- Legacy mocked DTO fixtures remain compatible via a Zod default and read serializer fallback; application repositories always select category links.
- Atomic category replacement and the existing `CATEGORY_NOT_FOUND` (422) error stay intact.
