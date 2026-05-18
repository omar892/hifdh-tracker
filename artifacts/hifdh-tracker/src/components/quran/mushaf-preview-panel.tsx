/**
 * Collapsible Mushaf preview shown in the weekly log entry UI.
 * Wraps <MushafPage> with a toggle so the verse fetch doesn't happen eagerly
 * when collapsed. When `onSelectLine` is provided, lines become tappable —
 * useful for "set this as the last line the student got to" in log-week.
 * When `onPageChange` is provided, prev/next buttons let teachers navigate
 * forward from last week's position without retyping the page number.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { MushafPage } from "./mushaf-page";

interface MushafPreviewPanelProps {
  mushafId: "madani_15" | "indopak_15";
  page: number;
  line?: number;
  /**
   * Anchor (start) position — last week's endpoint. Shown as a faint marker
   * on the page when anchorPage matches the displayed page.
   */
  anchorPage?: number;
  anchorLine?: number;
  /** When provided, tapping a line fires this callback (with the line number). */
  onSelectLine?: (lineNumber: number) => void;
  /** When provided, prev/next buttons appear and call this with the new page. */
  onPageChange?: (page: number) => void;
  /** Page bounds — defaults vary per mushaf (604 madani / 610 indopak_15). */
  maxPage?: number;
  /** Open by default. Useful for log-week where the preview is the main UX. */
  defaultOpen?: boolean;
}

export function MushafPreviewPanel({
  mushafId,
  page,
  line,
  anchorPage,
  anchorLine,
  onSelectLine,
  onPageChange,
  maxPage,
  defaultOpen = false,
}: MushafPreviewPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const mushafLabel = mushafId === "madani_15" ? "Madani 15-Line" : "Indo-Pak 15-Line";
  const maxP = maxPage ?? (mushafId === "madani_15" ? 604 : 610);

  const canPrev = !!onPageChange && page > 1;
  const canNext = !!onPageChange && page < maxP;

  return (
    <div className="mb-3 rounded-2xl border border-border/50 bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
            Mushaf preview
          </span>
          <span className="text-xs text-muted-foreground/70">
            {mushafLabel} · page {page}
            {line ? ` · line ${line}` : ""}
          </span>
        </button>
        {open && onPageChange && (
          <div className="mr-2 flex items-center gap-1">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => canPrev && onPageChange(page - 1)}
              aria-label="Previous page"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => canNext && onPageChange(page + 1)}
              aria-label="Next page"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
      {open && (
        <div className="border-t border-border/50 p-3">
          <MushafPage
            mushafId={mushafId}
            pageNumber={page}
            highlightLine={line}
            // If the anchor is on the same page being displayed AND we have a
            // separate endpoint line, paint the range between them.
            highlightRange={
              anchorPage === page && anchorLine !== undefined && line !== undefined && anchorLine !== line
                ? [Math.min(anchorLine, line), Math.max(anchorLine, line)]
                : undefined
            }
            // Show the anchor marker only when its page matches the view AND
            // it isn't the same line as the endpoint (which already has the
            // bright ring treatment).
            anchorLine={anchorPage === page && anchorLine !== line ? anchorLine : undefined}
            onSelectLine={onSelectLine}
            fontSize="md"
          />
        </div>
      )}
    </div>
  );
}
