import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "./lib/prisma.ts";
import { HttpError } from "./lib/errors.ts";
import { errorHandler } from "./middleware/errorHandler.ts";

const gameUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    playtimeMinutes: z.number().int().nonnegative().optional(),
    timeToBeatHours: z.number().positive().nullable().optional(),
    timeToBeatSource: z.string().min(1).nullable().optional(),
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

// List games
app.get('/api/games', async (req: Request, res: Response) => {
  const games = await prisma.game.findMany({ orderBy: { id: 'asc' } });
  res.json(games);
});

// Manual time-to-beat overrides (and other field updates)
app.patch('/api/games/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new HttpError(400, 'Invalid game id');
  }

  const data = gameUpdateSchema.parse(req.body);

  const game = await prisma.game.update({
    where: { id },
    data,
  });
  res.json(game);
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