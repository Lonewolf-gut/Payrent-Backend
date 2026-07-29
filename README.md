# PayRent Backend

REST API, database, business logic, webhooks, cron jobs, and partner integrations for the PayRent platform.

## Stack

- Next.js API routes
- Prisma + PostgreSQL
- Redis
- JWT auth for mobile/API clients

## Quick start

```bash
npm run setup:env
docker compose up -d postgres redis
npm install
npm run db:push
npm run db:seed
npm run dev
```

API runs at **http://localhost:3001**

Health check: `GET http://localhost:3001/api/health`

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | Must match frontend `AUTH_SECRET` |
| `FRONTEND_URL` | Frontend origin for CORS (e.g. `http://localhost:3000`) |
| `JWT_ACCESS_SECRET` | JWT signing key for mobile/API |
| `BANK_API_KEY` | Partner bank API key |

See `.env.example` for the full list.

## Related repo

- **Frontend:** [PayRent-Frontend](https://github.com/Lonewolf-gut/PayRent-Frontend)

## API docs

See [docs/API.md](./docs/API.md) and [docs/bank-partner-api.md](./docs/bank-partner-api.md).

## Scripts

```bash
npm run dev          # Dev server on port 3001 (webpack — use this on Windows)
npm run dev:turbo    # Turbopack (Linux/Mac only, faster when native SWC works)
npm run build        # Production build
npm run test         # Run tests
npm run db:studio    # Prisma Studio
```
