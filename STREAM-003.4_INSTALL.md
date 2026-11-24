# STREAM-003.4 — Video Listing & Detail API

## Install

From the repository root after saving current changes to Git:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-003.4_Video_Read_API_Patch.zip" -d .
node apply-stream-003-4.mjs
```

The installer checks all prerequisites, stages changes, and refuses unexpected conflicts before writing files. Backups of edited files are stored outside the project folder. Re-running the installer should not change files.

## Verify

```bash
pnpm format
pnpm verify:video:read
pnpm test:video:read
pnpm check
```

Run the infrastructure and API, then in another terminal:

```bash
pnpm smoke:video:read
```

Expected output:

```text
PASS: public READY/PUBLIC discovery -> keyset cursor -> owner drafts -> unlisted detail -> private/deleted 404
```

After a successful install, remove temporary installer files:

```bash
rm -rf stream-003-4-payload
rm apply-stream-003-4.mjs
```

No Prisma migration or new package dependency required.
