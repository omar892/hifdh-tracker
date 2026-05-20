/**
 * Step 2 added several endpoints that aren't yet in the OpenAPI spec (and
 * therefore aren't in the generated `@workspace/api-client-react` hooks).
 * Rather than block on regen, these helpers use raw fetch + React Query
 * directly. Mirror them into the spec when it's time to type the surface.
 *
 * Same auth + base URL conventions as the generated client:
 *   - credentials: "include" (cookie session)
 *   - throws Error on non-2xx
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface FetchOptions {
  method?: string;
  body?: unknown;
}

async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `HTTP ${res.status}`);
  }
  return data as T;
}

// ── Guardians ──────────────────────────────────────────────────────────────

export interface Guardian {
  id: number;
  studentId: number;
  name: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  primary: boolean;
  notes: string | null;
  createdAt: string;
}

export function useGuardians(studentId: number) {
  return useQuery({
    queryKey: ["guardians", studentId],
    queryFn: () => api<Guardian[]>(`/api/students/${studentId}/guardians`),
    enabled: studentId > 0,
  });
}

export function useCreateGuardian(studentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Guardian>) =>
      api<Guardian>(`/api/students/${studentId}/guardians`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardians", studentId] });
    },
  });
}

export function useUpdateGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Guardian> & { id: number }) =>
      api<Guardian>(`/api/guardians/${id}`, { method: "PATCH", body }),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["guardians", g.studentId] });
    },
  });
}

export function useDeleteGuardian(studentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/guardians/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardians", studentId] });
    },
  });
}

// ── Viewer access (parent links) ──────────────────────────────────────────

export interface ViewerLink {
  id: number;
  studentId: number;
  token: string;
  label: string | null;
  notesVisibleToParent: boolean;
  active: boolean;
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
}

export function useViewerLinks(studentId: number) {
  return useQuery({
    queryKey: ["viewer-access", studentId],
    queryFn: () => api<ViewerLink[]>(`/api/students/${studentId}/viewer-access`),
    enabled: studentId > 0,
  });
}

export function useCreateViewerLink(studentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { label?: string; notesVisibleToParent?: boolean }) =>
      api<ViewerLink>(`/api/students/${studentId}/viewer-access`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["viewer-access", studentId] }),
  });
}

export function useUpdateViewerLink(studentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Pick<ViewerLink, "label" | "notesVisibleToParent" | "active">>) =>
      api<ViewerLink>(`/api/viewer-access/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["viewer-access", studentId] }),
  });
}

export function useDeleteViewerLink(studentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/viewer-access/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["viewer-access", studentId] }),
  });
}

// ── Status change (typed wrapper around the existing PATCH /students/:id) ─

export type StudentStatus = "active" | "paused" | "graduated" | "withdrawn";

export function useChangeStatus(studentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: StudentStatus) =>
      api<{ id: number; status: StudentStatus; active: boolean }>(`/api/students/${studentId}`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/students"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      qc.invalidateQueries(); // student/stats endpoints aren't keyed predictably; nuke all
    },
  });
}

export function useUpdatePosition(studentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pos: { currentPage: number; currentLine: number }) =>
      api<{ id: number; currentPage: number; currentLine: number }>(`/api/students/${studentId}`, {
        method: "PATCH",
        body: pos,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/students"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      qc.invalidateQueries(); // student/stats endpoints aren't keyed predictably; nuke all
    },
  });
}

// ── Extended stats response from /api/students/:id/stats ───────────────────
// Just the new fields step 2a added — the existing fields keep their types.

export interface AttendanceSummary {
  scheduled: number;
  present: number;
  absent: number;
  percent: number | null;
}

export interface StudentRecordExtras {
  attendanceLast4Weeks?: AttendanceSummary;
  attendanceAllTime?: AttendanceSummary;
  status?: StudentStatus;
  statusChangedAt?: string | null;
  archivedAt?: string | null;
}

// ── Per-student dashboard assessment (additive on /students/:id/stats) ─────
// The student-profile redesign reads `assessment` — the single object the
// server computes so the status banner and all three signal tiles can never
// state conflicting characterizations of the same student. All optional so
// any code that doesn't care about the new shape keeps compiling.

export type StudentVerdictStatus = "needs_attention" | "watch" | "on_track";
export type StudentTrendDir = "up" | "flat" | "down";

export interface StudentTrajectorySignal {
  /** Avg lines/week across the last `windowWeeks` weeks that have entries. */
  linesPerWeek: number;
  windowWeeks: number;
  /** Calendar-anchored, oldest → newest, lines per week (8 weeks, zero-filled). */
  sparkline: number[];
  /** Pace is continuous — a real trend, shown with an arrow. */
  trend: StudentTrendDir;
  label: "Climbing" | "Steady" | "Slipping";
}

export interface StudentQualitySignal {
  /** Newest → oldest of the last 4 rated weeks. */
  recentRatings: { weekStartDate: string; rating: string }[];
  /** Factual pattern (e.g. "Strong+ every week (last 4)") — no trend, no arrow. */
  pattern: string;
  latestRating: string | null;
}

export interface StudentAttendanceSignal {
  percent: number | null;
  present: number;
  scheduled: number;
  /** Real period-over-period trend (recent 4w vs prior 4w); null when no prior data. */
  trend: StudentTrendDir | null;
}

export interface StudentAssessment {
  status: StudentVerdictStatus;
  sentence: string;
  /** Internal flags that drove the status. Diagnostic, not user-shown. */
  signals: string[];
  trajectory: StudentTrajectorySignal;
  quality: StudentQualitySignal;
  attendance: StudentAttendanceSignal;
}

export interface StudentMonthlyComparison {
  thisMonthPerWeek: number;
  lastMonthPerWeek: number;
  weeksLoggedThisMonth: number;
  weeksLoggedLastMonth: number;
}

export interface StudentDashboardExtras {
  assessment?: StudentAssessment;
  monthlyComparison?: StudentMonthlyComparison;
}
