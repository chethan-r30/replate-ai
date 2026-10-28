# Test report

Measured 2026-10-28 on Node 20.20.2. This is local test evidence, not a live deployment certification.

## Automated checks

- 80 unit/integration/component tests pass, with disposable MongoDB replica sets.
- Server services coverage: lines 95.17%, statements 90.56%, functions 94.11%, branches 82.22%. Thresholds: 80% each.
- Client coverage: lines 87.58%, statements 85.55%, functions 85.82%, branches 85.02%. Thresholds: 70% each. Includes App, components, pages, API and auth store; excludes entrypoint and test files.
- AI modules are included in coverage and pure math/matching, valid JSON, malformed retry, timeout, no-key and API-failure paths pass without paid requests.
- MSW mocks real fetch for API/client tests. Latest MSW required newer JavaScript primitives than Node20, so pinned compatible 2.7.3. Do not casually remove the pin.
- Security: strict NoSQL body/query rejection, escaped XSS card markup, role/ownership checks, expired/tampered/purpose-mismatched JWTs, brute-force lockout, refresh-family reuse rejection, and private socket room isolation pass.
- Concurrency: two NGOs compete for one listing, exactly one succeeds. Injected persistence failures roll back reservation and handover; duplicate completion exactly one success.
- Route matrices cover public reads, protected read success/401/role denials, strict input errors, organizations/approval/edit, listing mutations, claim actions/feedback, AI, notifications and admin management/moderation. Public routes intentionally have no 401/403 requirement; logout/forgot/reset/verification are public token-based flows. External SMTP/Cloudinary successful delivery/upload is not tested against real services without credentials.

## Browser flow

`npm run test:e2e` uses Chromium desktop 1280x900 and mobile 390x844. Restaurant and NGO both register through UI, verify generated development-inbox links, submit organization details, receive admin approval through UI, then complete listing post, claim, restaurant approval and six-digit-code handover. Both passed. Screenshots are saved in ignored test-results. A demo admin is the only pre-created account. Verification email uses the safe development inbox; real SMTP delivery is not claimed.

## Load baseline

`npm run test:load`: disposable single-node replica set, 200 connections. Search: 6,873 responses in 10 seconds, p95 287.63ms, p99 4955ms, zero errors/non-2xx. Claim: 200 distinct listing claims, p95 1451.30ms, p99 1483ms, zero errors/non-2xx; 200 persisted claims and 200 reserved listings verified. Percentiles use response-event timings, not a substituted percentile. Load generator and server share local CPU, so results are baseline only. Claim latency misses the Phase7 p95 target and must be improved and remeasured. An earlier invalid load fixture repeatedly claimed one listing and was discarded after the persisted-count assertion exposed it.

## Bugs found and fixed during this phase

- Listing creation/edit and completed pickups now persist numeric forecast history transactionally. Missing history writes are failure-tested.
- Expiry updates listing and active claim in one transaction with rollback failure test, avoiding a stranded reserved claim.

- Organization PATCH defaults silently made an empty patch into writes. Only explicitly supplied keys now persist; empty changes reject with 400.
- NGO allocated capacity now uses each NGO local calendar day rather than UTC midnight, tested at the India date boundary.
- Organization list/detail accepted unknown query keys. Strict query validation now rejects them.

## Commands

`npm run lint`, `npm run test:coverage`, `npm run build`, `npm run test:e2e`, `npm run test:load`.

Performance optimization, full security hardening, CI results for this phase, real service keys and live smoke verification remain later gates. No claim of production readiness yet.

## Phase7 regression evidence

93 unit/integration/component tests pass on Node20; added bulk claim insertion/notification failure rollback, compare-and-swap mismatch, overlapping batches, same-NGO retry/other-NGO conflict, current approval revocation and live-read/non-caching checks. Live socket hints debounce50ms per private room while all rows remain durable. Desktop/mobile full signup-to-pickup flows pass again. Equivalent independent200-distinct-NGO CI measured260.50ms claim and212.06ms search p95,0 errors,200 distinct persisted claims/reservations: https://github.com/chethan-r30/replate-ai/actions/runs/40726937022 . PERFORMANCE.md preserves all earlier misses and topology/caveats. New CI load gate enforces latency instead of only measuring it.

## Phase8 regression evidence

98 tests pass with configured coverage thresholds, including password-confirmed account erasure, old-session rejection, active-handover/admin deletion guards, deletion-write rollback, production HTTPS/Origin/CSP/HSTS and audit-write failure rollback for approval/disable/moderation. SECURITY.md lists the scope and remaining deployment/retention limits.

Latest Phase8 scope:100 tests pass. Added cache-miss single-flight/invalidation regression and trailing-slash claim permission regression. Services thresholds80% and client70% remain enforced. Repeatable200-user load: three independent disposable trials claims203.82/193.92/225.61ms,search86.73/92.32/89.28ms,0errors/200correct each in40730689271. Every trial must pass. Full external production latency remains unverified.
