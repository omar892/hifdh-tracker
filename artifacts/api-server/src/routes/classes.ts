import { Router, type IRouter } from "express";
import { db, classesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/**
 * The current teacher's class. Today every teacher has exactly one class
 * (created at backfill), so this returns the first match. When teachers can
 * have multiple classes, this should be replaced with a list endpoint plus
 * an explicit "current" selection mechanism.
 */
router.get("/classes/current", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const [klass] = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.teacherId, teacher.id))
    .limit(1);
  if (!klass) {
    res.status(404).json({ error: "No class found for current teacher" });
    return;
  }
  res.json({ id: klass.id, name: klass.name });
});

export default router;
