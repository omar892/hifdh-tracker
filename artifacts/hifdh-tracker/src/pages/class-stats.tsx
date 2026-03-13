import { AppLayout } from "@/components/layout/app-layout";
import { useGetClassStats } from "@workspace/api-client-react";
import { Award, Users, AlertTriangle, BookOpen, CheckCircle2 } from "lucide-react";

export default function ClassStats() {
  const { data: stats, isLoading } = useGetClassStats();

  if (isLoading || !stats) {
    return <AppLayout title="Class Stats"><div className="animate-pulse h-64 bg-card rounded-3xl"></div></AppLayout>;
  }

  return (
    <AppLayout title="Class Statistics">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl">Program Overview</h1>
        <p className="text-muted-foreground mt-1">High-level metrics across all active students.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-card p-8 rounded-3xl border border-border/50 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shrink-0">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Active Students</p>
            <p className="font-display font-bold text-4xl">{stats.totalStudents}</p>
          </div>
        </div>

        <div className="bg-card p-8 rounded-3xl border border-border/50 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 bg-success/10 text-success rounded-2xl flex items-center justify-center shrink-0">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Avg Success Rate</p>
            <p className="font-display font-bold text-4xl">{Math.round(stats.averageSuccessRate)}%</p>
          </div>
        </div>

        <div className="bg-card p-8 rounded-3xl border border-border/50 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 bg-accent text-accent-foreground rounded-2xl flex items-center justify-center shrink-0 border border-border">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Ayahs Done</p>
            <p className="font-display font-bold text-4xl">{stats.totalAyahsMemorized.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border/50 bg-success/5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2 text-success">
              <Award className="w-6 h-6" /> Top Performers
            </h2>
          </div>
          <div className="p-6">
            {stats.topPerformers.length > 0 ? (
              <ul className="space-y-4">
                {stats.topPerformers.map((p, i) => (
                  <li key={p.studentId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-muted-foreground w-4">{i + 1}.</span>
                      <span className="font-bold text-foreground text-lg">{p.name}</span>
                    </div>
                    <span className="font-bold text-success bg-success/10 px-3 py-1 rounded-lg">{Math.round(p.successRate)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Not enough data yet.</p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border/50 bg-destructive/5">
            <h2 className="font-display font-bold text-xl flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-6 h-6" /> Needs Attention
            </h2>
          </div>
          <div className="p-6">
            {stats.needsAttention.length > 0 ? (
              <ul className="space-y-4">
                {stats.needsAttention.map((p) => (
                  <li key={p.studentId} className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-lg">{p.name}</span>
                    <span className="font-bold text-destructive bg-destructive/10 px-3 py-1 rounded-lg">{Math.round(p.successRate)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
                <CheckCircle2 className="w-12 h-12 text-success/50 mb-3" />
                <p>All students are performing well above threshold!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
