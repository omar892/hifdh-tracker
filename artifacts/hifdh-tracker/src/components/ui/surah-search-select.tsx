import { useState, useRef, useEffect } from "react";
import { useListSurahs } from "@workspace/api-client-react";
import { Search, ChevronDown } from "lucide-react";

interface SurahSearchSelectProps {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
}

export function SurahSearchSelect({ value, onChange, placeholder = "Select Surah", className = "" }: SurahSearchSelectProps) {
  const { data: surahs = [] } = useListSurahs();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSurah = surahs.find((s) => s.number === value);

  const filtered = surahs.filter((s) => {
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.nameArabic.includes(q) ||
      String(s.number).startsWith(q)
    );
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (num: number) => {
    onChange(num);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-background border-2 border-border text-left text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
      >
        <span className={selectedSurah ? "text-foreground font-medium" : "text-muted-foreground"}>
          {selectedSurah
            ? `${selectedSurah.number}. ${selectedSurah.name}`
            : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border-2 border-primary/20 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search surah name or number..."
                className="w-full pl-9 pr-4 py-2 bg-background rounded-lg text-sm outline-none border border-border focus:border-primary"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-60">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-muted-foreground text-sm text-center">No results</div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.number}
                  type="button"
                  onClick={() => handleSelect(s.number)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-primary/5 transition-colors ${
                    s.number === value ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  <span className="text-sm">
                    <span className="text-muted-foreground mr-2 font-mono text-xs">{s.number}.</span>
                    {s.name}
                  </span>
                  <span className="text-sm text-muted-foreground font-arabic">{s.nameArabic}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
