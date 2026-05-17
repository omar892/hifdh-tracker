import { useProtectedRoute } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetDashboard } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { format, startOfWeek, addDays, getDay } from "date-fns";
import { CheckCircle2, Clock, BookOpen, Play, Pencil, AlertCircle } from "lucide-react";
import { TOTAL_PAGES, getLinesForCompletedJuz, TOTAL_LINES } from "@/lib/quran-utils";
import { getGenderAvatarClass, getGenderBorderClass, type Gender } from "@/lib/gender-colors";

/** Mon-Wed = early (normal to be unlogged), Thu = mid, Fri+ = late (alarm). */
function getWeekPhase(): "early" | "mid" | "late" {
  const d = getDay(new Date()); // 0=Sun
  if (d === 0 || d >= 5) return "late";
  if (d === 4) return "mid";
  return "early";
}

function WeekDots() {
  const now = new Date();
  const day = getDay(now); // 0=Sun, 1=Mon, ...
  const labels = ["M", "T", "W", "T", "F"];
  return (
    <div className="flex items-center gap-1">
      {labels.map((label, i) => {
        const dayIndex = i + 1;
        const isToday = day === dayIndex;
        const isPast = day > dayIndex || day === 0;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isToday
                  ? "bg-primary ring-2 ring-primary/25 ring-offset-1 ring-offset-background"
                  : isPast
                  ? "bg-primary/50"
                  : "bg-border"
              }`}
            />
            <span className={`text-[7px] font-bold ${isToday ? "text-primary" : "text-muted-foreground/50"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: students, isLoading: dataLoading } = useGetDashboard();
  const [, setLocation] = useLocation();

  if (authLoading || dataLoading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 4);
  const weekRange = `${format(weekStart, "MMM d")} \u2013 ${format(weekEnd, "MMM d")}`;

  const doneCount = students?.filter((s) => s.thisWeekDone).length ?? 0;
  const totalCount = students?.length ?? 0;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const weekPhase = getWeekPhase();
  const allUnlogged = totalCount > 0 && doneCount === 0;

  return (
    <AppLayout title="Dashboard">
      {/* Hero header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2">
          <p className="text-[11px] font-extrabold tracking-widest text-primary uppercase">{weekRange}</p>
          <WeekDots />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-extrabold text-foreground tracking-tight leading-none">
          Student Overview
        </h1>
        {totalCount > 0 && (
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 max-w-[200px] h-1.5 bg-primary/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground font-semibold">
              <span className="text-foreground font-bold">{doneCount}</span>/{totalCount} logged
            </p>
          </div>
        )}
      </div>

      {/* CTA */}
      {totalCount > 0 && (
        <div className="mb-8">
          {doneCount === totalCount ? (
            <div className="flex items-center gap-3 px-5 py-3.5 bg-emerald-500/8 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">All {totalCount} students logged!</p>
                <Link href="/log-week/0" className="text-xs font-semibold text-emerald-600/70 dark:text-emerald-400/70 hover:underline">
                  Edit entries
                </Link>
              </div>
            </div>
          ) : (
            <Link href="/log-week/0">
              <button className="w-full md:w-auto flex items-center justify-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-2xl font-bold text-base shadow-lg shadow-emerald-600/25 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all">
                <Play className="w-4 h-4" />
                Log This Week
              </button>
            </Link>
          )}
        </div>
      )}

      {/* Class-level banner when everyone's unlogged. Tone depends on week phase. */}
      {allUnlogged && (
        <div
          className={`mb-6 flex items-start gap-3 p-4 rounded-2xl border ${
            weekPhase === "late"
              ? "bg-amber-500/5 border-amber-200 dark:border-amber-800/50"
              : weekPhase === "mid"
              ? "bg-muted/40 border-border"
              : "bg-muted/30 border-border/50"
          }`}
        >
          {weekPhase === "late" ? (
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`text-sm font-bold ${
              weekPhase === "late" ? "text-amber-700 dark:text-amber-300" : "text-foreground"
            }`}>
              No entries yet for {weekRange}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {weekPhase === "late"
                ? "It’s late in the week — log entries today."
                : weekPhase === "mid"
                ? "Friday is tomorrow."
                : "Normal early-week state. No need to log yet."}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 ? (
        <div className="text-center p-12 bg-card rounded-3xl border border-border/50">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-display font-bold text-foreground mb-1">Ready to start tracking!</h3>
          <p className="text-sm text-muted-foreground mb-6">Add your first student to begin.</p>
          <Link href="/manage" className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm shadow-md inline-block">
            Add Students
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {students?.map((student) => {
            const juzCount = student.completedJuz?.length ?? 0;
            const juzPct = Math.round((juzCount / 30) * 100);

            return (
              <div key={student.id}>
                {/* Card uses a clickable div, not <Link>, so the inner
                    "Log this week" <Link> isn't an invalid nested <a>. */}
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => setLocation(`/students/${student.id}/profile`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLocation(`/students/${student.id}/profile`);
                    }
                  }}
                  className="block group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
                >
                  <div className={`bg-card rounded-2xl p-4 border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col relative overflow-hidden ${getGenderBorderClass(student.gender as Gender)} ${
                    student.thisWeekDone
                      ? "border-emerald-300/60 dark:border-emerald-700/40"
                      : "border-border/50"
                  }`}>
                    {student.thisWeekDone && (
                      <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-8 -mt-8 bg-emerald-500/8 pointer-events-none" />
                    )}

                    <div className="flex justify-between items-start mb-3 relative z-10">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getGenderAvatarClass(student.gender as Gender)}`}>
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <h3 className="font-display font-bold text-lg text-foreground leading-tight tracking-tight truncate">{student.name}</h3>
                      </div>
                      {student.thisWeekDone ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-extrabold shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          Done
                        </span>
                      ) : weekPhase === "early" ? (
                        // Mon–Wed: not having logged yet is normal. Stay silent — no badge.
                        null
                      ) : weekPhase === "mid" ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-[10px] font-bold shrink-0">
                          <Clock className="w-3 h-3" />
                          Not yet
                        </span>
                      ) : (
                        // Fri+: real signal
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-full text-[10px] font-extrabold shrink-0">
                          <AlertCircle className="w-3 h-3" />
                          Missing
                        </span>
                      )}
                    </div>

                    <div className="mt-auto relative z-10 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground font-semibold">{juzCount}/30 juz</p>
                        <p className="text-[10px] text-muted-foreground font-bold">{juzPct}%</p>
                      </div>
                      <div className="h-1.5 bg-primary/8 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(juzPct, juzCount > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      {student.thisWeekDone && student.thisWeekEntry && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-0.5">
                          {student.thisWeekEntry.memorizationLines} lines &middot; {student.thisWeekEntry.successfulDays}/{student.thisWeekEntry.daysAttended} days
                        </p>
                      )}
                    </div>

                    <div className="mt-3 relative z-10">
                      <Link
                        href={`/log-week/0?sid=${student.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold transition-all ${
                          student.thisWeekDone
                            ? "bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            : "bg-primary/10 text-primary hover:bg-primary/15"
                        }`}
                      >
                        {student.thisWeekDone ? (
                          <><Pencil className="w-3 h-3" /> Edit entry</>
                        ) : (
                          <><Play className="w-3 h-3" /> Log this week</>
                        )}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
