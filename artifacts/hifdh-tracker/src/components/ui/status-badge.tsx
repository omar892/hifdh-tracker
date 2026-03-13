import { DashboardStudentTodayStatus } from "@workspace/api-client-react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

export function StatusBadge({ status }: { status: DashboardStudentTodayStatus | string }) {
  if (status === "all_done") {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-success/15 text-success rounded-full font-medium text-sm border border-success/20 shadow-sm">
        <CheckCircle2 className="w-4 h-4" />
        All Done
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-warning/15 text-warning-foreground rounded-full font-medium text-sm border border-warning/20 shadow-sm">
        <Clock className="w-4 h-4" />
        In Progress
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-destructive/10 text-destructive rounded-full font-medium text-sm border border-destructive/20 shadow-sm">
      <XCircle className="w-4 h-4" />
      Not Started
    </div>
  );
}
