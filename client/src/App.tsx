import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DailyCheckin from "./pages/DailyCheckin";
import DailyDetail from "./pages/DailyDetail";
import Settings from "./pages/Settings";
import WritingReview from "./pages/WritingReview";
import Improvements from "./pages/Improvements";
import WeeklyReport from "./pages/WeeklyReport";
import AppLayout from "./components/AppLayout";
import { Loader2 } from "lucide-react";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Phase 1 */}
      <Route path="/">
        <AuthGuard>
          <AppLayout>
            <Dashboard />
          </AppLayout>
        </AuthGuard>
      </Route>
      <Route path="/daily">
        <AuthGuard>
          <AppLayout>
            <DailyCheckin />
          </AppLayout>
        </AuthGuard>
      </Route>
      <Route path="/daily/:date">
        {(params) => (
          <AuthGuard>
            <AppLayout>
              <DailyDetail date={params.date} />
            </AppLayout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/settings">
        <AuthGuard>
          <AppLayout>
            <Settings />
          </AppLayout>
        </AuthGuard>
      </Route>

      {/* Phase 2 */}
      <Route path="/review">
        <AuthGuard>
          <AppLayout>
            <WritingReview />
          </AppLayout>
        </AuthGuard>
      </Route>
      <Route path="/improvements">
        <AuthGuard>
          <AppLayout>
            <Improvements />
          </AppLayout>
        </AuthGuard>
      </Route>
      <Route path="/weekly">
        <AuthGuard>
          <AppLayout>
            <WeeklyReport />
          </AppLayout>
        </AuthGuard>
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
