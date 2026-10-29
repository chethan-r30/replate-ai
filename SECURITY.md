# Security and privacy

Phase8 checks use disposable Mongo replica sets and Node20. No external penetration test or compliance certification is claimed.

- API requires HTTPS in production (one trusted reverse-proxy hop); direct HTTP is rejected. Deploy only behind the intended proxy, with the origin inaccessible to untrusted forwarded-header injection.
- Helmet sets restrictive API CSP/HSTS, no frames and no MIME sniffing. CORS and Origin checks accept only CLIENT_URL. Refresh cookies are host-only/httpOnly, Secure in production, SameSite Strict, limited to the auth path. The deployed same-origin Vercel /api proxy was verified with browser session restore and explicit rotation/replay checks.
- Access tokens stay in memory. Refresh token digests rotate, replay revokes the family. Email/reset tokens are hashed, single use and expiring. Brute-force/global/AI rate limits, body/image limits, Zod strict schemas and Mongo-operator rejection are active.
- Images are byte-sniffed JPEG/PNG/WebP only and reencoded to WebP by Cloudinary; HTML/SVG/local serving is not permitted. This is file-type/reencoding safety, not antivirus certification.
- React escapes user strings. No raw user HTML is rendered. Mongo queries use explicit fields and values. API errors never include stacks; internal error messages are hidden.
- Request logs include method, path without query strings and remote address, not request bodies or authorization/cookie headers. Credential/token fields and response cookies are redacted. Development email links remain in an explicit local inbox, never logs; the inbox route is unavailable in production even if LOCAL_SANDBOX is passed.
- Organization verification, user disable/enable and listing moderation commit together with their audit record. Injected audit failure rolls back the decision. Admin accounts cannot be disabled through the management endpoint.

## Delete my account

DELETE /api/v1/auth/me needs a current bearer token, correct current password and JSON confirmation DELETE. Active requested/approved handovers must be completed or cancelled first (409); admin deletion requires a separate administrator transfer (403). It erases name/email/phone/avatar/password, organization registration/address/proof/location, listing text/photos/location, related feedback comments and notifications. All action/refresh tokens are removed and sockets disconnected. Numeric food/pickup history and non-identifying IDs remain for aggregate impact/audit consistency. The operation is transactional and failure-tested. This endpoint does not delete third-party email copies, external image assets or hosting backups; operators must set retention/deletion procedures for those services before handling real users.

## Dependency and secret checks

2026-10-28 npm audit:0 high/critical,5 moderate,4 low. Remaining moderate findings concern Router6 (explicit version requirement) and development load-tool dependencies. Do not upgrade Router major without checking routing behavior. Dependabot checks npm and Actions weekly. Production and full dependency audits belong in release checks.

A full reachable git-history pattern scan found no provider token, private-key or credentialed Mongo URI patterns. Only .env.example files are tracked; ignored .env files retain placeholders. Pattern scans are limited detection, not proof no possible secret can exist. Never add real keys to Git. Use service environment settings or a secret manager.

## Limits

Rate-limit and cache state are process-local unless explicitly shared. Multi-instance abuse coordination, external delivery credentials and backup retention remain real-service gates. Live HTTPS/CSP, refresh replay and socket isolation passed on the accepted synthetic demo; no penetration-test or production-readiness claim follows.
