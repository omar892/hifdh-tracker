import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import {
  useGetClassStats,
  useGetCurrentClass,
} from "@workspace/api-client-react";
import type { ClassStats as ClassStatsData, RosterRow } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Award,
  BookOpen,
  CalendarDays,
  Users,
  BarChart3,
  Flame,
  Sparkles,
  TrendingUp,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
import { getGenderDotClass, type Gender } from "@/lib/gender-colors";
import { formatLines } from "@/lib/format";
import {
  RATING_META,
  RATING_ORDER,
  STATUS_META,
  TrendArrow,
  SectionHeader,
  MiniSparkline,
  RatingChip,
  StatTile,
  JuzProgressBar,
  formatWeekRange,
  type TrendDir,
} from "@/components/dashboard/shared";

/* ── Small helpers ───────────────────────────────── */

function StudentLink({ id, children, className = "" }: { id: number; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={`/students/${id}/profile`}
      className={`hover:underline hover:text-primary transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}

/* ── Section 1: Header + Verdict ─────────────────── */

function HeaderVerdict({
  className,
  weekRange,
  sentence,
}: {
  className: string;
  weekRange: { weekStartDate: string; weekEndDate: string };
  sentence: string;
}) {
  // Split on the first em-dash so we can emphasize the "X students need a
  // check-in" clause that follows. The server composes the sentence with this
  // shape on purpose.
  const dashIdx = sentence.indexOf(" — ");
  const lede = dashIdx >= 0 ? sentence.slice(0, dashIdx) : sentence;
  const rest = dashIdx >= 0 ? sentence.slice(dashIdx + 3) : "";
  return (
    <header className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary flex items-center gap-2">
        <CalendarDays className="w-3 h-3" />
        Week of {formatWeekRange(weekRange.weekStartDate, weekRange.weekEndDate)}
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground">
        {className}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {lede}
        {rest && (
          <>
            {" — "}
            <span className="font-semibold text-foreground/90">{rest}</span>
          </>
        )}
      </p>
    </header>
  );
}

/* ── Section 2: Needs Attention (HERO) ───────────── */

function AttentionCard({
  item,
}: {
  item: ClassStatsData["attention"]["concern"][number];
}) {
  const meta = item.tier === "concern" ? STATUS_META.concern : STATUS_META.watch;
  return (
    <StudentLink id={item.studentId} className="block">
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-3.5 transition-colors hover:bg-secondary/30">
        <div className={`absolute left-0 top-0 h-full w-1 ${meta.dot}`} />
        <div className="pl-1.5">
          <p className="text-[13px] font-bold text-foreground">{item.name}</p>
          <p className="mt-1 text-[12.5px] font-medium leading-snug text-foreground/80">{item.reason}</p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{item.action}</p>
        </div>
      </div>
    </StudentLink>
  );
}

function NeedsAttention({ attention }: { attention: ClassStatsData["attention"] }) {
  const items = [...attention.concern, ...attention.watch];
  return (
    <section className="mb-7">
      <SectionHeader title="Needs your attention" icon={AlertTriangle} iconColor="text-rose-500" hint="act on these first" />
      {items.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-500/5 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-bold text-foreground">All clear this week.</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">No students are flagged for a check-in right now.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <AttentionCard key={item.studentId} item={item} />
          ))}
        </div>
      )}

      {attention.borderline.length > 0 && (
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground/80">Also keep an eye on:</span>{" "}
          {attention.borderline.map((b, i) => (
            <span key={b.studentId}>
              {i > 0 && ", "}
              <StudentLink id={b.studentId} className="font-medium text-foreground/80">
                {b.name}
              </StudentLink>
              <span className="text-muted-foreground"> ({b.hint})</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/* ── Section 3: Class Pulse ──────────────────────── */

function PaceCard({ pace }: { pace: ClassStatsData["classPulse"]["pace"] }) {
  const deltaDir: TrendDir = pace.delta > 0.5 ? "up" : pace.delta < -0.5 ? "down" : "flat";
  const peak = Math.max(...pace.sparkline, 0);
  return (
    <StatTile
      icon={BarChart3}
      label="Weekly pace"
      value={formatLines(pace.thisWeek, { short: true })}
      unit="/ student"
      trendDirection={deltaDir}
      deltaText={`${pace.delta > 0 ? "+" : ""}${formatLines(pace.delta, { short: true })}`}
      deltaCaption="vs 4-week avg"
    >
      <MiniSparkline values={pace.sparkline} className="mt-2 -mx-1" height={42} />
      <p className="text-[10px] text-muted-foreground/80 mt-0.5 font-medium">
        Last 8 weeks{peak > 0 ? ` · peak ${formatLines(peak, { short: true })}` : ""}
      </p>
    </StatTile>
  );
}

function QualityCard({ quality }: { quality: ClassStatsData["classPulse"]["quality"] }) {
  const total = quality.totalRated;
  const deltaDir: TrendDir =
    quality.deltaStrongOrAbove > 0 ? "up" : quality.deltaStrongOrAbove < 0 ? "down" : "flat";
  return (
    <StatTile
      icon={Sparkles}
      iconColor="text-yellow-500"
      label="Recitation quality"
      value={quality.strongOrAbove}
      unit={total > 0 ? `of ${total} at Strong+` : "at Strong+"}
      trendDirection={deltaDir}
      deltaText={`${quality.deltaStrongOrAbove > 0 ? "+" : ""}${quality.deltaStrongOrAbove}`}
      deltaCaption="vs last week"
    >
      {total > 0 ? (
        <>
          <div className="mt-2.5 h-2.5 rounded-full overflow-hidden flex bg-secondary">
            {RATING_ORDER.map((key) => {
              const count = quality.mix[key];
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={key}
                  className={`${RATING_META[key].bar} h-full`}
                  style={{ width: `${pct}%` }}
                  title={`${RATING_META[key].label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[10.5px]">
            {RATING_ORDER.map((key) =>
              quality.mix[key] > 0 ? (
                <span key={key} className="flex items-center gap-1 text-muted-foreground">
                  <span className={`w-1.5 h-1.5 rounded-full ${RATING_META[key].bar}`} />
                  <span className="font-semibold text-foreground/80">{quality.mix[key]}</span>
                  {RATING_META[key].label}
                </span>
              ) : null,
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground italic">No rated entries yet this week.</p>
      )}
    </StatTile>
  );
}

function AttendanceCard({
  attendance,
  pendingNames,
  perStudentDays,
}: {
  attendance: ClassStatsData["classPulse"]["attendance"];
  pendingNames: string[];
  perStudentDays: (number | null | undefined)[];
}) {
  const pct = attendance.percentThisWeek;
  // Map each student to a dot color based on this week's daysAttended:
  // 4+ → emerald (good), 1-3 → amber (partial), 0/null → rose (absent or no entry yet).
  const dotColor = (days: number | null | undefined): string => {
    if (days == null || days === 0) return "bg-rose-400";
    if (days >= 4) return "bg-emerald-500";
    return "bg-amber-500";
  };
  return (
    <StatTile
      icon={Users}
      iconColor="text-blue-500"
      label="Showing up"
      value={pct == null ? "—" : `${pct}%`}
      unit="attendance"
    >
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        avg <span className="font-semibold text-foreground">{attendance.avgDaysOfFive.toFixed(1)}</span> of 5 days
      </p>
      {/* Per-student dot grid — one dot per active student. Communicates the
          "9 of 10 logged" stat as a glance, including which students are still
          pending (rose dots). */}
      {perStudentDays.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {perStudentDays.map((days, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${dotColor(days)}`}
              title={days == null ? "not logged" : `${days}/5 days`}
            />
          ))}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        <span className="font-semibold text-foreground">{attendance.loggedCount}</span> of {attendance.totalStudents} logged
        {pendingNames.length > 0 && (
          <>
            {" · still pending: "}
            <span className="font-medium text-foreground/80">
              {pendingNames.slice(0, 2).join(", ")}
              {pendingNames.length > 2 && ` +${pendingNames.length - 2}`}
            </span>
          </>
        )}
      </p>
    </StatTile>
  );
}

function ClassPulse({
  pulse,
  pendingNames,
  perStudentDays,
}: {
  pulse: ClassStatsData["classPulse"];
  pendingNames: string[];
  perStudentDays: (number | null | undefined)[];
}) {
  return (
    <section className="mb-7">
      <SectionHeader title="Class pulse" icon={TrendingUp} hint="is the class healthy?" />
      <div className="grid gap-2.5 sm:grid-cols-3">
        <PaceCard pace={pulse.pace} />
        <QualityCard quality={pulse.quality} />
        <AttendanceCard
          attendance={pulse.attendance}
          pendingNames={pendingNames}
          perStudentDays={perStudentDays}
        />
      </div>
    </section>
  );
}

/* ── Section 4: Sortable Roster ──────────────────── */

type SortKey = "status" | "juz" | "pace" | "name";

const STATUS_RANK: Record<RosterRow["status"], number> = { concern: 0, watch: 1, fine: 2 };

function sortRoster(rows: RosterRow[], key: SortKey): RosterRow[] {
  const sorted = [...rows];
  switch (key) {
    case "status":
      sorted.sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          b.juzCount - a.juzCount ||
          a.name.localeCompare(b.name),
      );
      break;
    case "juz":
      sorted.sort((a, b) => b.juzCount - a.juzCount || a.name.localeCompare(b.name));
      break;
    case "pace":
      sorted.sort((a, b) => b.pace4Week - a.pace4Week || a.name.localeCompare(b.name));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

function SortBtn({
  k,
  active,
  onClick,
  align = "left",
  children,
}: {
  k: SortKey;
  active: boolean;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
        align === "right" ? "justify-end" : ""
      } ${active ? "text-primary" : "text-muted-foreground/70 hover:text-foreground"}`}
    >
      {children}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );
}

function RosterTable({ roster }: { roster: RosterRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const sorted = useMemo(() => sortRoster(roster, sortKey), [roster, sortKey]);

  if (roster.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
        <p className="text-[13px] text-muted-foreground italic">No active students.</p>
      </div>
    );
  }

  const dayColor = (days: number | null | undefined): string => {
    if (days == null) return "text-muted-foreground/60 italic";
    if (days === 5) return "text-foreground";
    if (days === 0) return "text-rose-500";
    return "text-amber-600 dark:text-amber-400";
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
      {/* Head — 12-col grid mirrors the reference's tight layout */}
      <div className="grid grid-cols-12 gap-2 border-b border-border/50 px-4 py-2.5 bg-secondary/30">
        <div className="col-span-4">
          <SortBtn k="name" active={sortKey === "name"} onClick={setSortKey}>Student</SortBtn>
        </div>
        <div className="col-span-2">
          <SortBtn k="juz" active={sortKey === "juz"} onClick={setSortKey}>Juz</SortBtn>
        </div>
        <div className="col-span-2">
          <SortBtn k="pace" active={sortKey === "pace"} onClick={setSortKey}>Pace</SortBtn>
        </div>
        <div className="col-span-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
          This week
        </div>
        <div className="col-span-1 text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground/70">
          Days
        </div>
      </div>

      {/* Rows */}
      {sorted.map((row) => {
        const meta = STATUS_META[row.status];
        return (
          <div
            key={row.studentId}
            className="grid grid-cols-12 items-center gap-2 border-b border-border/40 px-4 py-2.5 last:border-0 hover:bg-secondary/30 transition-colors"
          >
            {/* Name + status dot (status is the dot; no separate column) */}
            <div className="col-span-4 flex items-center gap-2.5 min-w-0">
              <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getGenderDotClass(row.gender as Gender)}`} />
              <StudentLink id={row.studentId} className="truncate text-[13px] font-semibold text-foreground">
                {row.name}
              </StudentLink>
            </div>

            {/* Juz */}
            <div className="col-span-2 flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-foreground tabular-nums">{row.juzCount}</span>
              <div className="flex-1 max-w-[36px]">
                <JuzProgressBar juzCount={row.juzCount} currentPage={row.currentPage} showLabel={false} />
              </div>
            </div>

            {/* Pace */}
            <div className="col-span-2 flex items-center gap-1">
              <span className="text-[13px] font-medium text-foreground">{formatLines(row.pace4Week, { short: true })}</span>
              <TrendArrow direction={row.paceTrend ?? null} />
            </div>

            {/* This week — rating chip + trend */}
            <div className="col-span-3 flex items-center gap-1.5">
              {row.thisWeekRating ? (
                <RatingChip rating={row.thisWeekRating} trend={row.ratingTrend ?? null} />
              ) : (
                <span className="text-[11.5px] font-medium italic text-muted-foreground/60">not logged</span>
              )}
            </div>

            {/* Days /5 */}
            <div className="col-span-1 text-right">
              <span className={`text-[13px] font-semibold tabular-nums ${dayColor(row.daysAttended)}`}>
                {row.daysAttended == null ? "—" : `${row.daysAttended}/5`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RosterSection({ roster }: { roster: RosterRow[] }) {
  return (
    <section className="mb-7">
      <SectionHeader title="Every student" icon={Users} hint="the full picture" />
      <RosterTable roster={roster} />
    </section>
  );
}

/* ── Section 5: Wins ─────────────────────────────── */

function Celebrations({ celebrations }: { celebrations: ClassStatsData["celebrations"] }) {
  const [showAllStreaks, setShowAllStreaks] = useState(false);
  const visibleStreaks = showAllStreaks ? celebrations.streaks : celebrations.streaks.slice(0, 3);
  const hasStreaks = celebrations.streaks.length > 0;
  const hasMilestones = celebrations.milestonesThisWeek.length > 0;
  const totals = celebrations.classTotals;

  return (
    <section className="mb-2">
      <SectionHeader title="Wins this week" icon={Sparkles} iconColor="text-yellow-500" hint="worth celebrating" />

      <div className="grid gap-2.5 sm:grid-cols-2">
        {/* Streaks (emerald-tinted) */}
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-500/5 p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-[12.5px] font-bold text-foreground">Streaks</p>
          </div>
          {hasStreaks ? (
            <>
              <ul className="space-y-1.5">
                {visibleStreaks.map((s) => (
                  <li key={s.studentId} className="text-[12.5px] leading-snug">
                    <StudentLink id={s.studentId} className="text-foreground/85">
                      <span className="font-semibold text-foreground">{s.name}</span>
                      <span className="text-muted-foreground">
                        {" — "}
                        {s.currentStreak} {s.currentStreak === 1 ? "week" : "weeks"} of perfect attendance
                      </span>
                    </StudentLink>
                  </li>
                ))}
              </ul>
              {celebrations.streaks.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllStreaks((v) => !v)}
                  className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary/80 hover:text-primary"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAllStreaks ? "rotate-180" : ""}`} />
                  {showAllStreaks ? "Show top 3" : `View all (${celebrations.streaks.length})`}
                </button>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">No active streaks yet — a perfect 5-of-5 week starts one.</p>
          )}
        </div>

        {/* Milestones (amber-tinted) — class line totals fold into the prose here.
            This is the ONLY place all-time totals appear, per the spec. */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-500/5 p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <p className="text-[12.5px] font-bold text-foreground">Milestones</p>
          </div>
          <div className="space-y-1.5">
            {hasMilestones ? (
              celebrations.milestonesThisWeek.map((m, i) => (
                <p key={`${m.studentId}-${m.juzNumber}-${i}`} className="text-[12.5px] leading-snug text-foreground/85">
                  <StudentLink id={m.studentId} className="font-semibold text-foreground">
                    {m.name}
                  </StudentLink>
                  <span className="text-muted-foreground"> reached </span>
                  <span className="font-semibold text-foreground">juz {m.juzNumber}</span>
                </p>
              ))
            ) : (
              <p className="text-[12.5px] text-muted-foreground leading-snug">
                No new juz this week — keep going.
              </p>
            )}
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              The class has now memorized{" "}
              <span className="font-semibold text-foreground">{totals.totalLinesMemorized.toLocaleString()} lines</span>
              {" "}across{" "}
              <span className="font-semibold text-foreground">{totals.totalJuzCompleted} juz</span>
              {" "}all-time.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Loading / Error ─────────────────────────────── */

function LoadingState() {
  return (
    <AppLayout title="Class Stats">
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <AppLayout title="Class Stats">
      <div className="max-w-2xl mx-auto py-12">
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Couldn't load class statistics</p>
              <p className="text-sm text-muted-foreground mt-1">{message}</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

/* ── Main ────────────────────────────────────────── */

export default function ClassStats() {
  const { isLoading: authLoading } = useProtectedRoute();
  const statsQ = useGetClassStats();
  const classQ = useGetCurrentClass();

  if (authLoading || statsQ.isPending || classQ.isPending) {
    return <LoadingState />;
  }

  if (statsQ.error) {
    const msg = statsQ.error instanceof Error ? statsQ.error.message : "Unknown error.";
    return <ErrorState message={msg} />;
  }

  const stats = statsQ.data;
  if (!stats) {
    return <ErrorState message="Empty response from server." />;
  }

  const className = classQ.data?.name ?? "Class";

  // Per-student dot grid + pending names for the attendance card. Derived
  // from the roster so we don't need a second API call.
  const perStudentDays = stats.roster.map((r) => r.daysAttended);
  const pendingNames = stats.attention.concern
    .filter((c) => c.flagType === "no_entry")
    .map((c) => c.name);

  return (
    <AppLayout title="Class Stats">
      <div className="mx-auto max-w-4xl pb-12">
        <HeaderVerdict
          className={className}
          weekRange={stats.weekRange}
          sentence={stats.verdict.sentence}
        />
        <NeedsAttention attention={stats.attention} />
        <ClassPulse
          pulse={stats.classPulse}
          pendingNames={pendingNames}
          perStudentDays={perStudentDays}
        />
        <RosterSection roster={stats.roster} />
        <Celebrations celebrations={stats.celebrations} />
      </div>
    </AppLayout>
  );
}
