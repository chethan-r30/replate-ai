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

### Corrected release and free hosting checkpoint

Main0437c85 full CI40748383643 passed104tests, coverage, lint, build, desktop/mobile role E2E and container checks. Three200-user load trials passed search97.80/108.08/103.64ms and claims171.61/197.72/186.26ms, zeroerrors,200distinct claims/reservations. Earlier misses remain in PERFORMANCE.md. Node20-built static frontend was published through Vercel's supported prebuilt route after its remote builder rejected Node20. Read-only live smoke passed home,SPA,health,ready,impact. Final live mutation/auth/socket acceptance still pending demo seed access. No production-ready or phase-complete claim.

## Final verification: 2026-10-29

This section supersedes interim pending/status statements above, which remain as historical measurements. Deployed main870afad full CI40760838986 passed106tests, lint, coverage, build, desktop/mobile end-to-end role flow, container startup and three independent200-user trials. Vercel automated prebuilt40761256168 passed. Phase9 evidence PR34 full CI40798570659 also passed before merge.

Live acceptance used isolated synthetic data: restaurant UI login/post12servings, NGO request, restaurant approval and code-confirmed pickup; picked_up history and12meals were observed. Browser reload restored session; refresh rotated, HttpOnly/Secure/SameSiteStrict flags passed, replay401. Own authenticated socket received new-claim hint, unrelated NGO socket received none; extra test claim cancelled. Admin mobile390px layout inspected. Seed counts1admin/3restaurants/3NGOs/20listings/180history60days, plus acceptance listing. No real email/image/Claude success claimed. Uptime40797914282 actually passed after fixing an unset variable that previously caused skip.

Phase10 audit discovered/fixed missing public API documentation and matching reliability defaults that never updated from real outcomes. OpenAPI now derives payload descriptions from route Zod validators and inventories41paths/47operations. Swagger uses only local assets, no Try-It-Out mutation or persisted authorization, and a docs-only CSP. Desktop/mobile pixels inspected, no JS errors. New tests verify route/payload/security semantics, real no-show/feedback-based reliability,15minute escalation and reminder idempotency. Pickup-before filter now has a frontend control and regression.

Coverage scope is explicit: server/src/services and server/src/ai, plus all client source except entrypoint/test files. Route modules, models, jobs, config and middleware are integration-tested but not part of the percentage denominator. It is not whole-server80%coverage. Final measured services lines96.37%, statements94.29%, functions95.06%, branches87.83%; client lines87.84%, statements85.84%, functions86.01%, branches85.03%. Both configured thresholds are enforced. Local final suite count may increase as audit fixes land; exact final CI is authoritative.

Fresh clone of deployed main: npm install, placeholder env copies, npm run dev (frontend200/APIready200), lint,106tests and build passed under Node20. No production credentials needed. Final phase10 clone/release verification is recorded in docs/PROGRESS.md after its gates. Pattern scanning full reachable git history found zero targeted private-key/provider-token/credentialed-Atlas patterns; this is limited detection, not mathematical proof. Only .env.example tracked; local .env placeholders ignored. Audit remains0high/critical,5moderate/4low, preserving React18/Router6/Node20 requirements. Historical Dependabot major-upgrade failures were not merged or erased.

Final audit also added NGO-personalized nearby food ranking and dashboard cards, not only restaurant-to-NGO recommendations. Same explainable rules score capacity/hours/diet/category/distance, with10km/200candidate bounds and pagination. Endpoint tests cover authenticated success, dietary rejection, invalid query,401and403; UI regression covers ranked food and forecast category.

Final Phase10 local checkpoint after all audit fixes:113tests, lint, build, desktop/mobile full E2E pass. Services coverage95.35lines/93.44statements/90.91functions/87.11branches; client87.10/85.21/85.91/85.48. These supersede earlier intermediate percentages. Final measured Lighthouse/axe results are in PERFORMANCE.md. Final exact release checks are recorded separately in docs/PROGRESS.md, not inferred from local evidence.

PWA returning-client follow-up:115unit/integration/component tests plus an actual two-revision production service-worker browser regression. Waiting update shows explicit finish/save-form warning; only click requests activation/reload. Workbox prompt workers may not emit controllerchange for existing tabs, so activation statechange is also observed. Real lifecycle regression passes and is now a required CI step after browser installation. Initial PWA-only CI40802506209 passed functional/container checks but missed one unchanged-backend load gate; retained in PERFORMANCE.md and not merged on that result.

Availability regression adds test116: repeated health probes do not consume the user limiter, malformed probe query still400, and normal traffic remains limited. Live Render logs conclusively showed internal health429with remaining0before routing502. Exact corrected-head CI and full-window live verification remain required.

Location usability regression:119tests plus desktop/mobile full E2E. Component tests cover explicit-only fresh geolocation, success, denial, browser unsupported, saved organization location and clearing browse area. Actual Chromium E2E denies permission, selects map center manually, then permits geolocation for restaurant/NGO organization creation and uses saved organization location for posting. No raw coordinate entry in those forms. Desktop/mobile manual-map screenshots inspected for readable controls and no overflow. Address search is not implemented or claimed; manual selection uses the map, with no paid provider and no private address disclosure.

Groq adapter preparation:124tests/lint/coverage/build pass locally. New mocked provider tests cover text/vision payloads and strict output, quota429without paid-provider fallback, missing key, malformed one-retry JSON, invalid oversized response and bounded forecast text. No live account/key success claimed before configuration and Free-plan verification. Original Anthropic path remains available only when explicitly selected; Groq errors never call it.

Groq actual Free-confirmed key checks used synthetic text/forecast plus generated non-food labeled image only. Validated text/photo outputs and forecast prose succeeded; initial text attempts also fell back safely, so live success is not treated as guaranteed availability. Low reasoning effort is selected for the bounded GPT-OSS text budget; Qwen image mode disables reasoning per provider documentation. Vision remains preview. API key remains private, not committed, and no paid plan/payment method or paid-provider failover was enabled. Non-AI load miss300.349171ms is retained in PERFORMANCE.md despite later diagnostic passes.
