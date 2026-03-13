import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useProtectedRoute } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { format } from "date-fns";
import { 
  useGetEntry, 
  useUpsertEntry, 
  useGetDashboard,
  useGetStudent,
  Grade
} from "@workspace/api-client-react";
import { SurahSelector } from "@/components/ui/surah-selector";
import { Check, ChevronLeft, ChevronRight, Save, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type SectionData = {
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  completed: boolean;
  grade: Grade | null;
};

const emptySection: SectionData = {
  fromSurah: null, fromAyah: null, toSurah: null, toAyah: null, completed: false, grade: null
};

export default function DailyEntry() {
  const { studentId: idStr } = useParams();
  const studentId = Number(idStr);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  const { isLoading: authLoading } = useProtectedRoute();
  const { data: student } = useGetStudent(studentId);
  const { data: dashboard } = useGetDashboard();
  const { data: entry, isLoading: entryLoading } = useGetEntry(studentId, date);
  const upsertMutation = useUpsertEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    newMem: { ...emptySection },
    rmv: { ...emptySection },
    review: { ...emptySection },
    extraRev: { ...emptySection },
    notes: ""
  });

  useEffect(() => {
    if (entry) {
      setFormData({
        newMem: {
          fromSurah: entry.newMemorizationFromSurah ?? null,
          fromAyah: entry.newMemorizationFromAyah ?? null,
          toSurah: entry.newMemorizationToSurah ?? null,
          toAyah: entry.newMemorizationToAyah ?? null,
          completed: entry.newMemorizationCompleted ?? false,
          grade: entry.newMemorizationGrade ?? null,
        },
        rmv: {
          fromSurah: entry.rmvFromSurah ?? null,
          fromAyah: entry.rmvFromAyah ?? null,
          toSurah: entry.rmvToSurah ?? null,
          toAyah: entry.rmvToAyah ?? null,
          completed: entry.rmvCompleted ?? false,
          grade: entry.rmvGrade ?? null,
        },
        review: {
          fromSurah: entry.reviewFromSurah ?? null,
          fromAyah: entry.reviewFromAyah ?? null,
          toSurah: entry.reviewToSurah ?? null,
          toAyah: entry.reviewToAyah ?? null,
          completed: entry.reviewCompleted ?? false,
          grade: entry.reviewGrade ?? null,
        },
        extraRev: {
          fromSurah: entry.extraReviewFromSurah ?? null,
          fromAyah: entry.extraReviewFromAyah ?? null,
          toSurah: entry.extraReviewToSurah ?? null,
          toAyah: entry.extraReviewToAyah ?? null,
          completed: false, // Extra review doesn't have required completed in API schema? Wait, it doesn't in UpsertEntryRequest.
          grade: null,
        },
        notes: entry.teacherNotes ?? ""
      });
    } else if (student) {
      // Pre-fill with student current position if no entry exists
      setFormData(prev => ({
        ...prev,
        newMem: { ...emptySection, fromSurah: student.currentSurah, fromAyah: student.currentAyah },
        rmv: { ...emptySection },
        review: { ...emptySection },
        extraRev: { ...emptySection }
      }));
    }
  }, [entry, student]);

  // Navigation Logic
  const students = dashboard || [];
  const currentIndex = students.findIndex(s => s.id === studentId);
  const prevStudent = currentIndex > 0 ? students[currentIndex - 1] : null;
  const nextStudent = currentIndex < students.length - 1 ? students[currentIndex + 1] : null;

  const isDayComplete = formData.newMem.completed && formData.rmv.completed && formData.review.completed;

  const handleSave = async () => {
    try {
      await upsertMutation.mutateAsync({
        studentId,
        date,
        data: {
          newMemorizationFromSurah: formData.newMem.fromSurah,
          newMemorizationFromAyah: formData.newMem.fromAyah,
          newMemorizationToSurah: formData.newMem.toSurah,
          newMemorizationToAyah: formData.newMem.toAyah,
          newMemorizationCompleted: formData.newMem.completed,
          newMemorizationGrade: formData.newMem.grade,
          
          rmvFromSurah: formData.rmv.fromSurah,
          rmvFromAyah: formData.rmv.fromAyah,
          rmvToSurah: formData.rmv.toSurah,
          rmvToAyah: formData.rmv.toAyah,
          rmvCompleted: formData.rmv.completed,
          rmvGrade: formData.rmv.grade,
          
          reviewFromSurah: formData.review.fromSurah,
          reviewFromAyah: formData.review.fromAyah,
          reviewToSurah: formData.review.toSurah,
          reviewToAyah: formData.review.toAyah,
          reviewCompleted: formData.review.completed,
          reviewGrade: formData.review.grade,

          extraReviewFromSurah: formData.extraRev.fromSurah,
          extraReviewFromAyah: formData.extraRev.fromAyah,
          extraReviewToSurah: formData.extraRev.toSurah,
          extraReviewToAyah: formData.extraRev.toAyah,
          
          teacherNotes: formData.notes
        }
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      queryClient.invalidateQueries({ queryKey: [`/api/students/${studentId}`] });
      toast({ title: "Entry saved successfully", variant: "default" });
    } catch (e) {
      toast({ title: "Failed to save entry", variant: "destructive" });
    }
  };

  const renderSection = (title: string, key: keyof typeof formData, hideGrade = false) => {
    const data = formData[key] as SectionData;
    const update = (updates: Partial<SectionData>) => setFormData(p => ({ ...p, [key]: { ...p[key], ...updates } }));

    return (
      <div className={`p-6 rounded-2xl border ${data.completed ? 'border-success/30 bg-success/5' : 'border-border/50 bg-card'} shadow-sm transition-all`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-display font-bold text-xl">{title}</h3>
          {key !== 'extraRev' && (
            <button 
              onClick={() => update({ completed: !data.completed })}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${data.completed ? 'bg-success text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${data.completed ? 'border-white bg-success' : 'border-muted-foreground/30'}`}>
                {data.completed && <Check className="w-3 h-3 text-white" />}
              </div>
              {data.completed ? 'Done' : 'Mark Done'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Start Point</label>
              <div className="flex gap-2">
                <SurahSelector 
                  value={data.fromSurah} 
                  onChange={v => update({ fromSurah: v })} 
                  className="flex-2"
                />
                <input 
                  type="number" 
                  placeholder="Ayah"
                  value={data.fromAyah || ""}
                  onChange={e => update({ fromAyah: e.target.value ? Number(e.target.value) : null })}
                  className="w-24 px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">End Point</label>
              <div className="flex gap-2">
                <SurahSelector 
                  value={data.toSurah} 
                  onChange={v => update({ toSurah: v })} 
                  className="flex-2"
                />
                <input 
                  type="number" 
                  placeholder="Ayah"
                  value={data.toAyah || ""}
                  onChange={e => update({ toAyah: e.target.value ? Number(e.target.value) : null })}
                  className="w-24 px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {!hideGrade && (
          <div className="mt-6 pt-6 border-t border-border/50">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Performance Grade</label>
            <div className="flex flex-wrap gap-2">
              {[
                { val: Grade.excellent, label: 'Excellent', color: 'bg-success/10 text-success border-success/30 hover:bg-success/20' },
                { val: Grade.good, label: 'Good', color: 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20' },
                { val: Grade.needs_repeat, label: 'Needs Repeat', color: 'bg-warning/10 text-warning-foreground border-warning/30 hover:bg-warning/20' },
                { val: Grade.incomplete, label: 'Incomplete', color: 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20' },
              ].map(g => (
                <button
                  key={g.val}
                  onClick={() => update({ grade: g.val })}
                  className={`px-4 py-2 rounded-xl font-medium border-2 transition-all ${
                    data.grade === g.val 
                      ? g.color.split(' ')[0] + ' ' + g.color.split(' ')[1] + ' border-current shadow-sm'
                      : 'border-transparent bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (authLoading || !student) return <AppLayout><div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-6 py-1"><div className="h-2 bg-slate-200 rounded"></div><div className="space-y-3"><div className="grid grid-cols-3 gap-4"><div className="h-2 bg-slate-200 rounded col-span-2"></div><div className="h-2 bg-slate-200 rounded col-span-1"></div></div><div className="h-2 bg-slate-200 rounded"></div></div></div></div></AppLayout>;

  return (
    <AppLayout title="Daily Entry">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
            <User className="w-8 h-8" />
          </div>
          <div>
            <h1 className="font-display font-bold text-3xl">{student.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <Link href={`/students/${student.id}/profile`} className="text-sm font-medium text-primary hover:underline">
                View Full Profile
              </Link>
              <span className="w-1 h-1 rounded-full bg-border"></span>
              <input 
                type="date" 
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-sm font-medium bg-transparent text-muted-foreground outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {prevStudent && (
            <Link href={`/students/${prevStudent.id}/entry`} className="p-3 rounded-xl bg-card border border-border/50 hover:bg-secondary transition-colors shadow-sm">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          {nextStudent && (
            <Link href={`/students/${nextStudent.id}/entry`} className="p-3 rounded-xl bg-card border border-border/50 hover:bg-secondary transition-colors shadow-sm flex items-center gap-2">
              <span className="hidden md:inline font-medium px-2">{nextStudent.name}</span>
              <ChevronRight className="w-5 h-5" />
            </Link>
          )}
        </div>
      </div>

      {/* Global Status Bar */}
      <div className={`p-4 rounded-2xl mb-8 flex items-center justify-between border-2 transition-colors ${isDayComplete ? 'bg-success/10 border-success/30 text-success' : 'bg-card border-border/50 text-foreground'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDayComplete ? 'bg-success text-white' : 'bg-secondary text-muted-foreground'}`}>
            <Check className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg">{isDayComplete ? "Day Complete! MashaAllah" : "In Progress"}</span>
        </div>
        <button 
          onClick={handleSave}
          disabled={upsertMutation.isPending}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {upsertMutation.isPending ? "Saving..." : "Save Entry"}
        </button>
      </div>

      {/* Form Sections */}
      <div className="space-y-6 mb-20">
        {renderSection("1. New Memorization (Sabaq)", "newMem")}
        {renderSection("2. Recent Revisions (Sabaq Para)", "rmv")}
        {renderSection("3. Past Revision (Dour)", "review")}
        {renderSection("Optional: Extra Review", "extraRev", true)}
        
        <div className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm">
          <h3 className="font-display font-bold text-xl mb-4">Teacher Notes</h3>
          <textarea
            value={formData.notes}
            onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
            placeholder="Add any observations, behavior notes, or specific feedback for today..."
            className="w-full p-4 rounded-xl bg-background border-2 border-border text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none resize-none h-32"
          ></textarea>
        </div>
      </div>
    </AppLayout>
  );
}
