# STREAM-001.9 — Acceptance checklist

- [ ] Existing health routes remain documented and unchanged in runtime.
- [ ] REST draft includes Auth, Videos, Upload, Playback and WatchProgress; planned routes are marked.
- [ ] OpenAPI YAML parses, all local component refs resolve and names are unique.
- [ ] Shared Zod 4 DTOs compile and validate representative valid/invalid payloads.
- [ ] Root and contracts package scripts + direct dependencies are present.
- [ ] `pnpm verify:api:contracts`, `pnpm test:api:contracts`, `pnpm check` PASS locally.
- [ ] Architectural decisions (privacy, refresh cookies, direct upload, BigInt, statuses) documented.
- [ ] Documentation and generated manifests committed with the rest of the changes.

**Not in scope:** Implementation of Auth/Video/Upload/Playback routes; Prisma migrations, S3 upload or video transcoding.
