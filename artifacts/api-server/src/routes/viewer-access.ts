import { Router, type IRouter } from "express";
import { db, viewerAccessTable, studentsTable, weeklyEntriesTable, studentCompletedJuzTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireAuth } from "../middlewares/auth";
import { getStudentForTeacher } from "../lib/scope";

const router: IRouter = Router();

const CreateLinkBody = z.object({
  label: z.string().optional().nullable(),
  notesVisibleToParent: z.boolean().optional(),
});

const UpdateLinkBody = z.object({
  label: z.string().optional().nullable(),
  notesVisibleToParent: z.boolean().optional(),
  active: z.boolean().optional(),
});

/**
 * Generate a URL-safe random token. 32 bytes → 256 bits, base64url-encoded
 * to ~43 chars. Guessing one is computationally infeasible — fine without
 * additional rate limiting for a hackathon-scale app.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

router.get("/students/:studentId/viewer-access", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const studentId = Number(req.params.studentId);
  const student = await getStudentForTeacher(studentId, teacher.id);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const rows = await db
    .select()
    .from(viewerAccessTable)
    .where(eq(viewerAccessTable.studentId, studentId))
    .orderBy(desc(viewerAccessTable.createdAt));
  res.json(rows);
});

router.post("/students/:studentId/viewer-access", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const studentId = Number(req.params.studentId);
  const student = await getStudentForTeacher(studentId, teacher.id);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const body = CreateLinkBody.parse(req.body);
  const [link] = await db
    .insert(viewerAccessTable)
    .values({
      studentId,
      token: generateToken(),
      label: body.label ?? null,
      notesVisibleToParent: body.notesVisibleToParent ?? false,
      active: true,
    })
    .returning();
  res.status(201).json(link);
});

async function linkOwnedByTeacher(linkId: number, teacherId: number) {
  const [row] = await db.select().from(viewerAccessTable).where(eq(viewerAccessTable.id, linkId));
  if (!row) return null;
  const student = await getStudentForTeacher(row.studentId, teacherId);
  return student ? row : null;
}

router.patch("/viewer-access/:id", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const id = Number(req.params.id);
  const existing = await linkOwnedByTeacher(id, teacher.id);
  if (!existing) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  const body = UpdateLinkBody.parse(req.body);
  const wasActive = existing.active;
  const willBeInactive = body.active === false && wasActive;
  const [updated] = await db
    .update(viewerAccessTable)
    .set({
      ...(body.label !== undefined && { label: body.label }),
      ...(body.notesVisibleToParent !== undefined && { notesVisibleToParent: body.notesVisibleToParent }),
      ...(body.active !== undefined && { active: body.active }),
      ...(willBeInactive && { revokedAt: new Date() }),
    })
    .where(eq(viewerAccessTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/viewer-access/:id", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const id = Number(req.params.id);
  const existing = await linkOwnedByTeacher(id, teacher.id);
  if (!existing) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  await db.delete(viewerAccessTable).where(eq(viewerAccessTable.id, id));
  res.status(204).end();
});

/**
 * Public read endpoint — NO auth, just a valid token. Returns the
 * parent-facing snapshot for one student. Teacher notes are included only
 * if notes_visible_to_parent is on for THIS link.
 *
 * Updates last_viewed_at as a side effect so the teacher can see "parent
 * last opened on …" on the student record page.
 */
router.get("/share/:token", async (req, res) => {
  const { token } = req.params;
  const [link] = await db
    .select()
    .from(viewerAccessTable)
    .where(eq(viewerAccessTable.token, token));
  if (!link || !link.active) {
    res.status(404).json({ error: "Link not found or revoked" });
    return;
  }
  await db
    .update(viewerAccessTable)
    .set({ lastViewedAt: new Date() })
    .where(eq(viewerAccessTable.id, link.id));

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, link.studentId));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const entries = await db
    .select()
    .from(weeklyEntriesTable)
    .where(eq(weeklyEntriesTable.studentId, student.id))
    .orderBy(desc(weeklyEntriesTable.weekStartDate))
    .limit(12);
  const juz = await db
    .select({ juzNumber: studentCompletedJuzTable.juzNumber })
    .from(studentCompletedJuzTable)
    .where(eq(studentCompletedJuzTable.studentId, student.id));
  const completedJuz = juz.map((j) => j.juzNumber).sort((a, b) => a - b);

  // Parent-safe projection — strip teacher_id, internal notes (unless flag),
  // and any audit metadata that's not interesting to a parent.
  res.json({
    student: {
      name: student.name,
      currentPage: student.currentPage,
      currentLine: student.currentLine,
      mushafPreference: student.mushafPreference,
      status: student.status,
    },
    completedJuz,
    recentEntries: entries.map((e) => ({
      weekStartDate: e.weekStartDate,
      weekEndDate: e.weekEndDate,
      memorizationLines: e.memorizationLines,
      currentPage: e.currentPage,
      currentLine: e.currentLine,
      successfulDays: e.successfulDays,
      daysAttended: e.daysAttended,
      weekRating: e.weekRating,
      teacherNotes: link.notesVisibleToParent ? e.teacherNotes : null,
    })),
    notesVisible: link.notesVisibleToParent,
  });
});

export default router;
