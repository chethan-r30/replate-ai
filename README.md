# ReplateAI

A JavaScript MERN application in development for restaurants to share surplus food with NGOs.

## Status

Phase 0: repository tooling. No deployable app or production-readiness claim yet.

## Development

Use Node 20 (`nvm use`), then `npm install`.

- `npm run lint`: ESLint
- `npm test`: Vitest
- `npm run format:check`: formatting
- `npm run build`: workspace builds as they are implemented

`client/` will contain React 18 and Vite. `server/` will contain Express and MongoDB. Secrets must stay in gitignored `.env` files. Example files contain placeholders only.

## Contribution flow

Work from `develop` on feature branches, run checks and merge through pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

## Foundation local modes

`npm run dev` starts an explicit disposable sandbox: an in-memory MongoDB process and ephemeral JWT secrets. Data and sessions do not survive restarts. The committed and ignored environment files are not rewritten. Missing Claude, SMTP and Cloudinary credentials must not silently simulate successful integrations.

`npm start -w server` is strict: replace MongoDB and JWT placeholders before startup. Production requires an HTTPS client URL. For Docker, replace the JWT placeholders first and run `docker compose up --build`; MongoDB remains private to the local host/network. Docker configuration is included but needs a Docker-capable environment for execution validation.
