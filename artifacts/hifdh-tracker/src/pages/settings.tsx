import { useProtectedRoute } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetQfLinkStatus, useGetQfLinkStreak, getGetQfLinkStatusQueryKey, getGetQfLinkStreakQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Link2, Link2Off, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/**
 * The Settings page houses program-level integrations that don't belong on
 * the day-to-day teaching surfaces. Today the only thing here is the Quran
 * Foundation account link that powers the program's daily activity streak.
 */
export default function Settings() {
  const { isLoading: authLoading } = useProtectedRoute();
  const qc = useQueryClient();
  const { data: status, isLoading: statusLoading, refetch } = useGetQfLinkStatus();
  const { data: streak } = useGetQfLinkStreak({
    query: { enabled: !!status?.connected, queryKey: getGetQfLinkStreakQueryKey() },
  });
  const [disconnecting, setDisconnecting] = useState(false);

  if (authLoading || statusLoading) {
    return (
      <AppLayout title="Settings">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect the program's Quran.com account? Your streak will no longer update.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/qf-link", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("disconnect failed");
      await qc.invalidateQueries({ queryKey: getGetQfLinkStatusQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetQfLinkStreakQueryKey() });
      refetch();
    } catch (err) {
      console.error(err);
      alert("Failed to disconnect. Try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = status?.connected ?? false;

  return (
    <AppLayout title="Settings">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold text-foreground tracking-tight leading-none">
          Settings
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Program-level integrations and configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-sm">
              <Flame className="text-white w-5 h-5" />
            </div>
            <div>
              <CardTitle>Quran.com — Program Streak</CardTitle>
              <CardDescription>
                Link a Quran.com account so the program's streak grows every day a weekly entry is saved.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected ? (
            <>
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Connected{status?.displayName ? ` as ${status.displayName}` : ""}
                  </p>
                  {status?.connectedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      since {new Date(status.connectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Flame className="w-5 h-5" />
                  <span className="font-extrabold text-2xl tabular-nums">
                    {streak?.currentStreak ?? 0}
                  </span>
                  <span className="text-xs uppercase tracking-widest font-bold">days</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Each time a teacher saves a weekly entry, we mark today's Activity Day on
                this account. No student data is sent — only a "program active today" ping.
              </p>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full md:w-auto"
              >
                <Link2Off className="w-4 h-4 mr-2" />
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Connect a single Quran.com account that represents the program. The
                streak on that account will tick up each day a weekly entry is saved
                in this app.
              </p>
              <Button asChild className="w-full md:w-auto">
                {/*
                  Full reload: /api/qf-link/start issues a 302 to Quran.com's
                  hosted login, which won't honor a SPA navigation.
                */}
                <a href="/api/qf-link/start">
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect Quran.com Account
                </a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
