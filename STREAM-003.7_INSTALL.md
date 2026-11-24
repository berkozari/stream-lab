# STREAM-003.7 — React Video Management API & Hooks

## Installation

Run in the repository root on `feature/stream-003-video-management`, after committing current changes:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-003.7_React_Video_API_Hooks_Patch.zip" -d .
node apply-stream-003-7.mjs
pnpm format
pnpm verify:web:video
pnpm test:web:video
pnpm check
```

Installer is preflight-validated and does not overwrite unknown existing feature files. Changed package manifests are backed up to a sibling folder outside the repo.

After success:

```bash
rm -rf stream-003-7-payload
rm apply-stream-003-7.mjs
```

## Notes

- No Prisma migration or new dependency is required.
- No Creator UI changes are included; planned for STREAM-003.8.
- Existing Axios authentication/refresh interceptors are reused for all video requests.
- Check `docs/development/stream-003-7-web-video.md` for usage and cache rules.
- Browser E2E scenarios remain in STREAM-003.9.
