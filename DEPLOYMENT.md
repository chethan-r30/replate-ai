# Deployment runbook

Verified2026-10-29: frontend https://replate-ai-sigma.vercel.app/ ; API https://replate-api.onrender.com/ . Current deployed app870afad passed full CI40760838986 and automated Vercel prebuilt40761256168. Atlas synthetic seed and live browser post-to-pickup, refresh rotation/replay, private sockets and admin/mobile layout passed. This is the accepted free demo, not production readiness. No paid upgrades, card holds or automatic-charge exposure are authorized.

## Architecture and current hosting limits

Frontend: Vercel, repository root, Vite build output client/dist. API: long-running Node20 Express/Socket.IO service on Render. Data: isolated MongoDB Atlas demo database with transactions. Images: Cloudinary. Email: SMTP.

Current vendor documentation checked2026-10-28:

- Vercel supports external API rewrites: https://vercel.com/docs/routing/rewrites . Use the frontend origin for /api so host-only Secure SameSite Strict refresh cookies are first-party. Do not change to cross-site None cookies as a workaround.
- Vercel now supports WebSockets/Socket.IO with Fluid compute, websocket-only transport, and reconnection at function maximum duration: https://vercel.com/docs/functions/websockets . It is not accurate to say Vercel cannot host sockets. The existing backend is not yet adapted/tested as Vercel functions.
- Vercel Hobby cron runs only daily, with per-hour precision; it cannot preserve minute expiry checks and15minute match escalation: https://vercel.com/docs/cron-jobs/usage-and-pricing . Do not migrate the full backend just because the frontend uses Vercel.
- Render Free sleeps after15minutes without inbound traffic, can restart anytime, has no shell/one-off jobs, and blocks SMTP ports25/465/587: https://render.com/docs/free . A free demo therefore has delayed scheduled work and no SMTP on those ports. It is not the full production definition of done. An always-on plan or separately verified scheduler/email approach requires the owner's choice and, for any cost, approval. Do not use artificial pings to evade free-plan limits.

## 1. Atlas

Use the owner's existing account and project, never change GitHub email privacy to bypass login. Setup references:
https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/
https://www.mongodb.com/docs/atlas/connect-to-database-deployment/

1. Create an isolated ReplateAI demo project/Free cluster only after reviewing its current limits/terms. Do not enable paid upgrades or sample data silently.
2. Create a database user separate from the Atlas account, restricted to readWrite on the replate database. Store the generated password in a secret manager, never Git or chat.
3. Add the Render service's verified outbound IP ranges to Network Access. Add your exact local IP temporarily only if seeding locally, then remove it. Do not default to0.0.0.0/0.
4. Connect > Drivers > Node.js. Put the credentialed URI with database replate into Render MONGODB_URI securely. Percent-encode password characters. Do not paste it into documentation or logs.
5. Wait for ready state and verify transactions/index initialization using /api/v1/ready. Production requires a replica set, not standalone Mongo.

## 2. Render API

render.yaml specifies main, checksPass deploys, Docker, /api/v1/health and Free plan. The deployed service matches this configuration; free-demo sleep/reminder/email limits were accepted.

Set these in Render environment settings, not committed files:

Required: NODE_ENV=production, PORT=10000, CLIENT_URL=the exact final HTTPS Vercel origin, MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET.

JWT secrets must be independent random values of at least32characters. Render generateValue can generate them directly. scripts/generate-secrets.js is a local option; do not put its output in terminal transcripts shared with others.

Optional integrations: ANTHROPIC_API_KEY, ANTHROPIC_MODEL=claude-sonnet-4-6, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, REDIS_URL. Missing Claude uses manual/numeric/rule-based fallback; missing Cloudinary returns unavailable, missing SMTP does not deliver verification/reset mail. Real signup cannot be certified without working SMTP.

JWT_ACCESS_EXPIRES=15m, JWT_REFRESH_EXPIRES=7d, RATE_LIMIT_WINDOW_MS=900000, RATE_LIMIT_MAX=100, AI_RATE_LIMIT_PER_HOUR=20 may use validated defaults. GOOGLE_CLIENT_ID/SECRET are placeholders only: optional OAuth is not implemented. COOKIE_DOMAIN is not used to widen host-only cookies.

The backend rejects non-HTTPS production requests and trusts one proxy hop. Verify actual Render forwarded protocol and health checks after deploy. Never weaken HTTPS to make a probe green. Readiness should establish DB connectivity; health is process availability.

## 3. Vercel frontend and same-origin auth

1. The owner approved acknowledgement of the updated terms/privacy notice with optional training/data-sharing OFF. The dashboard confirmed Opted out. Keep that setting OFF.
2. Import chethan-r30/replate-ai into the existing personal Hobby workspace, repository root. Use vercel.json: npm ci, npm run build -w client, output client/dist. Production branch main. No paid upgrade.
3. Once the API origin is real, run locally:

```sh
REPLATE_API_ORIGIN=https://your-verified-api-origin node scripts/configure-vercel.js
```

This validates a plain HTTPS origin and puts /api rewrite BEFORE the SPA catchall. Review/commit the resulting public origin. The committed vercel.json now proxies the verified Render origin before the SPA catchall.

4. Set VITE_API_URL=/api/v1 and VITE_SOCKET_URL=the verified HTTPS Render API origin. Never put a secret into a VITE variable: it ships to every browser. Socket auth uses the in-memory bearer token, not the refresh cookie.
5. Set Render CLIENT_URL to the exact Vercel origin. Preview URLs are not authorized automatically; test on a fixed allowed origin or explicitly configured isolated preview deployment.
6. Verify login/refresh/logout across browser reload through the Vercel /api proxy, secure host-only cookies and no caching of private/auth responses. External proxy preserves origin/protocol headers according to Vercel docs, but only live browser evidence can establish final behavior. Test sockets independently and verify re-fetch after reconnect.

## 4. Seed synthetic demo data

npm run seed never deletes existing data and refuses an already-seeded demo. It creates1admin,3restaurants,3NGOs,20listings and60days of history per restaurant(180records). Names, proof URLs, addresses and food are explicitly synthetic, not real collectable food.

Use an isolated demo database. Set MONGODB_URI and a unique SEED_PASSWORD securely in the environment. For a remote URI, additionally set SEED_ALLOW_REMOTE=true after checking the destination. Run npm run seed. Never commit the password. Accounts are admin@demo.replate.invalid, restaurant1 through3@demo.replate.invalid and ngo1 through3@demo.replate.invalid. All share the supplied demo-only password and are preverified only for this synthetic environment. Do not expose a public admin credential or reuse personal passwords. Reset/access-control the demo before real users.

Tests verify exact counts,60distinct dates, remote-target guard and no overwrite on a second run. Seeding production real-user data is outside this demo command's intended scope.

## 5. CI/CD and monitoring

Every PR runs Node20 lint,100+tests/coverage,build,desktop/mobile E2E,Docker and three independent200-user load trials; ANY missed300ms p95 fails. Main is protected. Render checksPass deploys only after branch checks. Vercel remote Git builds are disabled because they reject Node20; the exact-SHA prebuilt workflow below replaces them. Do not create deploy hooks that bypass checks.

Optional uptime workflow runs every6hours only when repository variable REPLATE_API_URL is set. Example after deployment:

```sh
gh variable set REPLATE_API_URL --repo chethan-r30/replate-ai --body https://your-verified-api-origin
```

It is a health check, not a sleep-prevention workaround. Structured logs omit request queries, bodies and auth cookies. Do not enable logging of tokens, database URIs or email action links. Optional Sentry is not configured yet.

## 6. Live verification and rollback

```sh
SMOKE_FRONTEND_URL=https://your-verified-frontend SMOKE_API_URL=https://your-verified-api node scripts/verification/live-smoke.mjs
```

The smoke script reads home,SPA deep-link,health,ready and public impact, never mutates data. Then run a real browser synthetic restaurant post -> NGO claim -> restaurant pickup code flow, desktop and mobile. Verify refresh after reload, socket notifications, cron behavior, no mixed content, CSP and accessible layouts. Do not report success from a200status alone. Save inspected screenshots and exact URLs.

Before a rollback, inspect database compatibility: code rollback does not undo committed claims. Render rollback is available subject to plan retention; Vercel can promote a prior verified deployment. Re-check ready/auth and claim consistency after rollback. Delete temporary seed IP access and test accounts/credentials when the demo ends.

## 7. Exact Node20 prebuilt automation

Vercel no longer accepts remote Node20 builds. Keep application builds on Node20; static assets contain no Node runtime. `.github/workflows/vercel-prebuilt.yml` builds the exact successfully checked main SHA under Node20, packages `client/dist` with `scripts/prepare-vercel-output.js`, and deploys static-only output using a separate supported CLI tooling runtime. Official routing conversion preserves root security headers, API proxy and SPA fallback. `.vercel` is ignored; never package `.env` or auth storage.

GitHub production environment must allow main only. Required environment secret: `VERCEL_TOKEN`, project-only for replate-ai. Repository variable: REPLATE_PREBUILT_DEPLOY_ENABLED=true. The workflow contains nonsecret VERCEL_ORG_ID=team_93k0oAoRqyU0cp8GicAOiDR7 and VERCEL_PROJECT_ID=prj_U5p74ZW6uNj2AflQD5iCHdo9KOzg. The workflow passes exact project/team IDs, not `--scope` or project-name lookups, because those require broader permissions. First scoped-lookup run40758434038 failed; corrected automated40761256168 succeeded. Historical failure is not hidden.

Set the secret using a secret manager or a private local environment, never command text in a shared transcript. Example with an already-secure shell variable: `printf %s "$VERCEL_TOKEN" | gh secret set VERCEL_TOKEN --env production --repo chethan-r30/replate-ai`. Do not echo the value. CLI deployment itself should use the workflow's pinned versions/flags.

The project token expires2026-11-27T19:20:37.887Z. Rotate beforeNovember26: create project-only replacement, securely update production secret, verify automated deploy, revoke old token. Existing static app stays up when the token expires, but new frontend deployments stop. Private vault label: ReplateAI Vercel project deploy. Owner support follow-up is arranged before expiry.

## 8. Actual resource and acceptance state

Atlas project ReplateAI uses Free Mumbai cluster, readWrite@replate user restricted to that cluster. Only Render egress74.220.52.0/24 and74.220.60.0/24 remain allowed. Seed-machine IP was temporary and removed. Render is Free Singapore Docker service, health /api/v1/health, main after successful CI, exact CLIENT_URL=https://replate-ai-sigma.vercel.app. No billing settings/card changed.

Seed transaction:1admin,3restaurants,3NGOs,20listings,180history rows/60days. Password is private vault item ReplateAI synthetic demo accounts. The live acceptance added one synthetic12-serving listing and completed it; another isolation test claim was cancelled. Public count21 and synthetic meals12 were observed. Listings have real expiry rules; do not promise seeded food stays available indefinitely. Create fresh synthetic examples if windows expire, not real pickup offers.

Refresh-cookie attributes and replay rejection, browser session restore, own-vs-unrelated Socket.IO room isolation and390px admin/dashboard layout passed. Live public health/readiness/impact and SPA routes passed. Automated signup-to-pickup also passes desktop/mobile against disposable infrastructure. External SMTP, Cloudinary and Anthropic remain unconfigured. Render Free does not offer production reminder timing; no artificial keepalive was added. Uptime variable was corrected and actual run40797914282 passed; schedule remains every6hours.

Before real users: configure and test external services, approve always-on scheduling if needed, recheck provider limits/billing, choose backups/retention, rotate demo credentials, inspect production-topology load and independent security/food-safety operations. No optional OAuth or Sentry implementation is claimed.
