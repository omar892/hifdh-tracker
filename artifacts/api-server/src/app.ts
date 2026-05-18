import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pgSession from "connect-pg-simple";
import path from "node:path";
import fs from "node:fs";
import { pool } from "@workspace/db";
import router from "./routes";

const app: Express = express();

app.use(cors({
  credentials: true,
  origin: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PgStore = pgSession(session);

app.use(
  session({
    store: new PgStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "hifdh-tracker-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

app.use("/api", router);

// Serve the built frontend in production. Mounted AFTER /api so API routes win.
// Path resolution uses process.cwd() because esbuild bundles to CJS and
// import.meta is unavailable in that format. Replit autoscale runs the start
// command from the repo root, so the first candidate matches. Second covers
// running `node dist/index.cjs` from artifacts/api-server/.
// In dev (vite serves the frontend), this block is a no-op since the dist
// directory doesn't exist.
const frontendDistCandidates = [
  path.resolve(process.cwd(), "artifacts/hifdh-tracker/dist/public"),
  path.resolve(process.cwd(), "../hifdh-tracker/dist/public"),
];
const frontendDist = frontendDistCandidates.find((p) => fs.existsSync(p));

if (frontendDist) {
  console.log(`[static] Serving frontend from ${frontendDist}`);
  app.use(express.static(frontendDist));
  // SPA fallback — any non-/api GET returns index.html so wouter routing works
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else if (process.env.NODE_ENV === "production") {
  console.warn(
    `[static] Frontend dist not found. Looked in:\n  ${frontendDistCandidates.join("\n  ")}`,
  );
}

// Global error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API Error]", err);
  if (err && typeof err === "object" && "issues" in err) {
    // Zod validation error
    res.status(400).json({ error: "Validation error", details: (err as { issues: unknown }).issues });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
});

export default app;
