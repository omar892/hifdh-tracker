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
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
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
  type AttendanceSummary,
  type StudentDashboardExtras,
  type StudentVerdict,
  type StudentTrajectory,
  type StudentQualitySnapshot,
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
import { formatLines, formatPagesDecimal } from "@/lib/format";

/* ── Local constants / helpers ────────────────────── */

const TOTAL_JUZ = 30;
// The visual reference uses 12 weeks of bars in the record section — wide
// enough to see a real trend, narrow enough that bars are individually
// readable on iPad. We clip whatever the API returns to this window.
const RECORD_BARS_MAX = 12;

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
// we re-key those for the per-student verdict so the lookup matches the
// verdict tier names coming back from the server.
const VERDICT_TIER_TO_STATUS: Record<StudentVerdict["tier"], keyof typeof STATUS_META> = {
  needs_attention: "concern",
  watch: "watch",
  on_track: "fine",
};

const VERDICT_TIER_ICON: Record<StudentVerdict["tier"], React.ElementType> = {
  needs_attention: AlertTriangle,
  watch: AlertCircle,
  on_track: CheckCircle2,
};

const VERDICT_TIER_LABEL: Record<StudentVerdict["tier"], string> = {
  needs_attention: "NEEDS ATTENTION",
  watch: "WATCH",
  on_track: "ON TRACK",
};

function trajectoryLabel(trend: TrendDir): string {
  if (trend === "up") return "Climbing";
  if (trend === "down") return "Slipping";
  return "Steady";
}

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

function VerdictHero({
  verdict,
  trajectory,
  quality,
  attendance,
}: {
  verdict: StudentVerdict;
  trajectory?: StudentTrajectory;
  quality?: StudentQualitySnapshot;
  attendance?: AttendanceSummary;
}) {
  const statusKey = VERDICT_TIER_TO_STATUS[verdict.tier];
  const meta = STATUS_META[statusKey];
  const Icon = VERDICT_TIER_ICON[verdict.tier];

  return (
    <section className="mb-8">
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
              {VERDICT_TIER_LABEL[verdict.tier]}
            </span>
            <p className="mt-2 text-lg md:text-xl text-foreground font-display font-bold leading-snug">
              {verdict.sentence}
            </p>
          </div>
        </div>
      </div>

      {/* Three signal tiles. These derive from the same data as the verdict
          so they can never contradict it. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <TrajectoryTile trajectory={trajectory} />
        <QualityTile quality={quality} />
        <AttendanceTile attendance={attendance} />
      </div>
    </section>
  );
}

function TrajectoryTile({ trajectory }: { trajectory?: StudentTrajectory }) {
  const trend: TrendDir = trajectory?.paceTrend ?? null;
  const lines = trajectory?.linesPerWeek ?? 0;
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
      value={formatLines(lines, { short: true })}
      unit="/ week"
      trendDirection={trend}
      deltaText={trajectoryLabel(trend)}
      deltaCaption="last 8 weeks"
    >
      <MiniSparkline values={trajectory?.sparkline ?? []} color={sparkColor} className="mt-4 -mx-1" />
    </StatTile>
  );
}

function QualityTile({ quality }: { quality?: StudentQualitySnapshot }) {
  const recent = quality?.recentRatings ?? [];
  const trend: TrendDir = quality?.qualityTrend ?? null;
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
      trendDirection={trend}
      deltaText={trend === "up" ? "Climbing" : trend === "down" ? "Slipping" : "Holding"}
      deltaCaption="last 4 rated"
    >
      {recent.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {recent.map((r) => (
            <RatingChip key={r.weekStartDate} rating={r.rating} size="xs" />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground italic">
          Log a few weeks with ratings to see the trend.
        </p>
      )}
    </StatTile>
  );
}

function AttendanceTile({ attendance }: { attendance?: AttendanceSummary }) {
  const pct = attendance?.percent ?? null;
  const present = attendance?.present ?? 0;
  const scheduled = attendance?.scheduled ?? 0;
  const tone: TrendDir = pct == null ? null : pct >= 80 ? "up" : pct >= 60 ? "flat" : "down";
  const barColor = pct == null
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
      trendDirection={tone}
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
}) {
  const hasProjection = projections && projections.paceRecent > 0;
  const trendDir: TrendDir =
    projections?.trend === "improving"
      ? "up"
      : projections?.trend === "declining"
        ? "down"
        : "flat";
  const stabilityLabel =
    projections?.trend === "improving"
      ? "Pace improving"
      : projections?.trend === "declining"
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
              secondary={`${formatPagesDecimal(projections.paceRecent)}/wk`}
              caption="current pace"
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

function RecordChart({ weeks }: { weeks: RecordWeek[] }) {
  // Clip to most-recent N for legibility. Recharts wants oldest → newest so
  // the X axis reads left → right, which matches how a teacher scans time.
  // Format the bar label in UTC so the Monday date matches what the table
  // shows — using local-tz `format(new Date(d+"Z"), "MMM d")` shifts the
  // label back a day for anyone west of UTC.
  const utcMonthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const bars = weeks.slice(-RECORD_BARS_MAX).map((w) => ({
    key: w.weekStartDate,
    label: utcMonthDay.format(new Date(w.weekStartDate + "T00:00:00Z")),
    lines: w.hasEntry ? (w.linesMemorized ?? 0) : 0,
    rating: w.weekRating ?? null,
    hasEntry: w.hasEntry,
    rangeLabel: formatWeekRange(w.weekStartDate, w.weekEndDate),
  }));

  const anyLogged = bars.some((b) => b.hasEntry);
  if (!anyLogged) {
    return (
      <div className="bg-secondary/30 rounded-xl py-10 text-center">
        <p className="text-sm text-muted-foreground italic">No weeks logged in this month.</p>
      </div>
    );
  }

  const fillFor = (rating: string | null, hasEntry: boolean) => {
    if (!hasEntry) return "var(--secondary)";
    if (!rating) return "hsl(217, 91%, 60%)"; // entry but no rating → neutral blue
    const meta = RATING_META[rating];
    if (!meta) return "hsl(217, 91%, 60%)";
    // Map the tailwind bar class onto a hex stroke for Recharts (Recharts can't
    // read tailwind classes). Keeping the source of truth in RATING_META means
    // a palette change there propagates here too.
    const map: Record<string, string> = {
      "bg-yellow-500": "#eab308",
      "bg-emerald-500": "#10b981",
      "bg-blue-500": "#3b82f6",
      "bg-orange-500": "#f97316",
      "bg-red-500": "#ef4444",
    };
    return map[meta.bar] ?? "#3b82f6";
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "var(--secondary)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
                padding: "8px 10px",
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.rangeLabel ?? ""}
              formatter={(value: number, _name, payload) => {
                const rating = (payload?.payload as { rating?: string | null })?.rating;
                const label = rating ? (RATING_META[rating]?.label ?? "—") : "no rating";
                return [`${formatLines(value)} · ${label}`, "Logged"];
              }}
            />
            <Bar dataKey="lines" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {bars.map((b) => (
                <Cell key={b.key} fill={fillFor(b.rating, b.hasEntry)} fillOpacity={b.hasEntry ? 0.95 : 0.25} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border/30 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {(["excellent", "strong", "steady", "needs_improvement", "difficult_week"] as const).map(
          (key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-sm ${RATING_META[key].bar}`} />
              <span className="text-muted-foreground">{RATING_META[key].label}</span>
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function RecordTable({
  weeks,
  studentId,
  onEdit,
}: {
  weeks: RecordWeek[];
  studentId: number;
  onEdit: (weekStart: string) => void;
}) {
  if (weeks.length === 0) {
    return <p className="text-center text-muted-foreground py-6 text-sm">No weeks in this month.</p>;
  }
  return (
    <div className="mt-4 bg-card border border-border/50 rounded-2xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto_28px] gap-3 px-4 py-2.5 bg-secondary/40 border-b border-border/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
        <span>Week</span>
        <span>Rating</span>
        <span>Days</span>
        <span>Lines</span>
        <span aria-hidden />
      </div>
      <ul className="divide-y divide-border/30">
        {weeks.map((w) => {
          const range = formatWeekRange(w.weekStartDate, w.weekEndDate);
          return (
            <li
              key={w.weekStartDate}
              className={`grid grid-cols-[1fr_auto_auto_auto_28px] gap-3 px-4 py-3 items-center hover:bg-secondary/30 transition-colors group ${
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
              <div className="text-xs tabular-nums font-bold text-primary">
                {w.hasEntry ? formatLines(w.linesMemorized ?? 0, { short: true }) : ""}
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
        <>
          <RecordChart weeks={calendar?.weeks ?? []} />
          <RecordTable weeks={calendar?.weeks ?? []} studentId={studentId} onEdit={onEditWeek} />
        </>
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

  // The stats endpoint returns the legacy fields plus our new dashboard extras.
  // We narrow once here so the rest of the page stays typed.
  const stats = rawStats as
    | (typeof rawStats & StudentDashboardExtras & {
        attendanceLast4Weeks?: AttendanceSummary;
        attendanceAllTime?: AttendanceSummary;
        status?: StudentStatus;
      })
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

  // The verdict block is the load-bearing piece of the page; if the server
  // didn't return it (older API, transient failure), fall back to an
  // on-track-with-info reading so the page still renders something coherent.
  const verdict: StudentVerdict =
    stats?.verdict ?? {
      tier: "on_track",
      sentence: `Showing baseline data for ${student.name}.`,
      signals: ["fallback"],
      paceTrend: "flat",
      qualityTrend: "flat",
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

        <VerdictHero
          verdict={verdict}
          trajectory={stats?.trajectory}
          quality={stats?.quality}
          attendance={stats?.attendanceLast4Weeks}
        />

        <FinishTimeline
          juzCompleted={stats?.juzCompleted ?? 0}
          projections={projections}
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
