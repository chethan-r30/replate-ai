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
