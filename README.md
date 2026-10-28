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
