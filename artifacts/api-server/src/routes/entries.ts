import { Router, type IRouter } from "express";
import { db, dailyEntriesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListEntriesParams,
  ListEntriesQueryParams,
  GetEntryParams,
  UpsertEntryParams,
  UpsertEntryBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/students/:studentId/entries", requireAuth, async (req, res) => {
  const { studentId } = ListEntriesParams.parse(req.params);
  const query = ListEntriesQueryParams.parse(req.query);

  let conditions = [eq(dailyEntriesTable.studentId, studentId)];

  const entries = await db
    .select()
    .from(dailyEntriesTable)
    .where(and(...conditions))
    .orderBy(desc(dailyEntriesTable.date))
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0);

  if (query.month) {
    const filtered = entries.filter((e) => e.date.startsWith(query.month!));
    res.json(filtered);
    return;
  }

  res.json(entries);
});

router.get("/students/:studentId/entries/:date", requireAuth, async (req, res) => {
  const { studentId, date } = GetEntryParams.parse(req.params);
  const [entry] = await db
    .select()
    .from(dailyEntriesTable)
    .where(and(eq(dailyEntriesTable.studentId, studentId), eq(dailyEntriesTable.date, date)));

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(entry);
});

router.put("/students/:studentId/entries/:date", requireAuth, async (req, res) => {
  const { studentId, date } = UpsertEntryParams.parse(req.params);
  const body = UpsertEntryBody.parse(req.body);

  const daySuccessful = body.newMemorizationCompleted && body.rmvCompleted && body.reviewCompleted;

  const entryData = {
    studentId,
    date,
    newMemorizationFromSurah: body.newMemorizationFromSurah ?? null,
    newMemorizationFromAyah: body.newMemorizationFromAyah ?? null,
    newMemorizationToSurah: body.newMemorizationToSurah ?? null,
    newMemorizationToAyah: body.newMemorizationToAyah ?? null,
    newMemorizationCompleted: body.newMemorizationCompleted,
    newMemorizationGrade: body.newMemorizationGrade ?? null,
    rmvFromSurah: body.rmvFromSurah ?? null,
    rmvFromAyah: body.rmvFromAyah ?? null,
    rmvToSurah: body.rmvToSurah ?? null,
    rmvToAyah: body.rmvToAyah ?? null,
    rmvCompleted: body.rmvCompleted,
    rmvGrade: body.rmvGrade ?? null,
    reviewFromSurah: body.reviewFromSurah ?? null,
    reviewFromAyah: body.reviewFromAyah ?? null,
    reviewToSurah: body.reviewToSurah ?? null,
    reviewToAyah: body.reviewToAyah ?? null,
    reviewCompleted: body.reviewCompleted,
    reviewGrade: body.reviewGrade ?? null,
    extraReviewFromSurah: body.extraReviewFromSurah ?? null,
    extraReviewFromAyah: body.extraReviewFromAyah ?? null,
    extraReviewToSurah: body.extraReviewToSurah ?? null,
    extraReviewToAyah: body.extraReviewToAyah ?? null,
    teacherNotes: body.teacherNotes ?? null,
    daySuccessful,
  };

  const [existing] = await db
    .select()
    .from(dailyEntriesTable)
    .where(and(eq(dailyEntriesTable.studentId, studentId), eq(dailyEntriesTable.date, date)));

  let entry;
  if (existing) {
    [entry] = await db
      .update(dailyEntriesTable)
      .set(entryData)
      .where(eq(dailyEntriesTable.id, existing.id))
      .returning();
  } else {
    [entry] = await db.insert(dailyEntriesTable).values(entryData).returning();
  }

  res.json(entry);
});

export default router;
