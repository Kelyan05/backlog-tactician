# 🎮 Backlog Tactician

> Turn your gaming backlog into an optimised weekly play plan.

[![CI](https://github.com/Kelyan05/backlog-tactician/actions/workflows/ci.yml/badge.svg)](https://github.com/Kelyan05/backlog-tactician/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**[Live demo](https://backlog-tactician.vercel.app)** · **[Scheduling engine design doc](docs/scheduling.md)** · **[Engineering notes](#-engineering-notes)**

Every gamer has a backlog of 40+ unplayed games and no idea what to actually play next. **Backlog Tactician** logs you in with Steam, imports your library, enriches it with how-long-to-beat estimates, and — given the hours you have free this week — builds a play schedule that maximises variety and prioritises finishing games you're already close to completing.

Under the hood, "what to play next" is modelled as a **0/1 knapsack problem**, and the repo ships **both** a greedy heuristic and an exact dynamic-programming solver, plus a benchmark script that measures how far greedy actually falls from optimal on a real library.

## 🧠 The interesting part: greedy vs. exact

| Knapsack concept | Backlog Tactician |
|---|---|
| Item | A game |
| Weight | Remaining hours to finish (`timeToBeatHours` − hours already played) |
| Capacity | Hours free this week |
| Value | A computed priority score |
| Goal | Pick the subset that fits the capacity and maximises total value |

The priority score is a transparent weighted sum with named constants in [`src/engine/scheduler.ts`](src/engine/scheduler.ts):

```
score = BASE_VALUE (5)
      + completionRatio × COMPLETION_WEIGHT (10)    ← reward near-finished games
      − recencyPenalty  × RECENCY_WEIGHT (3)        ← don't re-suggest what you just played
      + varietyBonus    × GENRE_VARIETY_WEIGHT (3)  ← avoid five shooters in one week
```

Genre variety is a property of the **plan as a whole**, not of any single game — a game's variety bonus depends on which genres are already selected. That's why selection re-ranks remaining candidates each round (O(n²)) instead of doing one upfront sort (O(n log n)); at real library sizes the difference is irrelevant and the plans are noticeably better.

`generatePlan()` (greedy) ships by default. `generatePlanExact()` (DP) is also implemented, and [`scripts/compareSchedulers.ts`](scripts/compareSchedulers.ts) runs both across several weekly budgets and prints the score gap — so the choice to ship the approximation is measured, not assumed.

The engine is a **pure function** — games and a budget in, a plan out, no DB and no HTTP — which is what makes it trivially unit-testable. Full write-up in [docs/scheduling.md](docs/scheduling.md).

## ✨ Features

- [x] Steam sign-in via OpenID 2.0 (multi-user)
- [x] Steam library import
- [x] Time-to-beat + genre enrichment via IGDB
- [x] "Hours free this week" drives a weekly plan
- [x] Scheduling engine — greedy heuristic **and** exact DP solver
- [x] Genre variety constraint
- [x] Mark sessions complete; plan re-optimises around what's left
- [x] Jest test suite + frontend lint/build, both gating CI on every push
- [x] Deployed public demo (Vercel + Neon; Docker/Render also supported — see "Deploying")
- [x] Responsive card-grid UI with per-game playtime progress
- [x] Security headers (`helmet`) and rate limiting on auth + the Steam/IGDB import endpoints
- [ ] User-configurable scoring weights

## 🧰 Tech stack

| Layer | Choice | Status | Why |
|---|---|---|---|
| Backend | Node.js + Express + TypeScript | ✅ Built | Typed end to end |
| Database | PostgreSQL + Prisma | ✅ Built | Relational data, migrations, type-safe queries |
| Frontend | React + TypeScript (Vite) | ✅ Built | Typed components, fast dev loop |
| Auth | Steam OpenID 2.0 + sessions | ✅ Built | Steam doesn't support OAuth2 |
| Integrations | Steam Web API, IGDB | ✅ Built | Real library + completion-time data |
| Testing | Jest | ✅ Built | Unit tests on the scheduling engine |
| CI | GitHub Actions | ✅ Built | Backend tests/build + frontend lint/build, on every push |
| CD | Vercel (GitHub-integrated) | ✅ Built | Auto-deploys `main` on push; Docker/Render supported too |
| Security | `helmet`, `express-rate-limit` | ✅ Built | Standard security headers; rate limits on auth + external-API calls |
| Infra | Docker Compose | ✅ Built | One-command API + DB stack |
| Cache | Redis | 🔜 Planned | Avoid re-hitting external APIs |

## 🏗️ Architecture

```
Steam OpenID ──▶ session
                    │
Steam API ──▶ Ingest ──▶ PostgreSQL ──▶ Scheduling engine ──▶ Express API ──▶ React UI
IGDB API  ──▶ Enrich ──▶     ▲                                     │
                             └────────────── play history ◀────────┘
```

## 🚀 Getting started

```bash
git clone https://github.com/Kelyan05/backlog-tactician.git
cd backlog-tactician
npm install
docker compose up -d db     # Postgres 16 on localhost:5432
npm run dev                 # API on localhost:3000
```

```bash
cd frontend && npm install && npm run dev   # UI on localhost:5173
```

Set `DATABASE_URL` in `.env` to `postgresql://backlog:backlog@localhost:5432/backlog_tactician`.

### Full stack in one command

```bash
docker compose up --build
```

The `api` service waits for the database healthcheck, then applies pending migrations (`prisma migrate deploy`) before starting — so a fresh `pgdata` volume is never a manual extra step. Containers reach Postgres at `db:5432`, not `localhost`, since compose services resolve each other by service name. Secrets come from your local `.env` via `env_file`; only `DATABASE_URL` is overridden.

The `Dockerfile` builds the frontend and bundles the static output into the same image the API runs from, and serves it directly — no separate frontend container, no CORS setup, and the session cookie just works since browser and API share one origin. Visit `http://localhost:3000`. `cookie.secure` is `"auto"`, not `true`, so the same image works over plain HTTP here and over HTTPS behind a real deploy's reverse proxy without a config change.

```bash
docker compose down       # stop, keep data
docker compose down -v    # stop and delete all data
```

## ☁️ Deploying

The `Dockerfile` alone is enough for any host that runs a Dockerfile against a
persistent Postgres (Render, Fly, Railway) — no extra config needed.

**Vercel** doesn't run a persistent server or host a database, so that shape
needs two adjustments, both already wired up:

- `src/app.ts` holds the actual Express app with no `app.listen()`; `src/server.ts`
  (Docker/local dev) and `api/index.ts` (Vercel's serverless entry point) each
  import it and use it differently. `vercel.json` rewrites `/health`, `/auth/*`,
  and `/api/*` to that one function — Vercel serves the frontend's static build
  (`frontend/dist`, per `outputDirectory`) directly, so the Express static-file
  block in `app.ts` skips itself when `process.env.VERCEL` is set.
- Postgres has to come from somewhere else — [Neon](https://neon.tech) is the
  natural fit (it's what Vercel's own Postgres offering runs on) and has a free
  tier. Use Neon's **pooled** connection string (not the direct one) for
  `DATABASE_URL`: serverless functions open a fresh connection per invocation,
  and a normal Postgres connection limit runs out fast under that pattern —
  pooling is what keeps it working.

Env vars to set in the Vercel dashboard: `DATABASE_URL` (Neon, pooled),
`SESSION_SECRET`, `STEAM_API_KEY`, `STEAM_ID`, `IGDB_CLIENT_ID`,
`IGDB_CLIENT_SECRET`, `APP_BASE_URL` and `FRONTEND_URL` (both your Vercel
production URL — same origin, see "Authentication" above for why), and
`NODE_ENV=production`. `vercel.json`'s `buildCommand` runs
`prisma migrate deploy` as part of every build, so schema changes apply
automatically on push — same "never a manual extra step" property the Docker
path has, just via a different mechanism (there's no Docker `CMD` to hook it
into here).

### Authentication

Every `/api/*` route requires a logged-in session. Login is **Steam OpenID 2.0** — not OAuth2; Steam doesn't support it.

```env
SESSION_SECRET=any-long-random-string
APP_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

Click **Log in with Steam**, or hit `/auth/steam/login`. Steam redirects back to `/auth/steam/callback`, which **re-verifies the response with Steam** (`openid.mode=check_authentication`) before trusting it — without that check, anyone could forge a login as any SteamID. `POST /auth/logout` clears the session; `GET /auth/me` reports the current user.

For local work, `POST /auth/dev-login` (mounted only when `NODE_ENV !== "production"`) skips the Steam round trip.

### Steam library import

1. Get a Web API key from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) and set `STEAM_API_KEY` in `.env` — this is the app's key, shared across users, not a per-user secret.
2. Log in. Your SteamID comes from that login.
3. Trigger the import:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/import/steam
```

Games are upserted by `(userId, steamAppId)` — safe to re-run. It refreshes `name`/`playtimeMinutes` but never touches `timeToBeatHours`/`timeToBeatSource`, so IGDB and manual estimates survive re-imports. **Never commit `.env`.**

## 🧪 Testing

```bash
npm test
```

Tests target the scheduling engine — budget edge cases, an empty backlog, a single game that overruns the week, greedy vs. exact DP, and genre variety. CI runs `npm test` and `npm run build` on every push and pull request.

## 📝 Engineering notes

*The reasoning behind the design decisions — the parts worth discussing.*

**Why an optimisation problem, and why ship the approximation.** Greedy sorts by value density and takes what fits: O(n log n), easy to explain, not always optimal. Exact DP over integer hour-buckets guarantees the best combination but costs more time and memory. Both are implemented; [`scripts/compareSchedulers.ts`](scripts/compareSchedulers.ts) measures the gap on a real library across several budgets. Shipping greedy is a decision backed by numbers rather than an assumption.

**Rate limits and API politeness.** The IGDB (Twitch) OAuth token is fetched once via client-credentials and cached in memory until a minute before expiry, instead of re-authenticating per request. Lookups run in batches of 10 using a single IN-clause query per batch rather than one HTTP round trip per game, with a short pause between batches. A `429` gets exactly one retry — honouring `Retry-After` when sent, otherwise a fixed backoff — and anything that still fails is logged and skipped rather than aborting the run, since one bad lookup shouldn't block enrichment for the whole library.

**Partial data as a first-class state.** Real pipelines never fully cover their input, so every `timeToBeatHours` carries an explicit `timeToBeatSource`: `IGDB` (auto-matched), `MANUAL` (user-entered), or `NONE` (still missing) — rather than treating a bare `null` as the only signal. That makes "missing" queryable (`GET /api/games?missing=true`) instead of something the engine has to infer, and it means a manual fix is never silently overwritten: Steam's upsert only touches `name`/`playtimeMinutes`, and IGDB enrichment only fills estimates that are still absent.

**Schema shape.** `User` owns `Game`s and `Plan`s (one-to-many, enforced with foreign keys). `PlanEntry` is a separate associative entity between `Plan` and `Game` rather than a bare join table — `allocatedHours` and `position` are attributes of the *pairing*, not of either side alone, so folding them into `Plan` or `Game` would violate 3NF. A unique constraint on `(planId, gameId)` stops the same game being scheduled twice in one plan.

**Verifying the Steam callback.** OpenID 2.0 hands your app a `claimed_id` in a redirect. Trusting it directly would let anyone log in as any SteamID by crafting a URL, so the callback re-posts the response to Steam with `openid.mode=check_authentication` and only creates a session if Steam confirms it.

## Author

**Kelyan Djomo** — [GitHub](https://github.com/Kelyan05) · [LinkedIn](https://linkedin.com/in/kelyan-djomo)

## 📄 License

MIT
