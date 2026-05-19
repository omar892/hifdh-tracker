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

/* ── Per-student assessment tunables ──────────────
   Every knob the verdict logic uses, in one place. A teacher tuning the
   "feel" of the page edits here, not the algorithm. */
const STUDENT_VERDICT_THRESHOLDS = {
  // NEEDS ATTENTION: no entry for more than this many full weeks.
  ATTENTION_NO_ENTRY_WEEKS: 1,
  // NEEDS ATTENTION: attendance % over the last 4 weeks below this floor.
  ATTENTION_ATTENDANCE_PCT: 60,
  // Pace trend: recent-4-week total vs prior-4-week total. Within ±this
  // fraction counts as "flat" (Steady); outside → Climbing / Slipping.
  PACE_TREND_BAND_PCT: 0.1,
  // The rating "good zone" — Strong and Excellent. A one-tier move WITHIN
  // this set (Strong↔Excellent) is normal oscillation and never flags.
  RATING_GOOD_ZONE: ["strong", "excellent"] as readonly string[],
  // WATCH: rating declined this many consecutive logged weeks (2 declines =
  // 3 logged entries, each a lower tier than the one before it).
  RATING_DECLINE_WEEKS: 2,
  // NEEDS ATTENTION: rating sat in the lower zone (Steady / Needs Work /
  // Difficult) for this many consecutive logged weeks — "dropped and stayed".
  RATING_SUSTAINED_LOW_WEEKS: 2,
  // Attendance trend: recent vs prior 4-week window. Within ±this many
  // percentage points counts as "flat".
  ATTENDANCE_TREND_BAND_PCT: 5,
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

type AssessmentTrend = "up" | "flat" | "down";

function trendDirSimple(current: number, baseline: number, band: number): AssessmentTrend {
  if (baseline <= 0) {
    if (current > 0) return "up";
    return "flat";
  }
  const delta = (current - baseline) / baseline;
  if (delta > band) return "up";
  if (delta < -band) return "down";
  return "flat";
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

/* ── Single source of truth: the student assessment ───────────────────────
   ONE function decides the page-level status AND every signal tile's
   characterization. The status banner and the trajectory / quality /
   attendance tiles all read from the object this returns — nothing
   recomputes a trend on its own. That is the fix for the page contradicting
   itself (amber "rating slipped" banner over a "Quality: Climbing" tile). */

const GOOD_ZONE_SET = new Set(STUDENT_VERDICT_THRESHOLDS.RATING_GOOD_ZONE);

/**
 * Quality is a 5-tier categorical rating — it naturally oscillates week to
 * week, so a "Climbing/Slipping" trend on it is noise. Instead we state a
 * FACT about the recent window: how many of the last N weeks landed
 * Strong-or-above. No trend verb, no arrow.
 */
function describeQualityPattern(ratingsNewestFirst: string[]): string {
  const n = ratingsNewestFirst.length;
  if (n === 0) return "No ratings logged yet";
  const excellentCount = ratingsNewestFirst.filter((r) => r === "excellent").length;
  const goodCount = ratingsNewestFirst.filter((r) => GOOD_ZONE_SET.has(r)).length;
  if (excellentCount === n) return `Excellent every week (last ${n})`;
  if (goodCount === n) return `Strong+ every week (last ${n})`;
  if (goodCount >= 1) return `${goodCount} of ${n} weeks Strong+`;
  return `Below Strong all ${n} weeks`;
}

/**
 * Decide whether the rating pattern is signal or noise.
 *  - needs_attention: rating sat in the lower zone (Steady / Needs Work /
 *    Difficult) for RATING_SUSTAINED_LOW_WEEKS consecutive logged weeks.
 *  - watch: latest rating is in the lower zone, OR the rating declined for
 *    RATING_DECLINE_WEEKS consecutive logged weeks.
 *  - null: a one-tier move within the good zone (Strong↔Excellent) — noise.
 */
function classifyRatingSignal(ratingsNewestFirst: string[]): "needs_attention" | "watch" | null {
  if (ratingsNewestFirst.length === 0) return null;
  const inLower = (r: string) => !GOOD_ZONE_SET.has(r);

  const sustain = STUDENT_VERDICT_THRESHOLDS.RATING_SUSTAINED_LOW_WEEKS;
  if (
    ratingsNewestFirst.length >= sustain &&
    ratingsNewestFirst.slice(0, sustain).every(inLower)
  ) {
    return "needs_attention";
  }

  if (inLower(ratingsNewestFirst[0])) return "watch";

  const need = STUDENT_VERDICT_THRESHOLDS.RATING_DECLINE_WEEKS + 1;
  if (ratingsNewestFirst.length >= need) {
    const tiers = ratingsNewestFirst.slice(0, need).map((r) => RATING_TIERS_STUDENT[r] ?? 3);
    let declining = true;
    for (let i = 0; i < need - 1; i++) {
      if (!(tiers[i] < tiers[i + 1])) {
        declining = false;
        break;
      }
    }
    if (declining) return "watch";
  }
  return null;
}

interface StudentAssessment {
  status: "on_track" | "watch" | "needs_attention";
  sentence: string;
  /** Diagnostic flags that drove the status — not user-facing. */
  signals: string[];
  trajectory: {
    /** Avg lines/week across the last `windowWeeks` weeks that have entries. */
    linesPerWeek: number;
    windowWeeks: number;
    /** Calendar-anchored 8-week lines/week, oldest → newest, zero-filled. */
    sparkline: number[];
    /** Pace IS continuous — a real trend, safe to show with an arrow. */
    trend: AssessmentTrend;
    label: "Climbing" | "Steady" | "Slipping";
  };
  quality: {
    /** Newest → oldest, last 4 rated weeks. */
    recentRatings: { weekStartDate: string; rating: string }[];
    /** Factual pattern string — no trend verb, no arrow. */
    pattern: string;
    latestRating: string | null;
  };
  attendance: {
    percent: number | null;
    present: number;
    scheduled: number;
    /** Real period-over-period (recent 4w vs prior 4w); null when no prior data. */
    trend: AssessmentTrend | null;
  };
}

function assessStudent(args: {
  studentName: string;
  entriesDesc: { weekStartDate: string; weekRating: string | null; memorizationLines: number }[];
  weeksSinceLastEntry: number | null;
  paceSparkline: number[];
  last4WeekEntries: { memorizationLines: number }[];
  attendanceRecent: { percent: number | null; present: number; scheduled: number };
  attendancePrior: { percent: number | null };
}): StudentAssessment {
  const {
    studentName,
    entriesDesc,
    weeksSinceLastEntry,
    paceSparkline,
    last4WeekEntries,
    attendanceRecent,
    attendancePrior,
  } = args;
  const name = studentName.split(" ")[0];
  const T = STUDENT_VERDICT_THRESHOLDS;

  // ── Trajectory — pace is continuous, so a trend arrow is honest here ──
  const recentTotal4 = paceSparkline.slice(-4).reduce((s, n) => s + n, 0);
  const priorTotal4 = paceSparkline.slice(0, 4).reduce((s, n) => s + n, 0);
  const trajectoryTrend = trendDirSimple(recentTotal4, priorTotal4, T.PACE_TREND_BAND_PCT);
  const linesPerWeek =
    last4WeekEntries.length > 0
      ? parseFloat(
          (last4WeekEntries.reduce((s, e) => s + e.memorizationLines, 0) / last4WeekEntries.length).toFixed(1),
        )
      : 0;
  const trajectoryLabel =
    trajectoryTrend === "up" ? "Climbing" : trajectoryTrend === "down" ? "Slipping" : "Steady";

  // ── Quality — categorical: a factual pattern, never a trend ──
  const ratedDesc = entriesDesc.filter((e) => e.weekRating != null);
  const recentRatings = ratedDesc
    .slice(0, 4)
    .map((e) => ({ weekStartDate: e.weekStartDate, rating: e.weekRating! }));
  const qualityPattern = describeQualityPattern(recentRatings.map((r) => r.rating));
  const latestRating = ratedDesc[0]?.weekRating ?? null;

  // ── Attendance trend — real period-over-period (recent 4w vs prior 4w) ──
  let attendanceTrend: AssessmentTrend | null = null;
  if (attendanceRecent.percent != null && attendancePrior.percent != null) {
    const delta = attendanceRecent.percent - attendancePrior.percent;
    attendanceTrend =
      delta > T.ATTENDANCE_TREND_BAND_PCT
        ? "up"
        : delta < -T.ATTENDANCE_TREND_BAND_PCT
          ? "down"
          : "flat";
  }

  // ── Status — the one decision. Every signal raises a rank; the highest
  // rank wins. Computed once into `status` so nothing downstream can disagree. ──
  const signals: string[] = [];
  let statusRank = 0; // 0 = on_track, 1 = watch, 2 = needs_attention
  const raise = (rank: number) => {
    if (rank > statusRank) statusRank = rank;
  };

  const weeksStale = weeksSinceLastEntry ?? Number.POSITIVE_INFINITY;
  const ratingSignal = classifyRatingSignal(recentRatings.map((r) => r.rating));

  if (entriesDesc.length === 0) {
    signals.push("no_entries_yet");
  } else {
    if (weeksStale > T.ATTENTION_NO_ENTRY_WEEKS) {
      raise(2);
      signals.push("stale_no_entry");
    }
    if (attendanceRecent.percent != null && attendanceRecent.percent < T.ATTENTION_ATTENDANCE_PCT) {
      raise(2);
      signals.push("low_attendance");
    }
    if (ratingSignal === "needs_attention") {
      raise(2);
      signals.push("rating_sustained_low");
    } else if (ratingSignal === "watch") {
      raise(1);
      signals.push("rating_flag");
    }
    if (trajectoryTrend === "down") {
      raise(1);
      signals.push("pace_down");
    }
  }

  const status: StudentAssessment["status"] =
    statusRank >= 2 ? "needs_attention" : statusRank >= 1 ? "watch" : "on_track";

  // ── Sentence — only ever rendered for watch / needs_attention (on_track
  // shows no banner). It always describes the signal that escalated the
  // status, so it cannot contradict the tiles. ──
  const ratingLabel = RATING_LABELS_STUDENT[latestRating ?? ""] ?? "low";
  let sentence: string;
  if (entriesDesc.length === 0) {
    sentence = `${name} hasn't logged any weeks yet — start with a first entry to set the baseline.`;
  } else if (status === "needs_attention") {
    if (signals.includes("stale_no_entry")) {
      const w = weeksStale === Number.POSITIVE_INFINITY ? "several" : String(weeksStale);
      sentence = `${name} hasn't logged in ${w} week${w === "1" ? "" : "s"} — reach out and reset the routine.`;
    } else if (signals.includes("low_attendance")) {
      sentence = `${name}'s attendance is ${attendanceRecent.percent}% over the last 4 weeks — check in on what's getting in the way.`;
    } else if (signals.includes("rating_sustained_low")) {
      sentence = `${name}'s rating has been ${ratingLabel} for ${T.RATING_SUSTAINED_LOW_WEEKS}+ weeks running — time for a focused conversation.`;
    } else {
      sentence = `${name} needs a check-in this week.`;
    }
  } else if (status === "watch") {
    if (signals.includes("rating_flag") && signals.includes("pace_down")) {
      sentence = `${name}'s rating and pace have both eased off — worth a quick check-in.`;
    } else if (signals.includes("rating_flag")) {
      sentence = `${name}'s recent rating dropped to ${ratingLabel} — keep an eye on this one.`;
    } else {
      sentence = `${name}'s pace is easing off — not a fire yet, just keep an eye on it.`;
    }
  } else {
    sentence = `${name} is on track.`;
  }

  return {
    status,
    sentence,
    signals,
    trajectory: {
      linesPerWeek,
      windowWeeks: 4,
      sparkline: paceSparkline,
      trend: trajectoryTrend,
      label: trajectoryLabel,
    },
    quality: { recentRatings, pattern: qualityPattern, latestRating },
    attendance: {
      percent: attendanceRecent.percent,
      present: attendanceRecent.present,
      scheduled: attendanceRecent.scheduled,
      trend: attendanceTrend,
    },
  };
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

  /* ── Trajectory sparkline: 8-week lines/week, calendar-anchored ──
     One slot per Monday, zero-filled for missed weeks so the chart shows the
     absences as well as the activity. */
  const eightWeekMondays = mondaysEndingAt(thisWeekMonday, 8);
  const entryByMonday = new Map<string, (typeof allEntries)[number]>();
  for (const e of allEntries) entryByMonday.set(e.weekStartDate, e);
  const paceSparkline = eightWeekMondays.map((m) => entryByMonday.get(m)?.memorizationLines ?? 0);

  /* ── Prior-4-week attendance window, for the period-over-period trend ── */
  const eightWeeksAgoMondayStudent = (() => {
    const d = new Date(thisWeekMonday + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 8 * 7);
    return d.toISOString().split("T")[0];
  })();
  const prior4WeekEntries = allEntries.filter(
    (e) => e.weekStartDate >= eightWeeksAgoMondayStudent && e.weekStartDate < fourWeeksAgoMondayStudent,
  );
  const attendancePrior4Weeks = attendanceFor(prior4WeekEntries);

  /* ── The single assessment — the status banner AND all three signal
     tiles read from this one object, so the page cannot contradict itself. */
  const assessment = assessStudent({
    studentName: student.name,
    entriesDesc: allEntries,
    weeksSinceLastEntry,
    paceSparkline,
    last4WeekEntries,
    attendanceRecent: attendanceLast4Weeks,
    attendancePrior: attendancePrior4Weeks,
  });

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
    // Single source of truth for the per-student dashboard — status banner +
    // trajectory / quality / attendance tiles all read from `assessment`.
    // Additive; existing fields kept so log-week and other consumers don't
    // break.
    assessment,
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
