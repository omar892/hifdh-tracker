import { Router, type IRouter } from "express";
import { db, studentsTable, studentCompletedJuzTable, classesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListStudentsQueryParams,
  GetStudentParams,
  UpdateStudentParams,
  UpdateStudentBody,
} from "@workspace/api-zod";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const CreateStudentBodyCoerced = z.object({
  name: z.string(),
  gender: z.enum(["male", "female"]).nullish(),
  currentPage: z.number().min(1).max(604),
  currentLine: z.number().min(1).max(15),
  startDate: z.coerce.date(),
  notes: z.string().nullish(),
  mushafPreference: z.enum(["madani_15", "indopak_15"]).optional(),
  defaultRmvAmount: z.string().nullish(),
  defaultReviewAmount: z.string().nullish(),
  completedJuz: z.array(z.number().min(1).max(30)),
});

const router: IRouter = Router();

async function getCompletedJuz(studentId: number): Promise<number[]> {
  const rows = await db
    .select({ juzNumber: studentCompletedJuzTable.juzNumber })
    .from(studentCompletedJuzTable)
    .where(eq(studentCompletedJuzTable.studentId, studentId));
  return rows.map((r) => r.juzNumber).sort((a, b) => a - b);
}

async function setCompletedJuz(studentId: number, teacherId: number, juzNumbers: number[], autoCompleted = false): Promise<void> {
  await db.delete(studentCompletedJuzTable).where(eq(studentCompletedJuzTable.studentId, studentId));
  if (juzNumbers.length > 0) {
    await db.insert(studentCompletedJuzTable).values(
      juzNumbers.map((juz) => ({ studentId, teacherId, juzNumber: juz, autoCompleted }))
    );
  }
}

async function studentWithJuz(student: typeof studentsTable.$inferSelect) {
  const completedJuz = await getCompletedJuz(student.id);
  return { ...student, completedJuz };
}

/**
 * Look up the (single) default class for a teacher. Today every teacher has
 * exactly one class — created at backfill — so this returns it. When teachers
 * can have multiple classes (post step 7), callers will pass classId explicitly.
 */
async function getDefaultClassForTeacher(teacherId: number) {
  const [klass] = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.teacherId, teacherId))
    .limit(1);
  return klass ?? null;
}

router.get("/students", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const query = ListStudentsQueryParams.parse(req.query);
  // Always scope by teacher_id so this becomes a multi-teacher-safe read
  // for free when the UI eventually has more than one teacher.
  const conditions = [eq(studentsTable.teacherId, teacher.id)];
  if (query.active !== undefined) {
    conditions.push(eq(studentsTable.active, query.active));
  }
  const students = await db
    .select()
    .from(studentsTable)
    .where(and(...conditions));
  const result = await Promise.all(students.map(studentWithJuz));
  res.json(result);
});

router.post("/students", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const body = CreateStudentBodyCoerced.parse(req.body);
  const klass = await getDefaultClassForTeacher(teacher.id);
  if (!klass) {
    res.status(500).json({ error: "Teacher has no default class. Run seed-demo to bootstrap." });
    return;
  }
  const [student] = await db.insert(studentsTable).values({
    programId: teacher.programId,
    classId: klass.id,
    teacherId: teacher.id,
    name: body.name,
    gender: body.gender ?? null,
    currentPage: body.currentPage,
    currentLine: body.currentLine,
    startDate: body.startDate.toISOString().split('T')[0],
    notes: body.notes ?? null,
    ...(body.mushafPreference ? { mushafPreference: body.mushafPreference } : {}),
    defaultRmvAmount: body.defaultRmvAmount ?? null,
    defaultReviewAmount: body.defaultReviewAmount ?? null,
  }).returning();

  if (body.completedJuz.length > 0) {
    await setCompletedJuz(student.id, teacher.id, body.completedJuz);
  }

  res.status(201).json(await studentWithJuz(student));
});

router.get("/students/:id", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const { id } = GetStudentParams.parse(req.params);
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.id, id), eq(studentsTable.teacherId, teacher.id)));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json(await studentWithJuz(student));
});

router.patch("/students/:id", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const { id } = UpdateStudentParams.parse(req.params);
  const body = UpdateStudentBody.parse(req.body);
  const updateData: Partial<{
    name: string;
    gender: string | null;
    currentPage: number;
    currentLine: number;
    notes: string | null;
    active: boolean;
    mushafPreference: string;
    defaultRmvAmount: string | null;
    defaultReviewAmount: string | null;
  }> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.gender !== undefined) updateData.gender = body.gender ?? null;
  if (body.currentPage !== undefined) updateData.currentPage = body.currentPage;
  if (body.currentLine !== undefined) updateData.currentLine = body.currentLine;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;
  if (body.active !== undefined) updateData.active = body.active;
  if (body.mushafPreference !== undefined) updateData.mushafPreference = body.mushafPreference;
  if (body.defaultRmvAmount !== undefined) updateData.defaultRmvAmount = body.defaultRmvAmount ?? null;
  if (body.defaultReviewAmount !== undefined) updateData.defaultReviewAmount = body.defaultReviewAmount ?? null;

  const hasUpdate = Object.keys(updateData).length > 0;
  let student;

  // Always require the student belongs to the current teacher.
  if (hasUpdate) {
    [student] = await db
      .update(studentsTable)
      .set(updateData)
      .where(and(eq(studentsTable.id, id), eq(studentsTable.teacherId, teacher.id)))
      .returning();
  } else {
    [student] = await db
      .select()
      .from(studentsTable)
      .where(and(eq(studentsTable.id, id), eq(studentsTable.teacherId, teacher.id)));
  }

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  if (body.completedJuz !== undefined) {
    await setCompletedJuz(student.id, teacher.id, body.completedJuz);
  }

  res.json(await studentWithJuz(student));
});

export { getCompletedJuz, setCompletedJuz };
export default router;
