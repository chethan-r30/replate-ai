# Phase evidence

## Phase 0

PR #1 merged into develop. Main requires a PR, including for admins; force push and deletion are disabled. Node 20.20.2 lint, 2 setup tests and formatting passed. Audit was zero at this checkpoint.

## Phase 1

Node 20 lint, 7 setup/foundation tests and both workspace builds passed. Explicit local sandbox started with disposable MongoDB; `/api/v1/ready` returned 200. Strict startup rejects MongoDB/JWT placeholders; optional integrations remain unavailable until configured. Responsive screenshots inspected at 390px and 1280px with no horizontal overflow. Initial JS build is 67.40 KB gzip (not a Lighthouse or performance-target certification).

Dockerfiles/compose added but not executed: this environment has no Docker executable. Two moderate React Router v6 advisories remain; no high/critical findings. Preserve the explicitly requested v6 and reassess at the security phase, rather than silently changing the requested major version.

No authentication, domain workflow, AI services or deployment is complete yet.

## Foundation validation follow-up

PR #3 passes GitHub Actions run 40713647482: compose validates, client/API images build, client responds, API readiness succeeds with containerized MongoDB. This replaces the earlier Docker execution gap.

## Phase 2

Auth/RBAC: registration (no self-admin), bcrypt cost 12, access JWTs, rotating hashed refresh families/replay revocation, single-use hashed email/reset links, login limit/lockout, org proof/approval and audit decisions. Local missing SMTP reports non-delivery; explicit sandbox exposes a development inbox only. Production has no inbox endpoint. Frontend includes auth forms, session restore, guards and visible mobile sign-in.

Node 20 lint, 17 tests (Mongo-backed integration plus React forms/guards) and builds pass locally. Mobile login/register screenshots inspected with styles, linked errors and no overflow. SMTP delivery and broad coverage thresholds await later integration/configuration. Google OAuth is optional and disabled (not implemented). Phase 2 does not imply complete app readiness.

Phase 2 CI run 40714153568 passed, including Docker image builds/readiness; PR #4 merged into develop.

## Phase 3

Core models and indexes, geo/category/page listing search, ownership and verification gates, atomic listing reservation/idempotent repeat claims, restaurant-verified pickup codes, feedback, expiry cron and byte-sniffed image uploads are implemented. Node 20 lint, 23 tests and builds pass. Concurrent NGO race test verifies exactly one winner. Missing Cloudinary returns explicit 503 rather than pretending an image was saved. Cloudinary external delivery is not verified without credentials. Claim reservation and transitions now run in MongoDB transactions with replica-set local/CI configuration. Failure-path tests verify reservation and pickup rollback; concurrent pickup completes exactly once. No phase 3 UI is claimed yet (frontend features are phase 5).

Phase 3 CI run 40714845602 passed with replica sets and 25 tests; PR #5 merged. Failure-path consistency gates resolved before Phase 4.

## Phase 4

Pure exponential smoothing/weekday forecast with cold-start category baseline, numeric area-demand estimate, explainable geo matching/capacity filters, strict Claude parser/one retry/10-second fallback, bounded cache, per-user AI limits and top-three escalation are implemented. No paid API requests are made in tests. Mocked valid/fenced JSON, malformed retry, timeout and missing-key paths pass. Human review and food safety disclaimers are mandatory output fields. Real Claude and external email delivery remain unverified without credentials. Local Node 20 lint, 36 tests and build pass. Organizations explicitly provide an IANA timezone. Forecast calendar dates/weekdays and NGO opening-hour feasibility use that timezone, including DST. Missing or invalid NGO timezone fails matching closed.

Phase 4 timezone fix passed CI run 40715638979; PR #6 merged with 38 local tests.

## Phase 5 (verification in progress)

Role dashboards, responsive browse/map/filter/detail, listing create/edit with optional AI note/photo draft, organization/timezone/preferences, handover UI, feedback, impact, private Socket.io rooms, persisted notifications and PWA offline shell are implemented. Local Node 20 lint, 41 tests and production builds pass. Local browser smoke script `node scripts/verification/role-flow.mjs` passes restaurant post, NGO request, restaurant code-verified pickup, admin dashboard using disposable pre-approved fixtures. This is NOT the Phase 6 signup/admin-approval end-to-end test. Mobile/desktop screenshots inspected; no horizontal overflow in browse/form checks. Real SMTP/Cloudinary delivery remains unavailable without keys.

Visual testing fixed two actual defects: StrictMode duplicate refresh revoked a valid session (deduplicated with regression test), and posting left cached dashboard listings stale (invalidate queries after save). Sign-out now clears cached private data between users. No claim that all coverage, WCAG, offline-install, socket delivery or phase 5 acceptance checks are finished. Phase 5 must remain pending until its remaining verification passes.

## Remaining ordered work

- Finish Phase 5 acceptance checks and latest CI; review notification fallback/expiry/escalation paths, socket auth/delivery, offline shell, empty/error states and admin moderation. Check account-switch cache isolation and mobile role pages.
- Phase 6: complete every-route case matrix, expired JWT/injection/XSS/security tests, mocked SDK tests, MSW frontend tests, signup+email+admin approval+post+claim+pickup E2E in desktop and mobile, 200-user load, coverage thresholds and TEST_REPORT.md.
- Phase 7: explain indexes, cache/Redis, image transforms, bundle analysis, Lighthouse four scores >=90, API p95 <300ms, initial JS <250KB gzip; record before/after measurements.
- Phase 8: full security audit, deletion endpoint, strict CSP/CORS/HTTPS, dependency findings, secrets/history scan, Dependabot, race/failure review. Router v6 has two moderate advisories; preserve explicit version request unless a scoped decision is required.
- Phase 9: deployment configs, CI/CD full gates, seed data, Atlas/Render/Vercel account and keys, monitoring and live smoke. No paid services or legal terms approved. Cross-site refresh-cookie semantics need an explicit production solution, not assuming localhost SameSite behavior works on separate hosts.
- Phase 10: complete README/architecture/API/deployment/test/performance docs and fresh-clone verification. Main currently has bootstrap only; releases go via protected PR, never bypass.

No live URL, production readiness, coverage target, load/security/performance target or complete end-to-end definition of done is claimed.

Phase 5 follow-up: Socket auth/user-room isolation test passes; production offline shell loaded after network was disabled. Explicit local role-flow smoke still passes. Active/reserved listings are now separated from completed/cancelled/expired history, with no matching controls on history. Self-disable is blocked and all admin targets are disabled from this management endpoint/UI to prevent last-admin lockout. Latest local count: 43 tests. No full coverage or installability certification yet.

### Phase 5 gate passed and Phase 6 begun

PR7 merged to develop after latest corrected-head CI passed: https://github.com/chethan-r30/replate-ai/actions/runs/40717685662 . Local role smoke, history-control check, admin protected-action check, 43 unit/integration tests, lint/build, socket privacy and offline shell check passed. Current branch: feat/phase-6-testing.

Phase 6 baseline coverage command ran successfully, but existing config only includes server services. Baseline services coverage: statements 86.92%, branches 79.54%, functions 90.62%, lines 91.30%. This is NOT the final scope/threshold result: widen to server services and AI with explicit thresholds, add client coverage with 70% target and MSW, then fill uncovered paths. Notifications are weakest baseline service (53.84% lines). Required full signup/email/admin-approval desktop/mobile E2E, every-route matrix and 200-concurrent load tests remain unrun. Preserve a TEST_REPORT distinguishing real measured results from pending targets. No deployment or external-key verification yet.

Phase6 local implementation checkpoint: 76 tests and explicit server/client thresholds pass (TEST_REPORT.md). Full desktop/mobile signup/email-local-inbox/organization/admin-approval/post/claim/pickup UI flows pass. Load baseline zero errors with 200 distinct claims, claim p95 1451ms remains Phase7 optimization gap. Organization PATCH defaults and strict query defects fixed with regression tests. Await latest lint/build/CI before phase6 merge.

Phase6 exact-head CI passed and PR8 merged: https://github.com/chethan-r30/replate-ai/actions/runs/40720199316 . Phase7 active, not passed: Lighthouse key pages meet90+ with accessibility100 after contrast fix; initial JS110KB gzip; index explain verified; optional Redis/cache/images/bundle analysis implemented. Local200-connection claim p95 remains~1.10s despite zero errors and correct persistence;20-connection171ms is not substituted. PERFORMANCE.md carries exact evidence. Independent CI load measurement now configured; inspect its job summary/artifact before deciding next. No Phase8 work is complete.

Phase7 independent CI result retrieved from40722068790 load-evidence: search233.64ms p95, claim1094.61ms p95, zero failures,200 persisted claims. Gate still missed. Command profile under200 concurrency found sequential DB operations each~160-253ms p95; transactions retained. Pool warming did not improve enough. Do not repeat identical benchmark. Next useful path: investigate write-path batching/architecture with full failure invariants and role consistency, or surface requirement/capacity decision through parent. No paid fix verified. Axe mobile four-page checks zero violations; Redis successful/error/fallback paths tested. Phase8-10 remain untouched.

Latest checkpoint: PR9 remains OPEN, Phase7 unpassed. Current branch feat/phase-7-optimization. Latest equivalent CI artifact40723132113 topology4core/16.76GB: search176.37ms p95, claim1508.38ms p95,0 errors,200 persisted. Parent informed of the concrete architecture/performance gate. Do not silently proceed to Phase8. Potential next investigation: isolate critical-path DB operations with CPU/command traces, consider durable outbox/batched writes only if atomic state/notifications/recovery guarantees are preserved. Existing in-memory notification queue experiment was rejected/reverted. Latest docs-only head ae7a697 queued run40723408951, no merge. Check actual latest test count in logs before reporting; lint/coverage/E2E/build pass.

Phase7 latest checkpoint: invariant-preserving microbatch redesign now has a numerical pass in independent200-distinct-NGO CI40726937022, claim260.50ms/search212.06ms,0errors,200 persisted claims/reservations.93 tests and desktop/mobile E2E pass locally. Socket hints debounce without dropping persisted rows. Load CI now enforces the300ms threshold. Await the exact final commit CI before PR9 merge and Phase8. Earlier performance misses are retained in PERFORMANCE.md, not erased.

Phase7 completed: PR9 merged after exact-head full CI40727455102 passed, enforced claim239.88ms/search174.31ms at200 distinct NGOs,0 failures.93 tests,E2E,Docker pass. Latest Lighthouse performance100/94/100/92,accessibility100,BP96,SEO91;initial JS110KB gzip.

Phase8 implemented and awaiting exact-head CI: password-confirmed transactional delete-my-account with active-handover/admin guards, PII anonymization/token removal/socket disconnect; production HTTPS/Origin enforcement, query-free request logging, hard production dev-inbox guard, audit-decision transactions/failure rollback, Dependabot and frontend response headers.98 tests/coverage,lint/build pass locally. SECURITY.md records0high/critical audit, remaining5moderate4low and retention/deployment limits. No production or live external delivery claimed.
