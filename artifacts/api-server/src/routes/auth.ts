import { Router, type IRouter } from "express";
import { LoginBody, LoginResponse, LogoutResponse, GetSessionResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const TEACHER_PASSWORD = process.env["TEACHER_PASSWORD"] ?? "hifdh2024";

router.post("/auth/login", async (req, res) => {
  const body = LoginBody.parse(req.body);
  if (body.password !== TEACHER_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  // Single-teacher era: bind the session to the one admin user created by
  // backfill. When real email+password lands (step 7) this is where the
  // user-lookup-by-email + password-hash check goes.
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);
  if (!user) {
    res.status(500).json({ error: "No user configured. Run seed-demo to bootstrap." });
    return;
  }
  req.session.authenticated = true;
  req.session.userId = user.id;
  const data = LoginResponse.parse({ authenticated: true });
  res.json(data);
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    res.clearCookie("connect.sid");
    const data = LogoutResponse.parse({ message: "Logged out successfully" });
    res.json(data);
  });
});

router.get("/auth/session", (req, res) => {
  if (req.session?.authenticated) {
    const data = GetSessionResponse.parse({ authenticated: true });
    res.json(data);
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

export default router;
