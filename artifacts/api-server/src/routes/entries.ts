import { Router, type IRouter } from "express";
import { db, weeklyEntriesTable, studentsTable, studentCompletedJuzTable } from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";
import {
  ListWeeklyEntriesParams,
  ListWeeklyEntriesQueryParams,
  GetWeeklyEntryParams,
  UpsertWeeklyEntryParams,
  UpsertWeeklyEntryBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { getJuzForPage } from "../lib/quran-data";
import { enrichLogEntry } from "../lib/quran/lookup";
import { getCompletedJuz } from "./students";

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

/** Parse a JSON boolean array stored as text, returns boolean[5] */
function parseDailyArray(raw: string | null): boolean[] {
  if (!raw) return [false, false, false, false, false];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === 5) return arr.map(Boolean);
  } catch {}
  return [false, false, false, false, false];
}

/** Serialize entry for API response — parse JSON text columns to arrays */
function serializeEntry(entry: typeof weeklyEntriesTable.$inferSelect) {
  return {
    ...entry,
    dailySabaq: parseDailyArray(entry.dailySabaq),
    dailyRmv: parseDailyArray(entry.dailyRmv),
    dailyReview: parseDailyArray(entry.dailyReview),
    dailyAbsent: parseDailyArray(entry.dailyAbsent),
  };
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

  res.json(entries.map(serializeEntry));
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
  res.json(serializeEntry(entry));
});

router.put("/students/:studentId/entries/weekly/:weekStart", requireAuth, async (req, res, next) => {
  try {
  const { studentId, weekStart } = UpsertWeeklyEntryParams.parse(req.params);
  const body = UpsertWeeklyEntryBody.parse(req.body);

  const mondayDate = getMondayOfWeek(weekStart);
  const fridayDate = getFridayOfWeek(mondayDate);

  const memorizationLines = body.memorizationLines ?? 0;

  // Compute from daily arrays
  const sabaq = body.dailySabaq;
  const rmv = body.dailyRmv;
  const review = body.dailyReview;
  const absent = body.dailyAbsent;

  let weeklyPoints = 0;
  let successfulDays = 0;
  let daysAttended = 0;

  for (let i = 0; i < 5; i++) {
    if (absent[i]) continue;
    daysAttended++;
    let dayPoints = 0;
    if (sabaq[i]) { weeklyPoints++; dayPoints++; }
    if (rmv[i]) { weeklyPoints++; dayPoints++; }
    if (review[i]) { weeklyPoints++; dayPoints++; }
    if (dayPoints === 3) successfulDays++;
  }

  const entryData = {
    studentId,
    weekStartDate: mondayDate,
    weekEndDate: fridayDate,
    memorizationLines,
    currentPage: body.currentPage ?? null,
    currentLine: body.currentLine ?? null,
    dailySabaq: JSON.stringify(sabaq),
    dailyRmv: JSON.stringify(rmv),
    dailyReview: JSON.stringify(review),
    dailyAbsent: JSON.stringify(absent),
    successfulDays,
    daysAttended,
    weeklyPoints,
    rmvAmount: body.rmvAmount ?? null,
    reviewAmount: body.reviewAmount ?? null,
    weekRating: body.weekRating ?? null,
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

  // Update student's current page/line position
  if (body.currentPage != null && body.currentLine != null) {
    await db
      .update(studentsTable)
      .set({
        currentPage: body.currentPage,
        currentLine: body.currentLine,
      })
      .where(eq(studentsTable.id, studentId));

    // Auto-complete juz based on page position
    const currentJuz = getJuzForPage(body.currentPage);
    if (currentJuz > 1) {
      const completedJuz = await getCompletedJuz(studentId);
      const completedSet = new Set(completedJuz);
      const newJuz: number[] = [];

      // All juz before the current one are completed
      for (let j = 1; j < currentJuz; j++) {
        if (!completedSet.has(j)) {
          newJuz.push(j);
        }
      }

      if (newJuz.length > 0) {
        await db.insert(studentCompletedJuzTable).values(
          newJuz.map((juz) => ({ studentId, juzNumber: juz, autoCompleted: true }))
        );
      }
    }
  }

  // Enrich the response with this week's verse coverage from the Quran
  // Foundation cache. Look up the student's mushaf preference + the previous
  // entry's end position to derive the page range covered.
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId));

  const [prevEntry] = await db
    .select()
    .from(weeklyEntriesTable)
    .where(
      and(
        eq(weeklyEntriesTable.studentId, studentId),
        lt(weeklyEntriesTable.weekStartDate, mondayDate),
      ),
    )
    .orderBy(desc(weeklyEntriesTable.weekStartDate))
    .limit(1);

  let coverage = null;
  try {
    coverage = await enrichLogEntry({
      mushafId: student?.mushafPreference ?? "madani_15",
      prevPage: prevEntry?.currentPage ?? null,
      prevLine: prevEntry?.currentLine ?? null,
      currentPage: entry.currentPage ?? null,
      currentLine: entry.currentLine ?? null,
    });
  } catch (err) {
    // Don't fail the write if the cache isn't hydrated yet
    console.warn("[entries] coverage enrichment skipped:", err);
  }

  res.json({ ...serializeEntry(entry), coverage });
  } catch (err) { next(err); }
});

export default router;
