import { trpc } from "@/lib/trpc";
import {
  energyColors,
  energyEmojis,
  energyToMode,
  formatDate,
  getDaysAgo,
  getWeekRange,
  modeConfig,
} from "@/lib/energy";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Link } from "wouter";
import { CheckCircle2, Circle, TrendingUp, CalendarDays, Zap, ChevronRight, FlaskConical, Sparkles, BarChart3, Target, Download, FileArchive, Github } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Energy Trend Chart ────────────────────────────────────────────────────────

function EnergyTrendChart() {
  const startDate = getDaysAgo(27); // 4주
  const endDate = formatDate(new Date());

  const { data, isLoading } = trpc.dashboard.energyTrend.useQuery({ startDate, endDate });

  const chartData = useMemo(() => {
    if (!data) return [];
    // Fill all days in range
    const result: { date: string; label: string; energy: number | null }[] = [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const map = new Map(data.map((d) => [String(d.date), d.energy]));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = formatDate(d);
      const month = d.getMonth() + 1;
      const day = d.getDate();
      result.push({
        date: key,
        label: `${month}/${day}`,
        energy: map.get(key) ?? null,
      });
    }
    return result;
  }, [data, startDate, endDate]);

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (payload.energy === null) return null;
    const color = energyColors[payload.energy] ?? "#888";
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    if (d.energy === null) return null;
    const mode = energyToMode(d.energy);
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
        <p className="text-muted-foreground">{d.date}</p>
        <p className="font-semibold text-foreground mt-0.5">
          {energyEmojis[d.energy]} 에너지 {d.energy}
        </p>
        <p className={cn("font-mono mt-0.5", modeConfig[mode].color)}>{mode}</p>
      </div>
    );
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="oklch(0.72 0.15 195)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="oklch(0.72 0.15 195)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="oklch(0.25 0.02 240)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "oklch(0.58 0.02 240)" }}
            tickLine={false}
            axisLine={false}
            interval={6}
          />
          <YAxis
            domain={[0, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontSize: 10, fill: "oklch(0.58 0.02 240)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="energy"
            stroke="oklch(0.72 0.15 195)"
            strokeWidth={2}
            fill="url(#energyGrad)"
            dot={<CustomDot />}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Habit Heatmap ─────────────────────────────────────────────────────────────

function HabitHeatmap() {
  const startDate = getDaysAgo(83); // ~12주
  const endDate = formatDate(new Date());

  const { data, isLoading } = trpc.dashboard.habitHeatmap.useQuery({ startDate, endDate });

  const cells = useMemo(() => {
    if (!data) return [];
    const logMap = new Map<string, boolean>();
    for (const log of data.logs) {
      if (log.done) logMap.set(`${String(log.date)}-${log.habitId}`, true);
    }

    const result: { date: string; count: number; total: number }[] = [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const habitCount = data.habits.length || 3;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = formatDate(d);
      let count = 0;
      for (const habit of data.habits) {
        if (logMap.get(`${String(key)}-${habit.id}`)) count++;
      }
      result.push({ date: key, count, total: habitCount });
    }
    return result;
  }, [data, startDate, endDate]);

  const getCellColor = (count: number, total: number) => {
    if (count === 0) return "bg-secondary/60";
    const ratio = count / total;
    if (ratio >= 1) return "bg-[oklch(0.65_0.18_145)]";
    if (ratio >= 0.67) return "bg-[oklch(0.72_0.15_195)]";
    if (ratio >= 0.33) return "bg-[oklch(0.72_0.15_195)]/60";
    return "bg-[oklch(0.72_0.15_195)]/30";
  };

  if (isLoading) {
    return <Skeleton className="h-20 w-full rounded-xl" />;
  }

  // Group by week columns
  const weeks: typeof cells[] = [];
  let week: typeof cells = [];
  // Pad start to Monday
  if (cells.length > 0) {
    const firstDay = new Date(cells[0].date + "T00:00:00").getDay();
    const pad = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < pad; i++) week.push({ date: "", count: 0, total: 0 });
  }
  for (const cell of cells) {
    week.push(cell);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {w.map((cell, di) => (
              <div
                key={di}
                title={cell.date ? `${cell.date}: ${cell.count}/${cell.total}` : ""}
                className={cn(
                  "w-3 h-3 rounded-sm transition-colors",
                  cell.date ? getCellColor(cell.count, cell.total) : "bg-transparent"
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-muted-foreground">없음</span>
        <div className="flex gap-1">
          {["bg-secondary/60", "bg-[oklch(0.72_0.15_195)]/30", "bg-[oklch(0.72_0.15_195)]/60", "bg-[oklch(0.72_0.15_195)]", "bg-[oklch(0.65_0.18_145)]"].map(
            (c, i) => (
              <div key={i} className={cn("w-3 h-3 rounded-sm", c)} />
            )
          )}
        </div>
        <span className="text-xs text-muted-foreground">전체 완료</span>
      </div>
    </div>
  );
}

// ─── Weekly Habit Summary ──────────────────────────────────────────────────────

function WeeklyHabitSummary() {
  const today = formatDate(new Date());
  const { start, end } = getWeekRange(new Date());

  const { data, isLoading } = trpc.dashboard.weekSummary.useQuery({
    weekStart: start,
    weekEnd: end,
  });

  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-xl" />;
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">
        습관을 설정하면 주간 달성 현황이 표시됩니다
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {data.map((item) => {
        const ratio = item.done / item.total;
        const barColor =
          ratio >= 1
            ? "bg-[oklch(0.65_0.18_145)]"
            : ratio >= 0.5
            ? "bg-[oklch(0.72_0.15_195)]"
            : "bg-[oklch(0.72_0.19_50)]";
        return (
          <div key={item.habitId} className="bg-secondary/40 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary">Slot {item.slot}</span>
              <span className="text-xs font-semibold text-foreground">
                {item.done}/{item.total}일
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{item.name}</p>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColor)}
                style={{ width: `${Math.min(100, (item.done / item.total) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Today Status Card ─────────────────────────────────────────────────────────

function TodayCard() {
  const today = formatDate(new Date());
  const { data, isLoading } = trpc.daily.get.useQuery({ date: today });

  if (isLoading) return <Skeleton className="h-20 w-full rounded-2xl" />;

  const entry = data?.entry;
  const todos = data?.todos ?? [];
  const doneTodos = todos.filter((t) => t.done).length;

  return (
    <Link href="/daily">
      <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between hover:border-primary/40 transition-colors cursor-pointer">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">오늘 체크인</p>
          {entry ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl">{energyEmojis[entry.energy ?? 3]}</span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  에너지 {entry.energy}점
                </p>
                {entry.todoMode && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-mono border mt-0.5",
                      modeConfig[entry.todoMode].color,
                      modeConfig[entry.todoMode].bgColor,
                      modeConfig[entry.todoMode].borderColor
                    )}
                  >
                    {entry.todoMode}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">아직 체크인하지 않았습니다</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {entry && todos.length > 0 && (
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {doneTodos}/{todos.length}
              </p>
              <p className="text-xs text-muted-foreground">목표</p>
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

// ─── Phase 2: Improvement Points Widget ──────────────────────────────────────

function ImprovementsWidget() {
  const { data: improvements, isLoading } = trpc.improvements.list.useQuery(
    { status: "experimenting" },
    { staleTime: 30_000 }
  );
  const { data: pending } = trpc.improvements.list.useQuery(
    { status: "pending" },
    { staleTime: 30_000 }
  );

  const items = [
    ...(improvements ?? []),
    ...(pending ?? []),
  ].slice(0, 3);

  if (isLoading) return <Skeleton className="h-16 w-full rounded-xl" />;

  if (items.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-xs text-muted-foreground">개선 포인트가 없습니다</p>
        <Link href="/review">
          <span className="text-xs text-primary hover:underline">Writing Review에서 추가하기 →</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((p) => (
        <div key={p.id} className="flex items-start gap-2 p-2 rounded-lg bg-secondary/30">
          <div className={cn(
            "mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center",
            p.status === "experimenting" ? "bg-yellow-500/20" : "bg-muted"
          )}>
            {p.status === "experimenting"
              ? <FlaskConical size={10} className="text-yellow-400" />
              : <Target size={10} className="text-muted-foreground" />}
          </div>
          <p className="text-xs text-foreground leading-relaxed flex-1 line-clamp-2">{p.content}</p>
        </div>
      ))}
      <Link href="/improvements">
        <button className="w-full text-xs text-primary hover:underline text-center py-1">
          전체 보기 →
        </button>
      </Link>
    </div>
  );
}

// ─── Phase 2: Latest Weekly Review Widget ────────────────────────────────────

function WeeklyReviewWidget() {
  const { data: reports, isLoading } = trpc.weekly.list.useQuery(undefined, { staleTime: 60_000 });
  const latest = reports?.[reports.length - 1];

  if (isLoading) return <Skeleton className="h-16 w-full rounded-xl" />;

  if (!latest) {
    return (
      <div className="text-center py-3">
        <p className="text-xs text-muted-foreground">아직 주간 리포트가 없습니다</p>
        <Link href="/weekly">
          <span className="text-xs text-primary hover:underline">리포트 생성하기 →</span>
        </Link>
      </div>
    );
  }

  const modeColors: Record<string, string> = {
    recovery: "text-red-400",
    normal: "text-yellow-400",
    stretch: "text-primary",
  };

  return (
    <Link href="/weekly">
      <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 hover:border-primary/40 transition-colors cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {latest.weekStart} ~ {latest.weekEnd}
          </span>
          {latest.nextWeekMode && (
            <span className={cn("text-xs font-bold", modeColors[latest.nextWeekMode] ?? "text-foreground")}>
              → {latest.nextWeekMode}
            </span>
          )}
        </div>
        {latest.aiAnalysis && (
          <p className="text-xs text-foreground line-clamp-2 leading-relaxed">{latest.aiAnalysis}</p>
        )}
        {latest.energyAvg && (
          <p className="text-xs text-muted-foreground mt-1">평균 에너지 {latest.energyAvg}/5</p>
        )}
      </div>
    </Link>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <div className="container py-4 space-y-5">
      {/* Today Card */}
      <TodayCard />

      {/* Phase 2: Improvement Points */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-foreground">이번 주 실험</h2>
          <Link href="/improvements" className="ml-auto">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </div>
        <ImprovementsWidget />
      </section>

      {/* Energy Trend */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">에너지 트렌드</h2>
          <span className="text-xs text-muted-foreground ml-auto">최근 4주</span>
        </div>
        <EnergyTrendChart />
      </section>

      {/* Weekly Habit Summary */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">이번 주 습관</h2>
        </div>
        <WeeklyHabitSummary />
      </section>

      {/* Phase 2: Latest Weekly Review */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">최근 주간 리뷰</h2>
          <Link href="/weekly" className="ml-auto">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </div>
        <WeeklyReviewWidget />
      </section>

      {/* Habit Heatmap */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">습관 히트맵</h2>
          <span className="text-xs text-muted-foreground ml-auto">최근 12주</span>
        </div>
        <HabitHeatmap />
      </section>

      {/* Obsidian Export */}
      <ObsidianExportCard />
    </div>
  );
}

// ─── Obsidian Export Card ──────────────────────────────────────────────────────────

function ObsidianExportCard() {
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [range, setRange] = useState<"week" | "month" | "custom">("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { data: githubConfig } = trpc.userContext.getGitHubConfig.useQuery();
  const pushMutation = trpc.github.push.useMutation();

  const getDateRange = () => {
    const today = formatDate(new Date());
    if (range === "week") return { start: getDaysAgo(6), end: today };
    if (range === "month") return { start: getDaysAgo(29), end: today };
    return { start: customStart, end: customEnd };
  };

  const handleExport = async () => {
    const { start, end } = getDateRange();
    if (!start || !end) { toast.error("날짜를 입력해주세요"); return; }
    if (start > end) { toast.error("시작일이 종료일보다 뒤입니다"); return; }
    setExporting(true);
    try {
      const result = await utils.client.export.range.query({ startDate: start, endDate: end });
      if (!result.files.length) { toast.error("해당 기간에 기록이 없습니다"); return; }

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const folder = zip.folder("life-os-daily")!;
      for (const file of result.files) {
        folder.file(file.filename, file.content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `life-os-${start}-${end}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${result.files.length}개 파일 다운로드 완료`);
    } catch {
      toast.error("내보내기에 실패했습니다");
    } finally {
      setExporting(false);
    }
  };

  const handlePushToGitHub = async () => {
    const { start, end } = getDateRange();
    if (!start || !end) { toast.error("날짜를 입력해주세요"); return; }
    if (start > end) { toast.error("시작일이 종료일보다 뒤입니다"); return; }
    setPushing(true);
    try {
      const result = await utils.client.export.range.query({ startDate: start, endDate: end });
      if (!result.files.length) { toast.error("해당 기간에 기록이 없습니다"); return; }

      const res = await pushMutation.mutateAsync({
        files: result.files,
        commitMessage: `chore: bulk update daily notes ${start} ~ ${end}`,
      });
      if (res.failed > 0 && res.pushed === 0) {
        toast.error(`모든 파일 푸시 실패`);
      } else if (res.failed > 0) {
        toast.warning(`${res.pushed}개 성공, ${res.failed}개 실패`);
      } else {
        toast.success(`GitHub Daily/ 폴더에 ${res.pushed}개 파일 푸시 완료`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류";
      if (msg.includes("설정이 없습니다")) {
        toast.error("먼저 설정 화면에서 GitHub를 연결해주세요");
      } else {
        toast.error(`GitHub 푸시 실패: ${msg}`);
      }
    } finally {
      setPushing(false);
    }
  };

  const isDisabled = range === "custom" && (!customStart || !customEnd);

  return (
    <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileArchive className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Obsidian Export</h2>
        {githubConfig?.configured && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
            <Github className="w-3 h-3" />
            GitHub 연결됨
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">선택한 기간의 Daily 기록을 다운로드하거나 GitHub에 직접 푸시합니다.</p>

      {/* 기간 선택 */}
      <div className="flex gap-2">
        {(["week", "month", "custom"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "flex-1 h-8 rounded-lg text-xs font-medium transition-all border",
              range === r
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40"
            )}
          >
            {r === "week" ? "이번 주" : r === "month" ? "이번 달" : "직접 입력"}
          </button>
        ))}
      </div>

      {/* 직접 입력 */}
      {range === "custom" && (
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="flex-1 h-9 px-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="flex-1 h-9 px-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      )}

      {/* 다운로드 + GitHub 푸시 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={exporting || isDisabled}
          className="flex-1 h-10 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          {exporting ? "내보내는 중..." : ".zip"}
        </button>
        {githubConfig?.configured ? (
          <button
            onClick={handlePushToGitHub}
            disabled={pushing || isDisabled}
            className="flex-1 h-10 rounded-xl bg-[oklch(0.72_0.15_195)]/15 border border-[oklch(0.72_0.15_195)]/30 text-[oklch(0.72_0.15_195)] text-sm font-medium hover:bg-[oklch(0.72_0.15_195)]/25 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Github className="w-4 h-4" />
            {pushing ? "푸시 중..." : "GitHub 푸시"}
          </button>
        ) : (
          <a
            href="/settings"
            className="flex-1 h-10 rounded-xl bg-secondary/40 border border-border text-muted-foreground/60 text-sm font-medium hover:text-muted-foreground hover:border-border/80 transition-colors flex items-center justify-center gap-2"
          >
            <Github className="w-4 h-4" />
            GitHub 연결
          </a>
        )}
      </div>
    </section>
  );
}
