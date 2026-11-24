# STREAM-003.8 — Creator Video Management UI

## Installation

Run inside the StreamLab repository, after completing STREAM-003.7 and committing your changes:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-003.8_Creator_Video_UI_Patch.zip" -d .
node apply-stream-003-8.mjs
pnpm format
pnpm verify:web:video:ui
pnpm test:web:video:ui
pnpm check
```

Once installation succeeds, remove only the temporary installer and payload:

```bash
rm -rf stream-003-8-payload
rm apply-stream-003-8.mjs
```

The installer checks all file collisions **before** modifying repository files. Existing changed files are backed up in a sibling `.streamlab-003-8-backups` directory. A second install without modifications changes 0 files. No new dependencies or Prisma migrations are needed.

## Manual verification

With the API and web services running, sign in and visit `/creator`:

1. First view displays an empty state when no videos exist.
2. Create a draft with title and optional description. It appears as `Taslak` and `Özel`.
3. Edit title and description. Reload to confirm persistence.
4. Search by title and load additional pages if available.
5. Cancel deletion, then confirm deletion and verify the video disappears.
6. An unpublished draft must not offer PUBLIC/UNLISTED visibility.
7. Logout; `/creator` should redirect to login.

Category selection, actual uploads and initial publishing are not in this milestone.
