import { useState, useEffect } from "react";
import { useProtectedRoute } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { SurahSearchSelect } from "@/components/ui/surah-search-select";
import {
  useListStudents,
  useUpsertWeeklyEntry,
  useGetWeeklyEntry,
  useListSurahs,
} from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  BookOpen,
  Calendar,
  Star,
} from "lucide-react";

const WEEK_RATINGS = [
  { value: "excellent", label: "Excellent", emoji: "🌟", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10 border-yellow-300 dark:border-yellow-700" },
  { value: "strong", label: "Strong", emoji: "💪", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-300 dark:border-emerald-700" },
  { value: "steady", label: "Steady", emoji: "📖", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border-blue-300 dark:border-blue-700" },
  { value: "needs_improvement", label: "Needs Improvement", emoji: "📈", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10 border-orange-300 dark:border-orange-700" },
  { value: "difficult_week", label: "Difficult Week", emoji: "🤲", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border-red-300 dark:border-red-700" },
];

const QUALITY_RATINGS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

function DaySelector({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{label}</label>
      <div className="flex gap-2">
        {Array.from({ length: max + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={`w-12 h-12 rounded-xl font-bold text-lg transition-all ${
              value === i
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-110"
                : "bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}

function QualitySelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{label}</label>
      <div className="grid grid-cols-4 gap-2">
        {QUALITY_RATINGS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className={`py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
              value === r.value
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AyahInput({ label, surah, ayah, onSurahChange, onAyahChange, surahs }: {
  label: string;
  surah: number | null;
  ayah: number;
  onSurahChange: (v: number | null) => void;
  onAyahChange: (v: number) => void;
  surahs: Array<{ number: number; ayahCount: number; name: string }>;
}) {
  const selectedSurah = surahs.find((s) => s.number === surah);
  const maxAyah = selectedSurah?.ayahCount ?? 286;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="flex gap-3">
        <div className="flex-1">
          <SurahSearchSelect value={surah} onChange={onSurahChange} placeholder="Surah" />
        </div>
        <div className="w-28">
          <input
            type="number"
            min={1}
            max={maxAyah}
            value={ayah}
            onChange={(e) => onAyahChange(Math.max(1, Math.min(maxAyah, Number(e.target.value))))}
            className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground font-mono text-center text-lg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
            placeholder="Ayah"
          />
        </div>
      </div>
    </div>
  );
}

export default function LogWeek() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { studentIndex: studentIndexParam } = useParams<{ studentIndex: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const studentIndex = parseInt(studentIndexParam ?? "0", 10);

  const { data: allStudents = [], isLoading: studentsLoading } = useListStudents({ active: true });
  const { data: surahs = [] } = useListSurahs();

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 4), "MMM d, yyyy")}`;

  const student = allStudents[studentIndex];

  const { data: existingEntry } = useGetWeeklyEntry(
    student?.id ?? 0,
    weekStartStr,
    { query: { enabled: !!student?.id, retry: false } }
  );

  const [fromSurah, setFromSurah] = useState<number | null>(null);
  const [fromAyah, setFromAyah] = useState(1);
  const [toSurah, setToSurah] = useState<number | null>(null);
  const [toAyah, setToAyah] = useState(1);
  const [successfulDays, setSuccessfulDays] = useState(5);
  const [daysAttended, setDaysAttended] = useState(5);
  const [weekRating, setWeekRating] = useState("steady");
  const [rmvQuality, setRmvQuality] = useState("good");
  const [reviewQuality, setReviewQuality] = useState("good");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!student) return;
    setSubmitted(false);
    if (existingEntry) {
      setFromSurah(existingEntry.newMemFromSurah ?? student.currentSurah ?? null);
      setFromAyah(existingEntry.newMemFromAyah ?? student.currentAyah ?? 1);
      setToSurah(existingEntry.newMemToSurah ?? student.currentSurah ?? null);
      setToAyah(existingEntry.newMemToAyah ?? student.currentAyah ?? 1);
      setSuccessfulDays(existingEntry.successfulDays ?? 5);
      setDaysAttended(existingEntry.daysAttended ?? 5);
      setWeekRating(existingEntry.weekRating ?? "steady");
      setRmvQuality(existingEntry.rmvQuality ?? "good");
      setReviewQuality(existingEntry.reviewQuality ?? "good");
      setNotes(existingEntry.teacherNotes ?? "");
    } else {
      setFromSurah(student.currentSurah ?? null);
      setFromAyah(student.currentAyah ?? 1);
      setToSurah(student.currentSurah ?? null);
      setToAyah(student.currentAyah ?? 1);
      setSuccessfulDays(5);
      setDaysAttended(5);
      setWeekRating("steady");
      setRmvQuality("good");
      setReviewQuality("good");
      setNotes("");
    }
  }, [student?.id, existingEntry?.id]);

  const upsert = useUpsertWeeklyEntry();

  const handleSubmit = async () => {
    if (!student || !fromSurah || !toSurah) {
      toast({ title: "Missing fields", description: "Please select a surah range.", variant: "destructive" });
      return;
    }

    try {
      await upsert.mutateAsync({
        studentId: student.id,
        weekStart: weekStartStr,
        data: {
          newMemFromSurah: fromSurah,
          newMemFromAyah: fromAyah,
          newMemToSurah: toSurah,
          newMemToAyah: toAyah,
          successfulDays,
          daysAttended,
          weekRating: weekRating as "excellent" | "strong" | "steady" | "needs_improvement" | "difficult_week",
          rmvQuality: rmvQuality as "excellent" | "good" | "fair" | "poor",
          reviewQuality: reviewQuality as "excellent" | "good" | "fair" | "poor",
          teacherNotes: notes || null,
        },
      });
      setSubmitted(true);
      toast({ title: `${student.name} logged!`, description: "Entry saved successfully." });

      setTimeout(() => {
        const next = studentIndex + 1;
        if (next < allStudents.length) {
          setLocation(`/log-week/${next}`);
        } else {
          setLocation("/");
        }
      }, 800);
    } catch {
      toast({ title: "Error", description: "Failed to save entry. Please try again.", variant: "destructive" });
    }
  };

  const handleSkip = () => {
    const next = studentIndex + 1;
    if (next < allStudents.length) {
      setLocation(`/log-week/${next}`);
    } else {
      setLocation("/");
    }
  };

  if (authLoading || studentsLoading) {
    return (
      <AppLayout title="Log Week">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!student) {
    return (
      <AppLayout title="Log Week">
        <div className="text-center p-12">
          <CheckCircle2 className="w-20 h-20 mx-auto text-green-500 mb-4" />
          <h2 className="text-3xl font-bold font-display text-foreground mb-2">All Done!</h2>
          <p className="text-muted-foreground mb-6">All students have been logged for this week.</p>
          <button onClick={() => setLocation("/")} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-md">
            Back to Dashboard
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Log Week">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => {
              if (studentIndex > 0) setLocation(`/log-week/${studentIndex - 1}`);
              else setLocation("/");
            }}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ChevronLeft className="w-5 h-5" /> Back
          </button>
          <div className="flex items-center gap-1.5">
            {allStudents.map((_, i) => (
              <button
                key={i}
                onClick={() => setLocation(`/log-week/${i}`)}
                className={`h-2.5 rounded-full transition-all ${i === studentIndex ? "bg-primary w-6" : "bg-border w-2.5"}`}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground font-medium">
            {studentIndex + 1} / {allStudents.length}
          </span>
        </div>

        <div className="bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-5 border-b border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold tracking-widest text-primary uppercase mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {weekLabel}
                </p>
                <h2 className="font-display text-3xl font-bold text-foreground">{student.name}</h2>
              </div>
              {existingEntry && (
                <span className="px-3 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full text-xs font-bold border border-amber-200 dark:border-amber-800">
                  Editing
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-8">
            <div className="space-y-4">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> Memorization Range
              </h3>
              <AyahInput
                label="From"
                surah={fromSurah}
                ayah={fromAyah}
                onSurahChange={setFromSurah}
                onAyahChange={setFromAyah}
                surahs={surahs}
              />
              <AyahInput
                label="To"
                surah={toSurah}
                ayah={toAyah}
                onSurahChange={setToSurah}
                onAyahChange={setToAyah}
                surahs={surahs}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <DaySelector label="Successful Days" value={successfulDays} max={5} onChange={setSuccessfulDays} />
              <DaySelector label="Days Attended" value={daysAttended} max={5} onChange={setDaysAttended} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" /> Week Rating
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {WEEK_RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setWeekRating(r.value)}
                    className={`py-3 px-4 rounded-xl text-sm font-bold text-left transition-all border-2 ${
                      weekRating === r.value
                        ? `${r.bg} ${r.color} shadow-md`
                        : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    <span className="mr-1.5">{r.emoji}</span> {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <QualitySelect label="RMV Quality" value={rmvQuality} onChange={setRmvQuality} />
              <QualitySelect label="Review Quality" value={reviewQuality} onChange={setReviewQuality} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any notes about this student's week..."
                className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all resize-none"
              />
            </div>
          </div>

          <div className="px-6 pb-6 flex gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 py-4 rounded-2xl border-2 border-border text-muted-foreground hover:border-primary/30 hover:text-foreground font-bold text-lg transition-all"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={upsert.isPending || submitted}
              className={`flex-[2] py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-3 ${
                submitted
                  ? "bg-green-500 text-white shadow-green-500/25"
                  : "bg-primary text-primary-foreground shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70"
              }`}
            >
              {submitted ? (
                <><CheckCircle2 className="w-5 h-5" /> Saved!</>
              ) : upsert.isPending ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>Save & Next <ChevronRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
