import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { BookOpen, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const [password, setPassword] = useState("");
  const { login, isLoggingIn } = useAuth();
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login({ data: { password } });
    } catch (err) {
      setError("Invalid password. Please try again.");
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background relative overflow-hidden">
      {/* Background Panel with gradient + geometric pattern */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        {/* Radial gradient base */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.8),hsl(160,84%,10%))]" />
        {/* Islamic geometric pattern using CSS */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='white' stroke-width='1'/%3E%3Cpath d='M30 10L50 30L30 50L10 30Z' fill='none' stroke='white' stroke-width='0.5'/%3E%3Ccircle cx='30' cy='30' r='8' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Overlay for depth */}
        <div className="absolute inset-0 bg-black/10 z-10" />
        <img
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="Hifdh Tracker Logo"
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40"
        />
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white p-12 text-center">
          <BookOpen className="w-24 h-24 mb-8 opacity-90" />
          <h1 className="font-display font-bold text-5xl mb-4">Quran Hifdh Tracker</h1>
          <p className="text-xl text-white/80 max-w-md font-sans">
            A minimalist, distraction-free environment for tracking your students' memorization progress.
          </p>
        </div>
      </div>

      {/* Login Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 z-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25 mb-6">
              <BookOpen className="text-white w-8 h-8" />
            </div>
            <h1 className="font-display font-bold text-3xl text-foreground">Hifdh Tracker</h1>
          </div>

          <div className="bg-card dark:bg-secondary p-8 sm:p-10 rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/40 border border-border/50 dark:border-border">
            <div className="mb-8">
              <h2 className="font-display font-bold text-2xl text-foreground">Teacher Login</h2>
              <p className="text-muted-foreground mt-2">Enter your password to access the dashboard.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground ml-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-4 bg-secondary dark:bg-background border-2 border-transparent dark:border-border focus:border-primary focus:bg-background rounded-xl outline-none transition-all text-foreground"
                    placeholder="Enter teacher password"
                    required
                  />
                </div>
                {error && <p className="text-destructive text-sm mt-2 ml-1 font-medium">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoggingIn || !password}
                className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoggingIn ? "Authenticating..." : "Sign In"}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
