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

Performance regression gate reopened: postmerge313.59ms and Phase8 CI467.92ms claim p95. Original threshold remains enforced; Phase8 PR10 unmerged/deployment blocked. Profiling isolates slow concurrent commit bursts (260ms p95 commit, three batches).70ms batch collection experiment local273.77ms passes with one43.7ms transaction; this is pending CI, not completion. Latest branch feat/phase-8-security/head538ccff.98 tests still pass after change.

70ms CI40728808949 failed329.59ms despite one transaction and low commit2ms; this disproves concurrent commit bursts as the whole cause. Current security PR10 stays open. Next action: inspect latest CI40728879215, retain failure evidence, add stage-level auth/queue/response timing before another optimization. Do not merge on a lucky pass. No deployment attempted.

Performance regression corrected with measured headroom: three independent disposable trials CI40730689271 claims203.82/193.92/225.61ms,search86.73/92.32/89.28ms,0errors/200distinct NGOs each.100 tests/coverage and E2E pass. Current85468b8 full foundation CI pending; previous8598ea2 full CI40730475647 succeeded. Require exact final head full gates before Phase8 merge, then Phase9.

Phase8 PR10 merged after exact-head CI40731129524 full success, including100tests,E2E,Docker and three load trials266.47/199.32/232.28ms. Six independent trials now pass. Phase9 active: seed102test scope,Render/Vercel templates,validated same-origin API rewrite generator,live read-only smoke and optional6hour uptime workflow prepared. Render/Vercel existing accounts accessible via GitHub. Vercel changed terms blocked import; optional training not selected. Atlas GitHub denied; user confirmed Google route/chethanrv33@gmail.com and secure login request was sent via parent. Await saved entry. No recovery/privacy changes. Render Free sleep/SMTP restrictions and Vercel Hobby daily-only cron mean free deployment cannot be called full production; decisions reported to parent. No service created, no live URL yet.

Phase9 current checkpoint: checked PR12 released the app to main, but postmerge run40740789367 missed301.30396ms in one trial. Phase9 remains incomplete and live activation held. PR13 native conditional writes retain explicit transaction sessions/rollback; PR25 replaces joined permission lookup with parallel projected current reads sharing one collection window. PR25 exact-head full CI40742067892 passes, claims226.34/138.28/159.64ms,0errors/200distinct. Release PR24 must pass its updated head before merge.

Free-demo scope accepted through the user's conversation after explicit sleep/reminder/email limits. Vercel updated notice acknowledged with training OFF. Isolated Atlas Free cluster/user and only verified Render regional egress allowlist provisioned. Render Free Singapore service exists with initial build cancelled, private DB URI/generated JWT secrets saved; CLIENT_URL and one-time seed remain pending. No paid plans/card/broad network access. No working live frontend/API or pickup smoke result yet. See DEPLOYMENT.md for current setup, PERFORMANCE.md for retained failed trials. Phase10 final verification has not begun.

## Phase9 completed: 2026-10-29 live demo acceptance

This checkpoint supersedes the incomplete deployment states above, without erasing failed checks. Main870afad passed full CI40760838986:106tests, coverage gates, lint/build, desktop/mobile role E2E, Docker and three independent200-user load trials. Claims253.47/254.19/234.38ms; search96.46/94.59/111.43ms, zeroerrors,200distinct persisted claims/reservations each. Prebuilt Node20 Vercel deploy40761256168 succeeded. Render deployed the same main SHA. Uptime workflow40797914282 passed after REPLATE_API_URL was configured; previously it skipped, which was a monitoring defect rather than successful monitoring.

Stable frontend https://replate-ai-sigma.vercel.app/ and API https://replate-api.onrender.com/ are live on the accepted free-demo scope. Atlas seed transaction created1admin,3restaurants,3NGOs,20synthetic listings and180history rows covering60days. Exact temporary seed IP was removed; only Render regional egress ranges remain allowed. Private demo password is in the owner's vault, not this repository.

Actual production UI: restaurant1 login, create Synthetic live acceptance bread12servings, NGO1request, restaurant approval, six-digit-code handover, picked_up history and12meals saved all passed. Public listing count became21. Browser reload restored the session via refresh. Explicit live checks verified rotated refresh cookie, HttpOnly/Secure/SameSite=Strict, old-token reuse401, own-organization Socket.IO hint and zero unrelated-organization hints; additional test claim was cancelled. Admin dashboard login and390px mobile visual inspection passed. Browser signed out after tests.

This is a working synthetic demo, not production readiness. SMTP, Cloudinary and Anthropic are not configured. Render sleeps and reminders pause. No real food pickup is offered. Phase10 final documentation/fresh-clone verification follows in its own commit.

## Phase10 implementation and local final checks

Original acceptance reconciliation is in ACCEPTANCE.md. The audit fixed missing /api/docs, real-history matching reliability, NGO personalized food ranking, pickup-before UI, forecast category UI and reconnect invalidation rather than hiding them in documentation. OpenAPI inventories41actual paths/47operations and derives payload schemas from route Zod validators; a regression checks actual Express methods. Self-hosted read-only Swagger rendered at desktop/mobile with no JS errors. Additional tests cover15minute escalation and reminder idempotency.

Node20.20.2 lint,113tests/coverage,build and desktop/mobile signup->approval->post->pickup/admin E2E passed after these fixes. Coverage services lines95.35/statements93.44/functions90.91/branches87.11%; client87.10/85.21/85.91/85.48%, configured80/70thresholds enforced. Routes/models/jobs have integration coverage but are not in this percentage denominator. Audit0high/critical,5moderate/4low. Full reachable-history targeted credential patterns0matches; only .env.example tracked. Fresh main clone npm install/dev/frontend200/APIready200/lint/tests/build passed before final code changes; exact release fresh clone remains required.

Final built-client Lighthouse with supported Node22 measurement tooling: home100/100/96/91, listings95/100/96/91, login100/100/96/91, impact92/100/96/91 (performance/accessibility/best-practices/SEO). Mobile axe zero tested violations. Application build/runtime remains Node20. Initial JS110.02KB gzip. Final exact PR/develop/release/main checks, automatic deploy and live docs/recommendation verification remain before completion.

## Exact main release verification

Release PR36 main8714ea69d3ee324789403511d1f9196ad2c4f6ef passed full CI40800380738:113tests/coverage/lint/build, desktop/mobile role E2E, Docker and three independent200user load trials. Search73.63/75.49/82.14ms; claims260.17/219.31/264.55ms, zeroerrors/200distinct correct each. Main exact fresh clone npm install/dev/frontend200/APIready200/lint113tests/build passed; ignored .env files exactly match placeholder examples. Reachable-history targeted credential scan0matches. Main protection now explicitly enforces strict foundation/load-baseline checks plus PR/admin/no-force/no-delete; earlier merges had waited checks manually but this provider setting was missing.

Automated Vercel40800659228 succeeded for the exact SHA, stable frontend https://replate-ai-sigma.vercel.app/ . Render automatic dep-dbha330u01pc73a2scig deployed the same SHA. Public https://replate-api.onrender.com/api/docs/ actually rendered and /api/openapi.json returned200with41paths/47operations. Live NGO1ranked food cards now show score/explanation rather than404. Home/SPA/health/ready/impact smoke passed. Original actual post-to-pickup/auth/socket checks remain above.

Final visual follow-up PR37 fixes an action-row layout found in actual deployed pixels: recommendations had stretched organization/explore controls. Corrected local desktop/mobile pixels inspected, no overflow. This small follow-up still needs exact checked release and live pixels before final closeout; do not infer deployment from source or local render.

## Final usable-demo release and remaining acceptance qualification

2026-10-29: PR39 exact2fa7e6f CI40803825144 passed119tests, configured coverage, build, actual two-revision production PWA update lifecycle, desktop/mobile full registration-to-pickup E2E and containers. Updateddevelop/release40 CI40804140529/40804147045 passed before main merge. Maina03615f1f55f3318ffdca8617cb76f8a51c29f74 own CI40804529871 passed; search89.53/95.94/88.50ms, claims229.56/236.36/245.14ms,zeroerrors/200distinct correct each. AutomatedVercel40804833998 passed sameSHA. Exact main link: https://github.com/chethan-r30/replate-ai/commit/a03615f1f55f3318ffdca8617cb76f8a51c29f74 .

User location usability correction deployed: browse/org/listing no longer ask for raw coordinates. Explicit Use my location, manual map selection after denial, keyboard map-center selection and saved organization location reuse. No paid provider/address search added. Real desktop/mobile E2E exercises denial/manual selection plus geolocation organization creation and saved-location listing post. Screenshots wait until tiles finish fading in. Live stable mobile browse map/pin/filter was inspected legible, no overflow, active worker/no waiting.

Live health incident: old provider probes every5seconds exhausted global100/15minute user limiter, generating429and public502. Only health/ready GETs now bypass that limiter; strict validation/security and normal-user rate limits remain tested. Corrected Render cutover07:41:58IST. Public health/ready200JSON07:42:11and07:58:39, same corrected instance lfmxr. Initial probes and latest50visible probes200/no limiter headers; final sample spans~07:55:01-07:58:31. Dashboard virtualizes logs, so this verifies start/end+sameinstance across16m41s, not inspection of every intervening probe. Public analytics/OpenAPI41paths/Swagger also200. No postcutover429/502 observed. This is a bounded correction check, not an availability SLA; free sleep remains.

Fresh corrected develop clone Node20 install/dev(frontend200/APIready200)/lint119tests/build and clean ignored placeholder envs passed. Services measured lines95.35/statements93.18/functions90.91/branches86.60;client83.13/81.78/80.11/81.99 after location code. Both configured thresholds pass. Percentage denominator remains services+AI/client, not whole-server. No productioncredentials in source or localplaceholderenv.

Usable synthetic demo, not full production acceptance: previous480.35ms durable-commit outlier is retained in PERFORMANCE.md and means original300ms repeatability is unresolved despite final gates passing. No threshold/durability weakening or unapproved paid upgrade. Claude/Cloudinary/SMTP success absent until keys/provider setup; free sleep pauses reminders. Optional OAuth/Sentry/volunteer assignment remain explicitly absent.

Stable app https://replate-ai-sigma.vercel.app/ ; API docs https://replate-api.onrender.com/api/docs/ . Login restaurant1@demo.replate.invalid or ngo1@demo.replate.invalid using private vault item ReplateAI synthetic demo accounts. Never publish its password. Seed pickup windows expire08:34ISTOct29; create new synthetic listings for later flows, do not portray expired samples as available food. No real food/organization verification is represented.
