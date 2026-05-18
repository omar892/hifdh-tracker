/**
 * The four "step 2" sections that turn the student profile into a real
 * Student Record page: status badge + change, guardians, attendance, parent
 * link. Each is self-contained — drop into the existing profile layout where
 * it fits visually.
 */

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Pause,
  GraduationCap,
  UserX,
  ChevronDown,
  Users,
  Plus,
  Trash2,
  Link as LinkIcon,
  Copy,
  Check,
  EyeOff,
  Eye,
  Calendar,
} from "lucide-react";
import {
  type StudentStatus,
  type AttendanceSummary,
  useChangeStatus,
  useGuardians,
  useCreateGuardian,
  useDeleteGuardian,
  useViewerLinks,
  useCreateViewerLink,
  useUpdateViewerLink,
  useDeleteViewerLink,
} from "@/hooks/use-student-record";

/* ── Status badge + change action ─────────────────────────────────────── */

const STATUS_META: Record<StudentStatus, { label: string; chip: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: "Active", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: ShieldCheck },
  paused: { label: "Paused", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: Pause },
  graduated: { label: "Graduated", chip: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300", icon: GraduationCap },
  withdrawn: { label: "Withdrawn", chip: "bg-muted text-muted-foreground", icon: UserX },
};

export function StatusBadge({ status, studentId }: { status: StudentStatus; studentId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const changeStatus = useChangeStatus(studentId);
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  const choose = (next: StudentStatus) => {
    if (next === status) {
      setOpen(false);
      return;
    }
    changeStatus.mutate(next, {
      onSuccess: () => {
        setOpen(false);
        toast({ title: `Status changed to ${STATUS_META[next].label}` });
      },
      onError: (err) => {
        toast({ title: "Failed to change status", description: String((err as Error).message), variant: "destructive" });
      },
    });
  };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold transition-colors ${meta.chip}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {meta.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] bg-popover border border-border rounded-xl shadow-lg p-1">
          {(Object.keys(STATUS_META) as StudentStatus[]).map((s) => {
            const m = STATUS_META[s];
            const SIcon = m.icon;
            return (
              <button
                key={s}
                type="button"
                onClick={() => choose(s)}
                disabled={changeStatus.isPending}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-left transition-colors ${
                  s === status ? "bg-secondary/50 text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <SIcon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Attendance card ──────────────────────────────────────────────────── */

export function AttendanceCard({ recent, allTime }: { recent?: AttendanceSummary; allTime?: AttendanceSummary }) {
  if (!recent && !allTime) return null;
  const pct = recent?.percent ?? null;
  const tone = pct === null
    ? "text-muted-foreground"
    : pct >= 90
      ? "text-emerald-600 dark:text-emerald-400"
      : pct >= 75
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";
  return (
    <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/10">
          <Calendar className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Attendance</span>
      </div>
      <div className={`text-2xl font-display font-extrabold tracking-tight ${tone}`}>
        {pct === null ? "—" : `${pct}%`}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 font-medium">
        last 4 weeks
        {recent && pct !== null ? ` · ${recent.present}/${recent.scheduled} days` : ""}
      </div>
      {allTime && allTime.percent !== null && (
        <div className="text-[10px] text-muted-foreground/70 mt-1">
          all-time: <span className="font-bold text-foreground/70">{allTime.percent}%</span>{" "}
          ({allTime.present}/{allTime.scheduled} days)
        </div>
      )}
    </div>
  );
}

/* ── Guardians section ────────────────────────────────────────────────── */

export function GuardiansSection({ studentId }: { studentId: number }) {
  const { data: guardians, isLoading } = useGuardians(studentId);
  const createGuardian = useCreateGuardian(studentId);
  const deleteGuardian = useDeleteGuardian(studentId);
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setRelationship("");
    setShowForm(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createGuardian.mutate(
      {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        relationship: relationship.trim() || null,
        primary: guardians?.length === 0, // first guardian is primary by default
      },
      {
        onSuccess: () => {
          reset();
          toast({ title: "Guardian added" });
        },
        onError: (err) => toast({ title: "Failed to add guardian", description: String((err as Error).message), variant: "destructive" }),
      },
    );
  };

  return (
    <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/10">
            <Users className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Guardians</span>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : guardians && guardians.length > 0 ? (
        <div className="space-y-2 mb-3">
          {guardians.map((g) => (
            <div key={g.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {g.name}
                  {g.primary && <span className="ml-1.5 text-[9px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">primary</span>}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[g.relationship, g.phone, g.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${g.name}?`)) deleteGuardian.mutate(g.id);
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                aria-label={`Remove ${g.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <p className="text-xs text-muted-foreground py-2">No guardians on file. Add one to enable the parent link.</p>
      ) : null}

      {showForm && (
        <form onSubmit={submit} className="space-y-2 pt-2 border-t border-border/30">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Relationship"
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={reset}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createGuardian.isPending || !name.trim()}
              className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
            >
              {createGuardian.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ── Parent link section ──────────────────────────────────────────────── */

export function ParentLinkSection({ studentId }: { studentId: number }) {
  const { data: links, isLoading } = useViewerLinks(studentId);
  const createLink = useCreateViewerLink(studentId);
  const updateLink = useUpdateViewerLink(studentId);
  const deleteLink = useDeleteViewerLink(studentId);
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const activeLinks = links?.filter((l) => l.active) ?? [];
  const revokedLinks = links?.filter((l) => !l.active) ?? [];

  const generate = () => {
    createLink.mutate(
      { notesVisibleToParent: false },
      {
        onSuccess: () => toast({ title: "Parent link generated" }),
        onError: (err) => toast({ title: "Failed to generate", description: String((err as Error).message), variant: "destructive" }),
      },
    );
  };

  const copy = (token: string, id: number) => {
    const url = `${baseUrl}/share/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const toggleNotes = (id: number, current: boolean) => {
    updateLink.mutate({ id, notesVisibleToParent: !current });
  };

  const revoke = (id: number) => {
    if (confirm("Revoke this link? Parents using it will lose access immediately.")) {
      updateLink.mutate({ id, active: false });
    }
  };

  return (
    <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10">
            <LinkIcon className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Parent Link</span>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={createLink.isPending}
          className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" /> Generate
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground py-2">Loading…</div>
      ) : activeLinks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No active parent link. Generate one to share read-only progress with the family.
        </p>
      ) : (
        <div className="space-y-2">
          {activeLinks.map((link) => (
            <div key={link.id} className="p-2.5 rounded-lg bg-secondary/40 border border-border/30">
              <div className="flex items-center gap-2 mb-1.5">
                <code className="flex-1 text-[10px] font-mono text-muted-foreground truncate">
                  {baseUrl}/share/{link.token.slice(0, 12)}…
                </code>
                <button
                  type="button"
                  onClick={() => copy(link.token, link.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-card text-[10px] font-bold text-foreground hover:bg-primary/10 hover:text-primary"
                >
                  {copiedId === link.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedId === link.id ? "Copied" : "Copy URL"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => toggleNotes(link.id, link.notesVisibleToParent)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-bold transition-colors ${
                    link.notesVisibleToParent
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.notesVisibleToParent ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                  Notes {link.notesVisibleToParent ? "visible" : "hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(link.id)}
                  className="text-red-500 font-bold hover:text-red-600"
                >
                  Revoke
                </button>
              </div>
              {link.lastViewedAt && (
                <p className="text-[9px] text-muted-foreground/70 mt-1">
                  Last viewed {new Date(link.lastViewedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {revokedLinks.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] font-bold text-muted-foreground/70 cursor-pointer hover:text-muted-foreground">
            {revokedLinks.length} revoked link{revokedLinks.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 space-y-1">
            {revokedLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2 text-[10px] text-muted-foreground/60 px-2">
                <code className="flex-1 font-mono truncate">{link.token.slice(0, 12)}…</code>
                <span>revoked {link.revokedAt ? new Date(link.revokedAt).toLocaleDateString() : "?"}</span>
                <button
                  type="button"
                  onClick={() => deleteLink.mutate(link.id)}
                  className="text-red-500/60 hover:text-red-500"
                  aria-label="Delete revoked link"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
