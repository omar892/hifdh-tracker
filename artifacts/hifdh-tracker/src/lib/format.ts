/**
 * Display formatters used across the teacher UI.
 *
 * The big one is `formatLines` — teachers naturally talk in pages once a count
 * crosses one page (15 lines on Madani 15-line). Raw line counts past 15 are
 * harder to translate mentally ("how much is 80 lines?" vs "5 pages 5 lines").
 */

const LINES_PER_PAGE = 15;

interface FormatLinesOptions {
  /** Use single-letter abbreviations: "5p 5ℓ" instead of "5 pages 5 lines". */
  short?: boolean;
  /**
   * Show the line remainder when there is one. Default true. Pass false when
   * you want a clean "rounded to nearest page" feel (e.g. month totals).
   */
  showRemainder?: boolean;
}

/**
 * Format a count of lines the way a teacher would say it.
 *   formatLines(6)    → "6 lines"
 *   formatLines(1)    → "1 line"
 *   formatLines(15)   → "1 page"
 *   formatLines(20)   → "1 page 5 lines"
 *   formatLines(99)   → "6 pages 9 lines"
 *   formatLines(4215) → "281 pages"
 *   formatLines(-16)  → "-1 page 1 line"
 *
 * `short` form for tight spots:
 *   formatLines(20, {short:true})   → "1p 5ℓ"
 *   formatLines(99, {short:true})   → "6p 9ℓ"
 *   formatLines(4215, {short:true}) → "281p"
 *
 * `showRemainder: false` for big-picture stats where the remainder is noise:
 *   formatLines(80, {showRemainder: false}) → "~5 pages"
 */
/**
 * Format a count of lines as a single decimal of pages, for rate/pace
 * metrics. The "Xp Yℓ" split is harder to compare at a glance for rates
 * (is "4p 8ℓ/wk" faster than "5p 2ℓ/wk"?) than a single decimal.
 *   formatPagesDecimal(68)  → "4.5p"   (68 / 15)
 *   formatPagesDecimal(7)   → "0.5p"
 *   formatPagesDecimal(126) → "8.4p"
 *   formatPagesDecimal(0)   → "0p"
 */
export function formatPagesDecimal(lines: number): string {
  const pages = lines / LINES_PER_PAGE;
  if (pages === 0) return "0p";
  return `${pages.toFixed(1)}p`;
}

export function formatLines(n: number, opts: FormatLinesOptions = {}): string {
  const { short = false, showRemainder = true } = opts;
  // Round to int upfront — avg/pace values from the API can be floats, and
  // float arithmetic on the page/line split produces e.g. "6p 6.2999999ℓ".
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);

  if (abs < LINES_PER_PAGE) {
    if (short) return `${sign}${abs}ℓ`;
    return `${sign}${abs} ${abs === 1 ? "line" : "lines"}`;
  }

  const pages = Math.floor(abs / LINES_PER_PAGE);
  const lines = abs % LINES_PER_PAGE;

  if (short) {
    return lines === 0 ? `${sign}${pages}p` : `${sign}${pages}p ${lines}ℓ`;
  }

  const pageWord = pages === 1 ? "page" : "pages";
  if (lines === 0 || !showRemainder) {
    const prefix = !showRemainder && lines !== 0 ? "~" : "";
    return `${sign}${prefix}${pages} ${pageWord}`;
  }
  const lineWord = lines === 1 ? "line" : "lines";
  return `${sign}${pages} ${pageWord} ${lines} ${lineWord}`;
}
