import { Router, type IRouter } from "express";
import { db, weeklyEntriesTable, studentsTable, studentCompletedJuzTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { GetStudentStatsParams, GetStudentCalendarParams, GetStudentProjectionsParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { SURAHS, TOTAL_LINES, getLinesForCompletedJuz } from "../lib/quran-data";
import { getCompletedJuz } from "./students";
import { getStudentForTeacher } from "../lib/scope";

const router: IRouter = Router();

/**
 * Format a line count the way a teacher would say it. Mirrors the frontend
 * util in hifdh-tracker/src/lib/format.ts. Kept inline to avoid leaking a
 * frontend dep into the server bundle.
 *   formatLines(6)   → "6 lines"
 *   formatLines(20)  → "1 page 5 lines"
 *   formatLines(110) → "7 pages 5 lines"
 */
function formatLines(n: number): string {
  const LINES_PER_PAGE = 15;
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  if (abs < LINES_PER_PAGE) {
    return `${sign}${abs} ${abs === 1 ? "line" : "lines"}`;
  }
  const pages = Math.floor(abs / LINES_PER_PAGE);
  const lines = abs % LINES_PER_PAGE;
  const pageWord = pages === 1 ? "page" : "pages";
  if (lines === 0) return `${sign}${pages} ${pageWord}`;
  const lineWord = lines === 1 ? "line" : "lines";
  return `${sign}${pages} ${pageWord} ${lines} ${lineWord}`;
}

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

/**
 * Whole-week count between two Monday-anchored date strings (YYYY-MM-DD).
 * Returns null when either side is missing.
 */
function weeksBetween(fromMondayStr: string | null | undefined, toMondayStr: string): number | null {
  if (!fromMondayStr) return null;
  const from = new Date(fromMondayStr + "T00:00:00Z").getTime();
  const to = new Date(toMondayStr + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((to - from) / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * The streak shown to users only means anything if it INCLUDES recent weeks.
 * If the most-recent entry is older than this many weeks, treat the streak as
 * stale (return 0). 2 weeks lets a teacher log a week late without losing it.
 */
const STREAK_STALE_AFTER_WEEKS = 2;

/**
 * Walk recent entries from newest → oldest, counting consecutive weeks with
 * ≥4 successful days. Returns 0 if the newest entry itself is stale, so an
 * old streak doesn't keep displaying as current.
 */
function computeFreshStreak(
  entriesDesc: { weekStartDate: string; successfulDays: number }[],
  thisWeekMonday: string,
): number {
  if (entriesDesc.length === 0) return 0;
  const weeksSince = weeksBetween(entriesDesc[0].weekStartDate, thisWeekMonday) ?? 0;
  if (weeksSince > STREAK_STALE_AFTER_WEEKS) return 0;
  let streak = 0;
  for (const entry of entriesDesc) {
    if (entry.successfulDays >= 4) streak++;
    else break;
  }
  return streak;
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
  const teacher = req.teacher!;
  const { studentId } = GetStudentStatsParams.parse(req.params);

  const student = await getStudentForTeacher(studentId, teacher.id);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const completedJuz = await getCompletedJuz(student.id);
  const totalLinesMemorized = getLinesForCompletedJuz(completedJuz);
  const totalQuranPercentage = parseFloat(((totalLinesMemorized / TOTAL_LINES) * 100).toFixed(1));
  const juzCompleted = completedJuz.length;

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

  const thisWeekMonday = getCurrentMonday();
  // 4-week success rate — calendar-scoped so it answers "right now, how is
  // this student doing?" A student who hasn't logged in 6+ weeks reads as 0%,
  // which is the honest answer.
  const fourWeeksAgoMondayStudent = (() => {
    const d = new Date(thisWeekMonday + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 4 * 7);
    return d.toISOString().split("T")[0];
  })();
  const last4WeekEntries = allEntries.filter((e) => e.weekStartDate >= fourWeeksAgoMondayStudent);
  const days4w = last4WeekEntries.reduce((s, e) => s + e.daysAttended, 0);
  const success4w = last4WeekEntries.reduce((s, e) => s + e.successfulDays, 0);
  const successRate4Weeks = days4w > 0
    ? parseFloat(((success4w / days4w) * 100).toFixed(1))
    : 0;

  const currentStreakWeeks = computeFreshStreak(allEntries, thisWeekMonday);
  const weeksSinceLastEntry = weeksBetween(allEntries[0]?.weekStartDate, thisWeekMonday);

  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonth = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  const { start: thisMonthStart, end: thisMonthEnd } = getMonthBounds(thisMonth);
  const { start: lastMonthStart, end: lastMonthEnd } = getMonthBounds(lastMonth);

  let linesThisMonth = 0;
  let linesLastMonth = 0;

  for (const entry of allEntries) {
    const inThisMonth = entry.weekStartDate >= thisMonthStart && entry.weekStartDate <= thisMonthEnd;
    const inLastMonth = entry.weekStartDate >= lastMonthStart && entry.weekStartDate <= lastMonthEnd;

    if (inThisMonth) linesThisMonth += entry.memorizationLines;
    if (inLastMonth) linesLastMonth += entry.memorizationLines;
  }

  // Attendance summary — derived from the dailyAbsent arrays we already store
  // on weekly_entries. Two windows: last 4 weeks (the "recent attention" view
  // teachers act on) and all-time (the trust baseline). Each window counts
  // present days vs scheduled days; absent days are the inverse of
  // dailyAbsent. Skipped entries (no dailyAbsent JSON) contribute zero.
  function attendanceFor(entries: typeof allEntries) {
    let scheduled = 0;
    let present = 0;
    for (const e of entries) {
      if (!e.dailyAbsent) continue;
      try {
        const absent = JSON.parse(e.dailyAbsent) as boolean[];
        if (!Array.isArray(absent) || absent.length !== 5) continue;
        scheduled += 5;
        present += absent.filter((a) => !a).length;
      } catch {}
    }
    const pct = scheduled > 0 ? Math.round((present / scheduled) * 100) : null;
    return { scheduled, present, absent: scheduled - present, percent: pct };
  }
  const attendanceLast4Weeks = attendanceFor(last4WeekEntries);
  const attendanceAllTime = attendanceFor(allEntries);

  res.json({
    totalLinesMemorized,
    totalQuranPercentage,
    juzCompleted,
    overallSuccessRate,
    successRate4Weeks,
    currentStreakWeeks,
    weeksSinceLastEntry,
    linesThisMonth,
    linesLastMonth,
    attendanceLast4Weeks,
    attendanceAllTime,
    status: student.status,
    statusChangedAt: student.statusChangedAt,
    archivedAt: student.archivedAt,
  });
});

router.get("/students/:studentId/calendar", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const { studentId } = GetStudentCalendarParams.parse(req.params);
  const month = req.query.month as string;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month query param required (YYYY-MM)" });
    return;
  }

  const student = await getStudentForTeacher(studentId, teacher.id);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
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
      linesMemorized: entry?.memorizationLines ?? null,
      weeklyPoints: entry?.weeklyPoints ?? null,
    };
  });

  const weeksWithEntries = calendarWeeks.filter((w) => w.hasEntry);
  const totalLines = weeksWithEntries.reduce((sum, w) => sum + (w.linesMemorized ?? 0), 0);
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
    totalLines,
    avgSuccessfulDays,
    excellentWeeks,
  });
});

router.get("/dashboard", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  // Dashboard shows active AND paused students — paused stay visible so the
  // teacher can change their mind / unpause / log a make-up week, but the
  // frontend uses `status` to render them with calm styling and to suppress
  // "Missing" alerts. Graduated + withdrawn are filtered out entirely (the
  // roster's Archived view is their home).
  const students = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.teacherId, teacher.id),
        inArray(studentsTable.status, ["active", "paused"]),
      ),
    );

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
      const completedJuz = await getCompletedJuz(student.id);

      return {
        id: student.id,
        name: student.name,
        gender: student.gender ?? null,
        currentPage: student.currentPage,
        currentLine: student.currentLine,
        active: student.active,
        status: student.status,
        thisWeekDone,
        thisWeekEntry: thisWeekDone ? latestEntry : null,
        completedJuz,
      };
    })
  );

  res.json(result);
});

/* ── Attention flag logic ─────────────────────────── */

const RATING_TIERS: Record<string, number> = {
  excellent: 5,
  strong: 4,
  steady: 3,
  needs_improvement: 2,
  difficult_week: 1,
};

type EntryRow = {
  weekStartDate: string;
  successfulDays: number;
  daysAttended: number;
  weekRating: string | null;
  memorizationLines: number;
};

/**
 * "Genuine concern" flags — performance signals teachers should actually
 * think about. Excludes "missing this week's entry" which is its own state
 * (handled by notYetLogged below).
 */
function computeAttentionFlags(
  recentEntries: EntryRow[],
): { type: string; label: string }[] {
  const flags: { type: string; label: string }[] = [];
  const last2 = recentEntries.slice(0, 2);
  if (last2.length < 2) return flags;

  const bothLowSuccess = last2.every((e) => {
    const rate = e.daysAttended > 0 ? e.successfulDays / e.daysAttended : 0;
    return rate < 0.6;
  });
  if (bothLowSuccess) {
    flags.push({ type: "low_success", label: "Low success rate (2 weeks)" });
  }

  const bothBadRating = last2.every((e) =>
    e.weekRating === "needs_improvement" || e.weekRating === "difficult_week"
  );
  if (bothBadRating) {
    flags.push({ type: "rating_decline", label: "2-week rating concern" });
  }

  if (last2[0].weekRating && last2[1].weekRating) {
    const prevTier = RATING_TIERS[last2[1].weekRating] ?? 3;
    const currTier = RATING_TIERS[last2[0].weekRating] ?? 3;
    if (prevTier - currTier >= 2) {
      flags.push({ type: "rating_drop", label: "Sharp rating drop" });
    }
  }

  const bothLowAttendance = last2.every((e) => e.daysAttended <= 3);
  if (bothLowAttendance) {
    flags.push({ type: "attendance_drop", label: "Attendance drop" });
  }

  return flags;
}

/**
 * Day-of-week phase used to decide whether "not yet logged this week" is
 * a calm informational state or worth escalating. Mon–Wed early; Thu mid;
 * Fri+ late.
 */
function getWeekPhase(): "early" | "mid" | "late" {
  const day = new Date().getUTCDay(); // 0=Sun, 1=Mon, ...
  if (day === 0 || day >= 5) return "late"; // Fri, Sat, Sun
  if (day === 4) return "mid"; // Thu
  return "early"; // Mon-Wed
}

/* ── Spotlight logic ──────────────────────────────── */

type SpotlightItem = {
  studentId: number;
  name: string;
  insightText: string;
  type: string;
  category: "positive" | "concern";
  priority: number;
};

function computeSpotlights(
  students: { id: number; name: string; currentPage: number }[],
  entryMap: Map<number, EntryRow[]>,
  thisWeekMonday: string,
): SpotlightItem[] {
  const positives: SpotlightItem[] = [];
  const concerns: SpotlightItem[] = [];

  for (const student of students) {
    const entries = entryMap.get(student.id) ?? [];
    if (entries.length < 2) continue;

    const thisWeek = entries[0];
    const lastWeek = entries[1];

    // 1. Biggest week-over-week increase (>20%)
    if (lastWeek.memorizationLines > 0) {
      const pctChange = (thisWeek.memorizationLines - lastWeek.memorizationLines) / lastWeek.memorizationLines;
      if (pctChange > 0.2) {
        const delta = thisWeek.memorizationLines - lastWeek.memorizationLines;
        positives.push({
          studentId: student.id,
          name: student.name,
          insightText: `+${formatLines(delta)} vs last week (${Math.round(pctChange * 100)}% increase)`,
          type: "big_increase",
          category: "positive",
          priority: pctChange * 100,
        });
      }
    }

    // 2. First "Excellent" in 4+ weeks
    if (thisWeek.weekRating === "excellent" && entries.length >= 4) {
      const recentPrior = entries.slice(1, 5);
      const hadExcellent = recentPrior.some((e) => e.weekRating === "excellent");
      if (!hadExcellent) {
        positives.push({
          studentId: student.id,
          name: student.name,
          insightText: "First Excellent rating in 4+ weeks",
          type: "first_excellent",
          category: "positive",
          priority: 90,
        });
      }
    }

    // 3. New personal record for lines (needs 4+ weeks)
    if (entries.length >= 4) {
      const prevMax = Math.max(...entries.slice(1).map((e) => e.memorizationLines));
      if (thisWeek.memorizationLines > prevMax && prevMax > 0) {
        positives.push({
          studentId: student.id,
          name: student.name,
          insightText: `New personal record: ${formatLines(thisWeek.memorizationLines)} in a week`,
          type: "personal_record",
          category: "positive",
          priority: 85,
        });
      }
    }

    // 4. Hit milestone page (every 50 pages)
    if (thisWeek.weekStartDate === thisWeekMonday) {
      const currentMilestone = Math.floor(student.currentPage / 50) * 50;
      if (currentMilestone > 0) {
        // Check if they recently crossed this boundary
        const prevEntryWithPage = entries.find((e, i) => i > 0 && (e as any).currentPage != null);
        if (prevEntryWithPage) {
          const prevPage = (prevEntryWithPage as any).currentPage as number;
          const prevMilestone = Math.floor(prevPage / 50) * 50;
          if (currentMilestone > prevMilestone) {
            positives.push({
              studentId: student.id,
              name: student.name,
              insightText: `Reached page ${currentMilestone} milestone!`,
              type: "milestone_page",
              category: "positive",
              priority: 80,
            });
          }
        }
      }
    }

    // 5. Perfect 5/5 successful days for 4+ consecutive weeks
    if (entries.length >= 4) {
      const last4 = entries.slice(0, 4);
      const allPerfect = last4.every((e) => e.successfulDays >= 5);
      if (allPerfect) {
        positives.push({
          studentId: student.id,
          name: student.name,
          insightText: "Perfect 5/5 successful days for 4+ weeks straight",
          type: "perfect_streak",
          category: "positive",
          priority: 95,
        });
      }
    }

    // 6. Biggest week-over-week drop (>30%)
    if (lastWeek.memorizationLines > 0) {
      const pctDrop = (lastWeek.memorizationLines - thisWeek.memorizationLines) / lastWeek.memorizationLines;
      if (pctDrop > 0.3) {
        const delta = lastWeek.memorizationLines - thisWeek.memorizationLines;
        concerns.push({
          studentId: student.id,
          name: student.name,
          insightText: `-${formatLines(delta)} vs last week (${Math.round(pctDrop * 100)}% drop)`,
          type: "big_drop",
          category: "concern",
          priority: pctDrop * 100,
        });
      }
    }

    // 7. First streak break after 8+ weeks
    if (entries.length >= 9) {
      const thisWeekGood = thisWeek.successfulDays >= 4;
      if (!thisWeekGood) {
        let priorStreak = 0;
        for (let i = 1; i < entries.length; i++) {
          if (entries[i].successfulDays >= 4) priorStreak++;
          else break;
        }
        if (priorStreak >= 8) {
          concerns.push({
            studentId: student.id,
            name: student.name,
            insightText: `Streak broken after ${priorStreak} weeks`,
            type: "streak_break",
            category: "concern",
            priority: 80,
          });
        }
      }
    }

    // 8. Rating dropped 2+ tiers
    if (thisWeek.weekRating && lastWeek.weekRating) {
      const currTier = RATING_TIERS[thisWeek.weekRating] ?? 3;
      const prevTier = RATING_TIERS[lastWeek.weekRating] ?? 3;
      if (prevTier - currTier >= 2) {
        concerns.push({
          studentId: student.id,
          name: student.name,
          insightText: `Rating dropped from ${lastWeek.weekRating.replace(/_/g, " ")} to ${thisWeek.weekRating.replace(/_/g, " ")}`,
          type: "rating_drop",
          category: "concern",
          priority: 70,
        });
      }
    }
  }

  // Sort by priority desc, pick top 2 positive + top 1 concern
  positives.sort((a, b) => b.priority - a.priority);
  concerns.sort((a, b) => b.priority - a.priority);

  const result: SpotlightItem[] = [];
  result.push(...positives.slice(0, 2));
  if (concerns.length > 0) result.push(concerns[0]);

  return result.sort((a, b) => b.priority - a.priority);
}

/* ── /stats/class route ──────────────────────────── */

router.get("/stats/class", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  // Class averages reflect ACTIVE students only — paused students should not
  // pull down the success rate or pace because their lack of recent entries
  // is by design, not a problem. Graduated / withdrawn are also excluded.
  const students = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.teacherId, teacher.id),
        eq(studentsTable.status, "active"),
      ),
    );
  // Scope entries to only this teacher's students. Avoids leaking another
  // teacher's data through aggregates (mean lines/week, success rate, etc.).
  const studentIds = students.map((s) => s.id);
  const allWeeklyEntries = studentIds.length > 0
    ? await db.select().from(weeklyEntriesTable).where(inArray(weeklyEntriesTable.studentId, studentIds))
    : [];

  const entryMap = new Map<number, typeof allWeeklyEntries>();
  for (const entry of allWeeklyEntries) {
    if (!entryMap.has(entry.studentId)) entryMap.set(entry.studentId, []);
    entryMap.get(entry.studentId)!.push(entry);
  }
  for (const entries of entryMap.values()) {
    entries.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
  }

  const thisWeekMonday = getCurrentMonday();
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonth = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const { start: thisMonthStart, end: thisMonthEnd } = getMonthBounds(thisMonth);
  const { start: lastMonthStart, end: lastMonthEnd } = getMonthBounds(lastMonth);

  let totalLinesMemorized = 0;
  const studentStats: { studentId: number; name: string; successRate: number }[] = [];
  const studentProgressList: { studentId: number; name: string; totalLines: number; totalJuz: number; weeklyPace: number }[] = [];
  const attentionFlags: { studentId: number; name: string; flags: { type: string; label: string }[] }[] = [];
  const streakList: { studentId: number; name: string; currentStreak: number; best12WeekStreak: number; weeksSinceLastEntry: number | null }[] = [];
  const rankingData: { studentId: number; name: string; successRate4w: number; weeklyPace4w: number; consistency4w: number }[] = [];

  let classLinesThisMonth = 0;
  let classLinesLastMonth = 0;
  let activeStudentsThisMonth = 0;
  let activeStudentsLastMonth = 0;

  // Monthly decomposition accumulators
  let totalSchoolDaysThisMonth = 0;
  let totalSchoolDaysLastMonth = 0;
  const perStudentMonthlyDeltas: { studentId: number; name: string; linesThisMonth: number; linesLastMonth: number }[] = [];

  for (const student of students) {
    const studentJuz = await getCompletedJuz(student.id);
    const studentTotalLines = getLinesForCompletedJuz(studentJuz);
    totalLinesMemorized += studentTotalLines;

    const entries = entryMap.get(student.id) ?? [];
    const totalDays = entries.reduce((s, e) => s + e.daysAttended, 0);
    const successDays = entries.reduce((s, e) => s + e.successfulDays, 0);
    const rate = totalDays > 0 ? parseFloat(((successDays / totalDays) * 100).toFixed(1)) : 0;
    studentStats.push({ studentId: student.id, name: student.name, successRate: rate });

    const last4 = entries.slice(0, 4);
    const weeklyPace = last4.length > 0
      ? parseFloat((last4.reduce((s, e) => s + e.memorizationLines, 0) / last4.length).toFixed(1))
      : 0;
    studentProgressList.push({
      studentId: student.id,
      name: student.name,
      totalLines: studentTotalLines,
      totalJuz: studentJuz.length,
      weeklyPace,
    });

    const flags = computeAttentionFlags(entries);
    if (flags.length > 0) {
      attentionFlags.push({ studentId: student.id, name: student.name, flags });
    }

    const currentStreak = computeFreshStreak(entries, thisWeekMonday);
    const weeksSinceLast = weeksBetween(entries[0]?.weekStartDate, thisWeekMonday);

    const last12 = entries.slice(0, 12);
    let best12 = 0;
    let running = 0;
    for (const entry of last12) {
      if (entry.successfulDays >= 4) {
        running++;
        if (running > best12) best12 = running;
      } else {
        running = 0;
      }
    }

    streakList.push({
      studentId: student.id,
      name: student.name,
      currentStreak,
      best12WeekStreak: best12,
      weeksSinceLastEntry: weeksSinceLast,
    });

    const last4Entries = entries.slice(0, 4);
    if (last4Entries.length > 0) {
      const sr4w = (() => {
        const attended = last4Entries.reduce((s, e) => s + e.daysAttended, 0);
        const success = last4Entries.reduce((s, e) => s + e.successfulDays, 0);
        return attended > 0 ? success / attended : 0;
      })();

      const pace4w = last4Entries.reduce((s, e) => s + e.memorizationLines, 0) / last4Entries.length;

      const lineValues = last4Entries.map((e) => e.memorizationLines);
      const meanLines = lineValues.reduce((s, v) => s + v, 0) / lineValues.length;
      const variance = lineValues.reduce((s, v) => s + (v - meanLines) ** 2, 0) / lineValues.length;
      const stdDev = Math.sqrt(variance);

      rankingData.push({
        studentId: student.id,
        name: student.name,
        successRate4w: sr4w,
        weeklyPace4w: pace4w,
        consistency4w: stdDev,
      });
    }

    let studentLinesThisMonth = 0;
    let studentLinesLastMonth = 0;
    for (const entry of entries) {
      if (entry.weekStartDate >= thisMonthStart && entry.weekStartDate <= thisMonthEnd) {
        studentLinesThisMonth += entry.memorizationLines;
      }
      if (entry.weekStartDate >= lastMonthStart && entry.weekStartDate <= lastMonthEnd) {
        studentLinesLastMonth += entry.memorizationLines;
      }
    }
    classLinesThisMonth += studentLinesThisMonth;
    classLinesLastMonth += studentLinesLastMonth;
    if (studentLinesThisMonth > 0) activeStudentsThisMonth++;
    if (studentLinesLastMonth > 0) activeStudentsLastMonth++;

    // Track school days (daysAttended) per month
    let daysThisMonth = 0;
    let daysLastMonth = 0;
    for (const entry of entries) {
      if (entry.weekStartDate >= thisMonthStart && entry.weekStartDate <= thisMonthEnd) {
        daysThisMonth += entry.daysAttended;
      }
      if (entry.weekStartDate >= lastMonthStart && entry.weekStartDate <= lastMonthEnd) {
        daysLastMonth += entry.daysAttended;
      }
    }
    totalSchoolDaysThisMonth += daysThisMonth;
    totalSchoolDaysLastMonth += daysLastMonth;
    perStudentMonthlyDeltas.push({
      studentId: student.id,
      name: student.name,
      linesThisMonth: studentLinesThisMonth,
      linesLastMonth: studentLinesLastMonth,
    });
  }

  // Composite Rankings
  const avgClassPace = rankingData.length > 0
    ? rankingData.reduce((s, r) => s + r.weeklyPace4w, 0) / rankingData.length
    : 1;
  const maxStdDev = Math.max(...rankingData.map((r) => r.consistency4w), 1);

  const studentRankings = rankingData
    .map((r) => {
      const successComponent = r.successRate4w * 100 * 0.4;
      const paceNorm = avgClassPace > 0 ? Math.min(r.weeklyPace4w / avgClassPace, 2) : 0;
      const paceComponent = paceNorm * 50 * 0.3;
      const consistencyNorm = maxStdDev > 0 ? 1 - (r.consistency4w / maxStdDev) : 1;
      const consistencyComponent = Math.max(0, consistencyNorm) * 100 * 0.3;
      const composite = Math.round(successComponent + paceComponent + consistencyComponent);
      return {
        studentId: r.studentId,
        name: r.name,
        compositeScore: Math.min(100, composite),
        successRate: parseFloat((r.successRate4w * 100).toFixed(1)),
        weeklyPace: parseFloat(r.weeklyPace4w.toFixed(1)),
        consistency: parseFloat((Math.max(0, consistencyNorm) * 100).toFixed(0)),
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);

  studentStats.sort((a, b) => b.successRate - a.successRate);
  const avgRate =
    studentStats.length > 0
      ? parseFloat((studentStats.reduce((s, st) => s + st.successRate, 0) / studentStats.length).toFixed(1))
      : 0;
  const avgLinesPerWeek =
    allWeeklyEntries.length > 0
      ? parseFloat((allWeeklyEntries.reduce((s, e) => s + e.memorizationLines, 0) / allWeeklyEntries.length).toFixed(1))
      : 0;

  // 4-week class averages — scoped to actual calendar weeks, not "last 4
  // entries per student." A student who last logged 6 weeks ago contributes
  // 0 to both metrics (since they have no recent entries), which is the
  // honest answer to "how is the class doing right now?"
  const fourWeeksAgoMonday = (() => {
    const d = new Date(thisWeekMonday + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 4 * 7);
    return d.toISOString().split("T")[0];
  })();
  const entriesInLast4Weeks = allWeeklyEntries.filter((e) => e.weekStartDate >= fourWeeksAgoMonday);
  const days4wTotal = entriesInLast4Weeks.reduce((s, e) => s + e.daysAttended, 0);
  const success4wTotal = entriesInLast4Weeks.reduce((s, e) => s + e.successfulDays, 0);
  const averageSuccessRate4Weeks = days4wTotal > 0
    ? parseFloat(((success4wTotal / days4wTotal) * 100).toFixed(1))
    : 0;
  // lines / week / student over the last 4 calendar weeks, averaged across
  // all *currently active* students (not just those who logged)
  const lines4wTotal = entriesInLast4Weeks.reduce((s, e) => s + e.memorizationLines, 0);
  const avgLinesPerWeek4Weeks = students.length > 0
    ? parseFloat((lines4wTotal / students.length / 4).toFixed(1))
    : 0;

  studentProgressList.sort((a, b) => b.totalLines - a.totalLines);
  streakList.sort((a, b) => b.currentStreak - a.currentStreak || b.best12WeekStreak - a.best12WeekStreak);

  // Weekly Trends (last 8 weeks)
  const weeklyTrends: { weekStart: string; avgSuccessRate: number; totalLines: number; avgRating: number }[] = [];
  {
    const mondayDate = new Date(thisWeekMonday + "T00:00:00Z");
    const weekDates: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(mondayDate);
      d.setUTCDate(d.getUTCDate() - i * 7);
      weekDates.push(d.toISOString().split("T")[0]);
    }

    for (const weekStart of weekDates) {
      const weekEntries = allWeeklyEntries.filter((e) => e.weekStartDate === weekStart);
      if (weekEntries.length === 0) {
        weeklyTrends.push({ weekStart, avgSuccessRate: 0, totalLines: 0, avgRating: 0 });
        continue;
      }
      const totalAttended = weekEntries.reduce((s, e) => s + e.daysAttended, 0);
      const totalSuccess = weekEntries.reduce((s, e) => s + e.successfulDays, 0);
      const avgSuccessRate = totalAttended > 0 ? parseFloat(((totalSuccess / totalAttended) * 100).toFixed(1)) : 0;
      const totalLines = weekEntries.reduce((s, e) => s + e.memorizationLines, 0);
      const ratedEntries = weekEntries.filter((e) => e.weekRating != null);
      const avgRating = ratedEntries.length > 0
        ? parseFloat((ratedEntries.reduce((s, e) => s + (RATING_TIERS[e.weekRating!] ?? 3), 0) / ratedEntries.length).toFixed(1))
        : 0;
      weeklyTrends.push({ weekStart, avgSuccessRate, totalLines, avgRating });
    }
  }

  const avgLinesPerStudentThisMonth = activeStudentsThisMonth > 0
    ? parseFloat((classLinesThisMonth / activeStudentsThisMonth).toFixed(1))
    : 0;
  const avgLinesPerStudentLastMonth = activeStudentsLastMonth > 0
    ? parseFloat((classLinesLastMonth / activeStudentsLastMonth).toFixed(1))
    : 0;

  // ── Spotlights ──
  const spotlights = computeSpotlights(students, entryMap as any, thisWeekMonday);

  // ── Monthly Decomposition ──
  const linesPerSchoolDayThisMonth = totalSchoolDaysThisMonth > 0
    ? parseFloat((classLinesThisMonth / totalSchoolDaysThisMonth).toFixed(1))
    : 0;
  const linesPerSchoolDayLastMonth = totalSchoolDaysLastMonth > 0
    ? parseFloat((classLinesLastMonth / totalSchoolDaysLastMonth).toFixed(1))
    : 0;
  const biggestContributors = perStudentMonthlyDeltas
    .map((s) => ({ studentId: s.studentId, name: s.name, linesDelta: s.linesThisMonth - s.linesLastMonth }))
    .sort((a, b) => Math.abs(b.linesDelta) - Math.abs(a.linesDelta))
    .slice(0, 2);
  const monthlyDecomposition = {
    schoolDaysThisMonth: totalSchoolDaysThisMonth,
    schoolDaysLastMonth: totalSchoolDaysLastMonth,
    linesPerSchoolDayThisMonth,
    linesPerSchoolDayLastMonth,
    biggestContributors,
  };

  // ── Rating Distributions (5 weeks) ──
  const ratingDistributions: { weekStart: string; counts: Record<string, number> }[] = [];
  {
    const mondayDate = new Date(thisWeekMonday + "T00:00:00Z");
    for (let i = 0; i < 5; i++) {
      const d = new Date(mondayDate);
      d.setUTCDate(d.getUTCDate() - i * 7);
      const weekStart = d.toISOString().split("T")[0];
      const weekEntries = allWeeklyEntries.filter((e) => e.weekStartDate === weekStart);
      const counts = { excellent: 0, strong: 0, steady: 0, needs_improvement: 0, difficult_week: 0 };
      for (const e of weekEntries) {
        if (e.weekRating && e.weekRating in counts) {
          counts[e.weekRating as keyof typeof counts]++;
        }
      }
      ratingDistributions.push({ weekStart, counts });
    }
  }

  // ── This Week Summary + Absent Students ──
  const thisWeekEntries = allWeeklyEntries.filter((e) => e.weekStartDate === thisWeekMonday);
  const totalClassLines = thisWeekEntries.reduce((s, e) => s + e.memorizationLines, 0);
  const avgLinesPerStudent = thisWeekEntries.length > 0
    ? parseFloat((totalClassLines / thisWeekEntries.length).toFixed(1))
    : 0;

  // Best week this month
  const thisMonthEntries = allWeeklyEntries.filter(
    (e) => e.weekStartDate >= thisMonthStart && e.weekStartDate <= thisMonthEnd,
  );
  const weekTotals = new Map<string, number>();
  for (const e of thisMonthEntries) {
    weekTotals.set(e.weekStartDate, (weekTotals.get(e.weekStartDate) ?? 0) + e.memorizationLines);
  }
  const bestWeekLinesThisMonth = weekTotals.size > 0 ? Math.max(...weekTotals.values()) : 0;

  const thisWeekSummary = { totalClassLines, avgLinesPerStudent, bestWeekLinesThisMonth };

  // Absent students: students with <5 days attended (or no entry) this week
  const thisWeekStudentEntries = new Map(thisWeekEntries.map((e) => [e.studentId, e]));
  const absentStudents: { studentId: number; name: string; daysAttended: number }[] = [];
  for (const student of students) {
    const entry = thisWeekStudentEntries.get(student.id);
    const daysAttended = entry?.daysAttended ?? 0;
    if (daysAttended < 5) {
      absentStudents.push({ studentId: student.id, name: student.name, daysAttended });
    }
  }
  absentStudents.sort((a, b) => a.daysAttended - b.daysAttended);

  // ── notYetLogged + classWeekStatus ──
  // "Has this student logged this week's entry?" is a separate concept from
  // "is this student struggling?". We surface it in its own list so the
  // Needs Attention list stays for genuine concern signals.
  const notYetLogged: { studentId: number; name: string }[] = [];
  for (const student of students) {
    if (!thisWeekStudentEntries.has(student.id)) {
      notYetLogged.push({ studentId: student.id, name: student.name });
    }
  }
  const weekPhase = getWeekPhase();
  const classWeekStatus = {
    thisWeekMonday,
    weekPhase, // "early" Mon-Wed, "mid" Thu, "late" Fri+
    unloggedCount: notYetLogged.length,
    totalStudents: students.length,
    allUnlogged: notYetLogged.length === students.length && students.length > 0,
  };

  res.json({
    totalStudents: students.length,
    averageSuccessRate: avgRate,
    averageSuccessRate4Weeks,
    totalLinesMemorized,
    avgLinesPerWeek: avgLinesPerWeek,
    avgLinesPerWeek4Weeks,
    topPerformers: studentStats.slice(0, 3),
    needsAttention: studentStats.filter((s) => s.successRate < 70).slice(0, 3),
    studentProgress: studentProgressList,
    studentRankings,
    attentionFlags,
    weeklyTrends,
    streakLeaderboard: streakList,
    linesThisMonth: classLinesThisMonth,
    linesLastMonth: classLinesLastMonth,
    activeStudentsThisMonth,
    activeStudentsLastMonth,
    avgLinesPerStudentThisMonth,
    avgLinesPerStudentLastMonth,
    spotlights: spotlights.map(({ priority: _, ...rest }) => rest),
    monthlyDecomposition,
    ratingDistributions,
    thisWeekSummary,
    absentStudents,
    notYetLogged,
    classWeekStatus,
  });
});

/* ── Projections ─────────────────────────────────── */

const HALF_QURAN_LINES = Math.round(TOTAL_LINES / 2); // 4530

router.get("/students/:studentId/projections", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  const { studentId } = GetStudentProjectionsParams.parse(req.params);

  const student = await getStudentForTeacher(studentId, teacher.id);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const completedJuz = await getCompletedJuz(student.id);
  const totalLinesMemorized = getLinesForCompletedJuz(completedJuz);

  const allEntries = await db
    .select()
    .from(weeklyEntriesTable)
    .where(eq(weeklyEntriesTable.studentId, studentId))
    .orderBy(desc(weeklyEntriesTable.weekStartDate));

  const activeEntries = allEntries.filter((e) => e.daysAttended > 0);
  const recent8 = activeEntries.slice(0, 8);

  const recentTotal = recent8.reduce((sum, e) => sum + e.memorizationLines, 0);
  const paceRecent = recent8.length > 0 ? parseFloat((recentTotal / recent8.length).toFixed(1)) : 0;

  const allTimeTotal = activeEntries.reduce((sum, e) => sum + e.memorizationLines, 0);
  const paceAllTime = activeEntries.length > 0 ? parseFloat((allTimeTotal / activeEntries.length).toFixed(1)) : 0;

  const linesRemaining6Month = Math.max(0, HALF_QURAN_LINES - totalLinesMemorized);
  const linesRemainingFull = Math.max(0, TOTAL_LINES - totalLinesMemorized);

  const weeksTo6MonthGoal = paceRecent > 0 ? Math.round(linesRemaining6Month / paceRecent) : null;
  const weeksToFullQuran = paceRecent > 0 ? Math.round(linesRemainingFull / paceRecent) : null;

  const now = new Date();
  const addWeeks = (weeks: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().split("T")[0];
  };

  const projectedDate6Month = weeksTo6MonthGoal != null ? addWeeks(weeksTo6MonthGoal) : null;
  const projectedDateFull = weeksToFullQuran != null ? addWeeks(weeksToFullQuran) : null;

  let trend: "improving" | "declining" | "stable" = "stable";
  if (paceAllTime > 0 && paceRecent > 0) {
    if (paceRecent > paceAllTime * 1.1) trend = "improving";
    else if (paceRecent < paceAllTime * 0.9) trend = "declining";
  }

  let consistencyScore = 0;
  if (student.startDate) {
    const startMs = new Date(student.startDate + "T00:00:00Z").getTime();
    const totalWeeksSinceStart = Math.max(1, Math.floor((now.getTime() - startMs) / (7 * 24 * 60 * 60 * 1000)));
    consistencyScore = parseFloat(((allEntries.length / totalWeeksSinceStart) * 100).toFixed(1));
    if (consistencyScore > 100) consistencyScore = 100;
  }

  res.json({
    paceRecent,
    paceAllTime,
    linesRemaining6Month,
    linesRemainingFull,
    weeksTo6MonthGoal,
    weeksToFullQuran,
    projectedDate6Month,
    projectedDateFull,
    trend,
    consistencyScore,
  });
});

router.get("/surahs", requireAuth, (req, res) => {
  res.json(SURAHS);
});

export default router;
