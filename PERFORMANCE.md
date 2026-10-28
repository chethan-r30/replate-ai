# Performance evidence and open gate

Measured 2026-10-28. Phase7 is **not complete**: the 200-connection transactional-claim p95 target is still missed locally.

## Frontend

Production Vite build, Chromium and Lighthouse13.6.0, simulated mobile throttling, local API. Lighthouse13 measurement tooling uses Node22; the app, unit/integration tests and build use the requested Node20. Lighthouse12 was tested first but removed because its dependency chain had high advisories. Current audit has zero high/critical advisories.

| Page     | Before Performance / Accessibility / Best Practices / SEO | After               |
| -------- | --------------------------------------------------------- | ------------------- |
| Home     | 99 / 95 / 96 / 91                                         | 100 / 100 / 96 / 91 |
| Listings | 94 / 95 / 96 / 91                                         | 95 / 100 / 96 / 91  |
| Login    | 99 / 95 / 96 / 91                                         | 100 / 100 / 96 / 91 |
| Impact   | 91 / 95 / 96 / 91                                         | 93 / 100 / 96 / 91  |

Contrast changed from stone500 to stone600 on cream backgrounds. These scores meet the local key-page90 targets, not a guarantee of production scores. Best Practices includes expected anonymous refresh401 console noise. Full report HTML/JSON is generated in ignored test-results by `npm run test:lighthouse` using Node22.19 or newer.

Initial route JS:110.01KB gzip, below 250KB. Dashboard and map are lazy loaded. Bundle analyzer generates test-results/bundle.html with `npm run analyze`. Map45.48KB gzip and dashboard121.60KB gzip are separate route chunks. Images use lazy loading, dimensions and Cloudinary auto-format/quality/width srcset only on known Cloudinary image-upload URLs.

## Database and API

`node scripts/verification/indexes.mjs` verifies real explain plans with 500 disposable listings: status/bestBefore uses status_1_bestBefore_1 IXSCAN, restaurant history uses restaurant_1_createdAt_-1 IXSCAN, nearby query uses GEO_NEAR_2DSPHERE/location index. Results are saved to test-results/index-plans.json.

API compression and ETags are enabled. Public browse cache is one second, bounded to 1000 keys; it is advisory, never used to approve a claim. Local mutations clear it and claims always validate current database state. Public impact caches 60seconds. Forecasts cache six hours, optionally in Redis if REDIS_URL is set. Redis failure falls back to bounded process-local cache. No Redis account is created or required. Auth reads remain live, with lean projections where appropriate; no stale permission cache.

## Load

Local capacity:2 CPU cores, about2GB RAM. Disposable single-node replica set. API and autocannon run in separate processes, on the same host.200 simultaneous connections, exactly200 distinct listing claims and persisted reservations checked.

| Check           | Before                                                                           | After                    | Target                  |
| --------------- | -------------------------------------------------------------------------------- | ------------------------ | ----------------------- |
| Search p95      | 287.63ms original shared-event-loop baseline;430.95ms isolated uncached baseline | 202.24ms isolated cached | below 300ms             |
| Claim p95       | 1451.30ms                                                                        | 1099.38ms                | below 300ms, **missed** |
| HTTP/error rate | 0%                                                                               | 0%                       | no unexpected failures  |

A longer200-connection,2000-distinct-claim run also missed at1134.96ms p95, with zero failures and2000 persisted claims. At20 connections claim p95 was171.39ms, but this does not replace the200-connection requirement. One pool-tuning experiment had a search timeout and was discarded as a failed experiment. Larger pools alone did not solve the latency. Transactions and rollback guarantees were retained.

Independent CI load measurement completed: https://github.com/chethan-r30/replate-ai/actions/runs/40722068790 . Ubuntu-latest, Node20.20.2, disposable single-node Mongo replica set, separate API/load processes on the same runner. Search p95 233.64ms, claim p95 1094.61ms, zero errors/non-2xx and200 distinct persisted claims. The CI result corroborates the local latency miss; it does not establish that purchasing capacity will fix it. A targeted command profile under200 connections measured DB-command p95 around224ms for finds,253ms for reservation updates,227ms for inserts and161ms for transaction commits. The safe path has several sequential operations; removing transactions is not an accepted optimization. Pool warming did not meet the target. CI success means execution/correctness success only, not that latency passed. Do not mark Phase7 complete until a comparable measured workload is below 300ms or the user changes the requirement. Dedicated production capacity may be needed; no paid infrastructure has been authorized or purchased.

Automated axe WCAG2A/AA and2.1AA checks on mobile home/listings/login/impact found zero violations. Browser checks are a baseline, not a full accessibility audit.

A single-query user/organization join was tested to shorten one permission lookup without caching. It did not improve claim p95 (1185ms) and was reverted. Profiling can be rerun with PROFILE_DB=1 npm run test:load. No repeated trial is warranted without a new hypothesis.

A100ms notification burst-coalescing experiment reduced local claim p95 only to1011ms, still above target. The in-memory queue was not retained: crash-safe notification delivery would need a durable outbox, and a small latency gain does not justify introducing a loss window. Existing immediate persistence behavior is preserved.

A second CI artifact (run40723132113, commit da089ca) records runner topology:4 CPU cores,16.76GB RAM, Linux7.0 Azure, Node20.20.2, same single-node replica set and separate API/load processes. Search176.37ms p95, claim1508.38ms p95, zero failures,200 persisted claims. This also misses the target and contradicts a claim that more host cores/memory alone guarantee a fix. No infrastructure purchase is recommended from this evidence.

## In-progress invariant-preserving microbatch redesign

Overlapping permission reads are grouped for3ms, without retaining completed snapshots. Claim creation groups for10ms, at most200 requests per transaction, using bulk conditional reservations and generated claim records. Every response waits for commit. Notifications persist in the same transaction; websocket/email remain post-commit best effort. Mixed invalid requests reject individually; write failures roll back the whole transaction. Race/idempotency/multi-listing claim and notification-insert failure tests pass. A crashed process loses only unanswered queued requests, never acknowledges uncommitted state.

This reduced local p95 from~1.1s to336ms; lean insertion of server-generated records with explicit timestamps then measured278.98ms with200 distinct claims,0 failures. This first below300ms local result is not final signoff: latest code must pass equivalent CI, coverage, failure tests and full browser flows. Earlier pre-lean microbatch CI run40724929128 measured393.96ms and is not represented as a pass.

The benchmark now strengthens the workload to200 distinct NGO users/organizations, not200 connections sharing a token. A25ms batch window and reusable HS256 KeyObjects avoid per-request asymmetric-key parsing. Latest local profile: claim222.33ms, search225.93ms, zero errors,200 distinct successful claims. Verify latest CI and distinct-NGO assertion before signoff; an earlier10ms variant varied up to590ms and is not a reliable gate pass.

Independent distinct-user CI run40725712869 missed at625.18ms, despite the local219ms result. Therefore the gate is not passed. Next targeted correction: readiness now awaits all model/index initialization before serving traffic, to avoid first-mutation DDL; profile output is enabled for CI to check whether requests actually coalesce to one transaction under runner scheduling. The benchmark makes one authenticated read before the mutation burst; original search warmup remains unchanged. This is declared rather than silently changing workload.

Readiness-corrected distinct-user CI run40726061905 measured318.88ms claim p95 and254.09ms search,0 errors,200 distinct NGOs. This is still a miss, not rounded down to300ms. The next test uses a40ms bounded batch window to reduce runner scheduling fragmentation; latest local25ms result237ms is not substituted for CI.

40ms distinct-user CI measured305.77ms claim p95, still a miss, versus local233ms. The load generator previously signed JWTs inside setupRequest; tokens are now precomputed to remove client CPU work from the measured request preparation. Server still validates every JWT and the200 distinct user/workload checks are unchanged. Latest local token-precomputed run:229.65ms claim,228.29ms search,0 failures. Do not round the prior305.77ms to a pass.
