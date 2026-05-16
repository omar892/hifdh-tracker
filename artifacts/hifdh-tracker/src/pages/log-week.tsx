import { useState, useEffect, useRef, useCallback } from "react";
import { useProtectedRoute } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListStudents,
  useUpsertWeeklyEntry,
  useGetWeeklyEntry,
  useListWeeklyEntries,
  getGetWeeklyEntryQueryKey,
  getListWeeklyEntriesQueryKey,
  useGetDashboard,
  useGetStudentStats,
  getGetStudentStatsQueryKey,
} from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  BookOpen,
  Search,
  Copy,
  Check,
  Mic,
  MicOff,
  Sparkles,
  PenLine,
  Loader2,
  Send,
  MessageCircle,
} from "lucide-react";
import { getGenderAvatarClass, getGenderDotClass, type Gender } from "@/lib/gender-colors";
import { MushafPreviewPanel } from "@/components/quran/mushaf-preview-panel";

/* ── Constants ────────────────────────────────────── */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const ROWS = ["Memorization", "RMV", "Review"] as const;

const WEEK_RATINGS = [
  { value: "excellent", label: "Excellent", emoji: "\u{1F31F}", activeBg: "bg-yellow-500", shadow: "shadow-yellow-500/20" },
  { value: "strong", label: "Strong", emoji: "\u{1F4AA}", activeBg: "bg-emerald-500", shadow: "shadow-emerald-500/20" },
  { value: "steady", label: "Steady", emoji: "\u{1F4D6}", activeBg: "bg-blue-500", shadow: "shadow-blue-500/20" },
  { value: "needs_improvement", label: "Needs Work", emoji: "\u{1F4C8}", activeBg: "bg-orange-500", shadow: "shadow-orange-500/20" },
  { value: "difficult_week", label: "Difficult", emoji: "\u{1F932}", activeBg: "bg-red-500", shadow: "shadow-red-500/20" },
];

const EMPTY_5 = (): boolean[] => [false, false, false, false, false];

/* ── Helpers ──────────────────────────────────────── */

function suggestRmvAmount(linesPerWeek: number): string {
  if (linesPerWeek <= 5) return "Last 5 pages";
  if (linesPerWeek <= 10) return "Last 5-10 pages";
  return "Last 10+ pages";
}

function suggestReviewAmount(juzCompleted: number): string {
  if (juzCompleted < 5) return "5-10 pages";
  if (juzCompleted <= 15) return "1 Juz";
  return "2 Juz";
}

/* ── AI / Speech types ────────────────────────────── */

type EntryMode = "manual" | "ai";

// Set of field names the AI has filled
type AiFilledFields = Set<string>;

interface AiParsedResult {
  memorization_lines?: number | null;
  current_page?: number | null;
  current_line?: number | null;
  daily_tasks?: {
    mon?: { sabaq?: boolean | null; rmv?: boolean | null; review?: boolean | null };
    tue?: { sabaq?: boolean | null; rmv?: boolean | null; review?: boolean | null };
    wed?: { sabaq?: boolean | null; rmv?: boolean | null; review?: boolean | null };
    thu?: { sabaq?: boolean | null; rmv?: boolean | null; review?: boolean | null };
    fri?: { sabaq?: boolean | null; rmv?: boolean | null; review?: boolean | null };
  } | null;
  days_absent?: {
    mon?: boolean; tue?: boolean; wed?: boolean; thu?: boolean; fri?: boolean;
  } | null;
  week_rating?: string | null;
  teacher_notes?: string | null;
  rmv_amount?: string | null;
  review_amount?: string | null;
  ready_to_save?: boolean;
}

const RATING_MAP: Record<string, string> = {
  excellent: "excellent",
  strong: "strong",
  steady: "steady",
  needs_improvement: "needs_improvement",
  needs_work: "needs_improvement",
  difficult_week: "difficult_week",
  difficult: "difficult_week",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const FIELD_LABELS: Record<string, string> = {
  memorizationLines: "Lines",
  currentPage: "Page",
  currentLine: "Line",
  dailyGrid: "Daily Tasks",
  dailyAbsent: "Absent",
  weekRating: "Rating",
  notes: "Notes",
  rmvAmount: "RMV",
  reviewAmount: "Review",
};

const hasSpeechRecognition = typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

/* ── Main page ─────────────────────────────────────── */

export default function LogWeek() {
  const { isLoading: authLoading } = useProtectedRoute();
  const { studentIndex: studentIndexParam } = useParams<{ studentIndex: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const studentIndex = parseInt(studentIndexParam ?? "0", 10);

  const { data: allStudents = [], isLoading: studentsLoading } = useListStudents({ active: true });
  const { data: dashboardStudents } = useGetDashboard();
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const studentSearchRef = useRef<HTMLInputElement>(null);
  const didApplySearchParams = useRef(false);

  const student = allStudents[studentIndex];

  const { data: studentStats } = useGetStudentStats(
    student?.id ?? 0,
    { query: { queryKey: getGetStudentStatsQueryKey(student?.id ?? 0), enabled: !!student?.id } }
  );

  // Week selector state
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const [weekStart, setWeekStart] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const weekParam = params.get("week");
    if (weekParam) {
      const parsed = new Date(weekParam + "T00:00:00");
      if (!isNaN(parsed.getTime())) return startOfWeek(parsed, { weekStartsOn: 1 });
    }
    return currentWeekStart;
  });
  const isCurrentWeek = isSameDay(weekStart, currentWeekStart);
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekLabel = `${format(weekStart, "MMM d")} \u2013 ${format(addDays(weekStart, 4), "MMM d")}`;

  // Handle ?sid= query param
  useEffect(() => {
    if (didApplySearchParams.current || allStudents.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sid");
    if (sid) {
      const targetId = parseInt(sid, 10);
      const idx = allStudents.findIndex((s) => s.id === targetId);
      if (idx >= 0 && idx !== studentIndex) {
        didApplySearchParams.current = true;
        setLocation(`/log-week/${idx}`, { replace: true });
        return;
      }
    }
    didApplySearchParams.current = true;
  }, [allStudents, studentIndex, setLocation]);

  const { data: existingEntry } = useGetWeeklyEntry(
    student?.id ?? 0,
    weekStartStr,
    { query: { queryKey: getGetWeeklyEntryQueryKey(student?.id ?? 0, weekStartStr), enabled: !!student?.id, retry: false } }
  );

  const prevParams = { limit: 1 };
  const { data: prevEntries } = useListWeeklyEntries(
    student?.id ?? 0,
    prevParams,
    { query: { queryKey: getListWeeklyEntriesQueryKey(student?.id ?? 0, prevParams), enabled: !!student?.id && !existingEntry } }
  );
  const lastEntry = prevEntries?.[0];

  // Form state
  const [memorizationLines, setMemorizationLines] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentLine, setCurrentLine] = useState(1);
  const [dailySabaq, setDailySabaq] = useState<boolean[]>(EMPTY_5());
  const [dailyRmv, setDailyRmv] = useState<boolean[]>(EMPTY_5());
  const [dailyReview, setDailyReview] = useState<boolean[]>(EMPTY_5());
  const [dailyAbsent, setDailyAbsent] = useState<boolean[]>(EMPTY_5());
  const [rmvAmount, setRmvAmount] = useState("");
  const [reviewAmount, setReviewAmount] = useState("");
  const [weekRating, setWeekRating] = useState("steady");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // AI entry state
  const [entryMode, setEntryMode] = useState<EntryMode>(() => {
    try { return (localStorage.getItem("hifdh-entry-mode") as EntryMode) ?? "manual"; }
    catch { return "manual"; }
  });
  const [aiFilledFields, setAiFilledFields] = useState<AiFilledFields>(new Set());

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [readyToSave, setReadyToSave] = useState(false);
  const [showFormPreview, setShowFormPreview] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist entry mode preference
  useEffect(() => {
    try { localStorage.setItem("hifdh-entry-mode", entryMode); } catch {}
  }, [entryMode]);

  // Reset AI/chat state when switching students/weeks
  useEffect(() => {
    setChatMessages([]);
    setChatInput("");
    setIsAiStreaming(false);
    setReadyToSave(false);
    setAiFilledFields(new Set());
    stopRecording();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, weekStartStr]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiStreaming]);

  // Initialize chat greeting when entering AI mode with a student
  useEffect(() => {
    if (entryMode === "ai" && student && chatMessages.length === 0) {
      const page = student.currentPage ?? 1;
      const line = student.currentLine ?? 1;
      setChatMessages([{
        role: "assistant",
        content: `Let's log ${student.name}'s week. They're on page ${page}, line ${line}. How did they do?`,
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryMode, student?.id]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsRecording(false);
    setInterimText("");
  }, []);

  // Ref to hold pending auto-send text from voice
  const pendingVoiceTextRef = useRef("");

  const startRecording = useCallback(() => {
    if (!hasSpeechRecognition) return;
    stopRecording();
    pendingVoiceTextRef.current = "";

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (finalTranscript) {
        pendingVoiceTextRef.current = (pendingVoiceTextRef.current ? pendingVoiceTextRef.current + " " : "") + finalTranscript.trim();
        setChatInput(pendingVoiceTextRef.current);
      }
      setInterimText(interim);

      // Reset silence timer — auto-send after 2.5s silence
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        stopRecording();
        // Auto-send if there's accumulated text
        if (pendingVoiceTextRef.current.trim()) {
          autoSendVoiceRef.current?.(pendingVoiceTextRef.current.trim());
          pendingVoiceTextRef.current = "";
        }
      }, 2500);
    };

    recognition.onerror = () => {
      stopRecording();
      toast({ title: "Voice input error", description: "Microphone access may be blocked.", variant: "destructive" });
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);

    // Initial silence timeout
    silenceTimerRef.current = setTimeout(() => {
      stopRecording();
    }, 5000);
  }, [stopRecording, toast]);

  // Apply extracted fields incrementally (merges, doesn't reset)
  const applyFieldsToForm = useCallback((parsed: AiParsedResult) => {
    setAiFilledFields((prev) => {
      const filled = new Set(prev);

      if (parsed.memorization_lines != null) {
        setMemorizationLines(parsed.memorization_lines);
        filled.add("memorizationLines");
      }
      if (parsed.current_page != null) {
        setCurrentPage(Math.max(1, Math.min(604, parsed.current_page)));
        filled.add("currentPage");
      }
      if (parsed.current_line != null) {
        setCurrentLine(Math.max(1, Math.min(15, parsed.current_line)));
        filled.add("currentLine");
      }

      const dayKeys = ["mon", "tue", "wed", "thu", "fri"] as const;

      if (parsed.days_absent) {
        const absent = dayKeys.map((d) => parsed.days_absent?.[d] === true);
        setDailyAbsent(absent);
        filled.add("dailyAbsent");
      }

      if (parsed.daily_tasks) {
        const tasks = parsed.daily_tasks;
        const sabaq = dayKeys.map((d) => tasks[d]?.sabaq === true);
        const rmv = dayKeys.map((d) => tasks[d]?.rmv === true);
        const review = dayKeys.map((d) => tasks[d]?.review === true);

        const absent = parsed.days_absent;
        if (absent) {
          dayKeys.forEach((d, i) => {
            if (absent[d]) { sabaq[i] = false; rmv[i] = false; review[i] = false; }
          });
        }

        setDailySabaq(sabaq);
        setDailyRmv(rmv);
        setDailyReview(review);
        filled.add("dailyGrid");
      }

      if (parsed.week_rating != null) {
        const normalized = RATING_MAP[parsed.week_rating.toLowerCase().replace(/\s+/g, "_")] ?? null;
        if (normalized) {
          setWeekRating(normalized);
          filled.add("weekRating");
        }
      }

      if (parsed.teacher_notes != null) {
        setNotes(parsed.teacher_notes);
        setShowNotes(true);
        filled.add("notes");
      }

      if (parsed.rmv_amount != null) {
        setRmvAmount(parsed.rmv_amount);
        filled.add("rmvAmount");
      }

      if (parsed.review_amount != null) {
        setReviewAmount(parsed.review_amount);
        filled.add("reviewAmount");
      }

      if (parsed.ready_to_save) {
        setReadyToSave(true);
      }

      return filled;
    });
  }, []);

  // Send a chat message and stream the response
  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || !student || isAiStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsAiStreaming(true);

    try {
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentName: student.name,
          currentPage: student.currentPage,
          currentLine: student.currentLine,
          messages: updatedMessages,
        }),
      });

      if (!resp.ok) throw new Error("AI request failed");

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantText = "";
      let buffer = "";
      let eventType = ""; // Persists across read() calls in case event:/data: split across chunks

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from buffer, keeping any partial trailing line
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);

          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (eventType === "text_clear") {
                // Server is about to stream follow-up text; discard pre-tool text
                assistantText = "";
                setChatMessages((prev) => {
                  const msgs = [...prev];
                  const lastMsg = msgs[msgs.length - 1];
                  if (lastMsg?.role === "assistant") {
                    msgs[msgs.length - 1] = { ...lastMsg, content: "" };
                  }
                  return msgs;
                });
              } else if (eventType === "text") {
                assistantText += parsed.text;
                setChatMessages((prev) => {
                  const msgs = [...prev];
                  const lastMsg = msgs[msgs.length - 1];
                  if (lastMsg?.role === "assistant") {
                    msgs[msgs.length - 1] = { ...lastMsg, content: assistantText };
                  } else {
                    msgs.push({ role: "assistant", content: assistantText });
                  }
                  return msgs;
                });
              } else if (eventType === "extraction") {
                applyFieldsToForm(parsed as AiParsedResult);
              } else if (eventType === "error") {
                throw new Error(parsed.error);
              }
              eventType = ""; // Reset after consuming
            } catch (e) {
              if (e instanceof SyntaxError) continue; // Skip malformed JSON
              throw e;
            }
          }
          // Empty lines (SSE event separators) are naturally skipped
        }
      }
    } catch {
      toast({ title: "AI chat error", description: "Try again or switch to manual entry.", variant: "destructive" });
      // Remove the streaming assistant message if it failed
      setChatMessages((prev) => {
        if (prev[prev.length - 1]?.role === "assistant" && prev[prev.length - 1]?.content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsAiStreaming(false);
    }
  }, [student, chatMessages, isAiStreaming, applyFieldsToForm, toast]);

  // Ref for auto-send from voice (avoids stale closure)
  const autoSendVoiceRef = useRef<((text: string) => void) | null>(null);
  autoSendVoiceRef.current = sendChatMessage;

  // Helper to check if a field was AI-filled
  const isAiFilled = (field: string) => aiFilledFields.has(field);
  // Style helper for AI-filled fields
  const aiBorderClass = (field: string) =>
    isAiFilled(field) ? "border-l-2 border-l-emerald-500" : "";

  const suggestedRmv = suggestRmvAmount(studentStats?.linesThisMonth ? studentStats.linesThisMonth / 4 : 0);
  const suggestedReview = suggestReviewAmount(studentStats?.juzCompleted ?? 0);

  // Sync state from existing entry or smart defaults
  useEffect(() => {
    if (!student) return;
    setSubmitted(false);
    setShowNotes(false);
    if (existingEntry) {
      setMemorizationLines(existingEntry.memorizationLines ?? 0);
      setCurrentPage(existingEntry.currentPage ?? student.currentPage ?? 1);
      setCurrentLine(existingEntry.currentLine ?? student.currentLine ?? 1);
      setDailySabaq(existingEntry.dailySabaq ?? EMPTY_5());
      setDailyRmv(existingEntry.dailyRmv ?? EMPTY_5());
      setDailyReview(existingEntry.dailyReview ?? EMPTY_5());
      setDailyAbsent(existingEntry.dailyAbsent ?? EMPTY_5());
      setRmvAmount(existingEntry.rmvAmount ?? "");
      setReviewAmount(existingEntry.reviewAmount ?? "");
      setWeekRating(existingEntry.weekRating ?? "steady");
      setNotes(existingEntry.teacherNotes ?? "");
      if (existingEntry.teacherNotes) setShowNotes(true);
    } else {
      setMemorizationLines(0);
      setCurrentPage(student.currentPage ?? 1);
      setCurrentLine(student.currentLine ?? 1);
      setDailySabaq(EMPTY_5());
      setDailyRmv(EMPTY_5());
      setDailyReview(EMPTY_5());
      setDailyAbsent(EMPTY_5());
      setRmvAmount(lastEntry?.rmvAmount ?? "");
      setReviewAmount(lastEntry?.reviewAmount ?? "");
      setWeekRating("steady");
      setNotes("");
    }
  }, [student?.id, existingEntry?.id, lastEntry?.id, weekStartStr]);

  useEffect(() => {
    if (!rmvAmount && suggestedRmv) setRmvAmount(suggestedRmv);
  }, [suggestedRmv]);
  useEffect(() => {
    if (!reviewAmount && suggestedReview) setReviewAmount(suggestedReview);
  }, [suggestedReview]);

  const upsert = useUpsertWeeklyEntry();
  const safeIndex = Math.min(studentIndex, allStudents.length - 1);

  const advance = () => {
    const next = studentIndex + 1;
    if (next < allStudents.length) setLocation(`/log-week/${next}`);
    else setLocation("/");
  };

  const handleCopyLastWeek = () => {
    if (!lastEntry) return;
    setDailySabaq(lastEntry.dailySabaq ?? EMPTY_5());
    setDailyRmv(lastEntry.dailyRmv ?? EMPTY_5());
    setDailyReview(lastEntry.dailyReview ?? EMPTY_5());
    setDailyAbsent(lastEntry.dailyAbsent ?? EMPTY_5());
    setRmvAmount(lastEntry.rmvAmount ?? "");
    setReviewAmount(lastEntry.reviewAmount ?? "");
    setWeekRating(lastEntry.weekRating ?? "steady");
    toast({ title: "Copied last week" });
  };

  const toggle = (arr: boolean[], i: number, setter: (a: boolean[]) => void) => {
    const next = [...arr];
    next[i] = !next[i];
    setter(next);
  };

  const toggleAbsent = (i: number) => {
    const next = [...dailyAbsent];
    next[i] = !next[i];
    if (next[i]) {
      const s = [...dailySabaq]; s[i] = false; setDailySabaq(s);
      const r = [...dailyRmv]; r[i] = false; setDailyRmv(r);
      const v = [...dailyReview]; v[i] = false; setDailyReview(v);
    }
    setDailyAbsent(next);
  };

  // Computed
  let totalPoints = 0;
  let successfulDays = 0;
  let daysAttended = 0;
  const dailyPoints: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (dailyAbsent[i]) { dailyPoints.push(-1); continue; }
    daysAttended++;
    let dp = 0;
    if (dailySabaq[i]) { dp++; totalPoints++; }
    if (dailyRmv[i]) { dp++; totalPoints++; }
    if (dailyReview[i]) { dp++; totalPoints++; }
    if (dp === 3) successfulDays++;
    dailyPoints.push(dp);
  }

  const maxPoints = daysAttended * 3;
  const pointsColor = totalPoints >= maxPoints * 0.87 ? "text-emerald-600 dark:text-emerald-400"
    : totalPoints >= maxPoints * 0.67 ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400";

  const rowTotal = (arr: boolean[]) => arr.filter((v, i) => v && !dailyAbsent[i]).length;

  const handleSubmit = async () => {
    if (!student) {
      toast({ title: "Missing student", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        studentId: student.id,
        weekStart: weekStartStr,
        data: {
          memorizationLines,
          currentPage,
          currentLine,
          dailySabaq,
          dailyRmv,
          dailyReview,
          dailyAbsent,
          rmvAmount: rmvAmount || null,
          reviewAmount: reviewAmount || null,
          weekRating: weekRating as "excellent" | "strong" | "steady" | "needs_improvement" | "difficult_week",
          teacherNotes: notes || null,
        },
      });
      setSubmitted(true);
      toast({ title: `${student.name} saved` });
      if (isCurrentWeek) setTimeout(advance, 300);
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
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

  if (allStudents.length === 0) {
    return (
      <AppLayout title="Log Week">
        <div className="text-center p-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground mb-1">Ready to start logging!</h2>
          <p className="text-sm text-muted-foreground mb-6">Add your first student from Manage Students to begin.</p>
          <button onClick={() => setLocation("/manage")} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm shadow-md">
            Add Students
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Log Week">
      <div className="max-w-4xl mx-auto">
        {/* ── Top bar ── */}
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          {/* Student nav */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <button aria-label="Previous student" disabled={safeIndex === 0}
              onClick={() => setLocation(`/log-week/${safeIndex - 1}`)}
              className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all disabled:opacity-30 shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setShowStudentPicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border/50 text-foreground font-bold text-base transition-all cursor-pointer min-w-0 hover:border-primary/40 shadow-sm">
              <span className="truncate">{student?.name ?? "Select student"}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
            <button aria-label="Next student" disabled={safeIndex >= allStudents.length - 1}
              onClick={() => setLocation(`/log-week/${safeIndex + 1}`)}
              className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all disabled:opacity-30 shrink-0">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-extrabold text-primary ml-1 shrink-0">{safeIndex + 1}/{allStudents.length}</span>
          </div>

          {/* Week nav */}
          <div className="flex items-center gap-1 shrink-0">
            <button aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="text-center min-w-[120px]">
              <p className="text-sm font-bold text-foreground tracking-tight">{weekLabel}</p>
              {!isCurrentWeek && (
                <button onClick={() => setWeekStart(currentWeekStart)} className="text-[10px] text-primary font-bold">Back to this week</button>
              )}
            </div>
            <button aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))} disabled={isCurrentWeek}
              className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-all disabled:opacity-30">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Copy / edit badge */}
          <div className="flex items-center gap-2 shrink-0">
            {existingEntry && (
              <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">editing</span>
            )}
            {lastEntry && !existingEntry && (
              <button type="button" onClick={handleCopyLastWeek}
                className="flex items-center gap-1 text-xs font-bold text-primary/70 hover:text-primary transition-colors">
                <Copy className="w-3 h-3" /> Copy last
              </button>
            )}
          </div>
        </div>

        {/* Student picker modal */}
        {showStudentPicker && (() => {
          const q = studentSearch.toLowerCase();
          const filtered = q
            ? allStudents.map((s, i) => ({ s, i })).filter(({ s }) => s.name.toLowerCase().includes(q))
            : allStudents.map((s, i) => ({ s, i }));
          return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowStudentPicker(false); setStudentSearch(""); }} />
            <div className="relative bg-card rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[70vh] flex flex-col border border-border/50 shadow-2xl">
              <div className="p-4 border-b border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-lg text-foreground">Select Student</h3>
                  <button type="button" onClick={() => { setShowStudentPicker(false); setStudentSearch(""); }}
                    className="p-2 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-all">
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background border border-border focus-within:border-primary transition-all">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    ref={studentSearchRef}
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search students..."
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                  />
                </div>
              </div>
              <div className="overflow-y-auto p-3 grid grid-cols-2 gap-2">
                {filtered.length === 0 ? (
                  <div className="col-span-2 text-center py-6 text-muted-foreground text-sm">No students found</div>
                ) : filtered.map(({ s, i }) => {
                  const isDone = dashboardStudents?.find((d) => d.id === s.id)?.thisWeekDone ?? false;
                  const isSelected = i === safeIndex;
                  return (
                    <button key={s.id} type="button"
                      onClick={() => { setLocation(`/log-week/${i}`); setShowStudentPicker(false); setStudentSearch(""); }}
                      className={`flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left ${
                        isSelected ? "border-primary bg-primary/10" : "border-border/50 bg-background hover:border-primary/30"
                      }`}>
                      <div className="flex items-center gap-2 w-full min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${getGenderDotClass(s.gender as Gender)}`} />
                        <span className={`font-bold text-sm truncate ${isSelected ? "text-primary" : "text-foreground"}`}>{s.name}</span>
                      </div>
                      <span className={`text-[10px] font-extrabold mt-1 ml-4 ${isDone ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {isDone ? "\u2713 Done" : "Pending"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          );
        })()}

        {/* ── Mode Toggle ── */}
        <div className="flex mb-4">
          <button
            type="button"
            onClick={() => setEntryMode("manual")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-l-xl border-2 font-bold text-sm transition-all ${
              entryMode === "manual"
                ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20"
                : "bg-card text-muted-foreground border-border/50 hover:border-border"
            }`}
          >
            <PenLine className="w-4 h-4" /> Manual Entry
          </button>
          <button
            type="button"
            onClick={() => setEntryMode("ai")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-r-xl border-2 border-l-0 font-bold text-sm transition-all ${
              entryMode === "ai"
                ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20"
                : "bg-card text-muted-foreground border-border/50 hover:border-border"
            }`}
          >
            <Mic className="w-4 h-4" /> AI Entry
          </button>
        </div>

        {/* ── AI Chat Interface ── */}
        {entryMode === "ai" && (
          <div className="mb-4 flex flex-col" style={{ minHeight: "360px" }}>
            {/* Entry Progress Card */}
            <button
              type="button"
              onClick={() => setShowFormPreview(!showFormPreview)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-card border border-border/50 shadow-sm mb-2 transition-all hover:border-primary/30"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-bold text-foreground">Entry Progress</span>
                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                  {aiFilledFields.size}/{Object.keys(FIELD_LABELS).length}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showFormPreview ? "rotate-180" : ""}`} />
            </button>
            {showFormPreview && aiFilledFields.size > 0 && (
              <div className="px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-800/50 mb-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(FIELD_LABELS).map(([key, label]) => (
                    <span key={key} className={`text-[11px] font-bold ${aiFilledFields.has(key) ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"}`}>
                      {aiFilledFields.has(key) ? "\u2713" : "\u2013"} {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-2 max-h-[40vh] min-h-[160px] px-1">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border/50 text-foreground rounded-bl-md"
                  }`}>
                    {msg.role === "assistant" && (
                      <MessageCircle className="w-3 h-3 text-emerald-500 inline mr-1.5 -mt-0.5" />
                    )}
                    {msg.content}
                  </div>
                </div>
              ))}
              {isAiStreaming && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Ready to save banner */}
            {readyToSave && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex-1">Ready to save</span>
                <button
                  type="button"
                  onClick={() => { setEntryMode("manual"); }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Review Form
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={upsert.isPending}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-bold shadow-sm disabled:opacity-70"
                >
                  {upsert.isPending ? "Saving..." : isCurrentWeek ? "Save & Next" : "Save"}
                </button>
              </div>
            )}

            {/* Chat input bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput + (interimText ? (chatInput ? " " : "") + interimText : "")}
                  onChange={(e) => { setChatInput(e.target.value); setInterimText(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
                  placeholder="Type or tap mic..."
                  disabled={isAiStreaming}
                  className="w-full pl-4 pr-12 py-3 rounded-2xl bg-card border border-border/50 text-foreground text-sm placeholder:text-muted-foreground/40 focus:border-primary outline-none transition-all shadow-sm disabled:opacity-60"
                  style={{ fontSize: "16px" }}
                />
                {hasSpeechRecognition && (
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isAiStreaming}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isRecording
                        ? "bg-red-500 text-white animate-pulse shadow-red-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 disabled:opacity-40"
                    }`}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => sendChatMessage(chatInput)}
                disabled={!chatInput.trim() || isAiStreaming}
                className="w-11 h-11 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white flex items-center justify-center shadow-md disabled:opacity-40 transition-all active:scale-95 shrink-0"
              >
                {isAiStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {isRecording && (
              <p className="text-xs font-bold text-red-500 flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Listening...
              </p>
            )}
          </div>
        )}

        {/* ── AI Review Banner ── */}
        {entryMode === "manual" && aiFilledFields.size > 0 && (
          <div className="mb-3 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                AI filled {aiFilledFields.size} field{aiFilledFields.size !== 1 ? "s" : ""} — review and save
              </span>
            </div>
          </div>
        )}

        {/* ── Manual Form ── */}
        {entryMode === "manual" && (<>

        {/* ── New Lines + Current Position ── */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {/* Left: New Lines This Week */}
          <div className={`bg-card rounded-2xl border border-border/50 p-3 shadow-sm ${aiBorderClass("memorizationLines")}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest">New Lines This Week</span>
              {isAiFilled("memorizationLines") && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-auto">AI</span>}
            </div>
            <input
              type="number"
              min={0}
              value={memorizationLines}
              onChange={(e) => setMemorizationLines(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-foreground text-2xl font-extrabold text-center focus:border-primary outline-none transition-all"
            />
            {memorizationLines > 0 && (
              <p className="text-xs text-muted-foreground mt-1 text-center font-medium">
                = {(memorizationLines / 15).toFixed(1)} pages
              </p>
            )}
          </div>

          {/* Right: Current Position */}
          <div className={`bg-card rounded-2xl border border-border/50 p-3 shadow-sm ${aiBorderClass("currentPage")}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">Current Position</span>
              {(isAiFilled("currentPage") || isAiFilled("currentLine")) && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-auto">AI</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span className="text-[9px] font-bold text-muted-foreground/70 uppercase">Page</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  value={currentPage}
                  onChange={(e) => setCurrentPage(Math.max(1, Math.min(604, parseInt(e.target.value) || 1)))}
                  className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-sm font-bold text-center focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="flex-1">
                <span className="text-[9px] font-bold text-muted-foreground/70 uppercase">Line</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={currentLine}
                  onChange={(e) => setCurrentLine(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                  className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-foreground text-sm font-bold text-center focus:border-primary outline-none transition-all"
                />
              </div>
            </div>
            {(() => {
              const lastPage = existingEntry ? (student?.currentPage ?? 1) : (lastEntry?.currentPage ?? student?.currentPage ?? 1);
              const lastLine = existingEntry ? (student?.currentLine ?? 1) : (lastEntry?.currentLine ?? student?.currentLine ?? 1);
              const pageDelta = currentPage - lastPage;
              const lineDelta = currentLine - lastLine;
              return (
                <>
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5 font-medium">
                    Last week: Page {lastPage}, Line {lastLine}
                  </p>
                  {(pageDelta !== 0 || lineDelta !== 0) && (
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      {pageDelta > 0 ? `▲ ${pageDelta} pg` : pageDelta < 0 ? `▼ ${Math.abs(pageDelta)} pg` : ""}
                      {pageDelta !== 0 && lineDelta !== 0 ? ", " : ""}
                      {lineDelta > 0 ? `▲ ${lineDelta} ln` : lineDelta < 0 ? `▼ ${Math.abs(lineDelta)} ln` : ""}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* ── Mushaf preview ── */}
        <MushafPreviewPanel
          mushafId={(student?.mushafPreference ?? "madani_15") as "madani_15" | "indopak_15"}
          page={currentPage}
          line={currentLine}
          onSelectLine={(ln) => setCurrentLine(ln)}
          onPageChange={(p) => setCurrentPage(p)}
        />

        {/* ── RMV & Review amounts ── */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className={`bg-card rounded-xl border border-border/50 px-3 py-2.5 shadow-sm ${aiBorderClass("rmvAmount")}`}>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-extrabold text-primary uppercase tracking-wider">RMV (Daily)</span>
              {isAiFilled("rmvAmount") && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-auto">AI</span>}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Recently memorized verses</p>
            <input
              type="text"
              value={rmvAmount}
              onChange={(e) => setRmvAmount(e.target.value)}
              placeholder={suggestedRmv}
              className="w-full mt-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary transition-all font-medium"
            />
          </div>
          <div className={`bg-card rounded-xl border border-border/50 px-3 py-2.5 shadow-sm ${aiBorderClass("reviewAmount")}`}>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-extrabold text-primary uppercase tracking-wider">Review (Daily)</span>
              {isAiFilled("reviewAmount") && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-auto">AI</span>}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Older material</p>
            <input
              type="text"
              value={reviewAmount}
              onChange={(e) => setReviewAmount(e.target.value)}
              placeholder={suggestedReview}
              className="w-full mt-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary transition-all font-medium"
            />
          </div>
        </div>

        {/* ── Daily Grid ── */}
        <div className={`bg-card rounded-2xl border border-border/50 p-3 mb-3 shadow-sm ${aiBorderClass("dailyGrid")}`}>
          {isAiFilled("dailyGrid") && (
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">AI</span>
              <span className="text-[10px] text-muted-foreground">Tap any cell to adjust</span>
            </div>
          )}
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-20" />
                {DAYS.map((day, i) => (
                  <th key={day} className="text-center pb-2">
                    <button
                      type="button"
                      onClick={() => toggleAbsent(i)}
                      className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${
                        dailyAbsent[i]
                          ? "bg-zinc-500/15 text-zinc-400 line-through"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                      title={dailyAbsent[i] ? "Mark present" : "Mark absent"}
                    >
                      {dailyAbsent[i] ? "A" : day}
                    </button>
                  </th>
                ))}
                <th className="text-center pb-2 w-14">
                  <span className="text-[9px] font-extrabold text-muted-foreground/60 uppercase tracking-widest">/5</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const arr = row === "Memorization" ? dailySabaq : row === "RMV" ? dailyRmv : dailyReview;
                const setter = row === "Memorization" ? setDailySabaq : row === "RMV" ? setDailyRmv : setDailyReview;
                const total = rowTotal(arr);
                return (
                  <tr key={row} className="border-t border-border/20">
                    <td className="py-1.5 pr-2">
                      <span className="text-xs font-bold text-foreground">{row}</span>
                    </td>
                    {DAYS.map((_, i) => {
                      const absent = dailyAbsent[i];
                      const checked = arr[i];
                      return (
                        <td key={i} className="text-center py-1.5">
                          <button
                            type="button"
                            disabled={absent}
                            onClick={() => toggle(arr, i, setter)}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-90 mx-auto ${
                              absent
                                ? "bg-zinc-500/8 cursor-not-allowed"
                                : checked
                                ? "bg-emerald-500/12 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/10"
                                : "bg-secondary/40 border-2 border-border/30 text-muted-foreground/20 hover:border-primary/30"
                            }`}
                          >
                            {absent ? (
                              <span className="text-zinc-400/60 text-xs font-bold">\u2014</span>
                            ) : checked ? (
                              <Check className="w-5 h-5" strokeWidth={3} />
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                    <td className="text-center py-1.5">
                      <span className={`text-sm font-extrabold ${total >= 4 ? "text-emerald-600 dark:text-emerald-400" : total >= 3 ? "text-foreground" : "text-muted-foreground/60"}`}>
                        {total}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Daily points row */}
              <tr className="border-t border-border/30">
                <td className="py-1.5 pr-2">
                  <span className="text-[9px] font-extrabold text-muted-foreground/60 uppercase tracking-widest">Pts</span>
                </td>
                {dailyPoints.map((dp, i) => (
                  <td key={i} className="text-center py-1.5">
                    <span className={`text-xs font-extrabold ${
                      dp === -1 ? "text-zinc-400/50"
                      : dp === 3 ? "text-emerald-600 dark:text-emerald-400"
                      : dp === 0 ? "text-muted-foreground/30"
                      : "text-foreground"
                    }`}>
                      {dp === -1 ? "\u2014" : `${dp}/3`}
                    </span>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Points display ── */}
        <div className="bg-card rounded-2xl border border-border/50 p-3 mb-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[9px] font-extrabold text-muted-foreground/60 uppercase tracking-widest">Weekly Points</span>
              <p className={`text-3xl font-display font-extrabold tracking-tight ${pointsColor}`}>
                {totalPoints}<span className="text-lg text-muted-foreground/50">/{maxPoints}</span>
              </p>
            </div>
            <div className="h-10 w-px bg-border/30" />
            <div>
              <span className="text-[9px] font-extrabold text-muted-foreground/60 uppercase tracking-widest">Successful Days</span>
              <p className="text-3xl font-display font-extrabold text-foreground tracking-tight">
                {successfulDays}<span className="text-lg text-muted-foreground/50">/{daysAttended}</span>
              </p>
            </div>
          </div>
          {daysAttended < 5 && (
            <span className="text-[10px] font-bold text-zinc-400">{5 - daysAttended} absent</span>
          )}
        </div>

        {/* ── Bottom row: Rating, Notes, Save ── */}
        <div className="flex flex-wrap items-end gap-2.5">
          {/* Week Rating */}
          <div className="flex gap-1">
            {WEEK_RATINGS.map((r) => {
              const active = weekRating === r.value;
              return (
                <button key={r.value} type="button" onClick={() => setWeekRating(r.value)}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl border-2 transition-all active:scale-95 ${
                    active
                      ? `${r.activeBg} text-white border-transparent shadow-md ${r.shadow}`
                      : "bg-card border-border/30 text-muted-foreground hover:border-border"
                  }`}>
                  <span className="text-base leading-none">{r.emoji}</span>
                  <span className="text-[8px] font-bold leading-tight text-center mt-0.5">{r.label}</span>
                </button>
              );
            })}
          </div>

          {/* Notes */}
          <div className="flex-1 min-w-[120px]">
            {!showNotes ? (
              <button type="button" onClick={() => setShowNotes(true)}
                className="text-sm font-bold text-primary active:text-primary/70 transition-colors">
                + Notes
              </button>
            ) : (
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes..."
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/50 text-foreground placeholder:text-muted-foreground/40 focus:border-primary outline-none transition-all text-sm"
              />
            )}
          </div>

          {/* Save */}
          <button type="button" onClick={handleSubmit} disabled={upsert.isPending || submitted}
            className={`px-8 py-3 rounded-2xl font-bold text-base transition-all shadow-lg flex items-center gap-2 active:scale-[0.98] shrink-0 ${
              submitted
                ? "bg-emerald-500 text-white shadow-emerald-500/25"
                : "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-emerald-600/25 disabled:opacity-70"
            }`}>
            {submitted ? (
              <><CheckCircle2 className="w-5 h-5" /> Saved</>
            ) : upsert.isPending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isCurrentWeek ? (
              <>Save & Next <ChevronRight className="w-5 h-5" /></>
            ) : (
              <>Save</>
            )}
          </button>
        </div>

        </>)}
      </div>
    </AppLayout>
  );
}
