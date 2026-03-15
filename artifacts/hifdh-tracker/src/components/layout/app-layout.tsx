import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  LogOut,
  Moon,
  Sun,
  BookOpen,
} from "lucide-react";
import { motion } from "framer-motion";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
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
    <div className="min-h-screen bg-background flex flex-col md:flex-row w-full overflow-hidden">
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/50 shadow-sm z-20 shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <BookOpen className="text-primary-foreground w-6 h-6" />
          </div>
          <span className="font-display font-bold text-xl text-foreground">Hifdh Tracker</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="block">
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 space-y-2">
          <button
            onClick={() => setIsDark((d) => !d)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden relative">
        <header className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border/50 z-20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="text-primary-foreground w-5 h-5" />
            </div>
            <span className="font-display font-bold text-lg">{title || "Hifdh Tracker"}</span>
          </div>
          <button
            onClick={() => setIsDark((d) => !d)}
            className="p-2 rounded-full bg-secondary text-foreground"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-6xl mx-auto"
          >
            {children}
          </motion.div>
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50 px-6 py-3">
          <div className="flex justify-around items-center max-w-sm mx-auto">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} className="block">
                  <div className="flex flex-col items-center gap-1 p-2">
                    <div
                      className={`p-2 rounded-full transition-all ${
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <item.icon className="w-6 h-6" />
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        isActive ? "text-primary" : "text-muted-foreground"
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
