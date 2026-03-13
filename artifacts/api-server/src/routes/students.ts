import { Router, type IRouter } from "express";
import { db, studentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
  currentSurah: z.number(),
  currentAyah: z.number(),
  startDate: z.coerce.date(),
  notes: z.string().nullish(),
});

const router: IRouter = Router();

router.get("/students", requireAuth, async (req, res) => {
  const query = ListStudentsQueryParams.parse(req.query);
  let students;
  if (query.active !== undefined) {
    students = await db.select().from(studentsTable).where(eq(studentsTable.active, query.active));
  } else {
    students = await db.select().from(studentsTable);
  }
  res.json(students);
});

router.post("/students", requireAuth, async (req, res) => {
  const body = CreateStudentBodyCoerced.parse(req.body);
  const [student] = await db.insert(studentsTable).values({
    name: body.name,
    currentSurah: body.currentSurah,
    currentAyah: body.currentAyah,
    startDate: body.startDate.toISOString().split('T')[0],
    notes: body.notes ?? null,
  }).returning();
  res.status(201).json(student);
});

router.get("/students/:id", requireAuth, async (req, res) => {
  const { id } = GetStudentParams.parse(req.params);
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json(student);
});

router.patch("/students/:id", requireAuth, async (req, res) => {
  const { id } = UpdateStudentParams.parse(req.params);
  const body = UpdateStudentBody.parse(req.body);
  const updateData: Record<string, any> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.currentSurah !== undefined) updateData.currentSurah = body.currentSurah;
  if (body.currentAyah !== undefined) updateData.currentAyah = body.currentAyah;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.active !== undefined) updateData.active = body.active;

  const [student] = await db.update(studentsTable).set(updateData).where(eq(studentsTable.id, id)).returning();
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json(student);
});

export default router;
