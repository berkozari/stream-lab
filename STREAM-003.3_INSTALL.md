# STREAM-003.3 — Create Video API patch

Save all current changes in Git before installation.

From the StreamLab repository root:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-003.3_Create_Video_API_Patch.zip" -d .
node apply-stream-003-3.mjs
pnpm format
pnpm verify:video:create
pnpm test:video:create
pnpm check
```

The installer validates every expected input and source file **before it writes** and creates backups in a sibling directory (`../.streamlab-003-3-backups-*`). If it encounters an unexpected existing file, it stops rather than overwriting it.

With your API/infra running, execute the database-backed smoke check:

```bash
bash scripts/infra-up.sh
pnpm dev:api            # terminal A; if not already running
pnpm smoke:video:create # terminal B
```

Expected:

`PASS: JWT owner -> valid categories -> DRAFT/PRIVATE -> sanitized 201 -> PostgreSQL`

Once installation and all checks succeed:

```bash
rm -rf stream-003-3-payload
rm apply-stream-003-3.mjs
```

No new dependency or Prisma migration. The endpoint is `POST /api/v1/videos`, protected by bearer JWT and active session validation; the listing and detail routes remain for STREAM-003.4.
