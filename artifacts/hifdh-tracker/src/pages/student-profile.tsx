import { useParams, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import {
  useGetStudent,
  useGetStudentStats,
  useGetStudentCalendar,
  useListSurahs,
} from "@workspace/api-client-react";
import { format, subMonths, addMonths } from "date-fns";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Star,
  TrendingUp,
  Flame,
  BookOpen,
  Calendar,
  ArrowLeft,
} from "lucide-react";

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
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-3xl font-display font-bold text-foreground">{value}</div>
      {sub && <div className="text-sm text-muted-foreground mt-1">{sub}</div>}
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
  const { data: calendar, isLoading: calLoading } = useGetStudentCalendar(studentId, { month: monthStr });
  const { data: surahs = [] } = useListSurahs();

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
        <div className="text-center p-12 text-muted-foreground">Student not found.</div>
      </AppLayout>
    );
  }

  const surahObj = surahs.find((s) => s.number === student.currentSurah);

  return (
    <AppLayout title={student.name}>
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>

        <div className="bg-gradient-to-br from-primary/10 to-transparent rounded-3xl p-6 mb-8 border border-primary/10">
          <h1 className="font-display text-4xl font-bold text-foreground mb-1">{student.name}</h1>
          <p className="text-muted-foreground font-medium">
            Current: {surahObj ? `${surahObj.name} (${surahObj.nameArabic})` : `Surah ${student.currentSurah}`} : {student.currentAyah}
          </p>
          {stats && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 max-w-xs h-2 bg-primary/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, stats.totalQuranPercentage)}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-primary">{stats.totalQuranPercentage}% of Quran</span>
            </div>
          )}
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <StatCard
              label="Ayahs Memorized"
              value={stats.totalAyahsMemorized.toLocaleString()}
              sub={`${stats.juzCompleted} juz`}
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
              value={stats.ayahsThisMonth}
              sub="ayahs"
              icon={Star}
              color="text-yellow-500"
            />
            <StatCard
              label="Last Month"
              value={stats.ayahsLastMonth}
              sub="ayahs"
              icon={Calendar}
              color="text-blue-500"
            />
          </div>
        )}

        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" /> Weekly History
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="font-semibold text-foreground min-w-[120px] text-center">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <button
                onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {calLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : calendar?.weeks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No weeks in this month.</p>
          ) : (
            <div className="space-y-3">
              {calendar?.weeks.map((week) => {
                const start = new Date(week.weekStartDate + "T00:00:00Z");
                const end = new Date(week.weekEndDate + "T00:00:00Z");
                const label = `${format(start, "MMM d")} – ${format(end, "MMM d")}`;

                return (
                  <div
                    key={week.weekStartDate}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                      week.hasEntry
                        ? "border-border/50 bg-card hover:shadow-sm"
                        : "border-dashed border-border/30 bg-secondary/20"
                    }`}
                  >
                    <div className="w-24 shrink-0">
                      <p className="text-xs font-bold text-muted-foreground">{label}</p>
                    </div>

                    {week.hasEntry ? (
                      <>
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            RATING_COLORS[week.weekRating ?? ""] ?? "bg-border"
                          }`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">
                              {RATING_LABELS[week.weekRating ?? ""] ?? week.weekRating}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {week.successfulDays}/{week.daysAttended} days
                            </span>
                            <span className="text-xs font-medium text-primary">
                              {week.ayahsMemorized} ayahs
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          {Array.from({ length: 5 }, (_, i) => (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded-sm ${
                                i < (week.successfulDays ?? 0)
                                  ? "bg-emerald-500"
                                  : i < (week.daysAttended ?? 0)
                                  ? "bg-red-400"
                                  : "bg-secondary"
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No entry logged</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {calendar && calendar.weeks.some((w) => w.hasEntry) && (
            <div className="mt-6 pt-6 border-t border-border/50 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-foreground">{calendar.totalAyahs}</div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ayahs this month</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{calendar.avgSuccessfulDays}</div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Avg successful days</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{calendar.excellentWeeks}</div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Excellent weeks</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
