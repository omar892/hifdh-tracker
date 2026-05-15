import { useParams, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import {
  useGetStudent,
  useGetStudentStats,
  useGetStudentProjections,
  useGetStudentCalendar,
} from "@workspace/api-client-react";
import { format, subMonths, addMonths } from "date-fns";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Star,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Flame,
  BookOpen,
  Calendar,
  ArrowLeft,
  Pencil,
  Target,
} from "lucide-react";
import { getGenderAvatarClass, type Gender } from "@/lib/gender-colors";

const RATING_COLORS: Record<string, string> = {
  excellent: "bg-yellow-500",
  strong: "bg-emerald-500",
  steady: "bg-blue-500",
  needs_improvement: "bg-orange-500",
  difficult_week: "bg-red-500",
};

const RATING_LABELS: Record<string, string> = {
  excellent: "Excellent",
  strong: "Strong",
  steady: "Steady",
  needs_improvement: "Needs Work",
  difficult_week: "Difficult",
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "text-primary",
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  accent?: string;
}) {
  return (
    <div className={`bg-card rounded-2xl p-4 border border-border/50 shadow-sm ${accent ?? ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
          color === "text-primary" ? "bg-primary/10" :
          color === "text-emerald-500" ? "bg-emerald-500/10" :
          color === "text-orange-500" ? "bg-orange-500/10" :
          color === "text-yellow-500" ? "bg-yellow-500/10" :
          color === "text-blue-500" ? "bg-blue-500/10" :
          "bg-primary/10"
        }`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-display font-extrabold text-foreground tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5 font-medium">{sub}</div>}
    </div>
  );
}

export default function StudentProfile() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { studentId: studentIdParam } = useParams<{ studentId: string }>();
  const [, setLocation] = useLocation();
  const studentId = parseInt(studentIdParam ?? "0", 10);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const monthStr = format(currentMonth, "yyyy-MM");

  const { data: student, isLoading: studentLoading } = useGetStudent(studentId);
  const { data: stats, isLoading: statsLoading } = useGetStudentStats(studentId);
  const { data: projections } = useGetStudentProjections(studentId);
  const { data: calendar, isLoading: calLoading } = useGetStudentCalendar(studentId, { month: monthStr });

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

  return (
    <AppLayout title={student.name}>
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-semibold text-sm mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>

        {/* Hero */}
        <div className="bg-gradient-to-br from-emerald-500/8 via-emerald-500/3 to-transparent rounded-3xl p-5 mb-6 border border-emerald-500/10">
          <div className="flex items-center gap-3 mb-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${getGenderAvatarClass((student as any).gender as Gender)}`}>
              {student.name.charAt(0).toUpperCase()}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold text-foreground tracking-tight leading-none">{student.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground font-medium mt-1">
            Working on: <span className="text-foreground font-semibold">Page {student.currentPage}, Line {student.currentLine}</span>
          </p>
          {stats && (
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex-1 max-w-xs h-2 bg-primary/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${Math.min(100, stats.totalQuranPercentage)}%` }}
                />
              </div>
              <span className="text-sm font-extrabold text-primary">{stats.totalQuranPercentage}%</span>
            </div>
          )}
          {'completedJuz' in student && (() => {
            const juzArr = (student.completedJuz as number[] | undefined) ?? [];
            const juzCount = juzArr.length;
            return (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Juz Completed</p>
                  <p className="text-[10px] font-extrabold text-primary">{juzCount}/30</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => {
                    const completed = juzArr.includes(juz);
                    return (
                      <div
                        key={juz}
                        className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${
                          completed
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                            : "bg-secondary/60 text-muted-foreground/40"
                        }`}
                      >
                        {juz}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard
              label="Juz Completed"
              value={`${stats.juzCompleted}/30`}
              sub={`${stats.totalLinesMemorized.toLocaleString()} lines`}
              icon={BookOpen}
              color="text-primary"
            />
            <StatCard
              label="Success Rate"
              value={`${stats.overallSuccessRate}%`}
              sub="all time"
              icon={TrendingUp}
              color="text-emerald-500"
            />
            <StatCard
              label="Current Streak"
              value={`${stats.currentStreakWeeks}w`}
              sub="consecutive weeks"
              icon={Flame}
              color="text-orange-500"
            />
            <StatCard
              label="This Month"
              value={stats.linesThisMonth}
              sub="lines"
              icon={Star}
              color="text-yellow-500"
            />
            <StatCard
              label="Last Month"
              value={stats.linesLastMonth}
              sub="lines"
              icon={Calendar}
              color="text-blue-500"
            />
          </div>
        )}

        {/* Projections */}
        {projections && projections.paceRecent > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-primary" />
              </div>
              <h2 className="font-display font-bold text-lg text-foreground tracking-tight">Projections</h2>
              {projections.trend === "improving" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="w-3 h-3" /> Improving
                </span>
              )}
              {projections.trend === "declining" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/10 text-red-600 dark:text-red-400">
                  <TrendingDown className="w-3 h-3" /> Declining
                </span>
              )}
              {projections.trend === "stable" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <ArrowRight className="w-3 h-3" /> Stable
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 mb-3">
              <div className="bg-card rounded-2xl p-3.5 border border-border/50 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Pace</span>
                </div>
                <div className="text-xl font-display font-extrabold text-foreground tracking-tight">{projections.paceRecent}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">lines/week</div>
                {projections.paceAllTime > 0 && (
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    <span className={`font-extrabold ${
                      projections.paceRecent > projections.paceAllTime ? "text-emerald-500" : projections.paceRecent < projections.paceAllTime ? "text-red-500" : "text-muted-foreground"
                    }`}>
                      {projections.paceRecent > projections.paceAllTime ? "\u2191" : projections.paceRecent < projections.paceAllTime ? "\u2193" : "="} vs {projections.paceAllTime} avg
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-card rounded-2xl p-3.5 border border-border/50 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Half</span>
                </div>
                {projections.linesRemaining6Month === 0 ? (
                  <div className="text-xl font-display font-extrabold text-emerald-600 dark:text-emerald-400">Done!</div>
                ) : projections.projectedDate6Month ? (
                  <>
                    <div className="text-xl font-display font-extrabold text-foreground tracking-tight">
                      {new Date(projections.projectedDate6Month + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">~{projections.weeksTo6MonthGoal}w away</div>
                  </>
                ) : (
                  <div className="text-lg font-bold text-muted-foreground">\u2014</div>
                )}
              </div>

              <div className="bg-card rounded-2xl p-3.5 border border-border/50 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Star className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Full</span>
                </div>
                {projections.linesRemainingFull === 0 ? (
                  <div className="text-xl font-display font-extrabold text-emerald-600 dark:text-emerald-400">Done!</div>
                ) : projections.projectedDateFull ? (
                  <>
                    <div className="text-xl font-display font-extrabold text-foreground tracking-tight">
                      {new Date(projections.projectedDateFull + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">~{projections.weeksToFullQuran}w away</div>
                  </>
                ) : (
                  <div className="text-lg font-bold text-muted-foreground">\u2014</div>
                )}
              </div>
            </div>

            {/* Consistency bar */}
            <div className="bg-card rounded-2xl p-3.5 border border-border/50 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">Consistency</span>
                <span className={`text-sm font-extrabold ${
                  projections.consistencyScore >= 85 ? "text-emerald-600 dark:text-emerald-400"
                    : projections.consistencyScore >= 70 ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                }`}>
                  {projections.consistencyScore}%
                </span>
              </div>
              <div className="h-1.5 bg-primary/8 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    projections.consistencyScore >= 85 ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                      : projections.consistencyScore >= 70 ? "bg-gradient-to-r from-amber-600 to-amber-400"
                      : "bg-gradient-to-r from-red-600 to-red-400"
                  }`}
                  style={{ width: `${Math.min(100, projections.consistencyScore)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Weekly History */}
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-bold text-lg text-foreground flex items-center gap-2 tracking-tight">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5 text-primary" />
              </div>
              Weekly History
            </h2>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous month"
                onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-sm text-foreground min-w-[110px] text-center tracking-tight">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <button
                aria-label="Next month"
                onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {calLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : calendar?.weeks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No weeks in this month.</p>
          ) : (
            <div className="space-y-2">
              {calendar?.weeks.map((week) => {
                const start = new Date(week.weekStartDate + "T00:00:00Z");
                const end = new Date(week.weekEndDate + "T00:00:00Z");
                const label = `${format(start, "MMM d")} \u2013 ${format(end, "MMM d")}`;

                return (
                  <button
                    key={week.weekStartDate}
                    type="button"
                    onClick={() => setLocation(`/log-week/0?sid=${studentId}&week=${week.weekStartDate}`)}
                    className={`w-full flex items-center gap-3 py-3 px-3.5 rounded-xl border transition-all cursor-pointer text-left group ${
                      week.hasEntry
                        ? "border-border/40 bg-card hover:shadow-md hover:border-primary/20"
                        : "border-dashed border-border/30 bg-secondary/20 hover:border-primary/20 hover:bg-secondary/40"
                    }`}
                  >
                    <div className="w-20 shrink-0">
                      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
                    </div>

                    {week.hasEntry ? (
                      <>
                        <div className={`w-3 h-3 rounded-full shrink-0 ring-3 ${
                          RATING_COLORS[week.weekRating ?? ""] ?? "bg-border"
                        } ${
                          week.weekRating === "excellent" ? "ring-yellow-500/15"
                            : week.weekRating === "strong" ? "ring-emerald-500/15"
                            : week.weekRating === "steady" ? "ring-blue-500/15"
                            : week.weekRating === "needs_improvement" ? "ring-orange-500/15"
                            : week.weekRating === "difficult_week" ? "ring-red-500/15"
                            : "ring-transparent"
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-xs font-bold text-foreground">
                              {RATING_LABELS[week.weekRating ?? ""] ?? week.weekRating}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {week.successfulDays}/{week.daysAttended} days
                            </span>
                            <span className="text-[10px] font-bold text-primary">
                              {week.linesMemorized} lines
                            </span>
                            {week.weeklyPoints != null && (
                              <span className={`text-[10px] font-extrabold ${
                                week.weeklyPoints >= (week.daysAttended ?? 5) * 3 * 0.87 ? "text-emerald-600 dark:text-emerald-400"
                                : week.weeklyPoints >= (week.daysAttended ?? 5) * 3 * 0.67 ? "text-yellow-600 dark:text-yellow-400"
                                : "text-red-500"
                              }`}>
                                {week.weeklyPoints}/{(week.daysAttended ?? 5) * 3}pts
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          {Array.from({ length: 5 }, (_, i) => (
                            <div
                              key={i}
                              className={`w-2.5 h-2.5 rounded-sm ${
                                i < (week.successfulDays ?? 0)
                                  ? "bg-emerald-500 dark:bg-emerald-400"
                                  : i < (week.daysAttended ?? 0)
                                  ? "bg-red-400 dark:bg-red-500"
                                  : "bg-secondary"
                              }`}
                            />
                          ))}
                        </div>
                        <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground font-medium group-hover:text-primary transition-colors">
                        Log this week \u2192
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {calendar && calendar.weeks.some((w) => w.hasEntry) && (
            <div className="mt-5 pt-5 border-t border-border/30 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-display font-extrabold text-foreground tracking-tight">{calendar.totalLines}</div>
                <div className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Lines</div>
              </div>
              <div>
                <div className="text-xl font-display font-extrabold text-foreground tracking-tight">{calendar.avgSuccessfulDays}</div>
                <div className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Avg days</div>
              </div>
              <div>
                <div className="text-xl font-display font-extrabold text-foreground tracking-tight">{calendar.excellentWeeks}</div>
                <div className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Excellent</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
