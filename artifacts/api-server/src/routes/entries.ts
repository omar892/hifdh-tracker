import { Router, type IRouter } from "express";
import { db, weeklyEntriesTable, studentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListWeeklyEntriesParams,
  ListWeeklyEntriesQueryParams,
  GetWeeklyEntryParams,
  UpsertWeeklyEntryParams,
  UpsertWeeklyEntryBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { calculateAyahsBetween } from "../lib/quran-data";

const router: IRouter = Router();

function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function getFridayOfWeek(mondayStr: string): string {
  const d = new Date(mondayStr);
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().split("T")[0];
}

router.get("/students/:studentId/entries/weekly", requireAuth, async (req, res) => {
  const { studentId } = ListWeeklyEntriesParams.parse(req.params);
  const query = ListWeeklyEntriesQueryParams.parse(req.query);

  let entries = await db
    .select()
    .from(weeklyEntriesTable)
    .where(eq(weeklyEntriesTable.studentId, studentId))
    .orderBy(desc(weeklyEntriesTable.weekStartDate))
    .limit(query.limit ?? 52)
    .offset(query.offset ?? 0);

  if (query.month) {
    entries = entries.filter((e) => e.weekStartDate.startsWith(query.month!));
  }

  res.json(entries);
});

router.get("/students/:studentId/entries/weekly/:weekStart", requireAuth, async (req, res) => {
  const { studentId, weekStart } = GetWeeklyEntryParams.parse(req.params);
  const [entry] = await db
    .select()
    .from(weeklyEntriesTable)
    .where(
      and(
        eq(weeklyEntriesTable.studentId, studentId),
        eq(weeklyEntriesTable.weekStartDate, weekStart)
      )
    );

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(entry);
});

router.put("/students/:studentId/entries/weekly/:weekStart", requireAuth, async (req, res) => {
  const { studentId, weekStart } = UpsertWeeklyEntryParams.parse(req.params);
  const body = UpsertWeeklyEntryBody.parse(req.body);

  const mondayDate = getMondayOfWeek(weekStart);
  const fridayDate = getFridayOfWeek(mondayDate);

  let ayahsMemorized = 0;
  if (
    body.newMemFromSurah != null &&
    body.newMemFromAyah != null &&
    body.newMemToSurah != null &&
    body.newMemToAyah != null
  ) {
    ayahsMemorized = calculateAyahsBetween(
      body.newMemFromSurah,
      body.newMemFromAyah,
      body.newMemToSurah,
      body.newMemToAyah
    );
  }

  const entryData = {
    studentId,
    weekStartDate: mondayDate,
    weekEndDate: fridayDate,
    newMemFromSurah: body.newMemFromSurah ?? null,
    newMemFromAyah: body.newMemFromAyah ?? null,
    newMemToSurah: body.newMemToSurah ?? null,
    newMemToAyah: body.newMemToAyah ?? null,
    ayahsMemorized,
    successfulDays: body.successfulDays,
    daysAttended: body.daysAttended,
    weekRating: body.weekRating ?? null,
    rmvQuality: body.rmvQuality ?? null,
    reviewQuality: body.reviewQuality ?? null,
    teacherNotes: body.teacherNotes ?? null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select()
    .from(weeklyEntriesTable)
    .where(
      and(
        eq(weeklyEntriesTable.studentId, studentId),
        eq(weeklyEntriesTable.weekStartDate, mondayDate)
      )
    );

  let entry;
  if (existing) {
    [entry] = await db
      .update(weeklyEntriesTable)
      .set(entryData)
      .where(eq(weeklyEntriesTable.id, existing.id))
      .returning();
  } else {
    [entry] = await db.insert(weeklyEntriesTable).values(entryData).returning();
  }

  if (
    body.newMemToSurah != null &&
    body.newMemToAyah != null &&
    ayahsMemorized > 0
  ) {
    await db
      .update(studentsTable)
      .set({
        currentSurah: body.newMemToSurah,
        currentAyah: body.newMemToAyah,
      })
      .where(eq(studentsTable.id, studentId));
  }

  res.json(entry);
});

export default router;
