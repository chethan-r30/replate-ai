# Contributing

Use Node 20 and npm. Use plain ES2022 JavaScript and JSX, never TypeScript.

1. Branch from `develop` using `feat/short-name` or `fix/short-name`.
2. Keep functions small and explain their purpose with short comments.
3. Validate all external inputs using Zod. Keep authorization on the server.
4. Add tests, then run `npm run lint`, `npm test` and `npm run build`.
5. Use conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
6. Open a PR into `develop`; release through a PR into `main`.

Never commit secrets, real credentials or personal data. Do not bypass a failed phase gate. Do not claim that unrun checks passed.
