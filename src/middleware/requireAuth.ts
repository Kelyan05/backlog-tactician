import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../lib/errors.ts";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    throw new HttpError(401, "Not authenticated");
  }
  next();
}
