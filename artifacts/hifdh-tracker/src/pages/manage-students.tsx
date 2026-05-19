/**
 * Roster — "manage my program" surface. One row per student with the
 * information a teacher needs to triage at a glance: status, current
 * position, juz progress, last-logged date, recent pace, attendance.
 *
 * Tapping a row lands on that student's record page. Add-student form
 * stays inline at the top (collapsed by default). The previous
 * deactivate-via-icon flow is replaced by status changes on the record
 * page; this screen is for triage + adding new students.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import { useCreateStudent, useListStudents } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRoster, type RosterRow } from "@/hooks/use-roster";
import type { StudentStatus } from "@/hooks/use-student-record";
import { getGenderAvatarClass, type Gender } from "@/lib/gender-colors";
import { formatLines } from "@/lib/format";
import {
  Plus,
  Search,
  X,
  Calendar,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

type StatusFilter = "all" | StudentStatus | "archived";
type GenderFilter = "all" | "male" | "female";

const STATUS_META: Record<StudentStatus, { label: string; chip: string; dot: string }> = {
  active: { label: "Active", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  paused: { label: "Paused", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  graduated: { label: "Graduated", chip: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500" },
  withdrawn: { label: "Withdrawn", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
};

function StatusChip({ status }: { status: StudentStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${m.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function AttendanceChip({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-[11px] text-muted-foreground/50">—</span>;
  const tone = percent >= 90
    ? "text-emerald-600 dark:text-emerald-400"
    : percent >= 75
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  return <span className={`text-[12px] font-bold tabular-nums ${tone}`}>{percent}%</span>;
}

function lastSeenLabel(row: RosterRow): { text: string; tone: string } {
  if (!row.lastEntryDate) return { text: "Never", tone: "text-muted-foreground/60" };
  const w = row.weeksSinceLastEntry ?? 0;
  if (w === 0) return { text: "This week", tone: "text-emerald-600 dark:text-emerald-400 font-bold" };
  if (w === 1) return { text: "1w ago", tone: "text-foreground/80" };
  if (w <= 3) return { text: `${w}w ago`, tone: "text-amber-600 dark:text-amber-400 font-semibold" };
  return { text: `${w}w ago`, tone: "text-red-600 dark:text-red-400 font-semibold" };
}

function RosterRowView({ row }: { row: RosterRow }) {
  const [, setLocation] = useLocation();
  const seen = lastSeenLabel(row);
  const isCalm = row.status === "graduated" || row.status === "withdrawn" || row.status === "paused";
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => setLocation(`/students/${row.id}/profile`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setLocation(`/students/${row.id}/profile`);
        }
      }}
      className={`group cursor-pointer bg-card rounded-2xl border border-border/50 px-3 sm:px-4 py-3 hover:shadow-md hover:-translate-y-px hover:border-primary/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isCalm ? "opacity-80" : ""}`}
    >
      <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getGenderAvatarClass(row.gender as Gender)}`}>
          {row.name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-base text-foreground tracking-tight truncate">{row.name}</h3>
            <StatusChip status={row.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground/80 tabular-nums">
              Pg {row.currentPage}·{row.currentLine}
            </span>
            <span className="opacity-50">·</span>
            <span className="font-semibold tabular-nums">{row.juzCompleted}/30 juz</span>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-0.5">
              <TrendingUp className="w-2.5 h-2.5" />
              <span className="font-semibold tabular-nums">{formatLines(row.paceLast4Weeks, { short: true })}/wk</span>
            </span>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-0.5">
              <Calendar className="w-2.5 h-2.5" />
              <AttendanceChip percent={row.attendancePercent} />
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] ${seen.tone}`}>{seen.text}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </div>
      </div>
    </div>
  );
}

function QuickAddForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>(null);
  const [page, setPage] = useState(1);
  const [line, setLine] = useState(1);
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateStudent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["roster"] });
        qc.invalidateQueries({ queryKey: ["/api/students"] });
        qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
        onSaved();
        toast({ title: "Student added" });
      },
      onError: (err) => toast({ title: "Failed to add student", description: String((err as Error).message), variant: "destructive" }),
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({
      data: {
        name: name.trim(),
        gender: gender,
        currentPage: page,
        currentLine: line,
        startDate: new Date().toISOString().split("T")[0],
        completedJuz: [],
      },
    });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border/50 rounded-2xl p-4 mb-5 shadow-sm">
      <p className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-3">New student</p>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        required
        className="w-full mb-2 px-3 py-2 rounded-xl bg-background border-2 border-border focus:border-primary outline-none text-foreground"
      />
      <div className="grid grid-cols-3 gap-2 mb-2">
        <select
          value={gender ?? ""}
          onChange={(e) => setGender((e.target.value || null) as Gender)}
          className="px-2 py-2 rounded-xl bg-background border-2 border-border text-sm focus:border-primary outline-none"
        >
          <option value="">Gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <input
          type="number"
          min={1}
          max={604}
          value={page}
          onChange={(e) => setPage(Math.max(1, Math.min(604, Number(e.target.value))))}
          placeholder="Page"
          className="px-2 py-2 rounded-xl bg-background border-2 border-border text-sm font-mono focus:border-primary outline-none"
        />
        <input
          type="number"
          min={1}
          max={15}
          value={line}
          onChange={(e) => setLine(Math.max(1, Math.min(15, Number(e.target.value))))}
          placeholder="Line"
          className="px-2 py-2 rounded-xl bg-background border-2 border-border text-sm font-mono focus:border-primary outline-none"
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60 mb-3">
        More fields (mushaf, defaults, completed juz) on the student record after adding.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "Add student"}
        </button>
      </div>
    </form>
  );
}

export default function ManageStudents() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: roster, isLoading: rosterLoading } = useRoster();
  useListStudents();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  if (authLoading || rosterLoading) {
    return (
      <AppLayout title="Roster">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const all = roster ?? [];
  const counts = {
    all: all.length,
    active: all.filter((r) => r.status === "active").length,
    paused: all.filter((r) => r.status === "paused").length,
    graduated: all.filter((r) => r.status === "graduated").length,
    withdrawn: all.filter((r) => r.status === "withdrawn").length,
    archived: all.filter((r) => r.status === "graduated" || r.status === "withdrawn").length,
  };

  const filtered = all
    .filter((r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "archived") return r.status === "graduated" || r.status === "withdrawn";
      return r.status === statusFilter;
    })
    .filter((r) => {
      if (genderFilter === "all") return true;
      return r.gender === genderFilter;
    })
    .filter((r) => {
      const q = searchQuery.trim().toLowerCase();
      return !q || r.name.toLowerCase().includes(q);
    });

  const STATUS_ORDER: Record<StudentStatus, number> = { active: 0, paused: 1, graduated: 2, withdrawn: 3 };
  filtered.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return a.name.localeCompare(b.name);
  });

  const filterChips: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "active", label: "Active", count: counts.active },
    { value: "paused", label: "Paused", count: counts.paused },
    { value: "archived", label: "Archived", count: counts.archived },
  ];

  return (
    <AppLayout title="Roster">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">Roster</h1>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              {counts.active} active{counts.paused > 0 ? ` · ${counts.paused} paused` : ""}{counts.archived > 0 ? ` · ${counts.archived} archived` : ""}
            </p>
          </div>
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold shadow-md hover:shadow-lg"
            >
              <Plus className="w-4 h-4" /> Add student
            </button>
          )}
        </div>

        {showAdd && (
          <QuickAddForm
            onSaved={() => setShowAdd(false)}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl bg-card border border-border/50 focus-within:border-primary transition-all">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search students…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
            {filterChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setStatusFilter(chip.value)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === chip.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {chip.label}
                <span className={`text-[10px] tabular-nums ${statusFilter === chip.value ? "opacity-80" : "opacity-50"}`}>{chip.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5 mb-5">
          {([
            { value: "all" as const, label: "All genders" },
            { value: "male" as const, label: "Male" },
            { value: "female" as const, label: "Female" },
          ]).map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGenderFilter(g.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                genderFilter === g.value
                  ? g.value === "male"
                    ? "bg-blue-500 text-white"
                    : g.value === "female"
                      ? "bg-pink-500 text-white"
                      : "bg-foreground/10 text-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? `No students matching "${searchQuery}"`
                : statusFilter === "all"
                  ? "No students yet. Use 'Add student' above to enroll your first one."
                  : `No ${statusFilter} students.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => (
              <RosterRowView key={row.id} row={row} />
            ))}
          </div>
        )}

        <Link href="/" className="block mt-6 text-center text-xs text-muted-foreground/50 hover:text-muted-foreground">
          ← Back to dashboard
        </Link>
      </div>
    </AppLayout>
  );
}
