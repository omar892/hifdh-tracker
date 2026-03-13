import { useParams } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetStudent, useGetStudentStats, useGetStudentCalendar } from "@workspace/api-client-react";
import { format, subMonths, addMonths } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Award, CalendarDays, Target } from "lucide-react";

export default function StudentProfile() {
  const { studentId: idStr } = useParams();
  const studentId = Number(idStr);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const yearMonth = format(calendarMonth, "yyyy-MM");
  
  const { data: student } = useGetStudent(studentId);
  const { data: stats } = useGetStudentStats(studentId);
  const { data: calendar } = useGetStudentCalendar(studentId, yearMonth);

  const prevMonth = () => setCalendarMonth(d => subMonths(d, 1));
  const nextMonth = () => setCalendarMonth(d => addMonths(d, 1));

  if (!student || !stats) return <AppLayout title="Profile"><div className="animate-pulse h-64 bg-card rounded-3xl"></div></AppLayout>;

  const getKPIColor = (percent: number) => {
    if (percent >= 85) return 'text-success bg-success/10 border-success/20';
    if (percent >= 70) return 'text-warning-foreground bg-warning/10 border-warning/20';
    return 'text-destructive bg-destructive/10 border-destructive/20';
  };

  const getHeatmapColor = (status: string) => {
    switch (status) {
      case 'successful': return 'bg-success border-success/20 shadow-sm shadow-success/20';
      case 'partial': return 'bg-warning border-warning/20 shadow-sm shadow-warning/20';
      case 'failed': return 'bg-destructive border-destructive/20 shadow-sm shadow-destructive/20';
      default: return 'bg-secondary border-border/50';
    }
  };

  const trend = stats.ayahsMemorizedThisWeek - stats.ayahsMemorizedLastWeek;

  return (
    <AppLayout title="Student Profile">
      <div className="mb-8">
        <h1 className="font-display font-bold text-4xl text-foreground mb-2">{student.name}</h1>
        <p className="text-muted-foreground flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Enrolled {format(new Date(student.startDate), "MMM yyyy")}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10">
        <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Memorized</p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-display font-bold text-4xl">{stats.juzCompleted}</span>
            <span className="text-lg text-muted-foreground font-medium">Juz</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${stats.totalQuranPercentage}%` }}></div>
          </div>
          <p className="text-xs font-medium mt-2 text-right text-muted-foreground">{stats.totalQuranPercentage.toFixed(1)}% of Quran</p>
        </div>

        <div className={`p-6 rounded-3xl border shadow-sm flex flex-col justify-center ${getKPIColor(stats.successfulDaysPercent)}`}>
          <p className="text-sm font-semibold uppercase tracking-wider mb-2 opacity-80">Consistency</p>
          <div className="flex items-baseline gap-1">
            <span className="font-display font-bold text-5xl">{Math.round(stats.successfulDaysPercent)}</span>
            <span className="text-2xl font-bold">%</span>
          </div>
          <p className="text-sm font-medium mt-1 opacity-80">Successful Days</p>
        </div>

        <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 rounded-3xl shadow-lg shadow-primary/25 flex flex-col justify-center relative overflow-hidden">
          <Target className="absolute right-[-10px] bottom-[-10px] w-32 h-32 opacity-10" />
          <p className="text-sm font-semibold uppercase tracking-wider mb-2 opacity-90 relative z-10">Current Streak</p>
          <div className="flex items-baseline gap-2 relative z-10">
            <span className="font-display font-bold text-5xl">{stats.currentStreak}</span>
            <span className="text-lg font-medium opacity-90">Days</span>
          </div>
        </div>

        <div className="bg-card p-6 rounded-3xl border border-border/50 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Weekly Trend</p>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-4xl">{stats.ayahsMemorizedThisWeek}</span>
            <span className="text-sm text-muted-foreground font-medium">ayahs</span>
          </div>
          <div className={`flex items-center gap-1 mt-2 text-sm font-semibold ${trend >= 0 ? 'text-success' : 'text-destructive'}`}>
            {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{Math.abs(trend)} vs last week</span>
          </div>
        </div>
      </div>

      {/* Calendar Heatmap Section */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="font-display font-bold text-2xl">Activity Calendar</h2>
            {calendar && (
              <p className="text-muted-foreground mt-1 font-medium">
                {calendar.successfulDays}/{calendar.totalAttendedDays} successful days ({Math.round(calendar.successRate)}%) this month
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 bg-secondary p-1 rounded-xl">
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-background transition-colors"><ChevronLeft className="w-5 h-5" /></button>
            <span className="font-bold w-32 text-center">{format(calendarMonth, "MMMM yyyy")}</span>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-background transition-colors"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 md:gap-4 max-w-3xl">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{day}</div>
          ))}
          {/* Note: In a real app we'd pad the grid with empty squares for proper day alignment. Assuming calendar.days is padded or we just map them simply here. Let's just map the days safely. */}
          {calendar?.days?.map((day, i) => (
            <div key={i} className="aspect-square flex flex-col items-center justify-center p-1">
              <div 
                title={`${day.date}: ${day.status}`}
                className={`w-full h-full rounded-xl border ${getHeatmapColor(day.status)} transition-transform hover:scale-110 cursor-pointer`}
              />
              <span className="text-[10px] font-medium text-muted-foreground mt-1 hidden md:block">{format(new Date(day.date), "d")}</span>
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-6 mt-8 pt-6 border-t border-border/50 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-success"></div> All Done</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-warning"></div> Partial</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-destructive"></div> Failed</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-secondary border border-border/50"></div> Absent/Off</div>
        </div>
      </div>
    </AppLayout>
  );
}
