import { Router, type IRouter } from "express";
import { db, weeklyEntriesTable, studentsTable, studentCompletedJuzTable } from "@workspace/db";
import { eq, desc, and, inArray, gte } from "drizzle-orm";
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

/**
 * For the Wins section: consecutive weeks of perfect attendance
 * (daysAttended === 5), newest → oldest, stale-aware just like the success
 * streak. Showing up every day is the cleanest signal to celebrate.
 */
function computePerfectAttendanceStreak(
  entriesDesc: { weekStartDate: string; daysAttended: number }[],
  thisWeekMonday: string,
): number {
  if (entriesDesc.length === 0) return 0;
  const weeksSince = weeksBetween(entriesDesc[0].weekStartDate, thisWeekMonday) ?? 0;
  if (weeksSince > STREAK_STALE_AFTER_WEEKS) return 0;
  let streak = 0;
  for (const entry of entriesDesc) {
    if (entry.daysAttended >= 5) streak++;
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

/* ── Per-student verdict tunables ─────────────────── */
// All knobs in one place so a teacher's "feel" can be tuned without code
// archaeology. Mirrored intentionally with class-level ATTENTION_THRESHOLDS —
// the verdict reads off the SAME signal definitions as the class flagging.
const STUDENT_VERDICT_THRESHOLDS = {
  // NEEDS ATTENTION: no entry for 1+ full weeks (i.e. they missed both this
  // week and last week). 1 lets a teacher log a week late without alarm.
  ATTENTION_NO_ENTRY_WEEKS: 1,
  // NEEDS ATTENTION: attendance % over the last 4 weeks below this floor.
  ATTENTION_ATTENDANCE_PCT: 60,
  // NEEDS ATTENTION: rating dropped a full tier AND the new rating is one of
  // the bottom two ("Needs Work" or "Difficult"). Just dropping a tier from
  // Excellent → Strong is a Watch, not an alarm.
  ATTENTION_RATING_FLOOR: 2, // 1 = difficult, 2 = needs_improvement
  // WATCH: rating slipped a tier vs last week (any direction down).
  // WATCH: pace trending down (last 4w avg lower than prior 4w by this %).
  WATCH_PACE_DROP_PCT: 0.10,
  // ±10% counts as "flat" for pace trend; outside → up/down.
  PACE_TREND_BAND_PCT: 0.10,
  // ±0.3 tier for quality trend (tiers are 1–5).
  QUALITY_TREND_BAND_TIERS: 0.30,
} as const;

const RATING_TIERS_STUDENT: Record<string, number> = {
  excellent: 5,
  strong: 4,
  steady: 3,
  needs_improvement: 2,
  difficult_week: 1,
};

const RATING_LABELS_STUDENT: Record<string, string> = {
  excellent: "Excellent",
  strong: "Strong",
  steady: "Steady",
  needs_improvement: "Needs Work",
  difficult_week: "Difficult",
};

type StudentVerdictTier = "needs_attention" | "watch" | "on_track";

function trendDirSimple(current: number, baseline: number, band: number): "up" | "flat" | "down" {
  if (baseline <= 0) {
    if (current > 0) return "up";
    return "flat";
  }
  const delta = (current - baseline) / baseline;
  if (delta > band) return "up";
  if (delta < -band) return "down";
  return "flat";
}

function tierDirSimple(current: number, baseline: number, band: number): "up" | "flat" | "down" {
  const delta = current - baseline;
  if (delta > band) return "up";
  if (delta < -band) return "down";
  return "flat";
}

function prevMondayStr(monday: string): string {
  const d = new Date(monday + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().split("T")[0];
}

function mondaysEndingAt(thisWeekMonday: string, count: number): string[] {
  const out: string[] = [];
  const base = new Date(thisWeekMonday + "T00:00:00Z");
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
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
  let weeksLoggedThisMonth = 0;
  let weeksLoggedLastMonth = 0;

  for (const entry of allEntries) {
    const inThisMonth = entry.weekStartDate >= thisMonthStart && entry.weekStartDate <= thisMonthEnd;
    const inLastMonth = entry.weekStartDate >= lastMonthStart && entry.weekStartDate <= lastMonthEnd;

    if (inThisMonth) {
      linesThisMonth += entry.memorizationLines;
      weeksLoggedThisMonth += 1;
    }
    if (inLastMonth) {
      linesLastMonth += entry.memorizationLines;
      weeksLoggedLastMonth += 1;
    }
  }

  // Per-week-normalized monthly comparison. Raw month totals are misleading
  // because the current month is partial — comparing a 1-week partial against
  // a 4-week complete month makes the student look like they fell off a cliff.
  // Per active-week is honest at any point in the month.
  const linesPerWeekThisMonth = weeksLoggedThisMonth > 0
    ? parseFloat((linesThisMonth / weeksLoggedThisMonth).toFixed(1))
    : 0;
  const linesPerWeekLastMonth = weeksLoggedLastMonth > 0
    ? parseFloat((linesLastMonth / weeksLoggedLastMonth).toFixed(1))
    : 0;

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

  /* ── Trajectory: 8-week lines/week sparkline + pace trend ──
     Calendar-anchored (one slot per Monday, zero-filled for missed weeks) so
     the chart shows the absence as well as the activity — that's the whole
     story we're trying to tell. */
  const eightWeekMondays = mondaysEndingAt(thisWeekMonday, 8);
  const entryByMonday = new Map<string, (typeof allEntries)[number]>();
  for (const e of allEntries) entryByMonday.set(e.weekStartDate, e);

  const paceSparkline = eightWeekMondays.map((m) => entryByMonday.get(m)?.memorizationLines ?? 0);
  const recentTotal4 = paceSparkline.slice(-4).reduce((s, n) => s + n, 0);
  const priorTotal4 = paceSparkline.slice(0, 4).reduce((s, n) => s + n, 0);
  // Pace label uses entries-only avg over the last 4 weeks (matches what a
  // teacher would call "her current pace" — skipped weeks aren't her pace).
  const linesPerWeekRecent = last4WeekEntries.length > 0
    ? parseFloat((last4WeekEntries.reduce((s, e) => s + e.memorizationLines, 0) / last4WeekEntries.length).toFixed(1))
    : 0;
  const paceTrend = trendDirSimple(recentTotal4, priorTotal4, STUDENT_VERDICT_THRESHOLDS.PACE_TREND_BAND_PCT);

  /* ── Quality trend: avg tier last 4 vs prior 4 of RATED entries ── */
  const rated = allEntries.filter((e) => e.weekRating != null);
  const recent4Rated = rated.slice(0, 4);
  const prior4Rated = rated.slice(4, 8);
  const avgTier = (list: typeof rated) =>
    list.length === 0
      ? null
      : list.reduce((s, e) => s + (RATING_TIERS_STUDENT[e.weekRating!] ?? 3), 0) / list.length;
  const qRecent = avgTier(recent4Rated);
  const qPrior = avgTier(prior4Rated);
  const qualityTrend: "up" | "flat" | "down" =
    qRecent == null || qPrior == null
      ? "flat"
      : tierDirSimple(qRecent, qPrior, STUDENT_VERDICT_THRESHOLDS.QUALITY_TREND_BAND_TIERS);
  // Last-4-rated for the chip list under the quality tile (newest → oldest).
  const recentRatings = recent4Rated.map((e) => ({
    weekStartDate: e.weekStartDate,
    rating: e.weekRating!,
  }));

  /* ── Verdict tier + sentence ──
     The brief: NEEDS ATTENTION wins over WATCH wins over ON TRACK. Each tier
     captures the strongest reason it landed there in `signal` for debugging /
     potential UI use; the user-visible string is the sentence. */
  const verdictSignals: string[] = [];
  let verdictTier: StudentVerdictTier = "on_track";

  const weeksStale = weeksSinceLastEntry ?? Number.POSITIVE_INFINITY;
  const lastRated = rated[0]?.weekRating ?? null;
  const lastTwoRatedTiers = rated.slice(0, 2).map((e) => RATING_TIERS_STUDENT[e.weekRating!] ?? 3);
  const droppedAndStayed =
    lastTwoRatedTiers.length === 2 &&
    rated.length >= 3 &&
    // current ≤ floor AND prior was at least one tier above
    lastTwoRatedTiers[0] <= STUDENT_VERDICT_THRESHOLDS.ATTENTION_RATING_FLOOR &&
    (RATING_TIERS_STUDENT[rated[2].weekRating!] ?? 3) - lastTwoRatedTiers[0] >= 1;

  if (allEntries.length === 0) {
    // Brand-new student. Treat as on_track-with-a-note so a fresh page doesn't
    // open with a red alarm.
    verdictTier = "on_track";
    verdictSignals.push("no_entries_yet");
  } else if (weeksStale > STUDENT_VERDICT_THRESHOLDS.ATTENTION_NO_ENTRY_WEEKS) {
    verdictTier = "needs_attention";
    verdictSignals.push("stale_no_entry");
  } else if (
    attendanceLast4Weeks.percent != null &&
    attendanceLast4Weeks.percent < STUDENT_VERDICT_THRESHOLDS.ATTENTION_ATTENDANCE_PCT
  ) {
    verdictTier = "needs_attention";
    verdictSignals.push("low_attendance");
  } else if (droppedAndStayed) {
    verdictTier = "needs_attention";
    verdictSignals.push("rating_floor");
  } else {
    // Watch checks
    const lastWeekMonday = prevMondayStr(thisWeekMonday);
    const thisWeekEntry = allEntries.find((e) => e.weekStartDate === thisWeekMonday) ?? null;
    const lastWeekEntry = allEntries.find((e) => e.weekStartDate === lastWeekMonday) ?? null;
    if (thisWeekEntry?.weekRating && lastWeekEntry?.weekRating) {
      const cur = RATING_TIERS_STUDENT[thisWeekEntry.weekRating] ?? 3;
      const prev = RATING_TIERS_STUDENT[lastWeekEntry.weekRating] ?? 3;
      if (prev - cur >= 1) {
        verdictTier = "watch";
        verdictSignals.push("rating_slip");
      }
    }
    if (paceTrend === "down") {
      if (verdictTier === "on_track") verdictTier = "watch";
      verdictSignals.push("pace_down");
    }
  }

  function composeStudentVerdictSentence(): string {
    const name = student.name.split(" ")[0];
    if (allEntries.length === 0) {
      return `${name} hasn't logged any weeks yet — start with a first entry to set the baseline.`;
    }
    const streakClause =
      currentStreakWeeks >= 2
        ? `${currentStreakWeeks} weeks logged in a row`
        : currentStreakWeeks === 1
          ? "logging this week"
          : null;

    if (verdictTier === "needs_attention") {
      if (verdictSignals.includes("stale_no_entry")) {
        const wks = weeksStale;
        return `${name} hasn't logged in ${wks} week${wks === 1 ? "" : "s"} — reach out and reset the routine.`;
      }
      if (verdictSignals.includes("low_attendance")) {
        const pct = attendanceLast4Weeks.percent ?? 0;
        return `${name}'s attendance is ${pct}% over the last 4 weeks — check in on what's getting in the way.`;
      }
      if (verdictSignals.includes("rating_floor")) {
        const lab = RATING_LABELS_STUDENT[lastRated ?? ""] ?? "low";
        return `${name}'s rating has dropped to ${lab} and stayed there — time for a focused conversation.`;
      }
      return `${name} needs a check-in this week.`;
    }
    if (verdictTier === "watch") {
      if (verdictSignals.includes("rating_slip") && verdictSignals.includes("pace_down")) {
        return `${name}'s rating slipped and pace is easing — worth a quick check-in.`;
      }
      if (verdictSignals.includes("rating_slip")) {
        return `${name}'s rating slipped vs last week — keep an eye on this one.`;
      }
      if (verdictSignals.includes("pace_down")) {
        return `${name}'s pace is trending down — not a fire yet, just watch it.`;
      }
      return `${name} is mostly steady but worth keeping an eye on.`;
    }
    // on_track
    const paceClause =
      paceTrend === "up"
        ? "and pace is picking up"
        : qualityTrend === "up"
          ? "and quality is climbing"
          : "and holding pace";
    if (streakClause) {
      return `${name} is on track — ${streakClause} ${paceClause}.`;
    }
    return `${name} is on track — ${paceClause}.`;
  }

  const verdict = {
    tier: verdictTier,
    sentence: composeStudentVerdictSentence(),
    signals: verdictSignals,
    paceTrend,
    qualityTrend,
  };

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
    // Derived signals for the redesigned per-student dashboard. Additive —
    // existing fields kept so log-week and any other consumers don't break.
    verdict,
    trajectory: {
      // Calendar-anchored 8-week lines/week — zero-filled for missed weeks so
      // the absences are visible.
      sparkline: paceSparkline,
      // What a teacher would call "her pace" — entries-only average.
      linesPerWeek: linesPerWeekRecent,
      paceTrend,
    },
    quality: {
      // Newest → oldest rating chips for the last 4 RATED weeks.
      recentRatings,
      qualityTrend,
    },
    monthlyComparison: {
      // Per-week-normalized so a partial current month doesn't read as a cliff.
      thisMonthPerWeek: linesPerWeekThisMonth,
      lastMonthPerWeek: linesPerWeekLastMonth,
      weeksLoggedThisMonth,
      weeksLoggedLastMonth,
    },
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

/* ── /stats/class — class dashboard ───────────────── */

const RATING_TIERS: Record<string, number> = {
  excellent: 5,
  strong: 4,
  steady: 3,
  needs_improvement: 2,
  difficult_week: 1,
};

const RATING_LABELS: Record<string, string> = {
  excellent: "Excellent",
  strong: "Strong",
  steady: "Steady",
  needs_improvement: "Needs Work",
  difficult_week: "Difficult",
};

/**
 * All flagging knobs in one place so they can be tuned without spelunking.
 */
const ATTENTION_THRESHOLDS = {
  // WATCH: pace in bottom quartile AND flat/declining vs prior 4-week pace.
  PACE_QUARTILE: 0.25,
  // ±10% counts as "flat" for pace trend; outside → up/down.
  PACE_TREND_BAND_PCT: 0.10,
  // ±0.3 tier counts as "flat" for quality trend (tiers are 1–5).
  QUALITY_TREND_BAND_TIERS: 0.30,
  // Verdict pace trend uses a wider band so it doesn't flap.
  VERDICT_PACE_BAND_PCT: 0.10,
  // Pace-quartile flag is meaningless with too few students (the quartile is
  // basically "the lowest student"). Skip it for very small classes.
  MIN_CLASS_SIZE_FOR_PACE_FLAG: 4,
  // Newest rated entry must be within this many weeks for the
  // "declined 2+ weeks running" check to fire.
  RATING_RECENCY_WEEKS: 3,
  // Borderline list: students who logged this week with low-but-nonzero
  // attendance and weren't already flagged. Capped to keep the line short.
  BORDERLINE_DAYS_MAX: 3,
  BORDERLINE_DAYS_MIN: 1,
  BORDERLINE_LIST_MAX: 3,
} as const;

function prevWeekMonday(monday: string): string {
  const d = new Date(monday + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().split("T")[0];
}

/** Returns `count` Mondays ending at `thisWeekMonday`, oldest → newest. */
function recentMondays(thisWeekMonday: string, count: number): string[] {
  const out: string[] = [];
  const base = new Date(thisWeekMonday + "T00:00:00Z");
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}

function trendDirection(current: number, baseline: number, band: number): "up" | "flat" | "down" {
  if (baseline <= 0) {
    if (current > 0) return "up";
    return "flat";
  }
  const delta = (current - baseline) / baseline;
  if (delta > band) return "up";
  if (delta < -band) return "down";
  return "flat";
}

function tierDelta(current: number, baseline: number, band: number): "up" | "flat" | "down" {
  const delta = current - baseline;
  if (delta > band) return "up";
  if (delta < -band) return "down";
  return "flat";
}

type EntryRow = {
  weekStartDate: string;
  daysAttended: number;
  successfulDays: number;
  memorizationLines: number;
  weekRating: string | null;
  rmvScore: number | null;
  reviewScore: number | null;
};

/**
 * Given two entries (newer + older), figure out which sub-dimension regressed
 * most. Returns a single keyword the teacher can act on. We point at the
 * largest drop across review score, rmv score, and attendance. Nothing
 * dropped meaningfully → fall back to generic "Recitation".
 */
function inferFocusFromDrop(current: EntryRow, prior: EntryRow): string {
  const reviewDrop = (prior.reviewScore ?? 0) - (current.reviewScore ?? 0);
  const rmvDrop = (prior.rmvScore ?? 0) - (current.rmvScore ?? 0);
  const attendanceDrop = prior.daysAttended - current.daysAttended;
  const max = Math.max(reviewDrop, rmvDrop, attendanceDrop);
  if (max <= 0) return "Recitation";
  if (max === attendanceDrop) return "Attendance";
  if (max === reviewDrop) return "Review";
  return "New material";
}

type AttentionItem = {
  studentId: number;
  name: string;
  tier: "concern" | "watch";
  flagType: "no_entry" | "zero_attendance" | "rating_drop" | "rating_decline" | "low_pace";
  reason: string;
  focus: string;
  action: string;
};

/**
 * Conversational next-step copy per flag type. Templates, not personalized
 * advice — but they use hifdh terminology (sabaq = new lesson, dohra =
 * revision) so they read as written by someone who teaches. The teacher
 * can take or leave them.
 */
const ATTENTION_ACTIONS: Record<AttentionItem["flagType"], string> = {
  no_entry: "No log yet this week. Quick check-in to see what's going on before it becomes a pattern.",
  zero_attendance: "Absent all week. Worth a call to confirm what's happening at home.",
  rating_drop: "A drop this sharp is usually load, not ability — review whether the sabaq is too heavy.",
  rating_decline: "Two weeks of decline. Ease new material for a week and weight revision (dohra) until the trend turns.",
  low_pace: "Pace is at the bottom and not catching up. A 1:1 to set an achievable weekly target could help.",
};

type BorderlineItem = {
  studentId: number;
  name: string;
  hint: string;
};

/**
 * Decide whether a single student is in concern / watch / fine. Returns null
 * for fine. Concern is evaluated first so it always wins — a student who
 * didn't log doesn't also need to be told their pace is low.
 */
function computeStudentAttention(
  student: { id: number; name: string },
  entries: EntryRow[],
  thisWeekMonday: string,
  paceQuartileFloorVal: number | null,
): AttentionItem | null {
  const thisWeekEntry = entries.find((e) => e.weekStartDate === thisWeekMonday) ?? null;

  // CONCERN: no entry yet this week.
  if (!thisWeekEntry) {
    return {
      studentId: student.id,
      name: student.name,
      tier: "concern",
      flagType: "no_entry",
      reason: "No entry logged yet this week",
      focus: "Logging",
      action: ATTENTION_ACTIONS.no_entry,
    };
  }

  // CONCERN: logged but zero days attended.
  if (thisWeekEntry.daysAttended === 0) {
    return {
      studentId: student.id,
      name: student.name,
      tier: "concern",
      flagType: "zero_attendance",
      reason: "Logged but no days attended this week",
      focus: "Attendance",
      action: ATTENTION_ACTIONS.zero_attendance,
    };
  }

  // WATCH: rating dropped a full tier vs last week.
  const lastWeekMonday = prevWeekMonday(thisWeekMonday);
  const lastWeekEntry = entries.find((e) => e.weekStartDate === lastWeekMonday) ?? null;
  if (thisWeekEntry.weekRating && lastWeekEntry?.weekRating) {
    const curTier = RATING_TIERS[thisWeekEntry.weekRating] ?? 3;
    const prevTier = RATING_TIERS[lastWeekEntry.weekRating] ?? 3;
    if (prevTier - curTier >= 1) {
      return {
        studentId: student.id,
        name: student.name,
        tier: "watch",
        flagType: "rating_drop",
        reason: `Rating fell ${RATING_LABELS[lastWeekEntry.weekRating]} → ${RATING_LABELS[thisWeekEntry.weekRating]}`,
        focus: inferFocusFromDrop(thisWeekEntry, lastWeekEntry),
        action: ATTENTION_ACTIONS.rating_drop,
      };
    }
  }

  // WATCH: rating declined 2+ weeks running across the most recent 3 rated
  // entries. Stale gate: newest rated entry must be within RATING_RECENCY_WEEKS.
  const ratedEntries = entries.filter((e) => e.weekRating != null).slice(0, 3);
  if (ratedEntries.length >= 3) {
    const newestAge = weeksBetween(ratedEntries[0].weekStartDate, thisWeekMonday) ?? 999;
    if (newestAge <= ATTENTION_THRESHOLDS.RATING_RECENCY_WEEKS) {
      const tiers = ratedEntries.map((e) => RATING_TIERS[e.weekRating!] ?? 3);
      if (tiers[0] < tiers[1] && tiers[1] < tiers[2]) {
        return {
          studentId: student.id,
          name: student.name,
          tier: "watch",
          flagType: "rating_decline",
          reason: `Rating sliding: ${RATING_LABELS[ratedEntries[2].weekRating!]} → ${RATING_LABELS[ratedEntries[1].weekRating!]} → ${RATING_LABELS[ratedEntries[0].weekRating!]}`,
          focus: inferFocusFromDrop(ratedEntries[0], ratedEntries[2]),
          action: ATTENTION_ACTIONS.rating_decline,
        };
      }
    }
  }

  // WATCH: pace in bottom quartile AND flat/declining.
  if (paceQuartileFloorVal != null) {
    const last4 = entries.slice(0, 4);
    if (last4.length >= 2) {
      const pace4w = last4.reduce((s, e) => s + e.memorizationLines, 0) / last4.length;
      const prior4 = entries.slice(4, 8);
      const priorPace4w = prior4.length > 0
        ? prior4.reduce((s, e) => s + e.memorizationLines, 0) / prior4.length
        : null;
      const flatOrDeclining = priorPace4w == null
        ? false
        : trendDirection(pace4w, priorPace4w, ATTENTION_THRESHOLDS.PACE_TREND_BAND_PCT) !== "up";
      if (pace4w <= paceQuartileFloorVal && flatOrDeclining) {
        return {
          studentId: student.id,
          name: student.name,
          tier: "watch",
          flagType: "low_pace",
          reason: `Pace is ${formatLines(Math.round(pace4w))}/wk — bottom of class and not catching up`,
          focus: "Pace",
          action: ATTENTION_ACTIONS.low_pace,
        };
      }
    }
  }

  return null;
}

function composeVerdict(
  paceTrend: "up" | "flat" | "down",
  qualityTrend: "up" | "flat" | "down",
  concernCount: number,
  watchCount: number,
  mostUrgentName: string | null,
  totalStudents: number,
  loggedThisWeek: number,
): string {
  if (totalStudents === 0) {
    return "No students yet — add a few to get started.";
  }
  if (loggedThisWeek === 0 && concernCount === totalStudents) {
    return `No entries logged yet this week — kick it off with the class.`;
  }

  const trends: Record<string, string> = {
    "up:up": "Pace and quality are both trending up",
    "up:flat": "Pace is picking up, quality is holding",
    "up:down": "Pace is up but quality is slipping",
    "flat:up": "Quality is improving, pace is steady",
    "flat:flat": "The class is holding steady",
    "flat:down": "Quality is slipping; pace is steady",
    "down:up": "Quality is up but pace has slowed",
    "down:flat": "Pace is slowing; quality is holding",
    "down:down": "Pace and quality are both slipping",
  };
  const lede = trends[`${paceTrend}:${qualityTrend}`] ?? "The class is steady";

  const flagged = concernCount + watchCount;
  if (flagged === 0) {
    return `${lede} — no one needs a check-in right now.`;
  }
  const who = mostUrgentName ? `, most urgently ${mostUrgentName}` : "";
  const noun = flagged === 1 ? "student needs" : "students need";
  return `${lede} — but ${flagged} ${noun} a check-in${who}.`;
}

/* ── /stats/class route ──────────────────────────── */

router.get("/stats/class", requireAuth, async (req, res) => {
  const teacher = req.teacher!;
  // Class averages reflect ACTIVE students only — paused students should not
  // pull down pace because their lack of recent entries is by design, not
  // a problem. Graduated / withdrawn are excluded entirely.
  const students = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.teacherId, teacher.id),
        eq(studentsTable.status, "active"),
      ),
    );

  const studentIds = students.map((s) => s.id);
  const thisWeekMonday = getCurrentMonday();
  const thisWeekFriday = getFridayOfWeek(thisWeekMonday);
  const lastWeekMonday = prevWeekMonday(thisWeekMonday);

  // ── Bail-out for an empty class ──
  if (studentIds.length === 0) {
    res.json({
      weekRange: { weekStartDate: thisWeekMonday, weekEndDate: thisWeekFriday },
      verdict: {
        paceTrend: "flat" as const,
        qualityTrend: "flat" as const,
        concernCount: 0,
        watchCount: 0,
        mostUrgentName: null,
        sentence: composeVerdict("flat", "flat", 0, 0, null, 0, 0),
      },
      attention: { concern: [], watch: [], borderline: [] },
      classPulse: {
        pace: { thisWeek: 0, avg4Week: 0, delta: 0, sparkline: [0, 0, 0, 0, 0, 0, 0, 0] },
        quality: {
          strongOrAbove: 0,
          totalRated: 0,
          mix: { excellent: 0, strong: 0, steady: 0, needs_improvement: 0, difficult_week: 0 },
          deltaStrongOrAbove: 0,
        },
        attendance: { percentThisWeek: null, avgDaysOfFive: 0, loggedCount: 0, totalStudents: 0 },
      },
      roster: [],
      celebrations: {
        streaks: [],
        milestonesThisWeek: [],
        classTotals: { totalLinesMemorized: 0, totalJuzCompleted: 0 },
      },
    });
    return;
  }

  // Single bulk fetch — entries for all students, then bucket by studentId.
  const allEntries = await db
    .select()
    .from(weeklyEntriesTable)
    .where(inArray(weeklyEntriesTable.studentId, studentIds));

  const entriesByStudent = new Map<number, EntryRow[]>();
  for (const s of students) entriesByStudent.set(s.id, []);
  for (const e of allEntries) {
    const row: EntryRow = {
      weekStartDate: e.weekStartDate,
      daysAttended: e.daysAttended,
      successfulDays: e.successfulDays,
      memorizationLines: e.memorizationLines,
      weekRating: e.weekRating,
      rmvScore: e.rmvScore,
      reviewScore: e.reviewScore,
    };
    const list = entriesByStudent.get(e.studentId);
    if (list) list.push(row);
  }
  for (const list of entriesByStudent.values()) {
    list.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
  }

  // ── Per-student pace (last 4 calendar weeks) for quartile floor + roster ──
  const fourWeeksAgoMonday = (() => {
    const d = new Date(thisWeekMonday + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 4 * 7);
    return d.toISOString().split("T")[0];
  })();
  const eightWeeksAgoMonday = (() => {
    const d = new Date(thisWeekMonday + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 8 * 7);
    return d.toISOString().split("T")[0];
  })();

  const paceByStudent = new Map<number, { pace4w: number; priorPace4w: number | null }>();
  for (const s of students) {
    const entries = entriesByStudent.get(s.id) ?? [];
    const last4 = entries.filter((e) => e.weekStartDate >= fourWeeksAgoMonday && e.weekStartDate <= thisWeekMonday);
    const prior4 = entries.filter((e) => e.weekStartDate >= eightWeeksAgoMonday && e.weekStartDate < fourWeeksAgoMonday);
    const pace4w = last4.length > 0
      ? last4.reduce((sum, e) => sum + e.memorizationLines, 0) / last4.length
      : 0;
    const priorPace4w = prior4.length > 0
      ? prior4.reduce((sum, e) => sum + e.memorizationLines, 0) / prior4.length
      : null;
    paceByStudent.set(s.id, { pace4w, priorPace4w });
  }

  // Bottom-quartile floor (value at the 25th percentile). null when class is
  // too small to have a meaningful quartile.
  let paceQuartileFloorVal: number | null = null;
  if (students.length >= ATTENTION_THRESHOLDS.MIN_CLASS_SIZE_FOR_PACE_FLAG) {
    const sortedPace = Array.from(paceByStudent.values()).map((p) => p.pace4w).sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(sortedPace.length * ATTENTION_THRESHOLDS.PACE_QUARTILE) - 1);
    paceQuartileFloorVal = sortedPace[idx];
  }

  // ── Attention block ──
  const concern: AttentionItem[] = [];
  const watch: AttentionItem[] = [];
  const borderline: BorderlineItem[] = [];

  for (const s of students) {
    const entries = entriesByStudent.get(s.id) ?? [];
    const flag = computeStudentAttention(s, entries, thisWeekMonday, paceQuartileFloorVal);
    if (flag) {
      if (flag.tier === "concern") concern.push(flag);
      else watch.push(flag);
    } else {
      // Borderline candidates — only check students NOT already flagged.
      const thisWeekEntry = entries.find((e) => e.weekStartDate === thisWeekMonday);
      if (
        thisWeekEntry &&
        thisWeekEntry.daysAttended >= ATTENTION_THRESHOLDS.BORDERLINE_DAYS_MIN &&
        thisWeekEntry.daysAttended <= ATTENTION_THRESHOLDS.BORDERLINE_DAYS_MAX
      ) {
        borderline.push({
          studentId: s.id,
          name: s.name,
          hint: `attended ${thisWeekEntry.daysAttended}/5 days`,
        });
      }
    }
  }

  borderline.sort((a, b) => a.name.localeCompare(b.name));
  const borderlineCapped = borderline.slice(0, ATTENTION_THRESHOLDS.BORDERLINE_LIST_MAX);

  // ── Class Pulse: pace ──
  const eightWeekMondays = recentMondays(thisWeekMonday, 8);
  const linesPerWeek = eightWeekMondays.map((monday) => {
    const sum = allEntries
      .filter((e) => e.weekStartDate === monday)
      .reduce((s, e) => s + e.memorizationLines, 0);
    return sum;
  });
  const paceSparkline = linesPerWeek.map((total) =>
    parseFloat((total / students.length).toFixed(1)),
  );
  const paceThisWeek = paceSparkline[paceSparkline.length - 1];
  const last4Totals = linesPerWeek.slice(-4);
  const paceAvg4Week = parseFloat(
    (last4Totals.reduce((s, n) => s + n, 0) / (4 * students.length)).toFixed(1),
  );
  const paceDelta = parseFloat((paceThisWeek - paceAvg4Week).toFixed(1));

  // ── Class Pulse: quality (this week's rating mix + WoW delta) ──
  const thisWeekRated = allEntries.filter((e) => e.weekStartDate === thisWeekMonday && e.weekRating != null);
  const lastWeekRated = allEntries.filter((e) => e.weekStartDate === lastWeekMonday && e.weekRating != null);
  const ratingMix = { excellent: 0, strong: 0, steady: 0, needs_improvement: 0, difficult_week: 0 };
  for (const e of thisWeekRated) {
    const k = e.weekRating as keyof typeof ratingMix;
    if (k in ratingMix) ratingMix[k]++;
  }
  const strongOrAbove = ratingMix.excellent + ratingMix.strong;
  let lastWeekStrongOrAbove = 0;
  for (const e of lastWeekRated) {
    if (e.weekRating === "excellent" || e.weekRating === "strong") lastWeekStrongOrAbove++;
  }
  const deltaStrongOrAbove = strongOrAbove - lastWeekStrongOrAbove;

  // ── Class Pulse: attendance (this week) ──
  const thisWeekEntries = allEntries.filter((e) => e.weekStartDate === thisWeekMonday);
  const loggedCount = thisWeekEntries.length;
  const totalDaysThisWeek = thisWeekEntries.reduce((s, e) => s + e.daysAttended, 0);
  const percentThisWeek = loggedCount > 0
    ? Math.round((totalDaysThisWeek / (loggedCount * 5)) * 100)
    : null;
  const avgDaysOfFive = loggedCount > 0
    ? parseFloat((totalDaysThisWeek / loggedCount).toFixed(1))
    : 0;

  // ── Verdict trend signals ──
  // Pace trend: total lines last 4 weeks vs prior 4 weeks (same denominator).
  const lines4w = linesPerWeek.slice(-4).reduce((s, n) => s + n, 0);
  const linesPrior4w = linesPerWeek.slice(0, 4).reduce((s, n) => s + n, 0);
  const paceTrend = trendDirection(lines4w, linesPrior4w, ATTENTION_THRESHOLDS.VERDICT_PACE_BAND_PCT);

  // Quality trend: avg tier last 4 weeks vs prior 4 weeks.
  function avgTier(weekStarts: string[]): number | null {
    const rated = allEntries.filter((e) => weekStarts.includes(e.weekStartDate) && e.weekRating != null);
    if (rated.length === 0) return null;
    const sum = rated.reduce((s, e) => s + (RATING_TIERS[e.weekRating!] ?? 3), 0);
    return sum / rated.length;
  }
  const recent4Mondays = eightWeekMondays.slice(-4);
  const prior4Mondays = eightWeekMondays.slice(0, 4);
  const qualityRecent = avgTier(recent4Mondays);
  const qualityPrior = avgTier(prior4Mondays);
  const qualityTrend: "up" | "flat" | "down" =
    qualityRecent == null || qualityPrior == null
      ? "flat"
      : tierDelta(qualityRecent, qualityPrior, ATTENTION_THRESHOLDS.QUALITY_TREND_BAND_TIERS);

  // ── Roster ──
  type RosterRow = {
    studentId: number;
    name: string;
    gender: "male" | "female" | null;
    status: "concern" | "watch" | "fine";
    juzCount: number;
    currentPage: number;
    pace4Week: number;
    paceTrend: "up" | "flat" | "down" | null;
    thisWeekRating: string | null;
    ratingTrend: "up" | "flat" | "down" | null;
    daysAttended: number | null;
  };

  const concernIds = new Set(concern.map((c) => c.studentId));
  const watchIds = new Set(watch.map((w) => w.studentId));

  const roster: RosterRow[] = await Promise.all(
    students.map(async (s) => {
      const entries = entriesByStudent.get(s.id) ?? [];
      const thisWeekEntry = entries.find((e) => e.weekStartDate === thisWeekMonday) ?? null;
      const lastWeekEntry = entries.find((e) => e.weekStartDate === lastWeekMonday) ?? null;
      const { pace4w, priorPace4w } = paceByStudent.get(s.id) ?? { pace4w: 0, priorPace4w: null };

      const paceTrendStudent: "up" | "flat" | "down" | null = priorPace4w == null
        ? null
        : trendDirection(pace4w, priorPace4w, ATTENTION_THRESHOLDS.PACE_TREND_BAND_PCT);

      let ratingTrendStudent: "up" | "flat" | "down" | null = null;
      if (thisWeekEntry?.weekRating && lastWeekEntry?.weekRating) {
        const cur = RATING_TIERS[thisWeekEntry.weekRating] ?? 3;
        const prev = RATING_TIERS[lastWeekEntry.weekRating] ?? 3;
        ratingTrendStudent = cur > prev ? "up" : cur < prev ? "down" : "flat";
      }

      const juz = await getCompletedJuz(s.id);
      const status: "concern" | "watch" | "fine" = concernIds.has(s.id)
        ? "concern"
        : watchIds.has(s.id)
        ? "watch"
        : "fine";

      return {
        studentId: s.id,
        name: s.name,
        gender: (s.gender as "male" | "female" | null) ?? null,
        status,
        juzCount: juz.length,
        currentPage: s.currentPage,
        pace4Week: parseFloat(pace4w.toFixed(1)),
        paceTrend: paceTrendStudent,
        thisWeekRating: thisWeekEntry?.weekRating ?? null,
        ratingTrend: ratingTrendStudent,
        daysAttended: thisWeekEntry?.daysAttended ?? null,
      };
    }),
  );

  // Default sort: status (concern > watch > fine), then by name within tier.
  const statusOrder: Record<RosterRow["status"], number> = { concern: 0, watch: 1, fine: 2 };
  roster.sort((a, b) => {
    const s = statusOrder[a.status] - statusOrder[b.status];
    if (s !== 0) return s;
    return a.name.localeCompare(b.name);
  });

  // ── Celebrations: streaks + milestones + class totals ──
  const streaks = students
    .map((s) => {
      const entries = entriesByStudent.get(s.id) ?? [];
      const current = computePerfectAttendanceStreak(entries, thisWeekMonday);
      // Best in last 12 entries of perfect-attendance runs.
      const last12 = entries.slice(0, 12);
      let best = 0;
      let running = 0;
      for (const e of last12) {
        if (e.daysAttended >= 5) {
          running++;
          if (running > best) best = running;
        } else {
          running = 0;
        }
      }
      return { studentId: s.id, name: s.name, currentStreak: current, best12Week: best };
    })
    .filter((s) => s.currentStreak >= 1 || s.best12Week >= 2)
    .sort((a, b) => b.currentStreak - a.currentStreak || b.best12Week - a.best12Week);

  // Milestones reached this week — juz completion rows whose createdAt is
  // within the current Mon → end-of-Fri window. createdAt is set on insert,
  // so this catches new completions; setCompletedJuz rewrites for existing
  // students will look like "new" milestones the first week they show up,
  // which is acceptable for a celebratory surface.
  const thisWeekStartTs = new Date(thisWeekMonday + "T00:00:00Z");
  const milestoneRows = await db
    .select({
      studentId: studentCompletedJuzTable.studentId,
      juzNumber: studentCompletedJuzTable.juzNumber,
      createdAt: studentCompletedJuzTable.createdAt,
    })
    .from(studentCompletedJuzTable)
    .where(
      and(
        inArray(studentCompletedJuzTable.studentId, studentIds),
        gte(studentCompletedJuzTable.createdAt, thisWeekStartTs),
      ),
    );
  const studentNameById = new Map(students.map((s) => [s.id, s.name]));
  const milestonesThisWeek = milestoneRows
    .map((m) => ({
      studentId: m.studentId,
      name: studentNameById.get(m.studentId) ?? "Unknown",
      juzNumber: m.juzNumber,
      completedAt: m.createdAt.toISOString(),
    }))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  let totalLinesMemorized = 0;
  let totalJuzCompleted = 0;
  for (const row of roster) {
    // Total juz completed across the class — sum of per-student juz counts.
    totalJuzCompleted += row.juzCount;
  }
  // Total lines memorized = sum across students of lines from completed juz.
  // We compute per-student here to use the same source the student stats route
  // uses, so the two numbers always agree.
  for (const s of students) {
    const juz = await getCompletedJuz(s.id);
    totalLinesMemorized += getLinesForCompletedJuz(juz);
  }

  // ── Verdict ──
  const mostUrgent = concern[0] ?? watch[0] ?? null;
  const verdict = {
    paceTrend,
    qualityTrend,
    concernCount: concern.length,
    watchCount: watch.length,
    mostUrgentName: mostUrgent?.name ?? null,
    sentence: composeVerdict(
      paceTrend,
      qualityTrend,
      concern.length,
      watch.length,
      mostUrgent?.name ?? null,
      students.length,
      loggedCount,
    ),
  };

  res.json({
    weekRange: { weekStartDate: thisWeekMonday, weekEndDate: thisWeekFriday },
    verdict,
    attention: {
      concern,
      watch,
      borderline: borderlineCapped,
    },
    classPulse: {
      pace: {
        thisWeek: paceThisWeek,
        avg4Week: paceAvg4Week,
        delta: paceDelta,
        sparkline: paceSparkline,
      },
      quality: {
        strongOrAbove,
        totalRated: thisWeekRated.length,
        mix: ratingMix,
        deltaStrongOrAbove,
      },
      attendance: {
        percentThisWeek,
        avgDaysOfFive,
        loggedCount,
        totalStudents: students.length,
      },
    },
    roster,
    celebrations: {
      streaks,
      milestonesThisWeek,
      classTotals: { totalLinesMemorized, totalJuzCompleted },
    },
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
