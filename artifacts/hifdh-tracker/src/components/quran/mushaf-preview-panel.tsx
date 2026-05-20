/**
 * Collapsible Mushaf preview shown in the weekly log entry UI.
 * Wraps <MushafPage> with a toggle so the verse fetch doesn't happen eagerly
 * when collapsed. When `onSelectLine` is provided, lines become tappable —
 * useful for "set this as the last line the student got to" in log-week.
 * When `onPageChange` is provided, prev/next buttons let teachers navigate
 * forward from last week's position without retyping the page number.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { MushafPage } from "./mushaf-page";

/** How many pages the spread view shows at once. */
const SPREAD_WINDOW = 2;

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

  // Spread mode: anchor and endpoint are on different pages and anchor
  // is earlier in the book. The week can span many pages; rather than
  // stacking them all, spread mode renders a 2-page window the teacher
  // pages through with chevrons. Window navigation is view-only — it
  // never calls onPageChange, so the rendered range stays dictated by
  // the data and can't fall out of sync.
  const isSpread = anchorPage !== undefined && anchorPage !== page && anchorPage < page;
  const pagesInRange: number[] = isSpread
    ? Array.from({ length: page - anchorPage! + 1 }, (_, i) => anchorPage! + i)
    : [page];
  const canPrev = !!onPageChange && page > 1 && !isSpread;
  const canNext = !!onPageChange && page < maxP && !isSpread;

  // Offset of the first page in the visible 2-page window. Offsets step
  // by SPREAD_WINDOW so paging is symmetric; the last window clamps its
  // start (see spreadStart) so it always shows a full pair — it may
  // overlap the previous window by one page on odd-length ranges.
  const maxSpreadOffset =
    (Math.ceil(pagesInRange.length / SPREAD_WINDOW) - 1) * SPREAD_WINDOW;
  const [spreadOffset, setSpreadOffset] = useState(maxSpreadOffset);

  // Reset the window to the endpoint whenever the range changes, so the
  // tappable last page stays visible by default.
  useEffect(() => {
    setSpreadOffset(maxSpreadOffset);
  }, [anchorPage, page, maxSpreadOffset]);

  const spreadStart = Math.min(
    spreadOffset,
    Math.max(0, pagesInRange.length - SPREAD_WINDOW),
  );
  const visiblePages = isSpread
    ? pagesInRange.slice(spreadStart, spreadStart + SPREAD_WINDOW)
    : pagesInRange;
  const canEarlierPages = isSpread && spreadOffset > 0;
  const canLaterPages = isSpread && spreadOffset < maxSpreadOffset;

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
            {mushafLabel}
            {isSpread
              ? ` · pages ${anchorPage}–${page} · line ${line ?? ""}`
              : ` · page ${page}${line ? ` · line ${line}` : ""}`}
          </span>
        </button>
        {open && onPageChange && !isSpread && (
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
        {open && isSpread && pagesInRange.length > SPREAD_WINDOW && (
          <div className="mr-2 flex items-center gap-1">
            <button
              type="button"
              disabled={!canEarlierPages}
              onClick={() => setSpreadOffset((o) => Math.max(0, o - SPREAD_WINDOW))}
              aria-label="Earlier pages"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="min-w-[3.25rem] text-center text-[11px] font-semibold tabular-nums text-muted-foreground/80">
              {visiblePages[0]}
              {visiblePages.length > 1 ? `–${visiblePages[visiblePages.length - 1]}` : ""}
            </span>
            <button
              type="button"
              disabled={!canLaterPages}
              onClick={() => setSpreadOffset((o) => Math.min(maxSpreadOffset, o + SPREAD_WINDOW))}
              aria-label="Later pages"
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
          {isSpread ? (
            // Render the visible 2-page window of the range — paged with the
            // header chevrons. Per-page highlights key off the absolute
            // anchor/endpoint page numbers, so they stay correct no matter
            // which slice is on screen.
            // Stack vertically on iPad portrait; side-by-side from lg up.
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {visiblePages.map((p) => {
                const isFirst = p === anchorPage;
                const isLast = p === page;
                const range: [number, number] | undefined = isFirst
                  ? [anchorLine ?? 1, 15]
                  : isLast
                    ? [1, line ?? 15]
                    : [1, 15];
                return (
                  <MushafPage
                    key={p}
                    mushafId={mushafId}
                    pageNumber={p}
                    anchorLine={isFirst ? anchorLine : undefined}
                    highlightLine={isLast ? line : undefined}
                    highlightRange={range}
                    onSelectLine={isLast ? onSelectLine : undefined}
                    fontSize="sm"
                  />
                );
              })}
            </div>
          ) : (
            <MushafPage
              mushafId={mushafId}
              pageNumber={page}
              highlightLine={line}
              // Same-page anchor → endpoint: paint the range between them.
              highlightRange={
                anchorPage === page && anchorLine !== undefined && line !== undefined && anchorLine !== line
                  ? [Math.min(anchorLine, line), Math.max(anchorLine, line)]
                  : undefined
              }
              // Anchor marker only when its page matches AND distinct from endpoint.
              anchorLine={anchorPage === page && anchorLine !== line ? anchorLine : undefined}
              onSelectLine={onSelectLine}
              fontSize="md"
            />
          )}
        </div>
      )}
    </div>
  );
}
