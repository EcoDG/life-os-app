import { getLoginUrl } from "@/const";
import { BarChart2, Zap, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const handleLogin = () => {
    window.location.href = getLoginUrl();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {/* Logo & Title */}
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
          <BarChart2 className="w-8 h-8 text-primary" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Life OS</h1>
          <p className="text-muted-foreground mt-1 text-sm">에너지 기반 개인 운영 시스템</p>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="w-full max-w-sm space-y-3 mb-10">
        {[
          {
            icon: Zap,
            title: "에너지 인식",
            desc: "매일 에너지를 기록하고 하루를 자동 설계",
          },
          {
            icon: Target,
            title: "습관 트래킹",
            desc: "Slot A/B/C 습관을 유연하게 관리",
          },
          {
            icon: TrendingUp,
            title: "패턴 분석",
            desc: "에너지 트렌드와 습관 히트맵으로 인사이트 확인",
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Login Button */}
      <div className="w-full max-w-sm">
        <Button
          onClick={handleLogin}
          className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
        >
          시작하기
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-3">
          Manus 계정으로 로그인합니다
        </p>
      </div>
    </div>
  );
}
