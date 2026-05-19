import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import LogWeek from "@/pages/log-week";
import StudentProfile from "@/pages/student-profile";
import ManageStudents from "@/pages/manage-students";
import ClassStats from "@/pages/class-stats";
import Settings from "@/pages/settings";
import SharePage from "@/pages/share";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* PUBLIC route — no auth, no app chrome. Lives outside everything
          else so a parent with a link doesn't need to know the app exists. */}
      <Route path="/share/:token" component={SharePage} />

      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path="/log-week" component={LogWeek} />
      <Route path="/log-week/:studentIndex" component={LogWeek} />
      <Route path="/students/:studentId/profile" component={StudentProfile} />
      <Route path="/manage" component={ManageStudents} />
      <Route path="/stats" component={ClassStats} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
