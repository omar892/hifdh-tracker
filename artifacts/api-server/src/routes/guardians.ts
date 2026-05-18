import { Router, type IRouter } from "express";
import { db, guardiansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { getStudentForTeacher } from "../lib/scope";

const router: IRouter = Router();

const CreateGuardianBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  relationship: z.string().optional().nullable(),
  primary: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const UpdateGuardianBody = CreateGuardianBody.partial();

/**
 * List guardians for one student. Student ownership is verified via
 * getStudentForTeacher so other teachers can't read this student's
 * contacts even if they guess the URL.
 */
router.get("/students/:studentId/guardians", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const studentId = Number(req.params.studentId);
  const student = await getStudentForTeacher(studentId, teacher.id);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const rows = await db
    .select()
    .from(guardiansTable)
    .where(eq(guardiansTable.studentId, studentId))
    .orderBy(guardiansTable.primary, guardiansTable.createdAt);
  res.json(rows);
});

router.post("/students/:studentId/guardians", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const studentId = Number(req.params.studentId);
  const student = await getStudentForTeacher(studentId, teacher.id);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const body = CreateGuardianBody.parse(req.body);
  const [g] = await db
    .insert(guardiansTable)
    .values({
      studentId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      relationship: body.relationship ?? null,
      primary: body.primary ?? false,
      notes: body.notes ?? null,
    })
    .returning();
  res.status(201).json(g);
});

/**
 * Cross-check the guardian's studentId against the teacher's students before
 * mutating. Plain `eq(guardians.id, id)` would let any logged-in teacher
 * update any guardian by ID.
 */
async function guardianOwnedByTeacher(guardianId: number, teacherId: number) {
  const [row] = await db.select().from(guardiansTable).where(eq(guardiansTable.id, guardianId));
  if (!row) return null;
  const student = await getStudentForTeacher(row.studentId, teacherId);
  return student ? row : null;
}

router.patch("/guardians/:id", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const id = Number(req.params.id);
  const existing = await guardianOwnedByTeacher(id, teacher.id);
  if (!existing) {
    res.status(404).json({ error: "Guardian not found" });
    return;
  }
  const body = UpdateGuardianBody.parse(req.body);
  const [updated] = await db
    .update(guardiansTable)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.relationship !== undefined && { relationship: body.relationship }),
      ...(body.primary !== undefined && { primary: body.primary }),
      ...(body.notes !== undefined && { notes: body.notes }),
    })
    .where(eq(guardiansTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/guardians/:id", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const id = Number(req.params.id);
  const existing = await guardianOwnedByTeacher(id, teacher.id);
  if (!existing) {
    res.status(404).json({ error: "Guardian not found" });
    return;
  }
  await db.delete(guardiansTable).where(eq(guardiansTable.id, id));
  res.status(204).end();
});

export default router;
