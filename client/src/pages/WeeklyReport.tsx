import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks } from "date-fns";
import { ko } from "date-fns/locale";
import {
  AlertCircle,
  BarChart3,
  Battery,
  BatteryLow,
  BatteryMedium,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── 에너지 모드 설정 ─────────────────────────────────────────────────────────

const MODE_CONFIG = {
  recovery: {
    label: "Recovery",
    icon: <BatteryLow size={16} />,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    desc: "회복에 집중하는 한 주",
  },
  normal: {
    label: "Normal",
    icon: <BatteryMedium size={16} />,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    desc: "균형 잡힌 한 주",
  },
  stretch: {
    label: "Stretch",
    icon: <Battery size={16} />,
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20",
    desc: "도전적인 한 주",
  },
};

// ─── 주간 날짜 계산 ───────────────────────────────────────────────────────────

function getWeekRange(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // 월요일 시작
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return {
    weekStart: format(start, "yyyy-MM-dd"),
    weekEnd: format(end, "yyyy-MM-dd"),
    label: `${format(start, "M월 d일", { locale: ko })} ~ ${format(end, "M월 d일", { locale: ko })}`,
  };
}

// ─── 에너지 바 ────────────────────────────────────────────────────────────────

function EnergyBar({ value, max = 5 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = value >= 4 ? "bg-primary" : value >= 3 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-foreground w-6 text-right">{value.toFixed(1)}</span>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function WeeklyReport() {
  const { isAuthenticated, loading } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => subWeeks(new Date(), 1)); // 기본: 지난 주
  const weekRange = getWeekRange(currentDate);

  const utils = trpc.useUtils();

  // 리포트 조회
  const { data: report, isLoading: reportLoading } = trpc.weekly.get.useQuery(
    { weekStart: weekRange.weekStart },
    { enabled: isAuthenticated }
  );

  // 리포트 목록 (사이드바용)
  const { data: reportList } = trpc.weekly.list.useQuery(undefined, { enabled: isAuthenticated });

  // 개선포인트 목록 (실험 중 + 미실행)
  const { data: improvements } = trpc.improvements.list.useQuery(
    { status: undefined },
    { enabled: isAuthenticated }
  );

  // 리포트 생성 mutation
  const generateMutation = trpc.weekly.generate.useMutation({
    onSuccess: (data) => {
      utils.weekly.get.invalidate({ weekStart: weekRange.weekStart });
      utils.weekly.list.invalidate();
      // energyGradeDist는 generate 응답에만 포함됨 (저장 안 됨)
      if (data && "energyGradeDist" in data) {
        setGradeDist(data.energyGradeDist as { grade: string; count: number; energy: number }[]);
      }
      toast.success("주간 리포트가 생성되었습니다!");
    },
    onError: () => toast.error("리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요."),
  });

  // 개선포인트 상태 변경 (실험 중으로)
  const updateStatusMutation = trpc.improvements.updateStatus.useMutation({
    onSuccess: () => {
      utils.improvements.list.invalidate();
      toast.success("상태가 업데이트되었습니다.");
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-6">
        <p className="text-muted-foreground">로그인이 필요합니다</p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>로그인</Button>
      </div>
    );
  }

  const isCurrentWeek = weekRange.weekStart === getWeekRange(new Date()).weekStart;
  const habitSummary = (report?.habitSummary ?? []) as { slot: string; name: string; done: number; total: number }[];
  const drainKeywords = (report?.drainKeywords ?? []) as string[];
  const chargeKeywords = (report?.chargeKeywords ?? []) as string[];
  const suggestions = (report?.suggestions ?? []) as string[];
  const nextWeekMode = (report?.nextWeekMode ?? "normal") as "recovery" | "normal" | "stretch";
  const modeCfg = MODE_CONFIG[nextWeekMode];

  // 에너지 등급 분포 데이터 (generate mutation 결과 또는 저장된 report에서)
  const [gradeDist, setGradeDist] = useState<{ grade: string; count: number; energy: number }[] | null>(null);
  const gradeDistData = useMemo(() => {
    if (gradeDist) return gradeDist;
    return null;
  }, [gradeDist]);

  const GRADE_COLORS: Record<string, string> = {
    "매우 좋음": "#2dd4bf",
    "좋음": "#34d399",
    "보통": "#fbbf24",
    "관심 필요": "#f87171",
  };

  // 이번 주 실험 가능한 개선포인트
  const pendingImprovements = improvements?.filter(
    (p) => p.status === "pending" || p.status === "experimenting"
  ) ?? [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 size={20} className="text-primary" />
              Weekly Report
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">AI 주간 분석</p>
          </div>
        </div>

        {/* 주 선택 네비게이션 */}
        <div className="flex items-center justify-between bg-card border border-border/50 rounded-xl p-3 mb-5">
          <button
            onClick={() => setCurrentDate((d) => subWeeks(d, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{weekRange.label}</p>
            {isCurrentWeek && (
              <span className="text-xs text-muted-foreground">이번 주</span>
            )}
          </div>
          <button
            onClick={() => setCurrentDate((d) => addWeeks(d, 1))}
            disabled={isCurrentWeek}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* 리포트 없을 때 */}
        {!reportLoading && !report && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles size={28} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-medium">아직 리포트가 없습니다</p>
              <p className="text-sm text-muted-foreground mt-1">
                {weekRange.label} 데이터를 AI가 분석합니다
              </p>
            </div>
            <Button
              onClick={() =>
                generateMutation.mutate({
                  weekStart: weekRange.weekStart,
                  weekEnd: weekRange.weekEnd,
                })
              }
              disabled={generateMutation.isPending}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  AI 분석 중...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  주간 리포트 생성
                </>
              )}
            </Button>
          </div>
        )}

        {/* 로딩 */}
        {reportLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        )}

        {/* 리포트 내용 */}
        {report && (
          <div className="space-y-4">
            {/* 에너지 요약 */}
            <Card className="bg-card border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap size={14} className="text-primary" />
                  에너지 요약
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.energyAvg != null ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">주간 평균</p>
                      <EnergyBar value={parseFloat(report.energyAvg)} />
                    </div>
                    {gradeDistData && gradeDistData.some((d) => d.count > 0) && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">등급 분포</p>
                        <ResponsiveContainer width="100%" height={110}>
                          <BarChart data={gradeDistData} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
                            <XAxis dataKey="grade" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, fontSize: 12 }}
                              formatter={(value) => [`${value}일`, "횟수"]}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {gradeDistData.map((entry) => (
                                <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade] ?? "#64748b"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {report.energyHighDay && (
                        <div className="bg-primary/10 rounded-lg p-2">
                          <div className="flex items-center gap-1 mb-0.5">
                            <TrendingUp size={12} className="text-primary" />
                            <span className="text-xs text-primary">최고</span>
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(report.energyHighDay), "M/d (EEE)", { locale: ko })}
                          </p>
                        </div>
                      )}
                      {report.energyLowDay && (
                        <div className="bg-red-500/10 rounded-lg p-2">
                          <div className="flex items-center gap-1 mb-0.5">
                            <TrendingDown size={12} className="text-red-400" />
                            <span className="text-xs text-red-400">최저</span>
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(report.energyLowDay), "M/d (EEE)", { locale: ko })}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">에너지 데이터가 없습니다</p>
                    {gradeDistData && gradeDistData.some((d) => d.count > 0) && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">등급 분포</p>
                        <ResponsiveContainer width="100%" height={100}>
                          <BarChart data={gradeDistData} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
                            <XAxis dataKey="grade" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, fontSize: 12 }}
                              formatter={(value) => [`${value}일`, "횟수"]}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {gradeDistData.map((entry) => (
                                <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade] ?? "#64748b"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    </div>
                )}
              </CardContent>
            </Card>

            {/* 습관 달성 */}
            {habitSummary.length > 0 && (
              <Card className="bg-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">습관 달성</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {habitSummary.map((h) => (
                    <div key={h.slot} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-12">Slot {h.slot}</span>
                      <span className="text-sm text-foreground flex-1 truncate">{h.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {Array.from({ length: h.total }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded-sm ${
                                i < h.done ? "bg-primary" : "bg-muted"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-medium text-foreground w-8 text-right">
                          {h.done}/{h.total}일
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Drain / Charge 키워드 */}
            {(drainKeywords.length > 0 || chargeKeywords.length > 0) && (
              <Card className="bg-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">에너지 키워드</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {drainKeywords.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Drain</p>
                      <div className="flex flex-wrap gap-1">
                        {drainKeywords.map((k) => (
                          <span
                            key={k}
                            className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {chargeKeywords.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Charge</p>
                      <div className="flex flex-wrap gap-1">
                        {chargeKeywords.map((k) => (
                          <span
                            key={k}
                            className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI 분석 */}
            {report.aiAnalysis && (
              <Card className="bg-gradient-to-br from-primary/10 to-accent/5 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    AI 인사이트
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">{report.aiAnalysis}</p>
                </CardContent>
              </Card>
            )}

            {/* 다음 주 모드 제안 */}
            <Card className={`border ${modeCfg.bg}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  다음 주 추천 모드
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`flex items-center gap-3 ${modeCfg.color}`}>
                  {modeCfg.icon}
                  <div>
                    <p className="font-bold text-lg">{modeCfg.label}</p>
                    <p className="text-xs text-muted-foreground">{modeCfg.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI 제안 */}
            {suggestions.length > 0 && (
              <Card className="bg-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">다음 주를 위한 제안</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* 개선포인트 실험 선택 */}
            {pendingImprovements.length > 0 && (
              <Card className="bg-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FlaskConical size={14} className="text-yellow-400" />
                    다음 주 실험할 개선 포인트
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingImprovements.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-relaxed">{p.content}</p>
                        <span
                          className={`text-xs ${
                            p.status === "experimenting"
                              ? "text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {p.status === "experimenting" ? "실행 중" : "미실행"}
                        </span>
                      </div>
                      {p.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 shrink-0"
                          onClick={() =>
                            updateStatusMutation.mutate({ id: p.id, status: "experimenting" })
                          }
                        >
                          실험 시작
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* 리포트 재생성 버튼 */}
            <Button
              variant="outline"
              onClick={() =>
                generateMutation.mutate({
                  weekStart: weekRange.weekStart,
                  weekEnd: weekRange.weekEnd,
                })
              }
              disabled={generateMutation.isPending}
              className="w-full gap-2 text-muted-foreground"
            >
              {generateMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              리포트 재생성
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
