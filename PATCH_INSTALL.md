# StreamLab — STREAM-001.9 API Contracts & Documentation

## Installation (repository root)

Before applying: commit local changes or create a backup. The installer checks existing destination files and refuses unexpected overwrites.

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-001.9_Contracts_Patch.zip" -d .
node scripts/apply-stream-001-9.mjs
rm -rf stream-001-9-payload
rm scripts/apply-stream-001-9.mjs
pnpm install
pnpm format
pnpm verify:api:contracts
pnpm test:api:contracts
pnpm check
```

### What it changes

- Adds `packages/contracts/src/api` Zod 4 schema modules and contract tests.
- Adds a named export to the existing `packages/contracts/src/index.ts`; **does not replace** existing queue exports.
- Adds `zod` as a direct dependency of `@streamlab/contracts` and `yaml` as a root dev dependency.
- Adds root scripts and extends root `check` to execute the new verifications.
- Replaces the **known unmodified** OpenAPI 3.0.3 health-only draft with an OpenAPI 3.1.1 contract-first specification. **Any other existing content triggers a safe abort.**
- Adds documentation under `docs/api` and an acceptance checklist.

The HTTP domain operations listed in OpenAPI are **not yet implemented**. They are explicitly marked `x-streamlab-status: planned`. This patch does not add Express routes or Prisma migrations.

If install reports a conflict in `openapi.yaml`, preserve your local file; make an intentional three-way merge. The script does not force overwrite.

The YAML verifier checks structural syntax and local references, not full third-party OpenAPI conformance. Use a full OpenAPI linter in the later QA milestone.
