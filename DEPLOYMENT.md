# Deployment runbook

Status: Phase9 in progress. Main contains the application after checked release PR12, but its postmerge performance trial reopened the gate. A Free Render service is provisioned, with its initial build cancelled until configuration and release checks are ready. No working live demo has passed verification. Vercel terms acknowledgement is completed with optional training OFF, and Atlas Google sign-in works. Free-demo scope was accepted; no paid upgrades or payment methods may be added.

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

render.yaml is a template, not proof of deployment. It specifies main, checksPass deploys, Docker, /api/v1/health and Free plan for review. The owner accepted free-demo sleep/reminder/email limits. Main now contains the app, but activation remains held for the current numerical performance gate and complete configuration.

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

This validates a plain HTTPS origin and puts /api rewrite BEFORE the SPA catchall. Review/commit the resulting public origin. The starter vercel.json intentionally has only SPA routing until a real origin is known; it is not a working API proxy yet.

4. Set VITE_API_URL=/api/v1 and VITE_SOCKET_URL=the verified HTTPS Render API origin. Never put a secret into a VITE variable: it ships to every browser. Socket auth uses the in-memory bearer token, not the refresh cookie.
5. Set Render CLIENT_URL to the exact Vercel origin. Preview URLs are not authorized automatically; test on a fixed allowed origin or explicitly configured isolated preview deployment.
6. Verify login/refresh/logout across browser reload through the Vercel /api proxy, secure host-only cookies and no caching of private/auth responses. External proxy preserves origin/protocol headers according to Vercel docs, but only live browser evidence can establish final behavior. Test sockets independently and verify re-fetch after reconnect.

## 4. Seed synthetic demo data

npm run seed never deletes existing data and refuses an already-seeded demo. It creates1admin,3restaurants,3NGOs,20listings and60days of history per restaurant(180records). Names, proof URLs, addresses and food are explicitly synthetic, not real collectable food.

Use an isolated demo database. Set MONGODB_URI and a unique SEED_PASSWORD securely in the environment. For a remote URI, additionally set SEED_ALLOW_REMOTE=true after checking the destination. Run npm run seed. Never commit the password. Accounts are admin@demo.replate.invalid, restaurant1 through3@demo.replate.invalid and ngo1 through3@demo.replate.invalid. All share the supplied demo-only password and are preverified only for this synthetic environment. Do not expose a public admin credential or reuse personal passwords. Reset/access-control the demo before real users.

Tests verify exact counts,60distinct dates, remote-target guard and no overwrite on a second run. Seeding production real-user data is outside this demo command's intended scope.

## 5. CI/CD and monitoring

Every PR runs Node20 lint,100+tests/coverage,build,desktop/mobile E2E,Docker and three independent200-user load trials; ANY missed300ms p95 fails. Main is protected. Render checksPass deploys only after branch checks; Vercel Git integration deploys main after release. No GitHub deployment secret is needed for those native integrations. Do not create deploy hooks that bypass checks.

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

## Still pending

Current release performance gate, final Vercel project/origin, Render CLIENT_URL, Atlas one-time seed, live API readiness, same-origin proxy/auth/socket/browser pickup verification and Phase10 final docs/fresh-clone checks. Claude/Cloudinary/SMTP still need real service keys. No production-ready claim.

### Provisioning checkpoint (2026-10-28)

A separate Atlas project ReplateAI was created, leaving existing unrelated projects unchanged. The ReplateAI cluster uses the explicitly selected Free tier ($0/hour), AWS Mumbai, no auto-scaling, no sample dataset and no automated security/user creation. No database credential or allowlist was created yet; database-scoped readWrite on the replate database and explicit hosting egress addresses are still required. No broad atlasAdmin quickstart user is needed.

The user approved acknowledgement of Vercel's updated terms/privacy notice with optional model training/data sharing off. The toggle was set off and the dashboard confirmed "Opted out". The existing Vercel GitHub App was granted access only to this additional repository, retaining the pre-existing selection. Its separate permission-upgrade request was not approved. Import now recognizes replate-ai, but no deployment/project creation has been submitted. The import defaults to main, which is still bootstrap; do not deploy it until the checked release is merged.

Latest CI performance regressions reopen the release gate despite earlier passes. See PERFORMANCE.md. Real API origin, database-scoped credentials/allowlist, working external email/image credentials and live smoke/demo remain outstanding. The Free Render scheduler/sleep/SMTP limitations described above remain unresolved; no paid plan was authorized.

Free-demo scope approved: keep Vercel frontend, Atlas Free and Render Free, synthetic verified accounts only, with explicit sleep/reminder/email caveats. Set VITE_DEMO_MODE=true for the deployed frontend to display these limitations and warn against entering real personal data. Render billing inspection confirmed Hobby, no card on file, current$0charges,15/25services and ample included runtime/bandwidth/build capacity. No card or billing setting was added. Without a payment method, documented quota behavior is suspension/build stop, not automatic payment. This check must be repeated before service creation; do not add payment details. Shared workspace quotas still matter to existing services. Atlas replate_app now has readWrite@replate only, restricted to ReplateAI; password stored securely, no network allowlist yet.

### Provisioning continuation (2026-10-28)

Render service: https://dashboard.render.com/web/srv-dbh3g761egvs739c2vp0/settings . Assigned API origin https://replate-api.onrender.com/ is not yet a verified working API. Singapore, Docker ./server/Dockerfile, root context, main, Free $0, health /api/v1/health, auto-deploy After CI Checks Pass. First automatic build was cancelled while required configuration was incomplete. No card was added; no paid add-ons or preview instances. Billing was rechecked Hobby/no card/low shared usage before creation.

Atlas IP Access List now contains only the two Render Singapore egress ranges shown by this service:74.220.52.0/24 and74.220.60.0/24, both Active. They are shared regional ranges, not dedicated addresses. No0.0.0.0/0 entry. User replate_app remains readWrite@replate, restricted to ReplateAI. The actual Node driver URI was acquired and its credentialed version saved directly in Render without printing it. Separate JWT secrets were generated in Render and saved. CLIENT_URL still awaits the actual final Vercel origin. Nonsecret NODE_ENV/PORT/expiry/model values are saved. No seed-machine IP or demo data has been added yet; one-time seed credential use awaits owner approval.

The frontend proxy config uses the actual Render origin and stays ahead of SPA fallback. Vercel import was inspected with Vite, repository root, npm ci, npm run build -w client, client/dist; demo/API/socket public variables were prepared but the form was not submitted. Re-enter them on the next import. Do not send an assigned or frontend-only URL as a completed demo.
