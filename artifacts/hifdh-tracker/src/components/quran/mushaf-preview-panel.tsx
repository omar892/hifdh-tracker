/**
 * Collapsible Mushaf preview shown in the weekly log entry UI.
 * Wraps <MushafPage> with a toggle so the teacher can show/hide the page
 * without the verse fetch happening eagerly when collapsed.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import { MushafPage } from "./mushaf-page";

interface MushafPreviewPanelProps {
  mushafId: "madani_15" | "indopak_15";
  page: number;
  line?: number;
}

export function MushafPreviewPanel({ mushafId, page, line }: MushafPreviewPanelProps) {
  const [open, setOpen] = useState(false);
  const mushafLabel = mushafId === "madani_15" ? "Madani 15-Line" : "Indo-Pak 15-Line";

  return (
    <div className="mb-3 rounded-2xl border border-border/50 bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
            Mushaf preview
          </span>
          <span className="text-xs text-muted-foreground/70">
            {mushafLabel} · page {page}
            {line ? ` · line ${line}` : ""}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="border-t border-border/50 p-3">
          <MushafPage
            mushafId={mushafId}
            pageNumber={page}
            highlightLine={line}
            fontSize="md"
          />
        </div>
      )}
    </div>
  );
}
