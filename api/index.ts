// Vercel serverless entry point — see vercel.json for the rewrites that route
// /health, /auth/*, and /api/* here. The Docker/local-dev entry point is
// src/server.ts instead, which calls app.listen(); Vercel invokes this
// exported app directly per-request instead of running a persistent process.
import { app } from "../src/app.ts";

export default app;
