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

Pure exponential smoothing/weekday forecast with cold-start category baseline, numeric area-demand estimate, explainable geo matching/capacity filters, strict Claude parser/one retry/10-second fallback, bounded cache, per-user AI limits and top-three escalation are implemented. No paid API requests are made in tests. Mocked valid/fenced JSON, malformed retry, timeout and missing-key paths pass. Human review and food safety disclaimers are mandatory output fields. Real Claude and external email delivery remain unverified without credentials. Local Node 20 lint, 36 tests and build pass. UTC weekday forecasting and a default India NGO operating-time offset are explicit current limits to revisit for multi-timezone deployment.
