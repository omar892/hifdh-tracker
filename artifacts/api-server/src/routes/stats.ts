import { Router, type IRouter } from "express";
import { db, dailyEntriesTable, studentsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { GetStudentStatsParams, GetStudentCalendarParams, GetStudentTodayStatusParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { SURAHS, TOTAL_QURAN_AYAHS, calculateAyahsUpTo } from "../lib/quran-data";

const router: IRouter = Router();

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getMonthStart(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function getMonthEnd(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split("T")[0];
}

router.get("/students/:studentId/stats", requireAuth, async (req, res) => {
  const { studentId } = GetStudentStatsParams.parse(req.params);

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const totalAyahsMemorized = calculateAyahsUpTo(student.currentSurah, student.currentAyah) - 1;
  const totalQuranPercentage = parseFloat(((totalAyahsMemorized / TOTAL_QURAN_AYAHS) * 100).toFixed(1));
  const juzCompleted = Math.floor(totalAyahsMemorized / (TOTAL_QURAN_AYAHS / 30));

  const allEntries = await db
    .select()
    .from(dailyEntriesTable)
    .where(eq(dailyEntriesTable.studentId, studentId))
    .orderBy(desc(dailyEntriesTable.date));

  const totalDays = allEntries.length;
  const successfulDays = allEntries.filter((e) => e.daySuccessful).length;
  const successfulDaysPercent = totalDays > 0 ? parseFloat(((successfulDays / totalDays) * 100).toFixed(1)) : 0;

  let currentStreak = 0;
  for (const entry of allEntries) {
    if (entry.daySuccessful) {
      currentStreak++;
    } else {
      break;
    }
  }

  const currentMonth = getCurrentYearMonth();
  const monthEntries = allEntries.filter((e) => e.date.startsWith(currentMonth));
  const monthSuccessful = monthEntries.filter((e) => e.daySuccessful).length;
  const thisMonthSuccessRate = monthEntries.length > 0
    ? parseFloat(((monthSuccessful / monthEntries.length) * 100).toFixed(1))
    : 0;

  let ayahsMemorizedThisMonth = 0;
  for (const entry of monthEntries) {
    if (entry.newMemorizationCompleted && entry.newMemorizationFromSurah && entry.newMemorizationToSurah &&
        entry.newMemorizationFromAyah && entry.newMemorizationToAyah) {
      const from = calculateAyahsUpTo(entry.newMemorizationFromSurah, entry.newMemorizationFromAyah);
      const to = calculateAyahsUpTo(entry.newMemorizationToSurah, entry.newMemorizationToAyah);
      ayahsMemorizedThisMonth += Math.abs(to - from) + 1;
    }
  }

  const now = new Date();
  const thisWeekStart = getWeekStart(now);
  const lastWeekStart = getWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

  let ayahsMemorizedThisWeek = 0;
  let ayahsMemorizedLastWeek = 0;

  for (const entry of allEntries) {
    if (entry.newMemorizationCompleted && entry.newMemorizationFromSurah && entry.newMemorizationToSurah &&
        entry.newMemorizationFromAyah && entry.newMemorizationToAyah) {
      const count = Math.abs(
        calculateAyahsUpTo(entry.newMemorizationToSurah, entry.newMemorizationToAyah) -
        calculateAyahsUpTo(entry.newMemorizationFromSurah, entry.newMemorizationFromAyah)
      ) + 1;

      if (entry.date >= thisWeekStart) {
        ayahsMemorizedThisWeek += count;
      } else if (entry.date >= lastWeekStart && entry.date < thisWeekStart) {
        ayahsMemorizedLastWeek += count;
      }
    }
  }

  res.json({
    studentId,
    totalAyahsMemorized,
    totalQuranPercentage,
    juzCompleted,
    successfulDaysPercent,
    currentStreak,
    thisMonthSuccessRate,
    ayahsMemorizedThisMonth,
    ayahsMemorizedThisWeek,
    ayahsMemorizedLastWeek,
  });
});

router.get("/students/:studentId/calendar/:yearMonth", requireAuth, async (req, res) => {
  const { studentId, yearMonth } = GetStudentCalendarParams.parse(req.params);

  const monthStart = getMonthStart(yearMonth);
  const monthEnd = getMonthEnd(yearMonth);

  const entries = await db
    .select()
    .from(dailyEntriesTable)
    .where(
      and(
        eq(dailyEntriesTable.studentId, studentId),
        sql`${dailyEntriesTable.date} >= ${monthStart}`,
        sql`${dailyEntriesTable.date} <= ${monthEnd}`
      )
    );

  const entryMap = new Map(entries.map((e) => [e.date, e]));

  const [yearNum, monthNum] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const days = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, "0")}`;
    const entry = entryMap.get(dateStr);
    const dayOfWeek = new Date(yearNum, monthNum - 1, d).getDay();

    let status: string;
    if (!entry) {
      status = "absent";
    } else if (entry.daySuccessful) {
      status = "successful";
    } else {
      const completed = [entry.newMemorizationCompleted, entry.rmvCompleted, entry.reviewCompleted].filter(Boolean).length;
      status = completed > 0 ? "partial" : "failed";
    }

    days.push({ date: dateStr, status });
  }

  const attendedDays = entries.length;
  const successfulDays = entries.filter((e) => e.daySuccessful).length;
  const successRate = attendedDays > 0 ? parseFloat(((successfulDays / attendedDays) * 100).toFixed(1)) : 0;

  res.json({
    yearMonth,
    days,
    successfulDays,
    totalAttendedDays: attendedDays,
    successRate,
  });
});

router.get("/students/:studentId/today-status", requireAuth, async (req, res) => {
  const { studentId } = GetStudentTodayStatusParams.parse(req.params);
  const today = getTodayDate();

  const [entry] = await db
    .select()
    .from(dailyEntriesTable)
    .where(and(eq(dailyEntriesTable.studentId, studentId), eq(dailyEntriesTable.date, today)));

  if (!entry) {
    res.json({ status: "not_started", completedTasks: 0, totalTasks: 3 });
    return;
  }

  const completed = [entry.newMemorizationCompleted, entry.rmvCompleted, entry.reviewCompleted].filter(Boolean).length;

  let status: string;
  if (completed === 3) status = "all_done";
  else if (completed > 0) status = "in_progress";
  else status = "not_started";

  res.json({ status, completedTasks: completed, totalTasks: 3 });
});

router.get("/dashboard", requireAuth, async (req, res) => {
  const students = await db.select().from(studentsTable).where(eq(studentsTable.active, true));
  const today = getTodayDate();

  const todayEntries = await db
    .select()
    .from(dailyEntriesTable)
    .where(eq(dailyEntriesTable.date, today));

  const entryMap = new Map(todayEntries.map((e) => [e.studentId, e]));

  const dashboard = students.map((s) => {
    const entry = entryMap.get(s.id);
    let todayStatus: string;
    let completedTasks = 0;

    if (!entry) {
      todayStatus = "not_started";
    } else {
      completedTasks = [entry.newMemorizationCompleted, entry.rmvCompleted, entry.reviewCompleted].filter(Boolean).length;
      if (completedTasks === 3) todayStatus = "all_done";
      else if (completedTasks > 0) todayStatus = "in_progress";
      else todayStatus = "not_started";
    }

    return {
      id: s.id,
      name: s.name,
      currentSurah: s.currentSurah,
      currentAyah: s.currentAyah,
      todayStatus,
      completedTasks,
    };
  });

  res.json(dashboard);
});

router.get("/stats/class", requireAuth, async (req, res) => {
  const students = await db.select().from(studentsTable).where(eq(studentsTable.active, true));

  let totalAyahsMemorized = 0;
  const studentStats: { studentId: number; name: string; successRate: number }[] = [];

  for (const student of students) {
    totalAyahsMemorized += calculateAyahsUpTo(student.currentSurah, student.currentAyah) - 1;

    const entries = await db
      .select()
      .from(dailyEntriesTable)
      .where(eq(dailyEntriesTable.studentId, student.id));

    const total = entries.length;
    const successful = entries.filter((e) => e.daySuccessful).length;
    const rate = total > 0 ? parseFloat(((successful / total) * 100).toFixed(1)) : 0;

    studentStats.push({ studentId: student.id, name: student.name, successRate: rate });
  }

  studentStats.sort((a, b) => b.successRate - a.successRate);

  const avgRate = studentStats.length > 0
    ? parseFloat((studentStats.reduce((sum, s) => sum + s.successRate, 0) / studentStats.length).toFixed(1))
    : 0;

  res.json({
    totalStudents: students.length,
    averageSuccessRate: avgRate,
    totalAyahsMemorized,
    topPerformers: studentStats.slice(0, 3),
    needsAttention: studentStats.slice(-3).reverse(),
  });
});

router.get("/surahs", (req, res) => {
  res.json(SURAHS);
});

export default router;
