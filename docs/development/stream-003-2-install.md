# STREAM-003.2 install

From the StreamLab repository root on `feature/stream-003-video-management`:

```bash
unzip -n ~/Downloads/StreamLab_STREAM-003.2_Video_Contracts_Patch.zip -d .
node apply-stream-003-2.mjs
pnpm format
pnpm verify:video:contracts
pnpm test:video:contracts
pnpm check
```

The installer checks expected schemas and OpenAPI sections before touching project files and keeps backups of changed files in a sibling `.streamlab-003-2-backups-*` directory. If it reports a mismatch, stop and inspect local changes; never force-overwrite user edits. Run after checkout with clean Git status. It does **not** modify Prisma schema or run migration.

After successful tests:

```bash
rm -rf stream-003-2-payload
rm apply-stream-003-2.mjs
git status
```
