# STREAM-002.6 — React Authentication Foundation

Apply from repository root after committing/stashing local changes:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-002.6_React_Auth_Foundation_Patch.zip" -d .
node apply-stream-002-6.mjs
rm -rf stream-002-6-payload
rm apply-stream-002-6.mjs
pnpm install
pnpm format
pnpm verify:web:auth
pnpm test:web:auth
pnpm check
```

No database migrations or new dependencies are needed. The installer checks anchors and new file collisions before writing, and backs up overwritten files in `../.streamlab-002-6-backups`.

For browser acceptance: run API and Web, then visit /creator as a signed-out user. See docs/development/stream-002-6-web-auth.md.
