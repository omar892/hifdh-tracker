import type { Request } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";

/**
 * The single seam between the auth layer and the rest of the app. Every
 * teacher-scoped read query, every write that needs a teacher_id stamp,
 * routes through here.
 *
 * Today: returns the one user row created by backfill. Tomorrow (step 7):
 * resolves the actual logged-in user from session.userId. The signature
 * doesn't change — only the resolution mechanism.
 *
 * Throws if no session — callers should be behind requireTeacher middleware.
 */
export async function getCurrentTeacher(req: Request): Promise<User> {
  const userId = req.session?.userId;
  if (!userId) {
    throw new Error("getCurrentTeacher called without an authenticated session");
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    throw new Error(`User ${userId} not found (session is stale)`);
  }
  return user;
}
