# 🎮 Backlog Tactician

> Turn your gaming backlog into an optimised weekly play plan.

![Status](https://img.shields.io/badge/status-in%20progress-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

Every gamer has a backlog of 40+ unplayed games and no idea what to actually play next. **Backlog Tactician** connects to your Steam library, pulls how-long-to-beat estimates, and — given the hours you have free this week — builds a play schedule that maximises variety and prioritises finishing games you're already close to completing. Under the hood, "what to play next" is modelled as a constrained optimisation problem, not a plain list.

## 🎬 Demo

*Demo GIF and live link coming once the scheduling engine ships (Week 3 of the build schedule).*

## ✨ Features

- [ ] Steam sign-in via OpenID and library import
- [ ] Enrich each game with how-long-to-beat estimates and genre
- [ ] "Hours free this week" input drives a weekly plan
- [ ] Scheduling engine: fit games into the time budget to maximise a score (variety + finishing near-complete titles)
- [ ] Mark sessions complete; plan re-optimises around what's left
- [ ] Responsive UI with per-game progress
- [ ] Persisted user data and play history

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

## 🧪 Testing

```bash
"test": "echo 'Tests ship with the scheduling engine in Week 3 — see roadmap'"
```

Unit tests focus on the scheduling engine — the interesting, testable logic (budget edge cases, empty backlog, a single game that overruns the week).

## 🗺️ Roadmap

- [ ] MVP: import library + generate a plan
- [ ] Scheduling engine with configurable scoring weights
- [ ] Deploy with a public demo link
- [ ] CI pipeline running tests on every push
- [ ] Stretch: exact DP solver + comparison against the greedy heuristic

## 📝 Engineering notes

<!-- Fill these in as you go — they double as interview talking points -->
- Why I modelled scheduling as an optimisation problem, and the trade-off between the greedy heuristic and an exact solution.
- How I handle Steam API rate limits and cache results.
- The PostgreSQL schema and why it's shaped that way.

## 📄 License

MIT
