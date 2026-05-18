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
