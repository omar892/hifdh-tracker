import { Router, type IRouter } from "express";
import { db, weeklyEntriesTable, studentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { GetStudentStatsParams, GetStudentCalendarParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { SURAHS, TOTAL_QURAN_AYAHS, calculateAyahsUpTo } from "../lib/quran-data";

const router: IRouter = Router();

function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().split("T")[0];
}

function getMonthBounds(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

function getFridayOfWeek(mondayStr: string): string {
  const d = new Date(mondayStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().split("T")[0];
}

function getWeeksInMonth(yearMonth: string): Array<{ weekStartDate: string; weekEndDate: string }> {
  const [year, month] = yearMonth.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));

  const weeks: Array<{ weekStartDate: string; weekEndDate: string }> = [];
  let current = new Date(firstDay);

  const dayOfWeek = current.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  current.setUTCDate(current.getUTCDate() + diff);

  while (current <= lastDay) {
    const monday = current.toISOString().split("T")[0];
    const friday = getFridayOfWeek(monday);
    weeks.push({ weekStartDate: monday, weekEndDate: friday });
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return weeks;
}

router.get("/students/:studentId/stats", requireAuth, async (req, res) => {
  const { studentId } = GetStudentStatsParams.parse(req.params);

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const totalAyahsMemorized = Math.max(0, calculateAyahsUpTo(student.currentSurah, student.currentAyah) - 1);
  const totalQuranPercentage = parseFloat(((totalAyahsMemorized / TOTAL_QURAN_AYAHS) * 100).toFixed(1));
  const juzCompleted = parseFloat((totalAyahsMemorized / (TOTAL_QURAN_AYAHS / 30)).toFixed(2));

  const allEntries = await db
    .select()
    .from(weeklyEntriesTable)
    .where(eq(weeklyEntriesTable.studentId, studentId))
    .orderBy(desc(weeklyEntriesTable.weekStartDate));

  const totalDaysAttended = allEntries.reduce((sum, e) => sum + e.daysAttended, 0);
  const totalSuccessfulDays = allEntries.reduce((sum, e) => sum + e.successfulDays, 0);
  const overallSuccessRate =
    totalDaysAttended > 0
      ? parseFloat(((totalSuccessfulDays / totalDaysAttended) * 100).toFixed(1))
      : 0;

  let currentStreakWeeks = 0;
  for (const entry of allEntries) {
    if (entry.successfulDays >= 4) {
      currentStreakWeeks++;
    } else {
      break;
    }
  }

  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonth = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  const { start: thisMonthStart, end: thisMonthEnd } = getMonthBounds(thisMonth);
  const { start: lastMonthStart, end: lastMonthEnd } = getMonthBounds(lastMonth);

  let ayahsThisMonth = 0;
  let ayahsLastMonth = 0;

  for (const entry of allEntries) {
    if (entry.weekStartDate >= thisMonthStart && entry.weekStartDate <= thisMonthEnd) {
      ayahsThisMonth += entry.ayahsMemorized;
    }
    if (entry.weekStartDate >= lastMonthStart && entry.weekStartDate <= lastMonthEnd) {
      ayahsLastMonth += entry.ayahsMemorized;
    }
  }

  res.json({
    totalAyahsMemorized,
    totalQuranPercentage,
    juzCompleted,
    overallSuccessRate,
    currentStreakWeeks,
    ayahsThisMonth,
    ayahsLastMonth,
  });
});

router.get("/students/:studentId/calendar", requireAuth, async (req, res) => {
  const { studentId } = GetStudentCalendarParams.parse(req.params);
  const month = req.query.month as string;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month query param required (YYYY-MM)" });
    return;
  }

  const entries = await db
    .select()
    .from(weeklyEntriesTable)
    .where(eq(weeklyEntriesTable.studentId, studentId))
    .orderBy(weeklyEntriesTable.weekStartDate);

  const entryMap = new Map(entries.map((e) => [e.weekStartDate, e]));
  const weeks = getWeeksInMonth(month);

  const calendarWeeks = weeks.map((w) => {
    const entry = entryMap.get(w.weekStartDate);
    return {
      weekStartDate: w.weekStartDate,
      weekEndDate: w.weekEndDate,
      hasEntry: !!entry,
      weekRating: entry?.weekRating ?? null,
      successfulDays: entry?.successfulDays ?? null,
      daysAttended: entry?.daysAttended ?? null,
      ayahsMemorized: entry?.ayahsMemorized ?? null,
    };
  });

  const weeksWithEntries = calendarWeeks.filter((w) => w.hasEntry);
  const totalAyahs = weeksWithEntries.reduce((sum, w) => sum + (w.ayahsMemorized ?? 0), 0);
  const totalSuccessful = weeksWithEntries.reduce((sum, w) => sum + (w.successfulDays ?? 0), 0);
  const avgSuccessfulDays =
    weeksWithEntries.length > 0
      ? parseFloat((totalSuccessful / weeksWithEntries.length).toFixed(1))
      : 0;
  const excellentWeeks = weeksWithEntries.filter(
    (w) => w.weekRating === "excellent" || w.weekRating === "strong"
  ).length;

  res.json({
    month,
    weeks: calendarWeeks,
    totalAyahs,
    avgSuccessfulDays,
    excellentWeeks,
  });
});

router.get("/dashboard", requireAuth, async (req, res) => {
  const students = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.active, true));

  const thisWeekMonday = getCurrentMonday();

  const result = await Promise.all(
    students.map(async (student) => {
      const [latestEntry] = await db
        .select()
        .from(weeklyEntriesTable)
        .where(eq(weeklyEntriesTable.studentId, student.id))
        .orderBy(desc(weeklyEntriesTable.weekStartDate))
        .limit(1);

      const thisWeekDone = latestEntry?.weekStartDate === thisWeekMonday;

      return {
        id: student.id,
        name: student.name,
        currentSurah: student.currentSurah,
        currentAyah: student.currentAyah,
        active: student.active,
        thisWeekDone,
        thisWeekEntry: thisWeekDone ? latestEntry : null,
      };
    })
  );

  res.json(result);
});

router.get("/stats/class", requireAuth, async (req, res) => {
  const students = await db.select().from(studentsTable).where(eq(studentsTable.active, true));
  const allWeeklyEntries = await db.select().from(weeklyEntriesTable);

  const entryMap = new Map<number, typeof allWeeklyEntries>();
  for (const entry of allWeeklyEntries) {
    if (!entryMap.has(entry.studentId)) entryMap.set(entry.studentId, []);
    entryMap.get(entry.studentId)!.push(entry);
  }

  let totalAyahsMemorized = 0;
  const studentStats: { studentId: number; name: string; successRate: number }[] = [];

  for (const student of students) {
    totalAyahsMemorized += Math.max(0, calculateAyahsUpTo(student.currentSurah, student.currentAyah) - 1);
    const entries = entryMap.get(student.id) ?? [];
    const totalDays = entries.reduce((s, e) => s + e.daysAttended, 0);
    const successDays = entries.reduce((s, e) => s + e.successfulDays, 0);
    const rate = totalDays > 0 ? parseFloat(((successDays / totalDays) * 100).toFixed(1)) : 0;
    studentStats.push({ studentId: student.id, name: student.name, successRate: rate });
  }

  studentStats.sort((a, b) => b.successRate - a.successRate);
  const avgRate =
    studentStats.length > 0
      ? parseFloat((studentStats.reduce((s, st) => s + st.successRate, 0) / studentStats.length).toFixed(1))
      : 0;

  const avgAyahsPerWeek =
    allWeeklyEntries.length > 0
      ? parseFloat((allWeeklyEntries.reduce((s, e) => s + e.ayahsMemorized, 0) / allWeeklyEntries.length).toFixed(1))
      : 0;

  res.json({
    totalStudents: students.length,
    averageSuccessRate: avgRate,
    totalAyahsMemorized,
    avgAyahsPerWeek,
    topPerformers: studentStats.slice(0, 3),
    needsAttention: studentStats.filter((s) => s.successRate < 70).slice(0, 3),
  });
});

router.get("/surahs", requireAuth, (req, res) => {
  res.json(SURAHS);
});

export default router;
