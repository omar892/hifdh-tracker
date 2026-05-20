interface LawhMarkProps {
  /** Tile width/height in px. Defaults to the sidebar icon size. */
  size?: number;
  className?: string;
}

/**
 * Brand mark: a rounded-square tile in the primary green with the
 * Arabic wordmark "لوح" centered inside (Reem Kufi 600).
 */
export function LawhMark({ size = 40, className = "" }: LawhMarkProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/30 ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.26 }}
      role="img"
      aria-label="Lawh"
    >
      <span
        className="font-arabic-mark font-semibold leading-none text-white select-none"
        style={{ fontSize: size * 0.52 }}
      >
        لوح
      </span>
    </div>
  );
}
