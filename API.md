# API guide

Version prefix: `/api/v1`. Interactive OpenAPI: https://replate-api.onrender.com/api/docs (local http://localhost:5000/api/docs). The server's OpenAPI document is the route/payload authority; strict schemas reject unknown fields.

| Resource        | Operations                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| /auth           | register, login, refresh, logout, verify-email, forgot-password, reset-password, me; password-confirmed account erasure |
| /organizations  | create, update, get; admin list and verify                                                                              |
| /listings       | create/read/update/cancel, filtered geo search, nearby and mine                                                         |
| /claims         | create, approve/reject, pickup confirmation, cancel, mine and feedback                                                  |
| /ai             | parse-listing, forecast, recommendations/:listingId and NGO recommended-listings                                        |
| /analytics      | restaurant, NGO, admin and public impact                                                                                |
| /notifications  | durable list and mark-read                                                                                              |
| /health, /ready | Process availability and database readiness                                                                             |
| /uploads        | Authenticated byte-sniffed image upload when Cloudinary configured                                                      |

Access JWT goes in `Authorization: Bearer <token>`. Refresh uses the first-party auth-path cookie, never a URL. JSON responses use `success` plus `data` on success, `message` and optional validation `errors` on failure.401means missing/invalid authentication,403means role/approval/ownership denied,409means lifecycle/conflict,429means rate limit. Pagination and filters are schema-validated. Organization approval is required even for valid restaurant/NGO sessions. Clients must re-fetch authoritative state after realtime hints; hints are not permission or handover confirmation.

Use the Swagger schema for exact verbs, fields, pagination limits and examples. Never send tokens, passwords or credentialed database URIs to public diagnostics. Authenticated acceptance and raw claim mutations should use synthetic demo data only until production operations are approved.

Private proof: POST /uploads/proof returns a relative proof API path; GET /uploads/proof/{id} returns image bytes only to uploader/admin. Separate from public listing-photo POST /uploads.
