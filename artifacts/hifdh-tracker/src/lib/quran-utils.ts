export const LINES_PER_PAGE = 15;
export const TOTAL_PAGES = 604;
export const TOTAL_LINES = LINES_PER_PAGE * TOTAL_PAGES; // 9060

const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

export function getJuzForPage(page: number): number {
  for (let i = JUZ_START_PAGES.length - 1; i >= 0; i--) {
    if (page >= JUZ_START_PAGES[i]) return i + 1;
  }
  return 1;
}

export function getProgressPercent(page: number, line: number): number {
  return ((page - 1) * LINES_PER_PAGE + line) / TOTAL_LINES * 100;
}

/** Calculate total lines memorized from a list of completed juz numbers */
export function getLinesForCompletedJuz(juzNumbers: number[]): number {
  let total = 0;
  for (const juz of juzNumbers) {
    const startPage = JUZ_START_PAGES[juz - 1];
    const endPage = juz < 30 ? JUZ_START_PAGES[juz] - 1 : TOTAL_PAGES;
    total += (endPage - startPage + 1) * LINES_PER_PAGE;
  }
  return total;
}
