import express, { type Express, type Request, type Response } from "express";
import { prisma } from "./lib/prisma.ts";

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
  const game = await prisma.game.update({
    where: { id },
    data: req.body,
  });
  res.json(game);
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});