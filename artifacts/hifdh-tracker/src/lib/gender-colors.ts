/** Gender-based color system for student avatars and accents */

export type Gender = "male" | "female" | null | undefined;

/** Avatar circle: background + text color */
export function getGenderAvatarClass(gender: Gender): string {
  if (gender === "male") return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
  if (gender === "female") return "bg-pink-500/15 text-pink-600 dark:text-pink-400";
  return "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400";
}

/** Subtle left-border accent for cards/rows */
export function getGenderBorderClass(gender: Gender): string {
  if (gender === "male") return "border-l-2 border-l-blue-400 dark:border-l-blue-500";
  if (gender === "female") return "border-l-2 border-l-pink-400 dark:border-l-pink-500";
  return "";
}

/** Dot indicator color */
export function getGenderDotClass(gender: Gender): string {
  if (gender === "male") return "bg-blue-500";
  if (gender === "female") return "bg-pink-500";
  return "bg-zinc-400";
}

/** Text color for name highlights */
export function getGenderTextClass(gender: Gender): string {
  if (gender === "male") return "text-blue-600 dark:text-blue-400";
  if (gender === "female") return "text-pink-600 dark:text-pink-400";
  return "text-foreground";
}
