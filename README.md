# 🎮 Backlog Tactician

> Turn your gaming backlog into an optimised weekly play plan.

![Status](https://img.shields.io/badge/status-in%20progress-yellow)
![CI](https://github.com/Kelyan05/backlog-tactician/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

Every gamer has a backlog of 40+ unplayed games and no idea what to actually play next. **Backlog Tactician** connects to your Steam library, pulls how-long-to-beat estimates, and — given the hours you have free this week — builds a play schedule that maximises variety and prioritises finishing games you're already close to completing. Under the hood, "what to play next" is modelled as a constrained optimisation problem, not a plain list.

## 🎬 Demo

*Demo GIF and live link coming once the scheduling engine ships (Week 3 of the build schedule).*

## ✨ Features

- [x] Steam library import (via Web API key + per-user SteamID from login)
- [x] Steam sign-in via OpenID (multi-user — see "Authentication" below)
- [x] Enrich each game with how-long-to-beat estimates (IGDB)
- [x] Enrich each game with genre metadata
- [x] "Hours free this week" input drives a weekly plan
- [x] Scheduling engine: fit games into the time budget to maximise a score (variety + finishing near-complete titles)
- [x] Mark sessions complete; plan re-optimises around what's left
- [ ] Responsive UI with per-game progress
- [x] Persisted user data and play history

## 🧰 Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript (Vite) | Typed components, fast dev loop |
| Backend | Node.js + Express + TypeScript | Shared language across the stack |
| Database | PostgreSQL | Relational data (users, games, sessions) |
| Integrations | Steam Web API, how-long-to-beat data | Real library + completion-time data |
| Cache | Redis | Avoid re-hitting external APIs |
| Infra | Docker, GitHub Actions | Reproducible builds + CI on every push |
| Testing | Jest | Unit tests for the scheduling engine |

## 🏗️ Architecture

```
Steam API ──▶ Ingest service ──▶ PostgreSQL ──▶ Scheduling engine ──▶ Express API ──▶ React UI
                                     ▲                                     │
                                     └───────────── play history ◀────────┘
```

The **scheduling engine** is the heart of the project: given a set of games (each with an estimated time-to-finish and a computed priority) and a weekly time budget, it selects and orders a subset to maximise total value — a variation on the knapsack problem solved with a greedy heuristic (and a note in the code on where an exact DP solution would fit).

## 🚀 Getting started

```bash
git clone https://github.com/Kelyan05/backlog-tactician.git
cd backlog-tactician
npm install
npm run dev        # starts the Express server on localhost:3000
```

Then open `http://localhost:5173`.

### PostgreSQL (local)

```bash
docker compose up -d db          # starts Postgres 16 on localhost:5432
docker compose exec db psql -U backlog -d backlog_tactician
```

Set `DATABASE_URL` in `.env` to `postgresql://backlog:backlog@localhost:5432/backlog_tactician`.

To stop and remove the container (data persists in the `pgdata` volume):

```bash
docker compose down
```

Practice SQL (create/insert/join, one-to-many `games` → `sessions`) lives in [`sql/practice_warmup.sql`](sql/practice_warmup.sql).

### Docker Compose (full API + DB stack)

For running the whole backend without a local Node install:

```bash
docker compose up --build
```

One command brings up Postgres and the API together: the `api` service waits
for the database's healthcheck, then applies any pending migrations
(`prisma migrate deploy`) before starting the server — so a completely fresh
`pgdata` volume is never a manual extra step. The API reaches Postgres over
the compose network at `db:5432`, not `localhost`, since containers resolve
each other by service name rather than the host's loopback address.

Real secrets (`STEAM_API_KEY`, `STEAM_ID`, `IGDB_CLIENT_ID`,
`IGDB_CLIENT_SECRET`) still come from your local `.env` via `env_file`; only
`DATABASE_URL` is overridden to point at the in-network `db` host.

The frontend isn't containerized yet — it's a Vite dev server whose proxy
currently points at `localhost:3000`, so for now run it separately with
`cd frontend && npm run dev`.

```bash
docker compose down       # stop the stack, keep the pgdata volume
docker compose down -v    # stop the stack and delete all data
```

### Authentication

The app is multi-user: every `/api/*` route requires a logged-in session
(`requireAuth` in `src/server.ts`). Log in is Steam OpenID 2.0 — not OAuth2,
Steam doesn't do that — which redirects your browser to Steam and back:

1. Set in `.env`:

   ```
   SESSION_SECRET=any-long-random-string
   APP_BASE_URL=http://localhost:3000
   FRONTEND_URL=http://localhost:5173
   ```

2. Open the frontend (`http://localhost:5173`) and click **Log in with
   Steam**, or hit `http://localhost:3000/auth/steam/login` directly. Steam
   redirects back to `/auth/steam/callback`, which re-verifies the response
   with Steam directly (`openid.mode=check_authentication`) before trusting
   it — an unverified `claimed_id` would let anyone forge a login as any
   SteamID — then sets a session cookie and redirects to the frontend.
3. `POST /auth/logout` clears the session; `GET /auth/me` reports the
   current session's `userId` (or `null`).

**Local testing without a real Steam login:** `POST /auth/dev-login` (only
mounted when `NODE_ENV !== "production"`) logs you in as a fixed dev user
without the Steam round trip — there's a matching "Dev login" button on the
frontend in dev mode. It seeds that user's Steam ID from `.env`'s
`STEAM_ID`, so the rest of this section still works for local testing.

### Steam library import

1. Grab a Web API key from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (any domain name works for personal use) and set it in `.env` as `STEAM_API_KEY` — this is the app's own key, shared across all users, not a per-user secret.
2. Log in (real Steam login, or `/auth/dev-login` for local testing — see above). Your own SteamID comes from that login now, not from `.env`.
3. With a session cookie, trigger the import:

   ```bash
   curl -b cookies.txt -X POST http://localhost:3000/api/import/steam
   ```

This upserts your owned games by `(userId, steamAppId)` — safe to re-run any time; it refreshes `name`/`playtimeMinutes` but never touches `timeToBeatHours`/`timeToBeatSource`, so IGDB or manual estimates survive re-imports. **Never commit `.env`** — it holds a real API key and is already gitignored.

## 🧪 Testing

```bash
npm test
```

Unit tests focus on the scheduling engine — the interesting, testable logic (budget edge cases, empty backlog, a single game that overruns the week, greedy vs. exact DP, genre variety).

## 🗺️ Roadmap

- [x] MVP: import library + generate a plan
- [ ] Scheduling engine with configurable scoring weights (weights exist — `BASE_VALUE`/`COMPLETION_WEIGHT`/etc. in `src/engine/scheduler.ts` — but aren't user-configurable yet)
- [ ] Deploy with a public demo link
- [x] CI pipeline running tests on every push
- [x] Stretch: exact DP solver + comparison against the greedy heuristic

## 📝 Engineering notes

<!-- Fill these in as you go — they double as interview talking points -->
- Why I modelled scheduling as an optimisation problem, and the trade-off between the greedy heuristic and an exact solution.
- How I handle Steam/IGDB rate limits: the IGDB (Twitch) OAuth token is fetched once via client-credentials and cached in memory until a minute before it expires, instead of re-authenticating per request. Game lookups run in small batches (10 at a time) using a single IN-clause query per batch (`where uid = (...)`) rather than one HTTP round trip per game, with a short pause between batches to stay polite. A `429` gets exactly one retry — honouring `Retry-After` if IGDB sends it, otherwise a fixed backoff — and a game (or batch) that still fails is logged and skipped rather than aborting the whole run, since one bad lookup shouldn't block enrichment for the rest of the library.
- How I handle partial data: real pipelines never fully cover the input, so every `Game.timeToBeatHours` carries an explicit `timeToBeatSource` — `IGDB` (auto-matched), `MANUAL` (user-entered), or `NONE` (still missing) — rather than treating a bare `null` as the only signal. That makes "missing" a first-class, queryable state (`GET /api/games?missing=true`) instead of something the scheduling engine has to infer, and it means a manual fix is never silently overwritten by a later re-import or re-enrich: Steam's upsert only ever touches `name`/`playtimeMinutes`, and IGDB enrichment only fills games where the estimate is still absent.
- The PostgreSQL schema and why it's shaped that way: `User` owns `Game`s and `Plan`s (one-to-many each, enforced with foreign keys). `PlanEntry` is a separate associative entity between `Plan` and `Game` rather than a bare join table — `allocatedHours` and `position` are attributes of the pairing itself, not of either side alone, so folding them into `Plan` or `Game` would violate 3NF (a transitive dependency on something other than that table's own key). A unique constraint on `(planId, gameId)` stops the same game being scheduled twice in one plan.

## 📄 License

MIT
