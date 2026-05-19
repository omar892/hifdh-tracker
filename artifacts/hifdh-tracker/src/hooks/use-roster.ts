/**
 * Roster data hook — wraps the /api/roster endpoint that returns one row
 * per student with the computed metrics the management view needs:
 * status, current position, last-logged, pace, attendance.
 */

import { useQuery } from "@tanstack/react-query";
import type { StudentStatus } from "./use-student-record";

export interface RosterRow {
  id: number;
  name: string;
  gender: string | null;
  currentPage: number;
  currentLine: number;
  status: StudentStatus;
  statusChangedAt: string | null;
  archivedAt: string | null;
  active: boolean;
  mushafPreference: string;
  juzCompleted: number;
  lastEntryDate: string | null;
  weeksSinceLastEntry: number | null;
  paceLast4Weeks: number;
  attendancePercent: number | null;
}

export function useRoster() {
  return useQuery({
    queryKey: ["roster"],
    queryFn: async () => {
      const res = await fetch("/api/roster", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as RosterRow[];
    },
  });
}
