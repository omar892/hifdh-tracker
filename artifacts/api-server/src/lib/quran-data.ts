export interface SurahData {
  number: number;
  name: string;
  nameArabic: string;
  ayahCount: number;
  juz: number;
}

export const SURAHS: SurahData[] = [
  { number: 1, name: "Al-Fatihah", nameArabic: "الفاتحة", ayahCount: 7, juz: 1 },
  { number: 2, name: "Al-Baqarah", nameArabic: "البقرة", ayahCount: 286, juz: 1 },
  { number: 3, name: "Aal-E-Imran", nameArabic: "آل عمران", ayahCount: 200, juz: 3 },
  { number: 4, name: "An-Nisa", nameArabic: "النساء", ayahCount: 176, juz: 4 },
  { number: 5, name: "Al-Maidah", nameArabic: "المائدة", ayahCount: 120, juz: 6 },
  { number: 6, name: "Al-Anam", nameArabic: "الأنعام", ayahCount: 165, juz: 7 },
  { number: 7, name: "Al-Araf", nameArabic: "الأعراف", ayahCount: 206, juz: 8 },
  { number: 8, name: "Al-Anfal", nameArabic: "الأنفال", ayahCount: 75, juz: 9 },
  { number: 9, name: "At-Tawbah", nameArabic: "التوبة", ayahCount: 129, juz: 10 },
  { number: 10, name: "Yunus", nameArabic: "يونس", ayahCount: 109, juz: 11 },
  { number: 11, name: "Hud", nameArabic: "هود", ayahCount: 123, juz: 11 },
  { number: 12, name: "Yusuf", nameArabic: "يوسف", ayahCount: 111, juz: 12 },
  { number: 13, name: "Ar-Ra'd", nameArabic: "الرعد", ayahCount: 43, juz: 13 },
  { number: 14, name: "Ibrahim", nameArabic: "إبراهيم", ayahCount: 52, juz: 13 },
  { number: 15, name: "Al-Hijr", nameArabic: "الحجر", ayahCount: 99, juz: 14 },
  { number: 16, name: "An-Nahl", nameArabic: "النحل", ayahCount: 128, juz: 14 },
  { number: 17, name: "Al-Isra", nameArabic: "الإسراء", ayahCount: 111, juz: 15 },
  { number: 18, name: "Al-Kahf", nameArabic: "الكهف", ayahCount: 110, juz: 15 },
  { number: 19, name: "Maryam", nameArabic: "مريم", ayahCount: 98, juz: 16 },
  { number: 20, name: "Taha", nameArabic: "طه", ayahCount: 135, juz: 16 },
  { number: 21, name: "Al-Anbiya", nameArabic: "الأنبياء", ayahCount: 112, juz: 17 },
  { number: 22, name: "Al-Hajj", nameArabic: "الحج", ayahCount: 78, juz: 17 },
  { number: 23, name: "Al-Muminun", nameArabic: "المؤمنون", ayahCount: 118, juz: 18 },
  { number: 24, name: "An-Nur", nameArabic: "النور", ayahCount: 64, juz: 18 },
  { number: 25, name: "Al-Furqan", nameArabic: "الفرقان", ayahCount: 77, juz: 18 },
  { number: 26, name: "Ash-Shuara", nameArabic: "الشعراء", ayahCount: 227, juz: 19 },
  { number: 27, name: "An-Naml", nameArabic: "النمل", ayahCount: 93, juz: 19 },
  { number: 28, name: "Al-Qasas", nameArabic: "القصص", ayahCount: 88, juz: 20 },
  { number: 29, name: "Al-Ankabut", nameArabic: "العنكبوت", ayahCount: 69, juz: 20 },
  { number: 30, name: "Ar-Rum", nameArabic: "الروم", ayahCount: 60, juz: 21 },
  { number: 31, name: "Luqman", nameArabic: "لقمان", ayahCount: 34, juz: 21 },
  { number: 32, name: "As-Sajdah", nameArabic: "السجدة", ayahCount: 30, juz: 21 },
  { number: 33, name: "Al-Ahzab", nameArabic: "الأحزاب", ayahCount: 73, juz: 21 },
  { number: 34, name: "Saba", nameArabic: "سبأ", ayahCount: 54, juz: 22 },
  { number: 35, name: "Fatir", nameArabic: "فاطر", ayahCount: 45, juz: 22 },
  { number: 36, name: "Ya-Sin", nameArabic: "يس", ayahCount: 83, juz: 22 },
  { number: 37, name: "As-Saffat", nameArabic: "الصافات", ayahCount: 182, juz: 23 },
  { number: 38, name: "Sad", nameArabic: "ص", ayahCount: 88, juz: 23 },
  { number: 39, name: "Az-Zumar", nameArabic: "الزمر", ayahCount: 75, juz: 23 },
  { number: 40, name: "Ghafir", nameArabic: "غافر", ayahCount: 85, juz: 24 },
  { number: 41, name: "Fussilat", nameArabic: "فصلت", ayahCount: 54, juz: 24 },
  { number: 42, name: "Ash-Shura", nameArabic: "الشورى", ayahCount: 53, juz: 25 },
  { number: 43, name: "Az-Zukhruf", nameArabic: "الزخرف", ayahCount: 89, juz: 25 },
  { number: 44, name: "Ad-Dukhan", nameArabic: "الدخان", ayahCount: 59, juz: 25 },
  { number: 45, name: "Al-Jathiyah", nameArabic: "الجاثية", ayahCount: 37, juz: 25 },
  { number: 46, name: "Al-Ahqaf", nameArabic: "الأحقاف", ayahCount: 35, juz: 26 },
  { number: 47, name: "Muhammad", nameArabic: "محمد", ayahCount: 38, juz: 26 },
  { number: 48, name: "Al-Fath", nameArabic: "الفتح", ayahCount: 29, juz: 26 },
  { number: 49, name: "Al-Hujurat", nameArabic: "الحجرات", ayahCount: 18, juz: 26 },
  { number: 50, name: "Qaf", nameArabic: "ق", ayahCount: 45, juz: 26 },
  { number: 51, name: "Adh-Dhariyat", nameArabic: "الذاريات", ayahCount: 60, juz: 26 },
  { number: 52, name: "At-Tur", nameArabic: "الطور", ayahCount: 49, juz: 27 },
  { number: 53, name: "An-Najm", nameArabic: "النجم", ayahCount: 62, juz: 27 },
  { number: 54, name: "Al-Qamar", nameArabic: "القمر", ayahCount: 55, juz: 27 },
  { number: 55, name: "Ar-Rahman", nameArabic: "الرحمن", ayahCount: 78, juz: 27 },
  { number: 56, name: "Al-Waqiah", nameArabic: "الواقعة", ayahCount: 96, juz: 27 },
  { number: 57, name: "Al-Hadid", nameArabic: "الحديد", ayahCount: 29, juz: 27 },
  { number: 58, name: "Al-Mujadila", nameArabic: "المجادلة", ayahCount: 22, juz: 28 },
  { number: 59, name: "Al-Hashr", nameArabic: "الحشر", ayahCount: 24, juz: 28 },
  { number: 60, name: "Al-Mumtahanah", nameArabic: "الممتحنة", ayahCount: 13, juz: 28 },
  { number: 61, name: "As-Saff", nameArabic: "الصف", ayahCount: 14, juz: 28 },
  { number: 62, name: "Al-Jumuah", nameArabic: "الجمعة", ayahCount: 11, juz: 28 },
  { number: 63, name: "Al-Munafiqun", nameArabic: "المنافقون", ayahCount: 11, juz: 28 },
  { number: 64, name: "At-Taghabun", nameArabic: "التغابن", ayahCount: 18, juz: 28 },
  { number: 65, name: "At-Talaq", nameArabic: "الطلاق", ayahCount: 12, juz: 28 },
  { number: 66, name: "At-Tahrim", nameArabic: "التحريم", ayahCount: 12, juz: 28 },
  { number: 67, name: "Al-Mulk", nameArabic: "الملك", ayahCount: 30, juz: 29 },
  { number: 68, name: "Al-Qalam", nameArabic: "القلم", ayahCount: 52, juz: 29 },
  { number: 69, name: "Al-Haqqah", nameArabic: "الحاقة", ayahCount: 52, juz: 29 },
  { number: 70, name: "Al-Maarij", nameArabic: "المعارج", ayahCount: 44, juz: 29 },
  { number: 71, name: "Nuh", nameArabic: "نوح", ayahCount: 28, juz: 29 },
  { number: 72, name: "Al-Jinn", nameArabic: "الجن", ayahCount: 28, juz: 29 },
  { number: 73, name: "Al-Muzzammil", nameArabic: "المزمل", ayahCount: 20, juz: 29 },
  { number: 74, name: "Al-Muddaththir", nameArabic: "المدثر", ayahCount: 56, juz: 29 },
  { number: 75, name: "Al-Qiyamah", nameArabic: "القيامة", ayahCount: 40, juz: 29 },
  { number: 76, name: "Al-Insan", nameArabic: "الإنسان", ayahCount: 31, juz: 29 },
  { number: 77, name: "Al-Mursalat", nameArabic: "المرسلات", ayahCount: 50, juz: 29 },
  { number: 78, name: "An-Naba", nameArabic: "النبأ", ayahCount: 40, juz: 30 },
  { number: 79, name: "An-Naziat", nameArabic: "النازعات", ayahCount: 46, juz: 30 },
  { number: 80, name: "Abasa", nameArabic: "عبس", ayahCount: 42, juz: 30 },
  { number: 81, name: "At-Takwir", nameArabic: "التكوير", ayahCount: 29, juz: 30 },
  { number: 82, name: "Al-Infitar", nameArabic: "الانفطار", ayahCount: 19, juz: 30 },
  { number: 83, name: "Al-Mutaffifin", nameArabic: "المطففين", ayahCount: 36, juz: 30 },
  { number: 84, name: "Al-Inshiqaq", nameArabic: "الانشقاق", ayahCount: 25, juz: 30 },
  { number: 85, name: "Al-Buruj", nameArabic: "البروج", ayahCount: 22, juz: 30 },
  { number: 86, name: "At-Tariq", nameArabic: "الطارق", ayahCount: 17, juz: 30 },
  { number: 87, name: "Al-Ala", nameArabic: "الأعلى", ayahCount: 19, juz: 30 },
  { number: 88, name: "Al-Ghashiyah", nameArabic: "الغاشية", ayahCount: 26, juz: 30 },
  { number: 89, name: "Al-Fajr", nameArabic: "الفجر", ayahCount: 30, juz: 30 },
  { number: 90, name: "Al-Balad", nameArabic: "البلد", ayahCount: 20, juz: 30 },
  { number: 91, name: "Ash-Shams", nameArabic: "الشمس", ayahCount: 15, juz: 30 },
  { number: 92, name: "Al-Lail", nameArabic: "الليل", ayahCount: 21, juz: 30 },
  { number: 93, name: "Ad-Duha", nameArabic: "الضحى", ayahCount: 11, juz: 30 },
  { number: 94, name: "Ash-Sharh", nameArabic: "الشرح", ayahCount: 8, juz: 30 },
  { number: 95, name: "At-Tin", nameArabic: "التين", ayahCount: 8, juz: 30 },
  { number: 96, name: "Al-Alaq", nameArabic: "العلق", ayahCount: 19, juz: 30 },
  { number: 97, name: "Al-Qadr", nameArabic: "القدر", ayahCount: 5, juz: 30 },
  { number: 98, name: "Al-Bayyinah", nameArabic: "البينة", ayahCount: 8, juz: 30 },
  { number: 99, name: "Az-Zalzalah", nameArabic: "الزلزلة", ayahCount: 8, juz: 30 },
  { number: 100, name: "Al-Adiyat", nameArabic: "العاديات", ayahCount: 11, juz: 30 },
  { number: 101, name: "Al-Qariah", nameArabic: "القارعة", ayahCount: 11, juz: 30 },
  { number: 102, name: "At-Takathur", nameArabic: "التكاثر", ayahCount: 8, juz: 30 },
  { number: 103, name: "Al-Asr", nameArabic: "العصر", ayahCount: 3, juz: 30 },
  { number: 104, name: "Al-Humazah", nameArabic: "الهمزة", ayahCount: 9, juz: 30 },
  { number: 105, name: "Al-Fil", nameArabic: "الفيل", ayahCount: 5, juz: 30 },
  { number: 106, name: "Quraysh", nameArabic: "قريش", ayahCount: 4, juz: 30 },
  { number: 107, name: "Al-Maun", nameArabic: "الماعون", ayahCount: 7, juz: 30 },
  { number: 108, name: "Al-Kawthar", nameArabic: "الكوثر", ayahCount: 3, juz: 30 },
  { number: 109, name: "Al-Kafirun", nameArabic: "الكافرون", ayahCount: 6, juz: 30 },
  { number: 110, name: "An-Nasr", nameArabic: "النصر", ayahCount: 3, juz: 30 },
  { number: 111, name: "Al-Masad", nameArabic: "المسد", ayahCount: 5, juz: 30 },
  { number: 112, name: "Al-Ikhlas", nameArabic: "الإخلاص", ayahCount: 4, juz: 30 },
  { number: 113, name: "Al-Falaq", nameArabic: "الفلق", ayahCount: 5, juz: 30 },
  { number: 114, name: "An-Nas", nameArabic: "الناس", ayahCount: 6, juz: 30 },
];

export const TOTAL_QURAN_AYAHS = 6236;

export const LINES_PER_PAGE = 15;
export const TOTAL_PAGES = 604;
export const TOTAL_LINES = LINES_PER_PAGE * TOTAL_PAGES; // 9060

// Starting page for each juz (1-indexed)
export const JUZ_START_PAGES: number[] = [
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

export function getPageProgress(page: number, line: number): number {
  return (page - 1) * LINES_PER_PAGE + line;
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

export const JUZ_BOUNDARIES: { juz: number; startSurah: number; startAyah: number }[] = [
  { juz: 1, startSurah: 1, startAyah: 1 },
  { juz: 2, startSurah: 2, startAyah: 142 },
  { juz: 3, startSurah: 2, startAyah: 253 },
  { juz: 4, startSurah: 3, startAyah: 93 },
  { juz: 5, startSurah: 4, startAyah: 24 },
  { juz: 6, startSurah: 4, startAyah: 148 },
  { juz: 7, startSurah: 5, startAyah: 83 },
  { juz: 8, startSurah: 6, startAyah: 111 },
  { juz: 9, startSurah: 7, startAyah: 88 },
  { juz: 10, startSurah: 8, startAyah: 41 },
  { juz: 11, startSurah: 9, startAyah: 93 },
  { juz: 12, startSurah: 11, startAyah: 6 },
  { juz: 13, startSurah: 12, startAyah: 53 },
  { juz: 14, startSurah: 15, startAyah: 1 },
  { juz: 15, startSurah: 17, startAyah: 1 },
  { juz: 16, startSurah: 18, startAyah: 75 },
  { juz: 17, startSurah: 21, startAyah: 1 },
  { juz: 18, startSurah: 23, startAyah: 1 },
  { juz: 19, startSurah: 25, startAyah: 21 },
  { juz: 20, startSurah: 27, startAyah: 56 },
  { juz: 21, startSurah: 29, startAyah: 46 },
  { juz: 22, startSurah: 33, startAyah: 31 },
  { juz: 23, startSurah: 36, startAyah: 28 },
  { juz: 24, startSurah: 39, startAyah: 32 },
  { juz: 25, startSurah: 41, startAyah: 47 },
  { juz: 26, startSurah: 46, startAyah: 1 },
  { juz: 27, startSurah: 51, startAyah: 31 },
  { juz: 28, startSurah: 58, startAyah: 1 },
  { juz: 29, startSurah: 67, startAyah: 1 },
  { juz: 30, startSurah: 78, startAyah: 1 },
];

export function calculateAyahsUpTo(surah: number, ayah: number): number {
  let total = 0;
  for (let i = 0; i < surah - 1; i++) {
    total += SURAHS[i].ayahCount;
  }
  total += ayah;
  return total;
}

export function calculateJuzFromPosition(surah: number, ayah: number): number {
  let juz = 1;
  for (let i = JUZ_BOUNDARIES.length - 1; i >= 0; i--) {
    const boundary = JUZ_BOUNDARIES[i];
    if (surah > boundary.startSurah || (surah === boundary.startSurah && ayah >= boundary.startAyah)) {
      juz = boundary.juz;
      break;
    }
  }
  return juz;
}

export function getJuzEndPosition(juz: number): { surah: number; ayah: number } {
  if (juz >= 30) {
    return { surah: 114, ayah: SURAHS[113].ayahCount };
  }
  const nextBoundary = JUZ_BOUNDARIES[juz]; // juz is 1-indexed, so JUZ_BOUNDARIES[juz] = start of juz+1
  const startOfNext = calculateAyahsUpTo(nextBoundary.startSurah, nextBoundary.startAyah);
  // End of current juz is 1 position before start of next
  let total = startOfNext - 1;
  let surah = 0;
  for (let i = 0; i < SURAHS.length; i++) {
    if (total <= SURAHS[i].ayahCount) {
      surah = SURAHS[i].number;
      return { surah, ayah: total };
    }
    total -= SURAHS[i].ayahCount;
  }
  return { surah: 114, ayah: SURAHS[113].ayahCount };
}

export function calculateAyahsInJuz(juzNumbers: number[]): number {
  let total = 0;
  for (const juz of juzNumbers) {
    const start = JUZ_BOUNDARIES[juz - 1]; // 0-indexed array
    const startPos = calculateAyahsUpTo(start.startSurah, start.startAyah);
    const end = getJuzEndPosition(juz);
    const endPos = calculateAyahsUpTo(end.surah, end.ayah);
    total += endPos - startPos + 1;
  }
  return total;
}

export function calculateAyahsBetween(
  fromSurah: number,
  fromAyah: number,
  toSurah: number,
  toAyah: number
): number {
  const from = calculateAyahsUpTo(fromSurah, fromAyah);
  const to = calculateAyahsUpTo(toSurah, toAyah);
  return Math.max(0, to - from + 1);
}
