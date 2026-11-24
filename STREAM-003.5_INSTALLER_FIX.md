# STREAM-003.5 — Installer wiring fix

The original installer expects `detail: options.videoDetail` to be immediately followed by `}`. It fails when Prettier adds a trailing comma.

This fixed installer accepts both forms and preserves the original trailing comma. No API implementation or Prisma model is changed in this fix.

In the repository root, after downloading this ZIP:

```bash
cp apply-stream-003-5.mjs apply-stream-003-5.mjs.bak
unzip -o "$HOME/Downloads/StreamLab_STREAM-003.5_Installer_Fix.zip" -d .
node apply-stream-003-5.mjs
pnpm format
pnpm verify:video:update
pnpm test:video:update
pnpm check
```

Once the API is running, verify with `pnpm smoke:video:update`.
