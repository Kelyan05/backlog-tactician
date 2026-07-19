import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "./lib/prisma.ts";
import { HttpError } from "./lib/errors.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { getOrCreateOwner } from "./lib/currentUser.ts";
import { importOwnedGames } from "./services/steamService.ts";
import { enrichGamesWithTimeToBeat } from "./services/igdbService.ts";
import { EstimateSource } from "./lib/estimateSource.ts";

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


// Middleware to parse JSON bodies
app.use(express.json());

// Basic route
app.get('/', (req: Request, res: Response) => {
  res.send('Hello, TypeScript + Express!');
});

// Health route
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// List games — ?missing=true limits to games with no time-to-beat estimate yet
app.get('/api/games', async (req: Request, res: Response) => {
  const missing = req.query.missing === 'true';
  const games = await prisma.game.findMany({
    where: missing ? { timeToBeatHours: null } : undefined,
    orderBy: { id: 'asc' },
  });
  res.json(games);
});

// Manual time-to-beat overrides (and other field updates)
app.patch('/api/games/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(400, 'Invalid game id');
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

// Import owned games from Steam for the (single, for now) app owner
app.post('/api/import/steam', async (req: Request, res: Response) => {
  const owner = await getOrCreateOwner();
  const result = await importOwnedGames(owner.id);
  res.json(result);
});

// Enrich games missing a time-to-beat estimate via IGDB
app.post('/api/enrich/igdb', async (req: Request, res: Response) => {
  const owner = await getOrCreateOwner();
  const result = await enrichGamesWithTimeToBeat(owner.id);
  res.json(result);
});

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