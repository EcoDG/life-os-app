import { cn } from "@/lib/utils";
import { BarChart2, BarChart3, CheckSquare, LayoutDashboard, PenLine, Settings, TrendingUp } from "lucide-react";
import { Link, useLocation } from "wouter";

const navItems = [
  { path: "/", label: "대시보드", icon: LayoutDashboard },
  { path: "/daily", label: "체크인", icon: CheckSquare },
  { path: "/review", label: "리뷰", icon: PenLine },
  { path: "/weekly", label: "주간", icon: BarChart3 },
  { path: "/settings", label: "설정", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">Life OS</span>
          </div>
          {/* 개선 포인트 링크 (헤더) */}
          <Link href="/improvements">
            <button
              className={cn(
                "flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-all",
                isActive("/improvements")
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              개선
            </button>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border safe-area-bottom">
        <div className="container">
          <div className="flex items-center justify-around h-16">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link key={path} href={path}>
                <button
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200",
                    isActive(path)
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-all duration-200",
                      isActive(path) ? "scale-110" : ""
                    )}
                  />
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                  {isActive(path) && (
                    <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary" />
                  )}
                </button>
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
