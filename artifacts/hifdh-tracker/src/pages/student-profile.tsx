/**
 * Per-student dashboard. Narrative spine, top to bottom:
 *   Header → Verdict → On-track timeline → The record.
 *
 * Every signal here ladders up to the verdict pill at the top, so the page
 * can never contradict itself (the bug the redesign was meant to fix).
 *
 * Shared primitives live in components/dashboard/shared — the class view and
 * this view share status colors, rating chips, sparkline, and the StatTile
 * shell on purpose. If you find yourself adding a one-off variant, push it
 * into shared instead.
 */

import { useParams, useLocation, Link } from "wouter";
import { useMemo, useState } from "react";
import { format, subMonths, addMonths } from "date-fns";
import {
  ArrowLeft,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Target,
  Sparkles,
  Users as UsersIcon,
  BarChart3,
  Info,
  Pencil,
} from "lucide-react";

import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import {
  useGetStudent,
  useGetStudentStats,
  useGetStudentProjections,
  useGetStudentCalendar,
} from "@workspace/api-client-react";
import {
  StatusBadge,
  GuardiansSection,
  ParentLinkSection,
} from "@/components/student-record/record-sections";
import {
  type StudentStatus,
  type StudentDashboardExtras,
  type StudentAssessment,
  type StudentTrajectorySignal,
  type StudentQualitySignal,
  type StudentAttendanceSignal,
  type StudentMonthlyComparison,
} from "@/hooks/use-student-record";
import {
  RATING_META,
  STATUS_META,
  SectionHeader,
  TrendArrow,
  MiniSparkline,
  RatingChip,
  StatTile,
  formatWeekRange,
  type TrendDir,
} from "@/components/dashboard/shared";
import { getGenderAvatarClass, type Gender } from "@/lib/gender-colors";
import { formatLines } from "@/lib/format";

/* ── Local constants / helpers ────────────────────── */

const TOTAL_JUZ = 30;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function isSameCalendarMonth(d: Date, today: Date): boolean {
  return d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth();
}

// Three tiers, single palette. The class view uses concern/watch/fine —
// we re-key those for the per-student status so the lookup matches the
// assessment status names coming back from the server.
type VerdictStatus = StudentAssessment["status"];

const VERDICT_TIER_TO_STATUS: Record<VerdictStatus, keyof typeof STATUS_META> = {
  needs_attention: "concern",
  watch: "watch",
  on_track: "fine",
};

const VERDICT_TIER_ICON: Record<VerdictStatus, React.ElementType> = {
  needs_attention: AlertTriangle,
  watch: AlertCircle,
  on_track: CheckCircle2,
};

const VERDICT_TIER_LABEL: Record<VerdictStatus, string> = {
  needs_attention: "NEEDS ATTENTION",
  watch: "WATCH",
  on_track: "ON TRACK",
};

/* ── Section 0: Header ────────────────────────────── */

function StudentHeader({
  student,
  stats,
  studentId,
  onBack,
}: {
  student: {
    id: number;
    name: string;
    gender?: string | null;
    currentPage: number;
    currentLine: number;
    active: boolean;
    completedJuz?: number[];
  };
  stats:
    | {
        totalQuranPercentage: number;
        currentStreakWeeks: number;
        weeksSinceLastEntry?: number | null;
        status?: StudentStatus;
      }
    | undefined;
  studentId: number;
  onBack: () => void;
}) {
  const juzArr = student.completedJuz ?? [];
  const juzCount = juzArr.length;
  const paused =
    stats && stats.currentStreakWeeks === 0 && (stats.weeksSinceLastEntry ?? 0) > 2;

  return (
    <header className="mb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-semibold text-sm mb-5"
      >
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </button>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0 ${getGenderAvatarClass(
            (student.gender ?? null) as Gender,
          )}`}
        >
          {student.name.charAt(0).toUpperCase()}
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-extrabold text-foreground tracking-tight leading-none">
          {student.name}
        </h1>
        <StatusBadge
          status={(stats?.status ?? (student.active ? "active" : "withdrawn")) as StudentStatus}
          studentId={studentId}
        />
      </div>

      <p className="text-sm text-muted-foreground font-medium">
        {paused ? "Last position:" : "Working on:"}{" "}
        <span className="text-foreground font-semibold">
          Page {student.currentPage}, Line {student.currentLine}
        </span>
      </p>

      {stats && (
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 max-w-md h-2 bg-primary/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, stats.totalQuranPercentage)}%` }}
            />
          </div>
          <span className="text-sm font-extrabold text-primary tabular-nums">
            {stats.totalQuranPercentage}%
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            {juzCount}/{TOTAL_JUZ} juz
          </span>
        </div>
      )}

      <div className="mt-5">
        <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest mb-2">
          Juz Map
        </p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: TOTAL_JUZ }, (_, i) => i + 1).map((juz) => {
            const completed = juzArr.includes(juz);
            // "Current juz" highlight: figure out which juz the current page
            // belongs to. Without a page→juz lookup table here we use the
            // simple heuristic of `next juz after the highest completed`.
            const currentJuz = juzCount + 1;
            const isCurrent = !completed && juz === currentJuz && juzCount < TOTAL_JUZ;
            return (
              <div
                key={juz}
                className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${
                  completed
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                    : isCurrent
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/40"
                      : "bg-secondary/60 text-muted-foreground/40"
                }`}
                aria-label={
                  completed ? `Juz ${juz} complete` : isCurrent ? `Juz ${juz} current` : `Juz ${juz}`
                }
              >
                {juz}
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
}

/* ── Section 1: Verdict ───────────────────────────── */

/**
 * The status banner AND the three tiles below all read from one `assessment`
 * object computed server-side — nothing recomputes a trend on its own, so the
 * page can't contradict itself. When status is on_track the banner is omitted
 * entirely; the tiles still show the present-state read.
 */
function VerdictHero({ assessment }: { assessment: StudentAssessment }) {
  const showBanner = assessment.status !== "on_track";
  const meta = STATUS_META[VERDICT_TIER_TO_STATUS[assessment.status]];
  const Icon = VERDICT_TIER_ICON[assessment.status];

  return (
    <section className="mb-8">
      {showBanner && (
        <div className={`rounded-3xl border ${meta.border} ${meta.bg} p-6`}>
          <div className="flex items-start gap-3 mb-2">
            <div
              className={`shrink-0 w-10 h-10 rounded-full bg-card flex items-center justify-center ${meta.icon}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full ${meta.chipBg} ${meta.chipText}`}
              >
                {VERDICT_TIER_LABEL[assessment.status]}
              </span>
              <p className="mt-2 text-lg md:text-xl text-foreground font-display font-bold leading-snug">
                {assessment.sentence}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Three signal tiles — all read from `assessment`, never recomputed. */}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${showBanner ? "mt-4" : ""}`}>
        <TrajectoryTile trajectory={assessment.trajectory} />
        <QualityTile quality={assessment.quality} />
        <AttendanceTile attendance={assessment.attendance} />
      </div>
    </section>
  );
}

function TrajectoryTile({ trajectory }: { trajectory: StudentTrajectorySignal }) {
  // Pace is a continuous metric — a trend arrow is honest here.
  const trend: TrendDir = trajectory.trend;
  const sparkColor =
    trend === "down"
      ? "hsl(346, 84%, 56%)" // rose-500-ish for slipping
      : trend === "up"
        ? "hsl(142, 76%, 36%)" // emerald
        : "hsl(217, 91%, 60%)"; // blue for flat
  return (
    <StatTile
      icon={BarChart3}
      label="Trajectory"
      value={formatLines(trajectory.linesPerWeek, { short: true })}
      unit={`/wk · ${trajectory.windowWeeks}-wk avg`}
      trendDirection={trend}
      deltaText={trajectory.label}
      deltaCaption="8-week trend"
    >
      <MiniSparkline values={trajectory.sparkline} color={sparkColor} className="mt-4 -mx-1" />
    </StatTile>
  );
}

function QualityTile({ quality }: { quality: StudentQualitySignal }) {
  // Quality is a categorical rating — no trend arrow, no "Climbing" verb.
  // The delta line states a FACT about the recent window instead.
  const recent = quality.recentRatings;
  const latest = recent[0];
  return (
    <StatTile
      icon={Sparkles}
      iconColor="text-yellow-500"
      label="Quality"
      value={
        latest ? (
          <span className={RATING_META[latest.rating]?.text ?? "text-foreground"}>
            {RATING_META[latest.rating]?.label ?? "—"}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      }
      unit={latest ? "latest" : "no ratings yet"}
      deltaText={quality.pattern}
    >
      {recent.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {recent.map((r) => (
            <RatingChip key={r.weekStartDate} rating={r.rating} size="xs" />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground italic">
          Log a few weeks with ratings to see the pattern.
        </p>
      )}
    </StatTile>
  );
}

function AttendanceTile({ attendance }: { attendance: StudentAttendanceSignal }) {
  const pct = attendance.percent;
  const { present, scheduled, trend } = attendance;
  const barColor =
    pct == null
      ? "bg-muted"
      : pct >= 80
        ? "bg-emerald-500"
        : pct >= 60
          ? "bg-amber-500"
          : "bg-rose-500";
  return (
    <StatTile
      icon={UsersIcon}
      iconColor="text-blue-500"
      label="Attendance"
      value={pct == null ? "—" : `${pct}%`}
      unit="last 4 weeks"
      trendDirection={trend}
      deltaText={scheduled > 0 ? `${present} of ${scheduled}` : "—"}
      deltaCaption={scheduled > 0 ? "days present" : ""}
    >
      <div className="mt-4 h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </StatTile>
  );
}

/* ── Section 2: On track to finish ────────────────── */

function FinishTimeline({
  juzCompleted,
  projections,
  paceTrend,
}: {
  juzCompleted: number;
  projections:
    | {
        paceRecent: number;
        projectedDate6Month?: string | null;
        projectedDateFull?: string | null;
        weeksTo6MonthGoal: number | null;
        weeksToFullQuran: number | null;
        linesRemaining6Month: number;
        linesRemainingFull: number;
        trend: "improving" | "declining" | "stable";
      }
    | undefined;
  /** Pace stability badge reads the SAME trend as the Trajectory tile, so the
      two characterizations of pace can never disagree. */
  paceTrend: TrendDir;
}) {
  const hasProjection = projections && projections.paceRecent > 0;
  const trendDir: TrendDir = paceTrend;
  const stabilityLabel =
    paceTrend === "up"
      ? "Pace improving"
      : paceTrend === "down"
        ? "Pace easing"
        : "Pace stable";

  return (
    <section className="mb-8">
      <SectionHeader
        title="On track to finish"
        icon={Target}
        right={
          hasProjection ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
              <TrendArrow direction={trendDir} className="w-3 h-3" /> {stabilityLabel}
            </span>
          ) : null
        }
      />

      {!hasProjection ? (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6 flex items-start gap-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Not enough data to project yet.</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              We need a few weeks of logged entries with memorized lines to estimate when this
              student will reach the halfway mark and full Quran. There's no target completion date
              field in the schema yet, so the projection here will read off recent pace alone.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
          <div className="grid grid-cols-3 gap-3 md:gap-6 relative">
            {/* Connector line behind the dots. Sits at ~the dot's vertical
                center so the milestones read as one timeline. */}
            <div
              aria-hidden
              className="absolute left-[16%] right-[16%] top-[34px] h-0.5 bg-gradient-to-r from-emerald-500/30 via-primary/30 to-yellow-500/30"
            />
            <TimelineStep
              tone="now"
              label="Now"
              primary={`Juz ${juzCompleted}`}
              secondary={`${formatLines(projections.paceRecent, { short: true })}/wk`}
              caption="8-week avg pace"
            />
            <TimelineStep
              tone="mid"
              label="Halfway"
              primary={
                projections.linesRemaining6Month === 0
                  ? "Reached"
                  : projections.projectedDate6Month
                    ? formatDate(projections.projectedDate6Month)
                    : "—"
              }
              secondary={
                projections.linesRemaining6Month === 0
                  ? "Juz 15 — done"
                  : projections.weeksTo6MonthGoal != null
                    ? `~${projections.weeksTo6MonthGoal} weeks away`
                    : ""
              }
              caption={
                projections.linesRemaining6Month === 0 ? "" : `Juz 15 · ${formatLines(projections.linesRemaining6Month, { short: true, showRemainder: false })} to go`
              }
            />
            <TimelineStep
              tone="end"
              label="Complete"
              primary={
                projections.linesRemainingFull === 0
                  ? "Done!"
                  : projections.projectedDateFull
                    ? formatDate(projections.projectedDateFull)
                    : "—"
              }
              secondary={
                projections.linesRemainingFull === 0
                  ? "Juz 30 — مَا شَاء اللهُ"
                  : projections.weeksToFullQuran != null
                    ? `~${projections.weeksToFullQuran} weeks away`
                    : ""
              }
              caption={
                projections.linesRemainingFull === 0
                  ? ""
                  : `Juz 30 · ${formatLines(projections.linesRemainingFull, { short: true, showRemainder: false })} to go`
              }
            />
          </div>

          <p className="mt-5 pt-4 border-t border-border/30 text-[11px] text-muted-foreground leading-relaxed">
            Projections assume the current pace holds — they'll shift week to week as new entries
            land. Schema doesn't track a target completion date, so this is pace-only.
          </p>
        </div>
      )}
    </section>
  );
}

function TimelineStep({
  tone,
  label,
  primary,
  secondary,
  caption,
}: {
  tone: "now" | "mid" | "end";
  label: string;
  primary: string;
  secondary: string;
  caption: string;
}) {
  const dotColor =
    tone === "now"
      ? "bg-emerald-500 ring-emerald-500/20"
      : tone === "mid"
        ? "bg-primary ring-primary/20"
        : "bg-yellow-500 ring-yellow-500/20";
  return (
    <div className="flex flex-col items-center text-center relative z-10">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </span>
      <span className={`w-4 h-4 rounded-full ring-4 ${dotColor} mb-3`} aria-hidden />
      <span className="font-display text-xl font-extrabold text-foreground tracking-tight">
        {primary}
      </span>
      {secondary && (
        <span className="text-xs font-medium text-muted-foreground mt-0.5">{secondary}</span>
      )}
      {caption && (
        <span className="text-[10px] text-muted-foreground/80 mt-1">{caption}</span>
      )}
    </div>
  );
}

/* ── Section 3: The record ────────────────────────── */

interface RecordWeek {
  weekStartDate: string;
  weekEndDate: string;
  hasEntry: boolean;
  weekRating?: string | null;
  successfulDays?: number | null;
  daysAttended?: number | null;
  linesMemorized?: number | null;
}

function MonthSoFarLine({
  comparison,
  viewingCurrentMonth,
}: {
  comparison?: StudentMonthlyComparison;
  viewingCurrentMonth: boolean;
}) {
  if (!viewingCurrentMonth || !comparison) return null;
  const { thisMonthPerWeek, lastMonthPerWeek, weeksLoggedThisMonth, weeksLoggedLastMonth } = comparison;
  if (weeksLoggedThisMonth === 0 && weeksLoggedLastMonth === 0) return null;
  const delta = thisMonthPerWeek - lastMonthPerWeek;
  const trend: TrendDir =
    weeksLoggedLastMonth === 0 || weeksLoggedThisMonth === 0
      ? null
      : Math.abs(delta) < 1.5
        ? "flat"
        : delta > 0
          ? "up"
          : "down";

  const thisStr = `${formatLines(thisMonthPerWeek, { short: true })}/wk across ${weeksLoggedThisMonth} ${weeksLoggedThisMonth === 1 ? "week" : "weeks"} logged so far`;
  const lastStr =
    weeksLoggedLastMonth > 0
      ? `last month was ${formatLines(lastMonthPerWeek, { short: true })}/wk`
      : "no comparison for last month";

  return (
    <p className="text-sm text-muted-foreground mb-4 leading-relaxed flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="font-semibold text-foreground">Month so far:</span>
      </span>
      <span>{thisStr}.</span>
      <span className="inline-flex items-center gap-1">
        {trend && <TrendArrow direction={trend} className="w-3 h-3" />}
        <span>{lastStr}.</span>
      </span>
    </p>
  );
}

// Column template shared by the record table's header and its rows. The
// "Memorized" column is wide enough to hold the in-row bar plus the value.
const RECORD_COLS = "grid-cols-[minmax(0,1fr)_auto_auto_minmax(132px,1.3fr)_28px]";

function RecordTable({
  weeks,
  onEdit,
}: {
  weeks: RecordWeek[];
  onEdit: (weekStart: string) => void;
}) {
  if (weeks.length === 0) {
    return <p className="text-center text-muted-foreground py-6 text-sm">No weeks in this month.</p>;
  }
  // Bars are scaled against the busiest logged week in view, so a bar's length
  // reads as "how this week compares to the rest of the month".
  const maxLines = Math.max(
    1,
    ...weeks.filter((w) => w.hasEntry).map((w) => w.linesMemorized ?? 0),
  );
  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
      <div className={`grid ${RECORD_COLS} gap-3 px-4 py-2.5 bg-secondary/40 border-b border-border/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground`}>
        <span>Week</span>
        <span>Rating</span>
        <span>Days</span>
        <span>Memorized</span>
        <span aria-hidden />
      </div>
      <ul className="divide-y divide-border/30">
        {weeks.map((w) => {
          const range = formatWeekRange(w.weekStartDate, w.weekEndDate);
          const lines = w.linesMemorized ?? 0;
          // In-row bar — replaces the standalone chart. Width = lines logged
          // that week vs the month's busiest week; colour = that week's
          // rating. The rating chip in the same row decodes the colour, so
          // no separate legend is needed.
          const barColor = w.weekRating
            ? RATING_META[w.weekRating]?.bar ?? "bg-blue-500"
            : "bg-blue-500";
          const barPct =
            w.hasEntry && lines > 0 ? Math.max(6, Math.round((lines / maxLines) * 100)) : 0;
          return (
            <li
              key={w.weekStartDate}
              className={`grid ${RECORD_COLS} gap-3 px-4 py-2.5 items-center hover:bg-secondary/30 transition-colors group ${
                w.hasEntry ? "" : "bg-secondary/10"
              }`}
            >
              <button
                type="button"
                onClick={() => onEdit(w.weekStartDate)}
                className="text-left text-sm font-semibold text-foreground hover:text-primary transition-colors truncate"
              >
                {range}
              </button>
              <div>
                {w.hasEntry && w.weekRating ? (
                  <RatingChip rating={w.weekRating} size="xs" />
                ) : w.hasEntry ? (
                  <span className="text-[10px] text-muted-foreground italic">no rating</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/70 italic">no entry</span>
                )}
              </div>
              <div className="text-xs tabular-nums">
                {w.hasEntry ? (
                  <span className="font-semibold text-foreground">
                    {w.successfulDays ?? 0}
                    <span className="text-muted-foreground">/{w.daysAttended ?? 0}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 min-w-[40px] h-2.5 rounded-full bg-secondary/70 overflow-hidden">
                  {barPct > 0 && (
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${barPct}%` }}
                    />
                  )}
                </div>
                <span className="w-[54px] shrink-0 text-right text-xs tabular-nums font-bold text-foreground">
                  {w.hasEntry ? formatLines(lines, { short: true }) : "—"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onEdit(w.weekStartDate)}
                className="text-muted-foreground/0 group-hover:text-muted-foreground transition-colors"
                aria-label={w.hasEntry ? `Edit week ${range}` : `Log week ${range}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecordSection({
  studentId,
  monthStr,
  calendar,
  monthlyComparison,
  isLoading,
  onPrev,
  onNext,
  onEditWeek,
  monthDate,
}: {
  studentId: number;
  monthStr: string;
  calendar?: { weeks: RecordWeek[] };
  monthlyComparison?: StudentMonthlyComparison;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onEditWeek: (weekStart: string) => void;
  monthDate: Date;
}) {
  const viewingCurrentMonth = isSameCalendarMonth(monthDate, new Date());

  return (
    <section className="mb-10">
      <SectionHeader
        title="The record"
        icon={Calendar}
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={onPrev}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-sm text-foreground min-w-[110px] text-center tracking-tight">
              {format(monthDate, "MMMM yyyy")}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={onNext}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <MonthSoFarLine
        comparison={monthlyComparison}
        viewingCurrentMonth={viewingCurrentMonth}
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <RecordTable weeks={calendar?.weeks ?? []} onEdit={onEditWeek} />
      )}
    </section>
  );
}

/* ── Footer (demoted guardians / parent link) ─────── */

function FamilyAccessFooter({ studentId }: { studentId: number }) {
  // The brief calls for ONE quiet footer row, not the full card pair. We keep
  // the existing components but render them inside <details> so they're
  // available without dominating the page.
  return (
    <footer className="mt-12 pt-6 border-t border-border/30">
      <details className="group">
        <summary className="cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2 list-none">
          <UsersIcon className="w-3.5 h-3.5" />
          Family access &amp; parent link
          <span className="text-muted-foreground/60 font-medium">
            (manage guardians, generate read-only link)
          </span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto transition-transform group-open:rotate-90" />
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <GuardiansSection studentId={studentId} />
          <ParentLinkSection studentId={studentId} />
        </div>
      </details>
    </footer>
  );
}

/* ── Page ─────────────────────────────────────────── */

export default function StudentProfile() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { studentId: studentIdParam } = useParams<{ studentId: string }>();
  const [, setLocation] = useLocation();
  const studentId = parseInt(studentIdParam ?? "0", 10);

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const monthStr = format(currentMonth, "yyyy-MM");

  const { data: student, isLoading: studentLoading, error: studentError } = useGetStudent(studentId);
  const { data: rawStats, isLoading: statsLoading, error: statsError } = useGetStudentStats(studentId);
  const { data: projections } = useGetStudentProjections(studentId);
  const { data: calendar, isLoading: calLoading } = useGetStudentCalendar(studentId, {
    month: monthStr,
  });

  // The stats endpoint returns the legacy fields plus our new dashboard extras
  // (the single `assessment` object). We narrow once here so the rest of the
  // page stays typed.
  const stats = rawStats as
    | (typeof rawStats & StudentDashboardExtras & { status?: StudentStatus })
    | undefined;

  const editWeek = useMemo(
    () => (weekStart: string) =>
      setLocation(`/log-week/0?sid=${studentId}&week=${weekStart}`),
    [setLocation, studentId],
  );

  const isLoading = authLoading || studentLoading || statsLoading;

  if (isLoading) {
    return (
      <AppLayout title="Student Profile">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (studentError || statsError) {
    const msg =
      (studentError instanceof Error ? studentError.message : null) ??
      (statsError instanceof Error ? statsError.message : null) ??
      "Unknown error.";
    return (
      <AppLayout title="Student Profile">
        <div className="max-w-2xl mx-auto py-12">
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-500/5 p-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Couldn't load this student</p>
              <p className="text-sm text-muted-foreground mt-1">{msg}</p>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mt-3"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!student) {
    return (
      <AppLayout title="Student Profile">
        <div className="text-center p-12">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">Student not found.</p>
        </div>
      </AppLayout>
    );
  }

  // The assessment is the load-bearing piece of the page — the status banner
  // AND all three signal tiles read from it. If the server didn't return it
  // (older API, transient failure), fall back to an on-track reading (no
  // banner) so the page still renders something coherent.
  const assessment: StudentAssessment =
    stats?.assessment ?? {
      status: "on_track",
      sentence: `Showing baseline data for ${student.name}.`,
      signals: ["fallback"],
      trajectory: { linesPerWeek: 0, windowWeeks: 4, sparkline: [], trend: "flat", label: "Steady" },
      quality: { recentRatings: [], pattern: "No ratings logged yet", latestRating: null },
      attendance: { percent: null, present: 0, scheduled: 0, trend: null },
    };

  return (
    <AppLayout title={student.name}>
      <div className="max-w-5xl mx-auto pb-12">
        <StudentHeader
          student={{
            id: student.id,
            name: student.name,
            gender: (student as { gender?: string | null }).gender ?? null,
            currentPage: student.currentPage,
            currentLine: student.currentLine,
            active: student.active,
            completedJuz: (student as { completedJuz?: number[] }).completedJuz,
          }}
          stats={stats}
          studentId={studentId}
          onBack={() => setLocation("/")}
        />

        <VerdictHero assessment={assessment} />

        <FinishTimeline
          juzCompleted={stats?.juzCompleted ?? 0}
          projections={projections}
          paceTrend={assessment.trajectory.trend}
        />

        <RecordSection
          studentId={studentId}
          monthStr={monthStr}
          calendar={calendar as { weeks: RecordWeek[] } | undefined}
          monthlyComparison={stats?.monthlyComparison}
          isLoading={calLoading}
          onPrev={() => setCurrentMonth((m) => subMonths(m, 1))}
          onNext={() => setCurrentMonth((m) => addMonths(m, 1))}
          onEditWeek={editWeek}
          monthDate={currentMonth}
        />

        <FamilyAccessFooter studentId={studentId} />
      </div>
    </AppLayout>
  );
}
