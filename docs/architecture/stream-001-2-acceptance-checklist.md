# STREAM-001.2 — Acceptance checklist

- [x] Root pnpm workspace and package manifests created
- [x] React Web skeleton with a placeholder page and API health indicator
- [x] Express API skeleton with health route and app/index separation
- [x] Standalone Worker skeleton with graceful signal handling
- [x] Shared contracts package using `workspace:*`
- [x] Shared TypeScript strict config and local package configs
- [x] Previous STREAM-001.1 ADR and architecture docs included
- [x] Static structure verification (`pnpm verify:scaffold`) passes
- [ ] Dependency installation on user machine (`pnpm install`)
- [ ] `pnpm typecheck` and `pnpm build` verified with resolved packages
- [ ] `pnpm dev` verified in a user environment, API endpoint and frontend health indicator checked
- [ ] Commit `pnpm-lock.yaml` and scaffold files to Git

**Note:** The generated ZIP was assembled in an environment without npm registry access. Do not claim runtime checks passed until the local install and commands succeed.
