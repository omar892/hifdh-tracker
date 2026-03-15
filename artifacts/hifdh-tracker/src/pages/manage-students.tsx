import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useProtectedRoute } from "@/hooks/use-auth";
import { useListStudents, useCreateStudent, useUpdateStudent, useListSurahs } from "@workspace/api-client-react";
import { Plus, Edit2, UserCheck, UserX, ChevronDown, ChevronUp, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { SurahSearchSelect } from "@/components/ui/surah-search-select";

interface StudentFormData {
  name: string;
  surah: number | null;
  ayah: number;
}

function StudentForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  surahs,
}: {
  initial?: StudentFormData;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  isSaving: boolean;
  surahs: Array<{ number: number; ayahCount: number }>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [surah, setSurah] = useState<number | null>(initial?.surah ?? 1);
  const [ayah, setAyah] = useState(initial?.ayah ?? 1);

  const maxAyah = surahs.find((s) => s.number === surah)?.ayahCount ?? 286;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !surah) return;
    onSave({ name: name.trim(), surah, ayah });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5 bg-secondary/30 rounded-2xl border border-border/50">
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
          Current Surah
        </label>
        <SurahSearchSelect value={surah} onChange={setSurah} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Current Ayah
        </label>
        <input
          type="number"
          value={ayah}
          min={1}
          max={maxAyah}
          onChange={(e) => setAyah(Math.max(1, Math.min(maxAyah, Number(e.target.value))))}
          className="w-32 px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all font-mono"
        />
      </div>

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
          disabled={isSaving || !name.trim() || !surah}
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
  const { data: surahs = [] } = useListSurahs();
  const [showInactive, setShowInactive] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useCreateStudent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/students"] });
        setShowAddForm(false);
        toast({ title: "Student added!" });
      },
    },
  });

  const updateMutation = useUpdateStudent({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/students"] });
        setEditingId(null);
        toast({ title: "Student updated!" });
      },
    },
  });

  const activeStudents = allStudents.filter((s) => s.active);
  const inactiveStudents = allStudents.filter((s) => !s.active);

  const handleCreate = (data: StudentFormData) => {
    createMutation.mutate({
      data: {
        name: data.name,
        currentSurah: data.surah ?? 1,
        currentAyah: data.ayah,
        startDate: new Date().toISOString().split("T")[0],
      },
    });
  };

  const handleUpdate = (id: number, data: StudentFormData) => {
    updateMutation.mutate({
      id,
      data: {
        name: data.name,
        currentSurah: data.surah ?? undefined,
        currentAyah: data.ayah,
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
    const surahObj = surahs.find((s) => s.number === student.currentSurah);
    const isEditing = editingId === student.id;

    return (
      <div key={student.id} className={`rounded-2xl border transition-all shadow-sm ${student.active ? "bg-card border-border/50" : "bg-secondary/20 border-dashed border-border/30"}`}>
        {isEditing ? (
          <div className="p-4">
            <p className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Edit: {student.name}</p>
            <StudentForm
              initial={{ name: student.name, surah: student.currentSurah, ayah: student.currentAyah }}
              onSave={(data) => handleUpdate(student.id, data)}
              onCancel={() => setEditingId(null)}
              isSaving={updateMutation.isPending}
              surahs={surahs}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 gap-4">
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-lg truncate ${student.active ? "text-foreground" : "text-muted-foreground"}`}>
                {student.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {surahObj ? `${surahObj.name} : ${student.currentAyah}` : `Surah ${student.currentSurah} : ${student.currentAyah}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {student.active && (
                <button
                  onClick={() => setEditingId(student.id)}
                  className="p-2.5 rounded-xl bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              <button
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
              {activeStudents.length} active {inactiveStudents.length > 0 ? `· ${inactiveStudents.length} inactive` : ""}
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

        {showAddForm && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">New Student</h3>
            <StudentForm
              onSave={handleCreate}
              onCancel={() => setShowAddForm(false)}
              isSaving={createMutation.isPending}
              surahs={surahs}
            />
          </div>
        )}

        <div className="space-y-3 mb-6">
          {activeStudents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No active students yet. Add one above!</p>
            </div>
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
