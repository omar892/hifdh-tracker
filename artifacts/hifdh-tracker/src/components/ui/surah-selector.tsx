import { useListSurahs } from "@workspace/api-client-react";

interface SurahSelectorProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  className?: string;
  placeholder?: string;
}

export function SurahSelector({ value, onChange, className = "", placeholder = "Select Surah" }: SurahSelectorProps) {
  const { data: surahs } = useListSurahs();

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={`w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all appearance-none ${className}`}
    >
      <option value="">{placeholder}</option>
      {surahs?.map((s) => (
        <option key={s.number} value={s.number}>
          {s.number}. {s.name} - {s.nameArabic} ({s.ayahCount} Ayahs)
        </option>
      ))}
    </select>
  );
}
