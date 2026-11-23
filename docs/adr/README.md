# StreamLab — Architecture Decision Records

**Milestone:** STREAM-001.1 | **Date:** 2026-11-23

An ADR records a decision, its rationale, the alternatives considered, and its consequences. These documents are proposed architecture decisions for the StreamLab VOD MVP; implementation is not implied.

| File    | Decision                                 | Status           |
| ------- | ---------------------------------------- | ---------------- |
| ADR-001 | Monorepo and runtime boundaries          | Accepted for MVP |
| ADR-002 | Web feature-based / API layer-based      | Accepted for MVP |
| ADR-003 | Direct-to-object-storage uploads         | Accepted for MVP |
| ADR-004 | Queue-based media processing             | Accepted for MVP |
| ADR-005 | HLS delivery and content authorization   | Accepted for MVP |
| ADR-006 | Data ownership and Prisma schema         | Accepted for MVP |
| ADR-007 | Session authentication and API contracts | Accepted for MVP |
| ADR-008 | Reliability, deletion, observability     | Accepted for MVP |

## How to use

1. Check each ADR's assumptions before implementing the relevant milestone.
2. Prefer a superseding ADR instead of silently rewriting an accepted architectural decision.
3. Update status to `Superseded` if the architecture changes and link the replacement.
4. Keep ADRs in Git. Read the overview and acceptance checklist in `../architecture/`.

**Scope:** VOD, not live streaming. No subscription, payments, DRM, recommendation engine or advanced analytics in MVP. All source material is owned/licensed for use.
