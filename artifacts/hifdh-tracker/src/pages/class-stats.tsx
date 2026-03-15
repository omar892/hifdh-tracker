import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import { useGetClassStats } from "@workspace/api-client-react";
import { Award, Users, TrendingUp, BookOpen, AlertTriangle, BarChart3 } from "lucide-react";

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
    <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-4xl font-display font-bold text-foreground">{value}</div>
      {sub && <div className="text-sm text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function ClassStats() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: stats, isLoading: statsLoading } = useGetClassStats();

  const isLoading = authLoading || statsLoading;

  if (isLoading) {
    return (
      <AppLayout title="Class Stats">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Class Stats">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-widest text-primary uppercase mb-1">Overview</p>
          <h1 className="font-display text-4xl font-bold text-foreground">Class Statistics</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard
            label="Active Students"
            value={stats?.totalStudents ?? 0}
            icon={Users}
            color="text-primary"
          />
          <StatCard
            label="Avg Success Rate"
            value={`${stats?.averageSuccessRate ?? 0}%`}
            sub="days successful"
            icon={TrendingUp}
            color="text-emerald-500"
          />
          <StatCard
            label="Total Ayahs"
            value={(stats?.totalAyahsMemorized ?? 0).toLocaleString()}
            sub="memorized across class"
            icon={BookOpen}
            color="text-blue-500"
          />
          <StatCard
            label="Avg / Week"
            value={stats?.avgAyahsPerWeek ?? 0}
            sub="ayahs per student per week"
            icon={BarChart3}
            color="text-purple-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
              <Award className="w-5 h-5 text-yellow-500" /> Top Performers
            </h2>
            {!stats?.topPerformers?.length ? (
              <p className="text-muted-foreground italic">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {stats.topPerformers.map((s, i) => (
                  <div key={s.studentId} className="flex items-center gap-4">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                        i === 0
                          ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                          : i === 1
                          ? "bg-zinc-300/30 text-zinc-500 dark:text-zinc-400"
                          : "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{s.name}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-foreground">{s.successRate}%</div>
                      <div className="text-xs text-muted-foreground">success rate</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
            <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2 mb-5">
              <AlertTriangle className="w-5 h-5 text-orange-500" /> Needs Attention
            </h2>
            {!stats?.needsAttention?.length ? (
              <p className="text-muted-foreground italic">All students are doing well!</p>
            ) : (
              <div className="space-y-3">
                {stats.needsAttention.map((s) => (
                  <div key={s.studentId} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{s.name}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-red-500">{s.successRate}%</div>
                      <div className="text-xs text-muted-foreground">success rate</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
