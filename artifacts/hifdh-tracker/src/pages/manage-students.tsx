import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import { useListStudents, useCreateStudent, useUpdateStudent } from "@workspace/api-client-react";
import { Plus, Edit2, UserCheck, UserX, ChevronDown, ChevronUp, X, BookOpen, Search, Filter } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getGenderAvatarClass, type Gender } from "@/lib/gender-colors";

type GenderFilter = "all" | "male" | "female" | "unset";
type MushafPreference = "madani_15" | "indopak_15";

interface StudentFormData {
  name: string;
  gender: Gender;
  page: number;
  line: number;
  mushafPreference: MushafPreference;
  completedJuz: number[];
}

function JuzGrid({ selected, onChange }: { selected: number[]; onChange: (juz: number[]) => void }) {
  const toggle = (juz: number) => {
    if (selected.includes(juz)) {
      onChange(selected.filter((j) => j !== juz));
    } else {
      onChange([...selected, juz].sort((a, b) => a - b));
    }
  };

  const allSelected = selected.length === 30;
  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(Array.from({ length: 30 }, (_, i) => i + 1));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Completed Juz
        </label>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Select the juz this student has already memorized ({selected.length}/30)
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
          <button
            key={juz}
            type="button"
            onClick={() => toggle(juz)}
            className={`h-10 rounded-lg font-bold text-sm transition-all ${
              selected.includes(juz)
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary"
            }`}
          >
            {juz}
          </button>
        ))}
      </div>
    </div>
  );
}

function StudentForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  showPosition = true,
}: {
  initial?: StudentFormData;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  isSaving: boolean;
  showPosition?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [gender, setGender] = useState<Gender>(initial?.gender ?? null);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [line, setLine] = useState(initial?.line ?? 1);
  const [mushafPreference, setMushafPreference] = useState<MushafPreference>(
    initial?.mushafPreference ?? "madani_15",
  );
  const [completedJuz, setCompletedJuz] = useState<number[]>(initial?.completedJuz ?? []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), gender, page, line, mushafPreference, completedJuz });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5 bg-primary/5 rounded-2xl border border-primary/20">
      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Student Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
          className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Gender
        </label>
        <div className="flex gap-2">
          {([
            { value: "male" as const, label: "Male", color: "bg-blue-500 text-white border-blue-500" },
            { value: "female" as const, label: "Female", color: "bg-pink-500 text-white border-pink-500" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGender(gender === opt.value ? null : opt.value)}
              className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-sm transition-all ${
                gender === opt.value
                  ? `${opt.color} shadow-md`
                  : "bg-background border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Mushaf
        </label>
        <div className="flex gap-2">
          {([
            { value: "madani_15" as const, label: "Madani 15-Line", subtitle: "604 pages" },
            { value: "indopak_15" as const, label: "Indo-Pak 15-Line", subtitle: "610 pages" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMushafPreference(opt.value)}
              className={`flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-sm transition-all ${
                mushafPreference === opt.value
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-background border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              <div>{opt.label}</div>
              <div className="text-xs font-normal opacity-70 mt-0.5">{opt.subtitle}</div>
            </button>
          ))}
        </div>
      </div>

      <JuzGrid selected={completedJuz} onChange={setCompletedJuz} />

      {showPosition && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Current Page (1-604)
            </label>
            <input
              type="number"
              value={page}
              min={1}
              max={604}
              onChange={(e) => setPage(Math.max(1, Math.min(604, Number(e.target.value))))}
              className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Current Line (1-15)
            </label>
            <input
              type="number"
              value={line}
              min={1}
              max={15}
              onChange={(e) => setLine(Math.max(1, Math.min(15, Number(e.target.value))))}
              className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all font-mono"
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-border text-muted-foreground hover:text-foreground hover:border-primary/30 font-semibold transition-all"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !name.trim()}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-60"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : null}
          Save Student
        </button>
      </div>
    </form>
  );
}

export default function ManageStudents() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: allStudents = [], isLoading: studentsLoading } = useListStudents();
  const [showInactive, setShowInactive] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useCreateStudent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/students"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        setShowAddForm(false);
        toast({ title: "Student added!" });
      },
      onError: (error) => {
        toast({ title: "Failed to add student", description: String(error.message ?? error), variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateStudent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/students"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        setEditingId(null);
        toast({ title: "Student updated!" });
      },
      onError: (error) => {
        toast({ title: "Failed to update student", description: String(error.message ?? error), variant: "destructive" });
      },
    },
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");

  const matchesFilter = (s: (typeof allStudents)[0]) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = !q || s.name.toLowerCase().includes(q);
    const genderMatch =
      genderFilter === "all" ||
      (genderFilter === "unset" ? !s.gender : s.gender === genderFilter);
    return nameMatch && genderMatch;
  };

  const activeStudents = allStudents.filter((s) => s.active && matchesFilter(s));
  const allActiveStudents = allStudents.filter((s) => s.active);
  const inactiveStudents = allStudents.filter((s) => !s.active);

  const handleCreate = (data: StudentFormData) => {
    createMutation.mutate({
      data: {
        name: data.name,
        gender: data.gender,
        currentPage: data.page,
        currentLine: data.line,
        startDate: new Date().toISOString().split("T")[0],
        mushafPreference: data.mushafPreference,
        completedJuz: data.completedJuz,
      },
    });
  };

  const handleUpdate = (id: number, data: StudentFormData) => {
    updateMutation.mutate({
      id,
      data: {
        name: data.name,
        gender: data.gender,
        currentPage: data.page,
        currentLine: data.line,
        mushafPreference: data.mushafPreference,
        completedJuz: data.completedJuz,
      },
    });
  };

  const handleToggleActive = (id: number, active: boolean) => {
    updateMutation.mutate({
      id,
      data: { active: !active },
    });
  };

  if (authLoading || studentsLoading) {
    return (
      <AppLayout title="Manage Students">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const renderStudent = (student: (typeof allStudents)[0]) => {
    const isEditing = editingId === student.id;
    const juzCount = student.completedJuz?.length ?? 0;

    return (
      <div key={student.id} className={`rounded-2xl border transition-all shadow-sm ${student.active ? "bg-card border-border/50" : "bg-secondary/20 border-dashed border-border/30"}`}>
        {isEditing ? (
          <div className="p-4">
            <p className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Edit: {student.name}</p>
            <StudentForm
              initial={{ name: student.name, gender: student.gender as Gender, page: student.currentPage, line: student.currentLine, mushafPreference: (student.mushafPreference ?? "madani_15") as MushafPreference, completedJuz: student.completedJuz ?? [] }}
              onSave={(data) => handleUpdate(student.id, data)}
              onCancel={() => setEditingId(null)}
              isSaving={updateMutation.isPending}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getGenderAvatarClass(student.gender as Gender)}`}>
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-lg truncate ${student.active ? "text-foreground" : "text-muted-foreground"}`}>
                {student.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {juzCount}/30 juz completed
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {student.active && (
                <button
                  aria-label={`Edit ${student.name}`}
                  onClick={() => setEditingId(student.id)}
                  className="p-2.5 rounded-xl bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              <button
                aria-label={student.active ? `Deactivate ${student.name}` : `Reactivate ${student.name}`}
                onClick={() => handleToggleActive(student.id, student.active)}
                disabled={updateMutation.isPending}
                className={`p-2.5 rounded-xl transition-all ${
                  student.active
                    ? "bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
                    : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                }`}
              >
                {student.active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout title="Manage Students">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">Students</h1>
            <p className="text-muted-foreground font-medium mt-1">
              {allActiveStudents.length} active {inactiveStudents.length > 0 ? `· ${inactiveStudents.length} inactive` : ""}
            </p>
          </div>
          <button
            onClick={() => { setShowAddForm((v) => !v); setEditingId(null); }}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
          >
            <Plus className="w-5 h-5" />
            Add Student
          </button>
        </div>

        {/* Search & Gender Filter */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
          <div className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl bg-card border border-border/50 focus-within:border-primary transition-all shadow-sm">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search students..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 shrink-0">
            {([
              { value: "all" as const, label: "All" },
              { value: "male" as const, label: "Male", color: "bg-blue-500 text-white" },
              { value: "female" as const, label: "Female", color: "bg-pink-500 text-white" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGenderFilter(genderFilter === opt.value ? "all" : opt.value)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  genderFilter === opt.value
                    ? (opt.color ?? "bg-primary text-primary-foreground") + " shadow-sm"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {showAddForm && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">New Student</h3>
            <StudentForm
              onSave={handleCreate}
              onCancel={() => setShowAddForm(false)}
              isSaving={createMutation.isPending}
            />
          </div>
        )}

        <div className="space-y-3 mb-6">
          {activeStudents.length === 0 ? (
            allActiveStudents.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-primary/60" />
                </div>
                <p className="text-muted-foreground font-medium">Ready to start tracking! Add your first student above.</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <Filter className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No students match your search.</p>
              </div>
            )
          ) : (
            activeStudents.map(renderStudent)
          )}
        </div>

        {inactiveStudents.length > 0 && (
          <div>
            <button
              onClick={() => setShowInactive((v) => !v)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-semibold transition-colors mb-3"
            >
              {showInactive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {inactiveStudents.length} Inactive Student{inactiveStudents.length !== 1 ? "s" : ""}
            </button>
            {showInactive && (
              <div className="space-y-3">
                {inactiveStudents.map(renderStudent)}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
