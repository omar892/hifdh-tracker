import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetDashboard } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  LogOut,
  Moon,
  Sun,
  Settings as SettingsIcon,
} from "lucide-react";
import { LawhMark } from "@/components/lawh-mark";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

function SidebarWeekSummary() {
  const { data: dashboard } = useGetDashboard();
  if (!dashboard || dashboard.length === 0) return null;
  const done = dashboard.filter((s) => s.thisWeekDone).length;
  const total = dashboard.length;
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;
  return (
    <div className={`mx-4 mb-3 p-3 rounded-xl border text-sm ${
      allDone
        ? "bg-emerald-500/10 border-emerald-500/20"
        : "bg-amber-500/10 border-amber-500/20"
    }`}>
      <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-1.5 ${
        allDone ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
      }`}>
        This Week
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-extrabold whitespace-nowrap ${
          allDone ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
        }`}>
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    document.title = title ? `Lawh · ${title}` : "Lawh";
  }, [title]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/stats", label: "Class Stats", icon: BarChart3 },
    { href: "/manage", label: "Students", icon: Users },
  ];

  return (
    <div className="h-screen bg-background flex flex-col md:flex-row w-full overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/50 z-20 shrink-0">
        <div className="p-6 flex items-center gap-3">
          <LawhMark size={40} />
          <div>
            <span className="font-display font-extrabold text-lg text-foreground tracking-tight block leading-none">Lawh</span>
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Hifdh</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="block">
                <div
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground font-medium"
                  }`}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  <span className="text-sm">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/50">
          <SidebarWeekSummary />
          <div className="p-3 pt-1 space-y-0.5">
            <Link href="/settings" className="block">
              <div
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  location === "/settings"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <SettingsIcon className="w-[18px] h-[18px]" />
                Settings
              </div>
            </Link>
            <button
              onClick={() => setIsDark((d) => !d)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-all text-sm font-medium"
            >
              {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
              {isDark ? "Light Mode" : "Dark Mode"}
            </button>
            <button
              onClick={() => logout().catch(() => {})}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-all text-sm font-medium"
            >
              <LogOut className="w-[18px] h-[18px]" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-card/80 backdrop-blur-lg border-b border-border/30 z-20 shrink-0">
          <div className="flex items-center gap-2.5">
            <LawhMark size={32} />
            <span className="font-display font-extrabold text-base tracking-tight">{title || "Lawh"}</span>
          </div>
          <button
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setIsDark((d) => !d)}
            className="p-2 rounded-full bg-secondary text-foreground"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 pb-28 md:pb-8">
          {/* min-h-0 is the key: without it, flex-1 lets this wrapper grow
              with content so overflow-y-auto never triggers, and the fixed
              mobile bottom nav sits over the bottom of any long form.
              Page entrance animation removed — framer-motion was leaving
              content stuck at opacity:0 in our preview environment. */}
          <div key={location} className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-lg border-t border-border/30 z-50 px-4 py-1.5">
          <div className="flex justify-around items-center max-w-sm mx-auto">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} className="block">
                  <div className="flex flex-col items-center gap-0.5 min-h-[52px] justify-center px-4">
                    <div
                      className={`p-1 rounded-full transition-all ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <item.icon className={`w-6 h-6 ${isActive ? "stroke-[2.5px]" : ""}`} />
                    </div>
                    <span
                      className={`text-[10px] leading-none ${
                        isActive ? "text-primary font-extrabold" : "text-muted-foreground font-semibold"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
  );
}
