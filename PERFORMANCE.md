# Performance evidence and open gate

Measured 2026-10-28. Latest corrected-head three-trial CI40730689271 meets the performance target: claim p95=203.82/193.92/225.61ms and search86.73/92.32/89.28ms,0errors,200distinct NGO claims/reservations each. Earlier postmerge failures below are retained. Full exact-head security CI must finish before Phase8 merge.

## Frontend

Production Vite build, Chromium and Lighthouse13.6.0, simulated mobile throttling, local API. Lighthouse13 measurement tooling uses Node22; the app, unit/integration tests and build use the requested Node20. Lighthouse12 was tested first but removed because its dependency chain had high advisories. Current audit has zero high/critical advisories.

| Page     | Before Performance / Accessibility / Best Practices / SEO | After               |
| -------- | --------------------------------------------------------- | ------------------- |
| Home     | 99 / 95 / 96 / 91                                         | 100 / 100 / 96 / 91 |
| Listings | 94 / 95 / 96 / 91                                         | 94 / 100 / 96 / 91  |
| Login    | 99 / 95 / 96 / 91                                         | 100 / 100 / 96 / 91 |
| Impact   | 91 / 95 / 96 / 91                                         | 92 / 100 / 96 / 91  |

Contrast changed from stone500 to stone600 on cream backgrounds. These scores meet the local key-page90 targets, not a guarantee of production scores. Best Practices includes expected anonymous refresh401 console noise. Full report HTML/JSON is generated in ignored test-results by `npm run test:lighthouse` using Node22.19 or newer.

Initial route JS:110.01KB gzip, below 250KB. Dashboard and map are lazy loaded. Bundle analyzer generates test-results/bundle.html with `npm run analyze`. Map45.48KB gzip and dashboard121.60KB gzip are separate route chunks. Images use lazy loading, dimensions and Cloudinary auto-format/quality/width srcset only on known Cloudinary image-upload URLs.

## Database and API

`node scripts/verification/indexes.mjs` verifies real explain plans with 500 disposable listings: status/bestBefore uses status_1_bestBefore_1 IXSCAN, restaurant history uses restaurant_1_createdAt_-1 IXSCAN, nearby query uses GEO_NEAR_2DSPHERE/location index. Results are saved to test-results/index-plans.json.

API compression and ETags are enabled. Public browse cache is one second, bounded to 1000 keys; it is advisory, never used to approve a claim. Local mutations clear it and claims always validate current database state. Public impact caches 60seconds. Forecasts cache six hours, optionally in Redis if REDIS_URL is set. Redis failure falls back to bounded process-local cache. No Redis account is created or required. Auth reads remain live, with lean projections where appropriate; no stale permission cache.

## Load

Local capacity:2 CPU cores, about2GB RAM. Disposable single-node replica set. API and autocannon run in separate processes, on the same host.200 simultaneous connections, exactly200 distinct listing claims and persisted reservations checked.

| Check           | Before                                                                           | After                    | Target                 |
| --------------- | -------------------------------------------------------------------------------- | ------------------------ | ---------------------- |
| Search p95      | 287.63ms original shared-event-loop baseline;430.95ms isolated uncached baseline | 202.24ms isolated cached | below 300ms            |
| Claim p95       | 1451.30ms                                                                        | 260.50ms independent CI  | below 300ms            |
| HTTP/error rate | 0%                                                                               | 0%                       | no unexpected failures |

A longer200-connection,2000-distinct-claim run also missed at1134.96ms p95, with zero failures and2000 persisted claims. At20 connections claim p95 was171.39ms, but this does not replace the200-connection requirement. One pool-tuning experiment had a search timeout and was discarded as a failed experiment. Larger pools alone did not solve the latency. Transactions and rollback guarantees were retained.

Independent CI load measurement completed: https://github.com/chethan-r30/replate-ai/actions/runs/40722068790 . Ubuntu-latest, Node20.20.2, disposable single-node Mongo replica set, separate API/load processes on the same runner. Search p95 233.64ms, claim p95 1094.61ms, zero errors/non-2xx and200 distinct persisted claims. The CI result corroborates the local latency miss; it does not establish that purchasing capacity will fix it. A targeted command profile under200 connections measured DB-command p95 around224ms for finds,253ms for reservation updates,227ms for inserts and161ms for transaction commits. The safe path has several sequential operations; removing transactions is not an accepted optimization. Pool warming did not meet the target. CI success means execution/correctness success only, not that latency passed. Do not mark Phase7 complete until a comparable measured workload is below 300ms or the user changes the requirement. Dedicated production capacity may be needed; no paid infrastructure has been authorized or purchased.

Automated axe WCAG2A/AA and2.1AA checks on mobile home/listings/login/impact found zero violations. Browser checks are a baseline, not a full accessibility audit.

A single-query user/organization join was tested to shorten one permission lookup without caching. It did not improve claim p95 (1185ms) and was reverted. Profiling can be rerun with PROFILE_DB=1 npm run test:load. No repeated trial is warranted without a new hypothesis.

A100ms notification burst-coalescing experiment reduced local claim p95 only to1011ms, still above target. The in-memory queue was not retained: crash-safe notification delivery would need a durable outbox, and a small latency gain does not justify introducing a loss window. Existing immediate persistence behavior is preserved.

A second CI artifact (run40723132113, commit da089ca) records runner topology:4 CPU cores,16.76GB RAM, Linux7.0 Azure, Node20.20.2, same single-node replica set and separate API/load processes. Search176.37ms p95, claim1508.38ms p95, zero failures,200 persisted claims. This also misses the target and contradicts a claim that more host cores/memory alone guarantee a fix. No infrastructure purchase is recommended from this evidence.

## In-progress invariant-preserving microbatch redesign

Overlapping permission reads are grouped for10ms, without retaining completed snapshots. Claim creation groups for40ms, at most200 requests per transaction, using bulk conditional reservations and generated claim records. Every response waits for commit. Notifications persist in the same transaction; websocket/email remain post-commit best effort. Mixed invalid requests reject individually; write failures roll back the whole transaction. Race/idempotency/multi-listing claim and notification-insert failure tests pass. A crashed process loses only unanswered queued requests, never acknowledges uncommitted state.

This reduced local p95 from~1.1s to336ms; lean insertion of server-generated records with explicit timestamps then measured278.98ms with200 distinct claims,0 failures. This first below300ms local result is not final signoff: latest code must pass equivalent CI, coverage, failure tests and full browser flows. Earlier pre-lean microbatch CI run40724929128 measured393.96ms and is not represented as a pass.

The benchmark now strengthens the workload to200 distinct NGO users/organizations, not200 connections sharing a token. A25ms batch window and reusable HS256 KeyObjects avoid per-request asymmetric-key parsing. Latest local profile: claim222.33ms, search225.93ms, zero errors,200 distinct successful claims. Verify latest CI and distinct-NGO assertion before signoff; an earlier10ms variant varied up to590ms and is not a reliable gate pass.

Independent distinct-user CI run40725712869 missed at625.18ms, despite the local219ms result. Therefore the gate is not passed. Next targeted correction: readiness now awaits all model/index initialization before serving traffic, to avoid first-mutation DDL; profile output is enabled for CI to check whether requests actually coalesce to one transaction under runner scheduling. The benchmark makes one authenticated read before the mutation burst; original search warmup remains unchanged. This is declared rather than silently changing workload.

Readiness-corrected distinct-user CI run40726061905 measured318.88ms claim p95 and254.09ms search,0 errors,200 distinct NGOs. This is still a miss, not rounded down to300ms. The next test uses a40ms bounded batch window to reduce runner scheduling fragmentation; latest local25ms result237ms is not substituted for CI.

40ms distinct-user CI measured305.77ms claim p95, still a miss, versus local233ms. The load generator previously signed JWTs inside setupRequest; tokens are now precomputed to remove client CPU work from the measured request preparation. Server still validates every JWT and the200 distinct user/workload checks are unchanged. Latest local token-precomputed run:229.65ms claim,228.29ms search,0 failures. Do not round the prior305.77ms to a pass.

Token-precomputation CI run40726636412 measured347.81ms claim p95 and272.36ms search, no errors. This did not solve runner variation. Prior40ms CI profile shows38 finds and two transactions for200 callers, so the next isolated hypothesis increases live-read coalescing to10ms to avoid many fragmented permission reads; completed snapshots are still never cached. Batch commit timings/sizes are now printed only with PROFILE_DB. Live socket hints now debounce50ms per private room; all underlying notification rows still persist before claim responses, and clients re-fetch all rows. A lost socket hint at process exit is not a lost notification.

Read10ms local profile measured245.35ms claim and225.23ms search,0 errors,200 distinct NGOs. One200-item transaction committed in43.1ms; total measured latency includes auth, JSON/server scheduling, batch wait and network.93 unit/integration/component tests pass plus desktop/mobile role flows after the socket-hint change. CI40726937022 pending.

Equivalent independent CI40726937022 now passes the numerical gate: search212.06ms p95, claim260.50ms p95,0 failures,200 distinct NGOs/claims/reservations,4cores/16.76GB. Profile: three transactions of147/48/5 requests, committed in69.1/21.2/7.3ms. This does not prove multi-instance production latency. Exact-head complete CI still required before merge. Load test now fails automatically when either p95 is >=300ms or correctness counts differ.

Final gated run40727183756 passes load at207.31ms claim/134.75ms search, but full CI exposed a real test-isolation race: unfinished post-response nearby notifications from the previous test could write after database cleanup. This is not ignored or rerun blindly. Best-effort jobs are now tracked and test cleanup drains them; matching retry resets its postcommit hint list so aborted transaction attempts cannot duplicate live hints. Phase7 remains pending complete corrected-head CI.

Reopened performance gate: postmerge develop40727914403 missed313.59ms; Phase8 CI40728488357 missed467.92ms (search239.37ms,0errors,200 correct). The latter profile isolated transaction commits at260ms p95, with three concurrent batches120/29/51; find15/update10/insert4ms. Earlier239.88ms and260.50ms passes do not establish reliable headroom. The next bounded hypothesis uses70ms collection rather than40ms to avoid concurrent commit bursts; no write concern/durability setting is weakened. Phase8 remains unmerged and deployment blocked.

70ms CI40728808949 missed329.59ms claims/search254.23ms,0errors/200 distinct correct. It did achieve one transaction (update26/insert4/commit2ms p95), so concurrent commit bursts are not the whole problem. Do not keep increasing the window: that adds latency and still lacks headroom. Next useful profiling must separate request arrival/auth/org lookup/batch wait/persist/response scheduling, then target the dominant stage rather than select a passing runner. Latest docs-only96083a1 run40728879215 is pending; no merge warranted merely if that rerun passes. Phase8 functional suite and E2E are locally passed, but performance remains a cross-phase blocker.

Stage instrumentation local shows auth66-105ms p95 and queue-through-commit122-136ms at70ms window; client p95 adds another30-40ms after server finish. Search generated~1000 geo aggregations per10s because every concurrent cache miss ran the same query. A single-flight public read cache now coalesces identical in-flight misses, invalidates pending refills on mutations and reduces aggregates to10 per10s. This directly fixes a measured stampede and search p95~116ms. Tests cover invalidation during load and error cleanup. A fast-jwt dependency trial did not establish sufficient gain and was reverted; no completed permission or JWT cache is introduced. Next25ms claim batch removes unnecessary70ms wait now that public search pressure is reduced. Exact correctness/200-user threshold unchanged.

CI40730183077 search159.47ms but claim309.14ms,0errors/200distinct; still fails. Single-flight search retained because it removes measured duplicate DB work, not because it solves everything. Next targeted improvement performs live user and approved-NGO reads concurrently for claim creation, rather than two sequential coalescing waits. Both results are new DB reads; role/verification checks still run before claim writes and missing/revoked NGO rejects. No completed permission cache.

Live user/NGO reads now overlap while requiring both current results. Local claim220.83ms/search127.78ms,99tests+full E2E pass. The CI gate now runs three independent disposable trials sequentially and fails if ANY trial misses; artifacts retain each trial. This tests repeatable headroom instead of selecting a passing runner. No workload, count, precision or threshold is relaxed.

## Repeatability checkpoint

Corrected live-read concurrency plus public single-flight cache: https://github.com/chethan-r30/replate-ai/actions/runs/40730689271 . Three independently seeded disposable replica sets, same200-distinct-user workload, all below300ms and zero errors: claims203.82/193.92/225.61ms;search86.73/92.32/89.28ms. Previous corrected-head full CI40730475647 also passed with claim245.54ms/search123.12ms. The load job fails if ANY trial misses, retaining every artifact. These are same-host runner measurements, not a production SLA or proof that multi-instance/remote Atlas latency will match. No write durability, permission freshness or count checks were weakened.

## Phase9 regression and targeted identity-read correction

Later unchanged-workload CI40732526330 and40732719270 reopened the gate. Latest trials claim296.15/327.32/304.61ms and search146.96/147.52/153.02ms, zero errors with200distinct NGO claims each. Earlier six passes did not establish enough headroom. Deployment/merge stays held.

The next measured correction replaces two independent batched permission queries with one fresh batched identity aggregation and an indexed owner lookup for approved NGO IDs. This is not the earlier single-request join: it combines overlapping requests, projects only identity/approval fields for this route and retains no completed permissions. Other routes still receive their normal current user fields. Claim listing reads now project only reservation/deadline fields, rather than unrelated listing text/photos. JWT verification, live approval, transaction/notification persistence and workload remain unchanged. Three local disposable trials measure claims185.73/176.10/177.01ms, search92.95/98.79/98.73ms with200distinct NGO claims and zero errors. CI and full role-flow regression remain required; no pass is inferred from local measurements alone.

The combined identity-read CI40733867913 still misses at303.18/290.21/317.65ms claims (search166.76/158.48/162.13ms),0errors and200distinct successful claims each. Functional/coverage/E2E pass. Cursor profiles show extra getMore calls on the200-row identity/listing batches. The next bounded change requests a1000-row identity batch and200-row listing batch, removing avoidable cursor round trips without changing query contents or cached state. No benchmark rerun of an unchanged head is used for signoff.
