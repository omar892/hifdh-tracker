import { CheckCircle2, Clock } from "lucide-react";

export function StatusBadge({ done }: { done: boolean }) {
  if (done) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-success/15 text-success rounded-full font-medium text-sm border border-success/20 shadow-sm">
        <CheckCircle2 className="w-4 h-4" />
        Done
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-muted text-muted-foreground rounded-full font-medium text-sm border border-border shadow-sm">
      <Clock className="w-4 h-4" />
      Pending
    </div>
  );
}
