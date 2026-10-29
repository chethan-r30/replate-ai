# Architecture

## Data and request flow

React routes load on demand. TanStack Query owns remote state, Zustand holds in-memory access tokens/theme, and forms share strict Zod constraints with server-side validation. The browser sends API calls to Vercel /api, forwarded to Render; Socket.IO connects directly to Render with a bearer token. Public reads use short mutation-invalidated caches; permissions are always fresh database reads.

Express validates origin/protocol, rate limits, sanitizes Mongo operators, validates strict inputs, authenticates and checks role/ownership before services execute. Central errors return consistent JSON without stacks. Mongoose models include location2dsphere and compound lifecycle/owner indexes. Atlas replica-set transactions keep listings, claims, notices and numeric history consistent. Public impact reports measured servings/kg rather than pretending unknown weight is known.

## Auth flow

Registration hashes passwords with bcrypt12 and generates hashed single-use email verification tokens. Local disposable mode has a development inbox; production never exposes it. Access JWT lifetime15minutes; refresh JWT7days in a host-only HttpOnly/Secure/SameSiteStrict auth-path cookie. Refresh stores hashes only, rotates each use and revokes its family on replay. Browser reload restores via same-origin refresh. Password-reset tokens expire and are single-use. Organization approval gates posting/claiming; admin decisions and audit rows commit together. Account erasure requires password confirmation and rejects active handovers/admin transfer gaps.

## Claim consistency

Claim creation atomically reserves an available listing and inserts the claim/notification inside a transaction. Current identity/approval is read without completed-permission caching. A bounded scheduler groups bursts with10ms collection, at most200items per batch, two concurrent batches and1000outstanding requests. Mongo conditional writes/conflict retries arbitrate across processes; no success is returned before commit. Approval/rejection/cancel/pickup are guarded transitions. Six-digit handover is confirmed by the restaurant, and history/impact update exactly once. Failure-injection tests verify rollback. Details: [CLAIM_BATCHING.md](docs/CLAIM_BATCHING.md).

## AI and matching

The parser treats note/image content as data, demands JSON, strips code fences, validates with Zod and retries malformed output once.10second timeout, input/token limits and per-user limits bound cost. Human review and food-safety warning remain mandatory; missing Claude returns manual entry rather than invented output.

Forecasting uses exponential smoothing plus weekday seasonality from restaurant/category history. Under14days uses peer category averages. Organization IANA timezone governs calendar/day boundaries, including DST. NGO demand is computed by area. Numeric results work without Claude; optional prose is cached6hours.

Matching starts with Mongo $geoNear candidates and computes weighted distance, pickup feasibility against local hours, category/diet fit, remaining daily capacity, no-show/rating reliability and urgency. It returns score components, not an opaque promise of safety. Top3 organizations receive durable notices/private socket hints; cron escalates after15minutes if unclaimed. Render Free sleep pauses cron, so those timings are not production guarantees here.

## Deployment and boundaries

Static client is built under Node20 and uploaded as Vercel Build Output API files. Render runs the Node20 Docker API; Atlas Free is isolated to the demo DB with readWrite credentials and regional egress allowlist. GitHub protected-main checks gate releases and an exact-SHA prebuilt workflow. No secrets enter client bundles or Git. Keys are environment settings/vault items. See DEPLOYMENT.md for credential rotation and accepted free-tier limitations.
