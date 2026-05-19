/**
 * Public parent-facing student progress page.
 *
 * Route: /share/:token  — NO auth, no app chrome (no sidebar, no nav, no
 * "manage" buttons). Just a parent-friendly read of the student's progress.
 *
 * Backend: GET /api/share/:token (no auth either). Returns:
 *   - student: name, current page/line, mushaf, status
 *   - completedJuz: number[]
 *   - recentEntries: last 12 weekly entries (with teacherNotes stripped
 *     unless notes_visible_to_parent is on for this token)
 *   - notesVisible: boolean (whether notes are included in the response)
 */

import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { BookOpen, Calendar, Star, TrendingUp, Award, Loader2 } from "lucide-react";
import { formatLines } from "@/lib/format";

interface ShareData {
  student: {
    name: string;
    currentPage: number;
    currentLine: number;
    mushafPreference: string;
    status: "active" | "paused" | "graduated" | "withdrawn";
  };
  completedJuz: number[];
  recentEntries: {
    weekStartDate: string;
    weekEndDate: string;
    memorizationLines: number;
    currentPage: number | null;
    currentLine: number | null;
    successfulDays: number;
    daysAttended: number;
    weekRating: string | null;
    teacherNotes: string | null;
  }[];
  notesVisible: boolean;
}

const RATING_LABELS: Record<string, { label: string; chip: string }> = {
  excellent: { label: "Excellent", chip: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200" },
  strong: { label: "Strong", chip: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200" },
  steady: { label: "Steady", chip: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200" },
  needs_improvement: { label: "Building", chip: "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200" },
  difficult_week: { label: "Tough week", chip: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200" },
};

function formatWeekRange(startIso: string, endIso: string): string {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${startStr} – ${endStr}`;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["share", token],
    queryFn: async () => {
      const res = await fetch(`/api/share/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as ShareData;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-muted-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Link not available</h1>
          <p className="text-muted-foreground text-sm">
            This progress link may have been revoked, or the URL is incorrect. Please
            ask your child's teacher for an updated link.
          </p>
        </div>
      </div>
    );
  }

  const { student, completedJuz, recentEntries } = data;
  const juzPct = Math.round((completedJuz.length / 30) * 100);
  // Total lines memorized: 15 lines × pages in completed juz. This mirrors
  // the teacher-side computation but the parent doesn't need to know the
  // formula — they see one big number.
  // (Juz boundaries — page starts for juz 1..30 + total pages, 604.)
  const JUZ_START_PAGES = [
    1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
    201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
    402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
  ];
  const LINES_PER_PAGE = 15;
  const TOTAL_PAGES = 604;
  let totalLines = 0;
  for (const j of completedJuz) {
    const startPage = JUZ_START_PAGES[j - 1];
    const endPage = j < 30 ? JUZ_START_PAGES[j] - 1 : TOTAL_PAGES;
    totalLines += (endPage - startPage + 1) * LINES_PER_PAGE;
  }
  const TOTAL_LINES = 604 * 15; // 9060

  const recent4 = recentEntries.slice(0, 4);
  const recent4Lines = recent4.reduce((s, e) => s + e.memorizationLines, 0);
  const recent4Days = recent4.reduce((s, e) => s + e.daysAttended, 0);
  const recent4Successful = recent4.reduce((s, e) => s + e.successfulDays, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20 dark:via-background dark:to-background">
      {/* Soft top banner so the page reads as a "shared report," not the app */}
      <div className="border-b border-emerald-500/10 bg-emerald-50/50 dark:bg-emerald-950/20">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tracking-widest uppercase">
          <BookOpen className="w-3.5 h-3.5" />
          Quran Memorization Progress
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-8">
          <p className="text-xs font-bold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase mb-2">Student</p>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {student.name}
          </h1>
          {student.status === "paused" && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300 font-medium">
              Currently on a pause from the program
            </p>
          )}
          {student.status === "graduated" && (
            <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 font-bold flex items-center justify-center gap-1.5">
              <Award className="w-4 h-4" /> Graduated
            </p>
          )}
        </div>

        {/* Big-stat row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-card rounded-2xl p-4 sm:p-5 border border-border/50 shadow-sm text-center">
            <p className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-1">Memorized</p>
            <p className="font-display text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {completedJuz.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">of 30 juz · {juzPct}%</p>
          </div>
          <div className="bg-card rounded-2xl p-4 sm:p-5 border border-border/50 shadow-sm text-center">
            <p className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-1">Current</p>
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums">
              Pg {student.currentPage}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">line {student.currentLine}</p>
          </div>
          <div className="bg-card rounded-2xl p-4 sm:p-5 border border-border/50 shadow-sm text-center">
            <p className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-1">Lines total</p>
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums">
              {formatLines(totalLines, { short: true })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{Math.round((totalLines / TOTAL_LINES) * 100)}% of Quran</p>
          </div>
        </div>

        {/* Juz grid — visual celebration of progress */}
        <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold text-foreground tracking-tight">Juz Memorized</h2>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">{completedJuz.length}/30</p>
          </div>
          <div className="grid grid-cols-10 gap-1.5 sm:gap-2">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => {
              const done = completedJuz.includes(j);
              return (
                <div
                  key={j}
                  className={`aspect-square rounded-md flex items-center justify-center text-[11px] sm:text-xs font-extrabold transition-colors ${
                    done
                      ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                      : "bg-secondary/60 text-muted-foreground/40"
                  }`}
                  title={`Juz ${j}${done ? " — memorized" : ""}`}
                >
                  {j}
                </div>
              );
            })}
          </div>
        </div>

        {/* Last 4 weeks summary */}
        {recent4.length > 0 && (
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm mb-8">
            <h2 className="font-display text-lg font-bold text-foreground tracking-tight mb-3">Last 4 weeks</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-1">New memorization</p>
                <p className="font-display text-xl font-bold text-foreground">
                  {formatLines(recent4Lines, { short: true })}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-1">Attendance</p>
                <p className="font-display text-xl font-bold text-foreground">
                  {recent4Days} <span className="text-sm text-muted-foreground">days</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-1">Strong days</p>
                <p className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {recent4Successful}<span className="text-sm text-muted-foreground">/{recent4Days}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Weekly history list */}
        {recentEntries.length > 0 && (
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm mb-8">
            <h2 className="font-display text-lg font-bold text-foreground tracking-tight mb-3">Weekly history</h2>
            <div className="space-y-2.5">
              {recentEntries.map((entry) => {
                const rating = entry.weekRating ? RATING_LABELS[entry.weekRating] : null;
                return (
                  <div
                    key={entry.weekStartDate}
                    className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30"
                  >
                    <div className="shrink-0 w-1 h-12 rounded-full bg-emerald-500/30" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <p className="text-sm font-bold text-foreground tabular-nums">
                          {formatWeekRange(entry.weekStartDate, entry.weekEndDate)}
                        </p>
                        {rating && (
                          <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${rating.chip}`}>
                            {rating.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          <span className="font-semibold text-foreground/80">{formatLines(entry.memorizationLines)}</span>
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span className="font-semibold text-foreground/80">
                            {entry.successfulDays}/{entry.daysAttended} strong days
                          </span>
                        </span>
                      </p>
                      {entry.teacherNotes && (
                        <p className="text-xs text-foreground/70 italic mt-2 leading-relaxed">
                          “{entry.teacherNotes}”
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 mb-4">
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            This is a read-only progress link from your child's teacher.
            <br />
            Updates as new weekly entries are logged.
          </p>
        </div>
      </div>
    </div>
  );
}
