import "dotenv/config";
import path from "node:path";
import express, { type Express, type Request, type Response } from "express";
import session from "express-session";
import { z } from "zod";
import { prisma } from "./lib/prisma.ts";
import { HttpError } from "./lib/errors.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { requireAuth } from "./middleware/requireAuth.ts";
import { getOrCreateDevOwner } from "./lib/currentUser.ts";
import { getLoginRedirectUrl, verifySteamCallback } from "./lib/steamAuth.ts";
import { importOwnedGames } from "./services/steamService.ts";
import { enrichGames } from "./services/igdbService.ts";
import { EstimateSource } from "./lib/estimateSource.ts";
import { createPlan, getPlan, listPlans } from "./services/planService.ts";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}

const createPlanSchema = z.object({ hoursAvailable: z.number().positive() }).strict();
const playSessionSchema = z.object({ hoursPlayed: z.number().positive() }).strict();

// timeToBeatSource is never client-settable directly — it's derived from
// whether timeToBeatHours was just set, cleared, or left alone (see PATCH below).
const gameUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    playtimeMinutes: z.number().int().nonnegative().optional(),
    timeToBeatHours: z.number().positive().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

const app: Express = express();
const port = 3000; // The port your express server will be running on.

// Real deploys sit behind a TLS-terminating reverse proxy (Fly/Railway/Render
// all work this way), so Express itself sees a plain HTTP connection — trust
// proxy makes it read "X-Forwarded-Proto" instead, which cookie.secure:"auto"
// below then checks per-request.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Middleware to parse JSON bodies
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // "auto" (not "true"): matches the real connection security per-request,
      // so this also works for a plain-HTTP docker-compose smoke test locally.
      secure: process.env.NODE_ENV === "production" ? "auto" : false,
    },
  }),
);

// Health route
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// --- Steam OpenID login ---

app.get('/auth/steam/login', (req: Request, res: Response) => {
  const returnTo = `${APP_BASE_URL}/auth/steam/callback`;
  res.redirect(getLoginRedirectUrl(returnTo, APP_BASE_URL));
});

app.get('/auth/steam/callback', async (req: Request, res: Response) => {
  const steamId = await verifySteamCallback(req.query as Record<string, string | undefined>);
  if (!steamId) {
    throw new HttpError(401, 'Steam login verification failed');
  }

  const user = await prisma.user.upsert({
    where: { steamId },
    update: {},
    create: { steamId },
  });

  req.session.userId = user.id;
  res.redirect(FRONTEND_URL);
});

app.post('/auth/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/auth/me', (req: Request, res: Response) => {
  res.json({ userId: req.session.userId ?? null });
});

// Dev-only convenience: a real session without a real Steam login, since
// that needs a real browser and real Steam credentials neither CI nor an
// agent has. Never mounted in production.
if (process.env.NODE_ENV !== 'production') {
  app.post('/auth/dev-login', async (req: Request, res: Response) => {
    const user = await getOrCreateDevOwner();
    req.session.userId = user.id;
    res.json({ userId: user.id });
  });
}

// --- Everything below operates on the logged-in user's own data ---
app.use('/api', requireAuth);

// List games — ?missing=true limits to games with no time-to-beat estimate yet
app.get('/api/games', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const missing = req.query.missing === 'true';
  const games = await prisma.game.findMany({
    where: { userId, ...(missing ? { timeToBeatHours: null } : {}) },
    orderBy: { id: 'asc' },
  });
  res.json(games);
});

// Manual time-to-beat overrides (and other field updates)
app.patch('/api/games/:id', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(400, 'Invalid game id');
  }

  const owned = await prisma.game.findFirst({ where: { id, userId } });
  if (!owned) {
    throw new HttpError(404, 'Not found');
  }

  const { timeToBeatHours, ...rest } = gameUpdateSchema.parse(req.body);

  const data: typeof rest & { timeToBeatHours?: number | null; timeToBeatSource?: EstimateSource } = rest;
  if (timeToBeatHours !== undefined) {
    data.timeToBeatHours = timeToBeatHours;
    data.timeToBeatSource = timeToBeatHours === null ? EstimateSource.NONE : EstimateSource.MANUAL;
  }

  const game = await prisma.game.update({
    where: { id },
    data,
  });
  res.json(game);
});

// Log a play session against a game — advances playtime and lastPlayedAt so
// the next generated plan reflects real progress (smaller remainingHours,
// bigger completionBonus, and the recency penalty kicking in).
app.post('/api/games/:id/play-sessions', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(400, 'Invalid game id');
  }

  const owned = await prisma.game.findFirst({ where: { id, userId } });
  if (!owned) {
    throw new HttpError(404, 'Not found');
  }

  const { hoursPlayed } = playSessionSchema.parse(req.body);

  const game = await prisma.game.update({
    where: { id },
    data: {
      playtimeMinutes: { increment: Math.round(hoursPlayed * 60) },
      lastPlayedAt: new Date(),
    },
  });

  res.json(game);
});

// Import owned games from Steam for the logged-in user
app.post('/api/import/steam', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const result = await importOwnedGames(userId);
  res.json(result);
});

// Enrich games missing a time-to-beat estimate or genre via IGDB
app.post('/api/enrich/igdb', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const result = await enrichGames(userId);
  res.json(result);
});

// Generate a plan from the current library and persist it (Plan + PlanEntries, atomically)
app.post('/api/plans', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const { hoursAvailable } = createPlanSchema.parse(req.body);
  const plan = await createPlan(userId, hoursAvailable);
  res.status(201).json(plan);
});

// List all plans for the logged-in user, most recent first
app.get('/api/plans', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const plans = await listPlans(userId);
  res.json(plans);
});

// Fetch a single plan with its ordered entries
app.get('/api/plans/:id', async (req: Request, res: Response) => {
  const userId = req.session.userId as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(400, 'Invalid plan id');
  }

  const plan = await getPlan(id, userId);
  if (!plan) {
    throw new HttpError(404, 'Not found');
  }

  res.json(plan);
});

// In production the built frontend ships in the same image/container as the
// API (see Dockerfile), so the browser talks to one origin and the session
// cookie's sameSite=lax just works — no CORS setup needed. In dev, Vite's own
// server + proxy plays the same role instead.
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(import.meta.dirname, "../frontend/dist");
  app.use(express.static(frontendDist));
  app.use((req: Request, res: Response, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// Unmatched routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler — must be registered last
app.use(errorHandler);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
