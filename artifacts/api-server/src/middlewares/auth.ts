import { Request, Response, NextFunction } from "express";
import { getCurrentTeacher } from "../lib/current-teacher";
import type { User } from "@workspace/db";

/**
 * Express extension: handlers downstream of `requireTeacher` receive the
 * authenticated user attached as `req.teacher`. Use this in route handlers
 * instead of re-resolving from session every call.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      teacher?: User;
    }
  }
}

/**
 * Legacy name kept so existing route imports still work; same behavior as
 * `requireTeacher`. Once every route is updated to expect `req.teacher`,
 * we can grep-and-rename in a single commit.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  return requireTeacher(req, res, next);
}

/**
 * Gate behind authenticated session AND attach the user record to the request
 * so downstream handlers can scope queries by `req.teacher.id`.
 */
export async function requireTeacher(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.authenticated || !req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    req.teacher = await getCurrentTeacher(req);
    next();
  } catch (err) {
    console.error("[requireTeacher]", err);
    res.status(401).json({ error: "Not authenticated" });
  }
}
