import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import { useGetClassStats, useGetDashboard } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Award,
  Users,
  TrendingUp,
  BookOpen,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Snowflake,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  ClipboardCheck,
  ChevronDown,
  Sparkles,
  AlertCircle,
  Check,
} from "lucide-react";
import { getGenderDotClass, type Gender } from "@/lib/gender-colors";

/* ── Helpers ──────────────────────────────────────── */

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

// framer-motion entrance animations were not completing reliably in our
// preview environment, leaving sections stuck at opacity:0. Decorative
// fade-in removed; sections render in their final state immediately.
function Section({ children }: { children: React.ReactNode; delay?: number }) {
  return <div>{children}</div>;
}

function StatCard({
  label,
  scope,
  value,
  sub,
  secondary,
  icon: Icon,
  color = "text-primary",
}: {
  label: string;
  /** Time window the headline value covers — e.g. "Last 4 weeks", "All-time" */
  scope?: string;
  value: string | number;
  sub?: string;
  /** Optional smaller value below for the alternate time window */
  secondary?: { label: string; value: string | number };
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-4xl font-display font-bold text-foreground">{value}</div>
      {scope && <div className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mt-0.5">{scope}</div>}
      {sub && <div className="text-sm text-muted-foreground mt-1">{sub}</div>}
      {secondary && (
        <div className="text-xs text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
          <span className="font-bold text-foreground/70">{secondary.value}</span>{" "}
          <span>{secondary.label}</span>
        </div>
      )}
    </div>
  );
}

const RATING_META: Record<string, { label: string; color: string; bar: string }> = {
  excellent: { label: "Excellent", color: "text-yellow-600 dark:text-yellow-400", bar: "bg-yellow-500" },
  strong: { label: "Strong", color: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  steady: { label: "Steady", color: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
  needs_improvement: { label: "Needs Work", color: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500" },
  difficult_week: { label: "Difficult", color: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
};

/* ── Main Component ───────────────────────────────── */

export default function ClassStats() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: stats, isLoading: statsLoading } = useGetClassStats();
  const { data: dashboard = [], isLoading: dashLoading } = useGetDashboard();
  const [showAllRankings, setShowAllRankings] = useState(false);
  const [showStreaks, setShowStreaks] = useState(false);

  const isLoading = authLoading || statsLoading || dashLoading;

  if (isLoading) {
    return (
      <AppLayout title="Class Stats">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  // ── Derived data ──
  const doneCount = dashboard.filter((s) => s.thisWeekDone).length;
  const totalStudents = dashboard.length;
  const loggedPct = totalStudents > 0 ? Math.round((doneCount / totalStudents) * 100) : 0;

  // Progress bar normalization: scale so max student fills ~80%
  const maxTotalLines = Math.max(...(stats?.studentProgress?.map((s) => s.totalLines) ?? [1]), 1);

  // Monthly comparison
  const monthDelta = (stats?.linesThisMonth ?? 0) - (stats?.linesLastMonth ?? 0);
  const monthUp = monthDelta >= 0;
  const perStudentUp = (stats?.avgLinesPerStudentThisMonth ?? 0) >= (stats?.avgLinesPerStudentLastMonth ?? 0);

  // Rankings to show
  const rankingsToShow = showAllRankings
    ? (stats?.studentRankings ?? [])
    : (stats?.studentRankings ?? []).slice(0, 3);

  return (
    <AppLayout title="Class Stats">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-widest text-primary uppercase mb-1">Overview</p>
          <h1 className="font-display text-4xl font-bold text-foreground">Class Statistics</h1>
        </div>

        {/* ── Stat Cards ── */}
        <Section delay={0.05}><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Active Students"
            value={stats?.totalStudents ?? 0}
            sub="enrolled"
            icon={Users}
            color="text-primary"
          />
          <StatCard
            label="Success Rate"
            scope="Last 4 weeks"
            value={`${stats?.averageSuccessRate4Weeks ?? 0}%`}
            sub="days successful"
            secondary={{ value: `${stats?.averageSuccessRate ?? 0}%`, label: "all-time" }}
            icon={TrendingUp}
            color="text-emerald-500"
          />
          <StatCard
            label="Lines Memorized"
            scope="All-time"
            value={(stats?.totalLinesMemorized ?? 0).toLocaleString()}
            sub="across the class"
            icon={BookOpen}
            color="text-blue-500"
          />
          <StatCard
            label="Lines / Week"
            scope="Last 4 weeks"
            value={stats?.avgLinesPerWeek4Weeks ?? 0}
            sub="per student"
            secondary={{ value: stats?.avgLinesPerWeek ?? 0, label: "all-time" }}
            icon={BarChart3}
            color="text-purple-500"
          />
        </div></Section>

        {/* ── Weekly Trends Charts ── */}
        {(stats?.weeklyTrends?.length ?? 0) > 0 && (() => {
          const trends = stats!.weeklyTrends;
          const chartData = trends.map((t) => {
            const d = new Date(t.weekStart + "T00:00:00Z");
            return {
              ...t,
              label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
            };
          });

          const latestSuccess = trends[trends.length - 1]?.avgSuccessRate ?? 0;
          const latestLines = trends[trends.length - 1]?.totalLines ?? 0;
          const latestRating = trends[trends.length - 1]?.avgRating ?? 0;

          const successValues = trends.map((t) => t.avgSuccessRate);
          const ratingValues = trends.map((t) => t.avgRating);
          const linesValues = trends.map((t) => t.totalLines);

          const isFlat = (vals: number[]) => vals.length > 0 && vals.every((v) => v === vals[0]);
          const successFlat = isFlat(successValues);
          const ratingFlat = isFlat(ratingValues);
          const linesFlat = isFlat(linesValues);

          const maxLines = Math.max(...linesValues, 1);
          const linesCeil = Math.ceil(maxLines * 1.2);

          const gridStroke = "rgba(128,128,128,0.08)";
          const axisTickStyle = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

          const CustomTooltip = ({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; unit: string }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-popover border border-border rounded-lg px-3 py-1.5 shadow-lg text-xs">
                <p className="text-muted-foreground font-medium">{label}</p>
                <p className="font-bold text-foreground">{payload[0].value}{unit}</p>
              </div>
            );
          };

          return (
            <Section delay={0.15}>
            <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 mb-6">
              <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
                <TrendingUp className="w-5 h-5 text-primary" /> Class Trends (Last 8 Weeks)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Success Rate — Area Chart, 0–100% fixed */}
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Success Rate</p>
                  <div className="h-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal vertical={false} />
                        <XAxis dataKey="label" tick={axisTickStyle} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTickStyle} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                        <Tooltip content={<CustomTooltip unit="%" />} />
                        <defs>
                          <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="avgSuccessRate"
                          stroke="hsl(142, 76%, 36%)"
                          strokeWidth={2}
                          fill="url(#successGrad)"
                          dot={{ r: 3, fill: "hsl(142, 76%, 36%)", strokeWidth: 0 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">This week</p>
                    <p className="text-base font-bold text-foreground">{latestSuccess}%</p>
                    {successFlat && <p className="text-[10px] text-muted-foreground font-medium">· consistent</p>}
                  </div>
                </div>

                {/* Lines / Week — Bar Chart, 0 to max+20% */}
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Lines / Week</p>
                  <div className="h-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 16, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal vertical={false} />
                        <XAxis dataKey="label" tick={axisTickStyle} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, linesCeil]} tick={axisTickStyle} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip unit=" lines" />} />
                        <Bar
                          dataKey="totalLines"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                          label={{ position: "top", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        >
                          {chartData.map((_, idx) => (
                            <Cell
                              key={idx}
                              fill={idx === chartData.length - 1 ? "hsl(142, 76%, 36%)" : "hsl(142, 76%, 36%, 0.5)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">This week</p>
                    <p className="text-base font-bold text-foreground">{latestLines}</p>
                    {linesFlat && <p className="text-[10px] text-muted-foreground font-medium">· consistent</p>}
                  </div>
                </div>

                {/* Avg Rating — Area Chart, 1–10 fixed */}
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Avg Rating</p>
                  <div className="h-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal vertical={false} />
                        <XAxis dataKey="label" tick={axisTickStyle} axisLine={false} tickLine={false} />
                        <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={axisTickStyle} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip unit="" />} />
                        <defs>
                          <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="avgRating"
                          stroke="hsl(38, 92%, 50%)"
                          strokeWidth={2}
                          fill="url(#ratingGrad)"
                          dot={{ r: 3, fill: "hsl(38, 92%, 50%)", strokeWidth: 0 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">This week</p>
                    <p className="text-base font-bold text-foreground">{latestRating}</p>
                    {ratingFlat && <p className="text-[10px] text-muted-foreground font-medium">· consistent</p>}
                  </div>
                </div>
              </div>
            </div>
            </Section>
          );
        })()}

        {/* ── Weekly Logging Status ── */}
        <Section delay={0.2}>
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 mb-6">
          <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-5 h-5 text-primary" /> Weekly Logging Status
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${loggedPct}%` }}
              />
            </div>
            <span className="text-sm font-bold text-foreground whitespace-nowrap">
              {doneCount} of {totalStudents}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {dashboard.map((s) => (
              <StudentLink key={s.id} id={s.id}>
                <div
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                    s.thisWeekDone
                      ? "bg-emerald-500/10 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                      : "bg-secondary/50 border-border/50 text-muted-foreground"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${getGenderDotClass(s.gender as Gender)}`} />
                  {s.thisWeekDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate" title={s.name}>{s.name.split(" ")[0]}</span>
                </div>
              </StudentLink>
            ))}
          </div>
        </div>
        </Section>

        {/* ── Class Progress (contextual bars) ── */}
        <Section delay={0.25}>
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 mb-6">
          <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
            <BookOpen className="w-5 h-5 text-primary" /> Class Progress
          </h2>
          <div className="space-y-3">
            {(stats?.studentProgress ?? []).map((s) => {
              const barPct = maxTotalLines > 0 ? Math.max((s.totalLines / maxTotalLines) * 80, 2) : 2;
              const barColor = s.totalLines > maxTotalLines * 0.5
                ? "bg-emerald-500"
                : s.totalLines > maxTotalLines * 0.2
                ? "bg-blue-500"
                : "bg-zinc-400 dark:bg-zinc-600";
              return (
                <StudentLink key={s.studentId} id={s.studentId}>
                  <div className="flex items-center gap-3">
                    <span className="w-28 sm:w-36 text-sm font-semibold text-foreground truncate shrink-0">{s.name}</span>
                    <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="text-right shrink-0 w-28">
                      <span className="text-xs font-bold text-foreground">{s.totalJuz} juz</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{s.weeklyPace}/wk</span>
                    </div>
                  </div>
                </StudentLink>
              );
            })}
            {(stats?.studentProgress ?? []).length === 0 && (
              <p className="text-muted-foreground italic">No students yet.</p>
            )}
          </div>
        </div>
        </Section>

        {/* ── Student Rankings + Needs Attention ── */}
        <Section delay={0.3}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Student Rankings (composite score) */}
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
              <Award className="w-5 h-5 text-yellow-500" /> Student Rankings
            </h2>
            {rankingsToShow.length === 0 ? (
              <p className="text-muted-foreground italic">No data yet.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {rankingsToShow.map((s, i) => (
                    <StudentLink key={s.studentId} id={s.studentId}>
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                            i === 0
                              ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                              : i === 1
                              ? "bg-zinc-400/20 text-zinc-600 dark:text-zinc-400"
                              : i === 2
                              ? "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{s.name}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-lg text-foreground">{s.compositeScore}</div>
                          <div className="text-[10px] text-muted-foreground">/ 100</div>
                        </div>
                      </div>
                    </StudentLink>
                  ))}
                </div>
                {(stats?.studentRankings?.length ?? 0) > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllRankings(!showAllRankings)}
                    className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary/70 hover:text-primary transition-colors"
                  >
                    <ChevronDown className={`w-3 h-3 transition-transform ${showAllRankings ? "rotate-180" : ""}`} />
                    {showAllRankings ? "Show top 3" : "View all rankings"}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Needs Attention (intelligent flags — genuine concerns only) */}
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
              <AlertTriangle className="w-5 h-5 text-orange-500" /> Needs Attention
            </h2>
            {(stats?.attentionFlags ?? []).length === 0 ? (
              <div>
                <p className="text-muted-foreground italic">No concerns to flag.</p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Checking success rate, ratings, and attendance over the last 2 weeks. Students who haven&apos;t logged this week are shown separately.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {stats!.attentionFlags.map((s) => (
                  <StudentLink key={s.studentId} id={s.studentId}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{s.name}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {s.flags.map((f, fi) => (
                            <span
                              key={fi}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400"
                            >
                              {f.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </StudentLink>
                ))}
              </div>
            )}

            {/* Not Yet Logged — separate from concerns. Calm Mon-Wed,
                gentle Thu, escalates Fri+. Collapses to class-level when all unlogged. */}
            {(stats?.notYetLogged?.length ?? 0) > 0 && stats?.classWeekStatus && (() => {
              const cws = stats.classWeekStatus;
              const phase = cws.weekPhase;
              const allUnlogged = cws.allUnlogged;
              const tone = phase === "late" ? "amber" : phase === "mid" ? "muted-strong" : "muted";
              const wrapClass =
                tone === "amber"
                  ? "border-amber-200 dark:border-amber-800/50 bg-amber-500/5"
                  : "border-border/50 bg-muted/30";
              const labelClass =
                tone === "amber"
                  ? "text-amber-700 dark:text-amber-300"
                  : tone === "muted-strong"
                  ? "text-foreground"
                  : "text-muted-foreground";
              return (
                <div className={`mt-5 pt-5 border-t border-border/30`}>
                  <div className={`rounded-xl border p-3 ${wrapClass}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider ${labelClass}`}>
                      {allUnlogged ? "No entries yet this week" : "Not yet logged this week"}
                    </p>
                    {allUnlogged ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        {cws.unloggedCount} of {cws.totalStudents} students. {phase === "late" ? "It's late in the week — log entries today." : phase === "mid" ? "Friday is tomorrow." : "Normal early-week state."}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {stats.notYetLogged.map((s) => (
                          <StudentLink key={s.studentId} id={s.studentId}>
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-background border border-border/50 text-foreground hover:border-primary/50">
                              {s.name}
                            </span>
                          </StudentLink>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        </Section>

        {/* ── Student Spotlight & Monthly Comparison ── */}
        <Section delay={0.35}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Student Spotlight (replaces Streak Leaderboard) */}
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
              <Sparkles className="w-5 h-5 text-yellow-500" /> Student Spotlight
            </h2>
            {(stats?.spotlights ?? []).length === 0 ? (
              <p className="text-muted-foreground italic">Consistent week across the class — no major changes.</p>
            ) : (
              <div className="space-y-3">
                {stats!.spotlights.map((s, i) => (
                  <StudentLink key={`${s.studentId}-${i}`} id={s.studentId}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        s.category === "positive"
                          ? "bg-emerald-500/10"
                          : "bg-amber-500/10"
                      }`}>
                        {s.category === "positive" ? (
                          <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm">{s.name}</p>
                        <p className={`text-xs mt-0.5 ${
                          s.category === "positive"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}>
                          {s.insightText}
                        </p>
                      </div>
                    </div>
                  </StudentLink>
                ))}
              </div>
            )}

            {/* Collapsible streaks */}
            {(stats?.streakLeaderboard ?? []).length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowStreaks(!showStreaks)}
                  className="flex items-center gap-1 text-xs font-semibold text-primary/70 hover:text-primary transition-colors"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showStreaks ? "rotate-180" : ""}`} />
                  {showStreaks ? "Hide streaks" : "View all streaks"}
                </button>
                {showStreaks && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <div className="flex items-center gap-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <span className="flex-1">Student</span>
                      <span className="w-16 text-center">Current</span>
                      <span className="w-16 text-center">Best (12wk)</span>
                    </div>
                    <div className="space-y-2">
                      {stats!.streakLeaderboard.map((s) => {
                        const stale = (s.weeksSinceLastEntry ?? 0) > 2;
                        return (
                        <StudentLink key={s.studentId} id={s.studentId}>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground text-sm truncate">{s.name}</p>
                              {stale && (
                                <p className="text-[10px] text-muted-foreground/80 font-medium">
                                  Paused &middot; last logged {s.weeksSinceLastEntry}w ago
                                </p>
                              )}
                            </div>
                            <div className="w-16 text-center">
                              <span className={`text-sm font-bold whitespace-nowrap ${
                                stale
                                  ? "text-muted-foreground"
                                  : s.currentStreak >= 3
                                  ? "text-orange-600 dark:text-orange-400"
                                  : s.currentStreak === 0
                                  ? "text-muted-foreground"
                                  : "text-foreground"
                              }`}>
                                {stale ? (
                                  <Snowflake className="w-4 h-4 inline text-muted-foreground/60" />
                                ) : s.currentStreak === 0 ? (
                                  <Snowflake className="w-4 h-4 inline text-blue-400" />
                                ) : s.currentStreak >= 3 ? (
                                  <>{"\uD83D\uDD25"} {s.currentStreak}</>
                                ) : (
                                  s.currentStreak
                                )}
                              </span>
                            </div>
                            <div className="w-16 text-center">
                              <span className="text-sm font-bold text-muted-foreground">
                                {s.best12WeekStreak}
                              </span>
                            </div>
                          </div>
                        </StudentLink>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Monthly Comparison (enhanced with decomposition) */}
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
              <Calendar className="w-5 h-5 text-blue-500" /> Monthly Comparison
            </h2>

            {/* Total lines row */}
            <div className="flex items-end gap-6 mb-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">This Month</p>
                <p className="text-4xl font-display font-bold text-foreground">{stats?.linesThisMonth ?? 0}</p>
                <p className="text-sm text-muted-foreground">lines</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Last Month</p>
                <p className="text-4xl font-display font-bold text-muted-foreground">{stats?.linesLastMonth ?? 0}</p>
                <p className="text-sm text-muted-foreground">lines</p>
              </div>
            </div>
            {((stats?.linesThisMonth ?? 0) > 0 || (stats?.linesLastMonth ?? 0) > 0) && (
              <div className={`flex items-center gap-1.5 text-sm font-bold ${monthUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {monthUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {monthUp ? "+" : ""}{monthDelta} lines
              </div>
            )}

            {/* Per-student average row */}
            <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg / Student</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{stats?.avgLinesPerStudentThisMonth ?? 0}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="text-sm font-bold text-muted-foreground">{stats?.avgLinesPerStudentLastMonth ?? 0}</span>
                  {((stats?.avgLinesPerStudentThisMonth ?? 0) > 0 || (stats?.avgLinesPerStudentLastMonth ?? 0) > 0) && (
                    perStudentUp
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                      : <ArrowDownRight className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Students</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{stats?.activeStudentsThisMonth ?? 0}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="text-sm font-bold text-muted-foreground">{stats?.activeStudentsLastMonth ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Decomposition: School days + lines/day */}
            {stats?.monthlyDecomposition && (
              <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">School Days</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{stats.monthlyDecomposition.schoolDaysThisMonth}</span>
                    <span className="text-xs text-muted-foreground">vs</span>
                    <span className="text-sm font-bold text-muted-foreground">{stats.monthlyDecomposition.schoolDaysLastMonth}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lines / School Day</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{stats.monthlyDecomposition.linesPerSchoolDayThisMonth}</span>
                    <span className="text-xs text-muted-foreground">vs</span>
                    <span className="text-sm font-bold text-muted-foreground">{stats.monthlyDecomposition.linesPerSchoolDayLastMonth}</span>
                    {stats.monthlyDecomposition.linesPerSchoolDayThisMonth >= stats.monthlyDecomposition.linesPerSchoolDayLastMonth
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                      : <ArrowDownRight className="w-3.5 h-3.5 text-zinc-400" />
                    }
                  </div>
                </div>
                {stats.monthlyDecomposition.biggestContributors.length > 0 && (
                  <div className="mt-2 pt-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Biggest Contributors</p>
                    <div className="space-y-1">
                      {stats.monthlyDecomposition.biggestContributors.map((c) => (
                        <StudentLink key={c.studentId} id={c.studentId}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">{c.name}</span>
                            <span className={`text-sm font-bold ${
                              c.linesDelta >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}>
                              {c.linesDelta >= 0 ? "+" : ""}{c.linesDelta}
                            </span>
                          </div>
                        </StudentLink>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </Section>

        {/* ── Rating Distribution & Attendance/Summary ── */}
        <Section delay={0.4}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Rating Distribution (week-over-week) */}
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
              <BarChart3 className="w-5 h-5 text-purple-500" /> Rating Distribution
            </h2>
            <p className="text-xs text-muted-foreground mb-4">This week vs last week</p>
            {(() => {
              const distributions = stats?.ratingDistributions ?? [];
              const thisWeekDist = distributions[0];
              const lastWeekDist = distributions[1];
              const fourWeeksAgoDist = distributions[4];

              if (!thisWeekDist) return <p className="text-muted-foreground italic">No rated entries yet.</p>;

              const thisWeekCounts = thisWeekDist.counts;
              const totalRated = Object.values(thisWeekCounts).reduce((s, v) => s + v, 0);

              if (totalRated === 0) return <p className="text-muted-foreground italic">No rated entries yet.</p>;

              return (
                <div>
                  <div className="space-y-3">
                    {Object.entries(RATING_META).map(([key, meta]) => {
                      const count = thisWeekCounts[key as keyof typeof thisWeekCounts] ?? 0;
                      const lastCount = lastWeekDist?.counts?.[key as keyof typeof thisWeekCounts] ?? 0;
                      const delta = count - lastCount;
                      const pct = Math.round((count / totalRated) * 100);
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className={`text-sm font-semibold w-24 shrink-0 ${meta.color}`}>{meta.label}</span>
                          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${meta.bar}`}
                              style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-muted-foreground w-6 text-right">{count}</span>
                          <span className={`text-[10px] font-bold w-8 text-right ${
                            delta > 0 ? "text-emerald-600 dark:text-emerald-400"
                              : delta < 0 ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                          }`}>
                            {delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {fourWeeksAgoDist && (
                    <p className="text-[10px] text-muted-foreground mt-4 pt-3 border-t border-border/30">
                      4 weeks ago: {Object.entries(RATING_META).map(([key, meta]) => {
                        const c = fourWeeksAgoDist.counts[key as keyof typeof thisWeekCounts] ?? 0;
                        return c > 0 ? `${meta.label} ${c}` : null;
                      }).filter(Boolean).join(" · ") || "No data"}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Attendance / This Week Summary (conditional) */}
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            {(() => {
              let totalAttended = 0;
              let entryCount = 0;
              for (const s of dashboard) {
                if (s.thisWeekEntry) {
                  totalAttended += s.thisWeekEntry.daysAttended;
                  entryCount++;
                }
              }
              if (entryCount === 0) {
                return (
                  <>
                    <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
                      <Users className="w-5 h-5 text-primary" /> Attendance
                    </h2>
                    <p className="text-muted-foreground italic">No entries yet.</p>
                  </>
                );
              }

              const attendancePct = Math.round((totalAttended / (entryCount * 5)) * 100);

              // High attendance: compact bar + This Week Summary
              if (attendancePct >= 95) {
                const summary = stats?.thisWeekSummary;
                return (
                  <>
                    <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
                      <BarChart3 className="w-5 h-5 text-primary" /> This Week Summary
                    </h2>
                    {/* Compact attendance indicator */}
                    <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800">
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Attendance: {attendancePct}%</span>
                    </div>
                    {summary ? (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-display font-bold text-foreground">{summary.totalClassLines}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Class Lines</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-display font-bold text-foreground">{summary.avgLinesPerStudent}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Avg / Student</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-display font-bold text-foreground">{summary.bestWeekLinesThisMonth}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Best Week</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic">No summary data.</p>
                    )}
                  </>
                );
              }

              // Low attendance: full card + absent students
              const attendanceColor = attendancePct >= 80 ? "text-emerald-600 dark:text-emerald-400" : attendancePct >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
              return (
                <>
                  <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
                    <Users className="w-5 h-5 text-primary" /> Attendance Rate
                  </h2>
                  <div className="flex flex-col items-center py-2">
                    <div className={`text-5xl font-display font-bold ${attendanceColor}`}>
                      {attendancePct}%
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      avg {(totalAttended / entryCount).toFixed(1)} of 5 days
                    </p>
                    <div className="w-full mt-3 h-3 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          attendancePct >= 80 ? "bg-emerald-500"
                          : attendancePct >= 60 ? "bg-yellow-500"
                          : "bg-red-500"
                        }`}
                        style={{ width: `${attendancePct}%` }}
                      />
                    </div>
                  </div>
                  {(stats?.absentStudents ?? []).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border/30">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Students Below 5 Days</p>
                      <div className="space-y-1.5">
                        {stats!.absentStudents.map((s) => (
                          <StudentLink key={s.studentId} id={s.studentId}>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-foreground">{s.name}</span>
                              <span className={`text-xs font-bold ${
                                s.daysAttended < 4 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                              }`}>
                                {s.daysAttended}/5 days
                              </span>
                            </div>
                          </StudentLink>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        </Section>
      </div>
    </AppLayout>
  );
}
