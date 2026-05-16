/**
 * <MushafPage> — renders a single page of the Quran as the student sees it.
 *
 * - Lazy-loads the per-page QCF v2 WOFF2 from QF's CDN via the FontFace API.
 * - Groups verse words by `line_number` so the on-screen layout matches the
 *   physical mushaf (a line often spans multiple ayat).
 * - Optional highlightLine adds a soft ring to the line the student is on.
 *
 * Note: word glyphs are rendered via dangerouslySetInnerHTML of code_v2 — these
 * are Quran-content glyph codes, not user input. Safe in this context.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface Word {
  id: number;
  position: number;
  line_number: number;
  page_number: number;
  char_type_name: "word" | "end" | "pause" | "sajdah" | string;
  code_v2: string;
  text_uthmani?: string;
  text_qpc_hafs?: string;
}

interface Verse {
  id: number;
  verse_key: string;
  words: Word[];
}

interface VersesByPageResponse {
  verses: Verse[];
  pagination?: unknown;
}

interface MushafPageProps {
  mushafId: string;        // 'madani_15' | 'indopak_15'
  pageNumber: number;      // 1–604 (madani) / 1–610 (indopak_15)
  highlightLine?: number;  // 1–15
  className?: string;
  fontSize?: "sm" | "md" | "lg";
}

const FONT_BASES = {
  madani_15: "https://verses.quran.foundation/fonts/quran/hafs/v2/woff2",
  // Indo-Pak fonts live under a different path; QF docs list these CDN prefixes.
  // If wrong, sync.ts logs would also flag the mushaf ID mismatch.
  indopak_15: "https://verses.quran.foundation/fonts/quran/indopak/v1/woff2",
} as const;

/** Ensure the per-page font is registered with document.fonts. Idempotent. */
function loadPageFont(mushafId: string, page: number): Promise<string> {
  const family = `QCF-${mushafId}-p${page}`;
  if (typeof document === "undefined") return Promise.resolve(family);
  // Already registered?
  for (const f of document.fonts as unknown as Iterable<FontFace>) {
    if ((f as FontFace).family === family) return Promise.resolve(family);
  }
  const base = FONT_BASES[mushafId as keyof typeof FONT_BASES] ?? FONT_BASES.madani_15;
  const url = `${base}/p${page}.woff2`;
  const face = new FontFace(family, `url(${url}) format("woff2")`, { display: "swap" });
  return face.load().then((loaded) => {
    document.fonts.add(loaded);
    return family;
  });
}

async function fetchPageVerses(mushafId: string, page: number): Promise<VersesByPageResponse> {
  const res = await fetch(`/api/quran/mushafs/${mushafId}/pages/${page}/verses`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`failed to load page ${page}: ${res.status}`);
  return res.json();
}

export function MushafPage({
  mushafId,
  pageNumber,
  highlightLine,
  className,
  fontSize = "md",
}: MushafPageProps) {
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    setFontReady(false);
    let cancelled = false;
    loadPageFont(mushafId, pageNumber)
      .then(() => { if (!cancelled) setFontReady(true); })
      .catch((err) => console.warn("[MushafPage] font load failed", err));
    return () => { cancelled = true; };
  }, [mushafId, pageNumber]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["quran", "page", mushafId, pageNumber],
    queryFn: () => fetchPageVerses(mushafId, pageNumber),
    staleTime: Infinity, // Quran content is immutable
    gcTime: 30 * 60 * 1000,
    retry: false,
    networkMode: "always",
  });

  // Group all words from all verses by their physical line number on the page
  const linesByNumber = useMemo(() => {
    if (!data?.verses) return new Map<number, Word[]>();
    const map = new Map<number, Word[]>();
    for (const v of data.verses) {
      for (const w of v.words ?? []) {
        if (!map.has(w.line_number)) map.set(w.line_number, []);
        map.get(w.line_number)!.push(w);
      }
    }
    // Sort each line by word position so reading order is preserved
    for (const [, words] of map) words.sort((a, b) => a.position - b.position);
    return new Map([...map.entries()].sort(([a], [b]) => a - b));
  }, [data]);

  const sizeClasses = {
    sm: "text-xl leading-[2]",
    md: "text-2xl leading-[2.2]",
    lg: "text-4xl leading-[2.4]",
  }[fontSize];

  const fontFamily = `QCF-${mushafId}-p${pageNumber}`;

  if (isError) {
    return (
      <div className={cn("rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive", className)}>
        Couldn’t load page {pageNumber}: {(error as Error)?.message ?? "unknown error"}
        <p className="mt-1 text-xs text-muted-foreground">
          Check that the API server is reachable and that <code>QURAN_CLIENT_ID</code>/<code>QURAN_CLIENT_SECRET</code> are set.
        </p>
      </div>
    );
  }

  if (isPending || !fontReady) {
    return (
      <div className={cn("rounded-lg border bg-muted/30 p-6", className)}>
        <div className="space-y-3" dir="rtl">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      lang="ar"
      className={cn(
        "rounded-lg border bg-card p-6 text-center select-none",
        sizeClasses,
        className,
      )}
      style={{ fontFamily, fontFeatureSettings: '"liga"' }}
    >
      {[...linesByNumber.entries()].map(([lineNum, words]) => {
        const isHighlight = highlightLine === lineNum;
        // aria text — pull text_uthmani so screen readers get something meaningful
        const aria = words.map((w) => w.text_uthmani ?? "").join(" ");
        return (
          <div
            key={lineNum}
            aria-label={aria}
            className={cn(
              "mushaf-line transition-colors",
              isHighlight && "rounded-md bg-emerald-50 ring-2 ring-emerald-400 ring-offset-1 dark:bg-emerald-950/30",
            )}
          >
            {words.map((w) => (
              <span
                key={w.id}
                className={w.char_type_name === "end" ? "font-uthmanic-hafs" : undefined}
                dangerouslySetInnerHTML={{ __html: w.code_v2 ?? "" }}
              />
            ))}
          </div>
        );
      })}
      <div className="mt-4 text-xs text-muted-foreground" lang="en" dir="ltr">
        Page {pageNumber}
        {highlightLine ? ` · line ${highlightLine}` : ""}
      </div>
    </div>
  );
}
