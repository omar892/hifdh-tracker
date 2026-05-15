import { Router, type IRouter } from "express";
import { db, studentsTable, studentCompletedJuzTable } from "@workspace/db";
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

async function setCompletedJuz(studentId: number, juzNumbers: number[], autoCompleted = false): Promise<void> {
  await db.delete(studentCompletedJuzTable).where(eq(studentCompletedJuzTable.studentId, studentId));
  if (juzNumbers.length > 0) {
    await db.insert(studentCompletedJuzTable).values(
      juzNumbers.map((juz) => ({ studentId, juzNumber: juz, autoCompleted }))
    );
  }
}

async function studentWithJuz(student: typeof studentsTable.$inferSelect) {
  const completedJuz = await getCompletedJuz(student.id);
  return { ...student, completedJuz };
}

router.get("/students", requireAuth, async (req, res) => {
  const query = ListStudentsQueryParams.parse(req.query);
  let students;
  if (query.active !== undefined) {
    students = await db.select().from(studentsTable).where(eq(studentsTable.active, query.active));
  } else {
    students = await db.select().from(studentsTable);
  }
  const result = await Promise.all(students.map(studentWithJuz));
  res.json(result);
});

router.post("/students", requireAuth, async (req, res) => {
  const body = CreateStudentBodyCoerced.parse(req.body);
  const [student] = await db.insert(studentsTable).values({
    name: body.name,
    gender: body.gender ?? null,
    currentPage: body.currentPage,
    currentLine: body.currentLine,
    startDate: body.startDate.toISOString().split('T')[0],
    notes: body.notes ?? null,
  }).returning();

  if (body.completedJuz.length > 0) {
    await setCompletedJuz(student.id, body.completedJuz);
  }

  res.status(201).json(await studentWithJuz(student));
});

router.get("/students/:id", requireAuth, async (req, res) => {
  const { id } = GetStudentParams.parse(req.params);
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json(await studentWithJuz(student));
});

router.patch("/students/:id", requireAuth, async (req, res) => {
  const { id } = UpdateStudentParams.parse(req.params);
  const body = UpdateStudentBody.parse(req.body);
  const updateData: Partial<{
    name: string;
    gender: string | null;
    currentPage: number;
    currentLine: number;
    notes: string | null;
    active: boolean;
  }> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.gender !== undefined) updateData.gender = body.gender ?? null;
  if (body.currentPage !== undefined) updateData.currentPage = body.currentPage;
  if (body.currentLine !== undefined) updateData.currentLine = body.currentLine;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;
  if (body.active !== undefined) updateData.active = body.active;

  const hasUpdate = Object.keys(updateData).length > 0;
  let student;

  if (hasUpdate) {
    [student] = await db.update(studentsTable).set(updateData).where(eq(studentsTable.id, id)).returning();
  } else {
    [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  }

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  if (body.completedJuz !== undefined) {
    await setCompletedJuz(student.id, body.completedJuz);
  }

  res.json(await studentWithJuz(student));
});

export { getCompletedJuz, setCompletedJuz };
export default router;
