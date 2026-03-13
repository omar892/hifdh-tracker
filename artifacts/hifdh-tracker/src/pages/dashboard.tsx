import { useProtectedRoute } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetDashboard, useListSurahs } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { StatusBadge } from "@/components/ui/status-badge";
import { ChevronRight, BookOpen } from "lucide-react";

export default function Dashboard() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: students, isLoading: dataLoading } = useGetDashboard();
  const { data: surahs } = useListSurahs();

  if (authLoading || dataLoading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppLayout>
    );
  }

  const today = format(new Date(), "EEEE, MMMM do, yyyy");

  return (
    <AppLayout title="Dashboard">
      <div className="mb-8 md:mb-10">
        <h1 className="text-sm font-semibold tracking-wider text-primary uppercase mb-2">Today's Overview</h1>
        <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground">{today}</h2>
      </div>

      {students?.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-3xl border border-border/50 shadow-sm">
          <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-xl font-bold text-foreground mb-2">No active students</h3>
          <p className="text-muted-foreground mb-6">Go to Manage Students to add your first student.</p>
          <Link href="/manage" className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-md">
            Manage Students
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {students?.map((student) => {
            const currentSurahObj = surahs?.find(s => s.number === student.currentSurah);
            const surahName = currentSurahObj ? `${currentSurahObj.nameArabic} (${currentSurahObj.name})` : `Surah ${student.currentSurah}`;
            
            return (
              <Link key={student.id} href={`/students/${student.id}/entry`} className="block group">
                <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm hover:shadow-xl hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 h-full flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/10 transition-colors"></div>
                  
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <h3 className="font-display font-bold text-xl text-foreground">{student.name}</h3>
                    <StatusBadge status={student.todayStatus} />
                  </div>
                  
                  <div className="mt-auto pt-4 relative z-10">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Current Position</p>
                    <p className="font-medium text-foreground flex items-center justify-between">
                      <span className="truncate pr-2">{surahName} : {student.currentAyah}</span>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </p>
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
