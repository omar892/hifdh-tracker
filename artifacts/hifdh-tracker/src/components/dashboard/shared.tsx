/**
 * Shared building blocks for the teacher dashboards (class view + per-student
 * view). One palette, one trend arrow, one rating chip — so the two pages
 * read as the same product. Anything that styles a "how is this going?" signal
 * lives here.
 */

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/* ── Rating palette (5 tiers) ─────────────────────── */

export const RATING_META: Record<
  string,
  { label: string; text: string; bar: string; chip: string; ring: string }
> = {
  excellent: {
    label: "Excellent",
    text: "text-yellow-600 dark:text-yellow-400",
    bar: "bg-yellow-500",
    chip: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
    ring: "ring-yellow-500/15",
  },
  strong: {
    label: "Strong",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    ring: "ring-emerald-500/15",
  },
  steady: {
    label: "Steady",
    text: "text-blue-600 dark:text-blue-400",
    bar: "bg-blue-500",
    chip: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    ring: "ring-blue-500/15",
  },
  needs_improvement: {
    label: "Needs Work",
    text: "text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500",
    chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    ring: "ring-orange-500/15",
  },
  difficult_week: {
    label: "Difficult",
    text: "text-red-600 dark:text-red-400",
    bar: "bg-red-500",
    chip: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    ring: "ring-red-500/15",
  },
};

export const RATING_ORDER = [
  "excellent",
  "strong",
  "steady",
  "needs_improvement",
  "difficult_week",
] as const;

/* ── Status palette (3 tiers — used in both views) ─ */

export type StatusTier = "concern" | "watch" | "fine";

export const STATUS_META: Record<
  StatusTier,
  {
    label: string;
    dot: string;
    icon: string;
    border: string;
    bg: string;
    chipBg: string;
    chipText: string;
  }
> = {
  concern: {
    label: "Needs attention",
    dot: "bg-rose-500",
    icon: "text-rose-500",
    border: "border-rose-200 dark:border-rose-900/50",
    bg: "bg-rose-500/5",
    chipBg: "bg-rose-500/10",
    chipText: "text-rose-700 dark:text-rose-300",
  },
  watch: {
    label: "Watch",
    dot: "bg-amber-500",
    icon: "text-amber-500",
    border: "border-amber-200 dark:border-amber-900/50",
    bg: "bg-amber-500/5",
    chipBg: "bg-amber-500/10",
    chipText: "text-amber-700 dark:text-amber-300",
  },
  fine: {
    label: "On track",
    dot: "bg-emerald-500",
    icon: "text-emerald-500",
    border: "border-emerald-200 dark:border-emerald-900/50",
    bg: "bg-emerald-500/5",
    chipBg: "bg-emerald-500/10",
    chipText: "text-emerald-700 dark:text-emerald-300",
  },
};

/* ── Trend arrow ──────────────────────────────────── */

export type TrendDir = "up" | "flat" | "down" | null;

export function TrendArrow({
  direction,
  className = "",
}: {
  direction: TrendDir;
  className?: string;
}) {
  if (direction == null) return null;
  if (direction === "up") {
    return <TrendingUp className={`w-3.5 h-3.5 text-emerald-500 ${className}`} />;
  }
  if (direction === "down") {
    return <TrendingDown className={`w-3.5 h-3.5 text-rose-500 ${className}`} />;
  }
  return <Minus className={`w-3.5 h-3.5 text-muted-foreground/70 ${className}`} />;
}

/* ── Section header ───────────────────────────────── */

export function SectionHeader({
  title,
  icon: Icon,
  iconColor = "text-primary",
  hint,
  right,
}: {
  title: string;
  icon?: React.ElementType;
  iconColor?: string;
  /** Tiny gray text after the title — surfaces the teacher question the section answers. */
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-display font-bold text-base text-foreground tracking-tight flex items-center gap-2">
          {Icon ? <Icon className={`w-4 h-4 ${iconColor} translate-y-0.5`} /> : null}
          {title}
        </h2>
        {hint && <span className="text-xs text-muted-foreground/70 font-medium">{hint}</span>}
      </div>
      {right}
    </div>
  );
}

/* ── Mini sparkline (8-week trajectory) ───────────── */

export function MiniSparkline({
  values,
  color = "hsl(142, 76%, 36%)",
  className = "",
  height = 56,
}: {
  values: number[];
  color?: string;
  className?: string;
  height?: number;
}) {
  // Don't render the area when there's nothing to show — Recharts will render
  // a flat baseline that reads as "data exists but is zero" which is wrong.
  if (values.length === 0 || values.every((v) => v === 0)) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] font-medium text-muted-foreground/60 italic ${className}`}
        style={{ height }}
      >
        no recent activity
      </div>
    );
  }
  const data = values.map((v, i) => ({ idx: i, v }));
  const gradId = `sparkGrad-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={{ r: 0 }}
            activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Week-range formatter ─────────────────────────── */

export function formatWeekRange(weekStartDate: string, weekEndDate: string): string {
  const start = new Date(weekStartDate + "T00:00:00Z");
  const end = new Date(weekEndDate + "T00:00:00Z");
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const startMonth = monthFmt.format(start);
  const endMonth = monthFmt.format(end);
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const year = end.getUTCFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

/* ── Rating chip (small, reusable) ────────────────── */

export function RatingChip({
  rating,
  trend = null,
  size = "sm",
}: {
  rating: string;
  trend?: TrendDir;
  size?: "xs" | "sm";
}) {
  const meta = RATING_META[rating];
  if (!meta) return null;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded-full border ${pad} ${meta.chip}`}
    >
      {meta.label}
      {trend && <TrendArrow direction={trend} className="w-3 h-3" />}
    </span>
  );
}

/* ── Stat tile (Pulse card shell) ─────────────────── */

/**
 * The card shell used for every "this is the headline value, here's the
 * trend, here's the supporting detail" tile across both dashboards. The
 * children area is freeform so each tile can layer in its own visual
 * (sparkline, stacked bar, attendance progress, etc.).
 */
export function StatTile({
  icon: Icon,
  iconColor = "text-primary",
  label,
  value,
  unit,
  trendDirection: trend,
  deltaText,
  deltaCaption,
  children,
}: {
  icon?: React.ElementType;
  iconColor?: string;
  label: string;
  value: React.ReactNode;
  unit?: string;
  trendDirection?: TrendDir;
  deltaText?: string;
  deltaCaption?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-4 md:p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        {Icon ? <Icon className={`w-4 h-4 ${iconColor}`} /> : null}
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      {/* `whitespace-nowrap` on the value keeps two-token outputs like "4p 8ℓ"
          from breaking onto two lines at narrow column widths (iPad portrait). */}
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <span className="text-3xl md:text-4xl font-display font-bold text-foreground whitespace-nowrap">
          {value}
        </span>
        {unit ? <span className="text-xs text-muted-foreground font-medium">{unit}</span> : null}
      </div>
      {(trend != null || deltaText || deltaCaption) && (
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {trend != null && <TrendArrow direction={trend} />}
          {deltaText && <span className="font-bold text-foreground">{deltaText}</span>}
          {deltaCaption && <span className="text-muted-foreground">{deltaCaption}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Juz progress bar (memorization toward the 30-juz/604-page goal) ─ */

const TOTAL_PAGES = 604;
const TOTAL_JUZ = 30;

export function JuzProgressBar({
  juzCount,
  currentPage,
  showLabel = true,
  showTotal = true,
}: {
  juzCount: number;
  currentPage: number;
  showLabel?: boolean;
  showTotal?: boolean;
}) {
  const pct = Math.min(100, Math.round(((currentPage ?? 0) / TOTAL_PAGES) * 100));
  return (
    <div>
      {showLabel && (
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-bold text-foreground tabular-nums">{juzCount}</span>
          {showTotal && <span className="text-[10px] text-muted-foreground">/ {TOTAL_JUZ}</span>}
        </div>
      )}
      <div className="mt-1 h-1 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
