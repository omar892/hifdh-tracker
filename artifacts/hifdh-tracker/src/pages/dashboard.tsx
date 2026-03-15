import { useProtectedRoute } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetDashboard, useListSurahs } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { CheckCircle2, Clock, BookOpen, Play } from "lucide-react";

export default function Dashboard() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: students, isLoading: dataLoading } = useGetDashboard();
  const { data: surahs } = useListSurahs();

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
  const weekRange = `Week of ${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const doneCount = students?.filter((s) => s.thisWeekDone).length ?? 0;
  const totalCount = students?.length ?? 0;

  return (
    <AppLayout title="Dashboard">
      <div className="mb-6 md:mb-8">
        <p className="text-sm font-semibold tracking-wider text-primary uppercase mb-1">{weekRange}</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Student Overview</h1>
        {totalCount > 0 && (
          <p className="text-muted-foreground mt-2 font-medium">
            {doneCount} of {totalCount} students logged this week
          </p>
        )}
      </div>

      {totalCount > 0 && (
        <Link href="/log-week/0">
          <button className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all mb-8">
            <Play className="w-5 h-5" />
            Log This Week
          </button>
        </Link>
      )}

      {totalCount === 0 ? (
        <div className="text-center p-12 bg-card rounded-3xl border border-border/50 shadow-sm">
          <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-xl font-bold text-foreground mb-2">No active students</h3>
          <p className="text-muted-foreground mb-6">Go to Manage Students to add your first student.</p>
          <Link href="/manage" className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-md inline-block">
            Manage Students
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {students?.map((student) => {
            const surahObj = surahs?.find((s) => s.number === student.currentSurah);
            const surahName = surahObj ? `${surahObj.name} (${surahObj.nameArabic})` : `Surah ${student.currentSurah}`;

            return (
              <Link key={student.id} href={`/students/${student.id}/profile`} className="block group">
                <div className={`bg-card rounded-2xl p-5 border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full flex flex-col relative overflow-hidden ${student.thisWeekDone ? "border-green-200 dark:border-green-900" : "border-border/50"}`}>
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 transition-colors ${student.thisWeekDone ? "bg-green-500/10" : "bg-primary/5 group-hover:bg-primary/10"}`} />

                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <h3 className="font-display font-bold text-xl text-foreground leading-tight">{student.name}</h3>
                    {student.thisWeekDone ? (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full text-xs font-bold border border-green-200 dark:border-green-800 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Done
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-muted text-muted-foreground rounded-full text-xs font-bold border border-border shrink-0">
                        <Clock className="w-3.5 h-3.5" />
                        Pending
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-4 relative z-10 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Current Position</p>
                    <p className="font-medium text-foreground text-sm">{surahName} : {student.currentAyah}</p>
                    {student.thisWeekDone && student.thisWeekEntry && (
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                        {student.thisWeekEntry.ayahsMemorized} ayahs · {student.thisWeekEntry.successfulDays}/{student.thisWeekEntry.daysAttended} days
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
