import { trpc } from "@/lib/trpc";
import {
  DAY_LABELS_KO,
  energyEmojis,
  energyToMaxTodos,
  energyToMode,
  formatDate,
  modeConfig,
} from "@/lib/energy";
import {
  EnergyGradeSelector,
  SleepGradeSelector,
  energyToGrade,
  sleepToGrade,
  type SamsungGrade,
} from "@/components/SamsungGradeSelector";
import { SamsungHealthAnalyzer, type AnalysisResult } from "@/components/SamsungHealthAnalyzer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Zap,
  Moon,
  ListChecks,
  Flame,
  Battery,
  PenLine,
  Activity,
  X,
} from "lucide-react";
import { Link, useLocation } from "wouter";

function getTodayStr() {
  return formatDate(new Date());
}

function getDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const today = getTodayStr();
  const dayLabel = DAY_LABELS_KO[d.getDay()];
  const isToday = dateStr === today;
  return `${dateStr.replace(/-/g, ".")} (${dayLabel})${isToday ? " · 오늘" : ""}`;
}

export default function DailyCheckin() {
  const today = getTodayStr();
  const [selectedDate, setSelectedDate] = useState(today);

  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.daily.get.useQuery({ date: selectedDate });

  // Samsung Health grade state
  const [energyGrade, setEnergyGrade] = useState<SamsungGrade | null>(null);
  const [sleepGrade, setSleepGrade] = useState<SamsungGrade | null>(null);

  // Derived Life OS values
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleep, setSleep] = useState<"good" | "ok" | "bad" | null>(null);
  const [drain, setDrain] = useState("");
  const [charge, setCharge] = useState("");
  const [newTodo, setNewTodo] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkinSaved, setCheckinSaved] = useState(false);
  const [, navigate] = useLocation();

  // Health Sync pre-fill 상태
  const [healthPrefilled, setHealthPrefilled] = useState(false);

  // AI 분석 결과 임시 저장 (세션 내 Writing Review 연결용)
  const [aiAnalysisForReview, setAiAnalysisForReview] = useState<{
    oneLine: string;
    suggestion: string;
    energyScore: number;
  } | null>(null);

  // Sync from server data (health sync 데이터 있으면 pre-fill)
  useEffect(() => {
    if (data?.entry) {
      const e = data.entry.energy ?? null;
      const s = data.entry.sleep ?? null;
      setEnergy(e);
      setSleep(s);
      // DB에 저장된 energyGrade/sleepGrade가 있으면 우선 복원, 없으면 에너지 숫자로 역매핑
      const storedEnergyGrade = (data.entry as any).energyGrade as SamsungGrade | null | undefined;
      const storedSleepGrade = (data.entry as any).sleepGrade as SamsungGrade | null | undefined;
      if (storedEnergyGrade) setEnergyGrade(storedEnergyGrade);
      else if (e !== null) setEnergyGrade(energyToGrade(e));
      else setEnergyGrade(null);
      if (storedSleepGrade) setSleepGrade(storedSleepGrade);
      else if (s !== null) setSleepGrade(sleepToGrade(s));
      else setSleepGrade(null);
      setDrain(data.entry.drain ?? "");
      setCharge(data.entry.charge ?? "");
      // health sync로 자동 채워진 경우 배너 표시
      const hasHealthSync = !!(data.entry as any).healthSyncedAt;
      const hasManualData = !!(data.entry.drain || data.entry.charge);
      setHealthPrefilled(hasHealthSync && !hasManualData);
    } else {
      setEnergy(null);
      setSleep(null);
      setEnergyGrade(null);
      setSleepGrade(null);
      setDrain("");
      setCharge("");
      setHealthPrefilled(false);
    }
  }, [data?.entry, selectedDate]);

  const mode = energy ? energyToMode(energy) : null;
  const maxTodos = energy ? energyToMaxTodos(energy) : 3;
  const modeInfo = mode ? modeConfig[mode] : null;

  const upsertDaily = trpc.daily.upsert.useMutation({
    onSuccess: () => {
      utils.daily.get.invalidate({ date: selectedDate });
      utils.dashboard.energyTrend.invalidate();
    },
  });

  const createTodo = trpc.todos.create.useMutation({
    onSuccess: () => utils.daily.get.invalidate({ date: selectedDate }),
    onError: (e) => toast.error(e.message),
  });

  const toggleTodo = trpc.todos.toggleDone.useMutation({
    onMutate: async ({ id, done }) => {
      await utils.daily.get.cancel({ date: selectedDate });
      const prev = utils.daily.get.getData({ date: selectedDate });
      utils.daily.get.setData({ date: selectedDate }, (old) => {
        if (!old) return old;
        return {
          ...old,
          todos: old.todos.map((t) => (t.id === id ? { ...t, done } : t)),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.daily.get.setData({ date: selectedDate }, ctx.prev);
    },
  });

  const deleteTodo = trpc.todos.delete.useMutation({
    onSuccess: () => utils.daily.get.invalidate({ date: selectedDate }),
  });

  const toggleHabit = trpc.habitLogs.toggle.useMutation({
    onMutate: async ({ habitId, done }) => {
      await utils.daily.get.cancel({ date: selectedDate });
      const prev = utils.daily.get.getData({ date: selectedDate });
      utils.daily.get.setData({ date: selectedDate }, (old) => {
        if (!old) return old;
        const existingLog = old.habitLogs.find((l) => l.habitId === habitId);
        if (existingLog) {
          return {
            ...old,
            habitLogs: old.habitLogs.map((l) =>
              l.habitId === habitId ? { ...l, done } : l
            ),
          };
        } else {
          return {
            ...old,
            habitLogs: [
              ...old.habitLogs,
              {
                id: -1,
                userId: 0,
                habitId,
                date: selectedDate,
                done,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          };
        }
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.daily.get.setData({ date: selectedDate }, ctx.prev);
    },
  });

  const handleSaveCheckin = async () => {
    if (!energy) {
      toast.error("에너지 점수를 선택해주세요");
      return;
    }
    setSaving(true);
    try {
      await upsertDaily.mutateAsync({
        date: selectedDate,
        energy,
        sleep: sleep ?? undefined,
        drain: drain || undefined,
        charge: charge || undefined,
        energyGrade: energyGrade ?? undefined,
        sleepGrade: sleepGrade ?? undefined,
      });
      toast.success("체크인 저장 완료!");
      setCheckinSaved(true);
    } catch {
      toast.error("저장에 실패했습니다");
    } finally {
      setSaving(false);
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    if (!data?.entry && !energy) {
      toast.error("에너지를 먼저 저장해주세요");
      return;
    }
    await createTodo.mutateAsync({ date: selectedDate, content: newTodo.trim() });
    setNewTodo("");
  };

  const navigateDate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + dir);
    setSelectedDate(formatDate(d));
  };

  const todos = data?.todos ?? [];
  const habitLogs = data?.habitLogs ?? [];
  const habits = data?.habits ?? [];

  const getHabitDone = (habitId: number) =>
    habitLogs.find((l) => l.habitId === habitId)?.done ?? false;

  return (
    <div className="container py-4 space-y-4">
      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateDate(-1)}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{getDateLabel(selectedDate)}</p>
        </div>
        <button
          onClick={() => navigateDate(1)}
          disabled={selectedDate >= today}
          className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Health Sync Pre-fill 배너 */}
      {healthPrefilled && (
        <div className="flex items-start gap-3 bg-primary/10 border border-primary/30 rounded-xl p-3">
          <Activity className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary">웨어러블 데이터로 자동 입력됨</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              에너지·수면 값이 Health Sync 데이터 기반으로 채워졌습니다. 직접 수정할 수 있습니다.
              {(data?.entry as any)?.sleepScore !== undefined && (
                <span className="ml-1 text-primary/80">
                  (수면 점수 {(data?.entry as any).sleepScore}점
                  {(data?.entry as any)?.sleepDuration !== undefined &&
                    ` · ${Math.floor((data?.entry as any).sleepDuration / 60)}시간 ${(data?.entry as any).sleepDuration % 60}분`}
                  {(data?.entry as any)?.hrv !== undefined &&
                    ` · HRV ${(data?.entry as any).hrv}ms`}
                  )
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setHealthPrefilled(false)}
            className="p-0.5 rounded hover:bg-primary/20 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* ── Samsung Health AI Analyzer ── */}
      <SamsungHealthAnalyzer
        date={selectedDate}
        onApply={(result: AnalysisResult) => {
          // energy_score → grade 매핑
          const scoreToGrade = (s: number): SamsungGrade => {
            if (s >= 5) return "매우 좋음";
            if (s >= 4) return "좋음";
            if (s >= 3) return "보통";
            return "관심 필요";
          };
          const newEnergyGrade = scoreToGrade(result.energy_score);
          const newSleepQuality = result.sleep_quality as "good" | "ok" | "bad";
          const newSleepGrade: SamsungGrade =
            newSleepQuality === "good" ? "좋음" :
            newSleepQuality === "ok" ? "보통" : "관심 필요";

          setEnergyGrade(newEnergyGrade);
          setEnergy(result.energy_score);
          setSleepGrade(newSleepGrade);
          setSleep(newSleepQuality);
          setHealthPrefilled(false); // AI 분석 결과로 대체
          // Writing Review 연결용으로 AI 분석 결과 저장
          setAiAnalysisForReview({
            oneLine: result.one_line,
            suggestion: result.suggestion,
            energyScore: result.energy_score,
          });
          // sessionStorage에도 백업 (페이지 이동 후도 유지)
          sessionStorage.setItem(
            `ai-analysis-${selectedDate}`,
            JSON.stringify({
              oneLine: result.one_line,
              suggestion: result.suggestion,
              energyScore: result.energy_score,
            })
          );
          toast.success(`AI 분석 완료 — Energy ${result.energy_score}/5 적용됨`);
        }}
      />

      {/* ── Section 1: Energy ── */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Energy</h2>
        </div>
        <EnergyGradeSelector
          value={energyGrade}
          onChange={(grade, mapped) => {
            setEnergyGrade(grade);
            setEnergy(mapped);
            setHealthPrefilled(false);
          }}
        />
        {energyGrade && energy && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {energyGrade} → <strong>Energy {energy}</strong>
            </span>
            {modeInfo && (
              <Badge
                className={cn(
                  "text-xs font-mono font-semibold border",
                  modeInfo.color,
                  modeInfo.bgColor,
                  modeInfo.borderColor
                )}
                variant="outline"
              >
                {modeInfo.label}
              </Badge>
            )}
          </div>
        )}
        {modeInfo && (
          <p className="text-xs text-muted-foreground">{modeInfo.description}</p>
        )}
      </section>

      {/* ── Section 2: Sleep ── */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Sleep</h2>
        </div>
        <SleepGradeSelector
          value={sleepGrade}
          onChange={(grade, mapped) => {
            setSleepGrade(grade);
            setSleep(mapped);
            setHealthPrefilled(false);
          }}
        />
        {sleepGrade && sleep && (
          <p className="text-xs text-muted-foreground">
            {sleepGrade} → <strong>{sleep}</strong>
          </p>
        )}
      </section>

      {/* Save Checkin Button */}
      <Button
        onClick={handleSaveCheckin}
        disabled={saving || !energy}
        className="w-full h-11 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        {saving ? "저장 중..." : data?.entry ? "체크인 업데이트" : "체크인 저장"}
      </Button>

      {/* ── Section 3: Today's Focus (micro-todo) ── */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Today's Focus</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {todos.length}/{maxTodos}
          </span>
        </div>

        {/* Todo List */}
        <div className="space-y-2">
          {todos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              오늘의 목표를 추가해보세요
            </p>
          )}
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-2 p-2 rounded-xl bg-secondary/30 group"
            >
              <button
                onClick={() => toggleTodo.mutate({ id: todo.id, done: !todo.done })}
                className="shrink-0"
              >
                {todo.done ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              <span
                className={cn(
                  "flex-1 text-sm",
                  todo.done ? "line-through text-muted-foreground" : "text-foreground"
                )}
              >
                {todo.content}
              </span>
              <button
                onClick={() => deleteTodo.mutate({ id: todo.id })}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Todo */}
        {todos.length < maxTodos && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
              placeholder="목표 추가..."
              className="flex-1 h-9 px-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              onClick={handleAddTodo}
              disabled={!newTodo.trim()}
              className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center disabled:opacity-40 hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-4 h-4 text-primary" />
            </button>
          </div>
        )}
        {energy && (
          <p className="text-xs text-muted-foreground">
            에너지 {energy}점 기준 최대 {maxTodos}개
          </p>
        )}
      </section>

      {/* ── Section 4: Habit Check ── */}
      {habits.length > 0 && (
        <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">습관 체크</h2>
          </div>
          <div className="space-y-2">
            {habits.map((habit) => {
              const done = getHabitDone(habit.id);
              return (
                <button
                  key={habit.id}
                  onClick={() =>
                    toggleHabit.mutate({ habitId: habit.id, date: selectedDate, done: !done })
                  }
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
                    done
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-secondary/30 hover:border-primary/30"
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border",
                      done
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary border-border text-muted-foreground"
                    )}
                  >
                    {habit.slot}
                  </div>
                  <span
                    className={cn(
                      "flex-1 text-sm text-left font-medium",
                      done ? "text-primary" : "text-foreground"
                    )}
                  >
                    {habit.name}
                  </span>
                  {done ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 5: Drain / Charge ── */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-[oklch(0.68_0.18_25)]" />
          <h2 className="text-sm font-semibold text-foreground">Drain / Charge</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[oklch(0.72_0.19_50)] mb-1.5 flex items-center gap-1">
              <span>🔻</span> Drain
            </label>
            <Textarea
              value={drain}
              onChange={(e) => setDrain(e.target.value)}
              placeholder="에너지를 뺏은 것들... (예: 반복 수정, 공개 질책)"
              className="bg-secondary/50 border-border text-sm resize-none h-16 rounded-xl focus:border-primary/50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[oklch(0.72_0.15_195)] mb-1.5 flex items-center gap-1">
              <span>🔺</span> Charge
            </label>
            <Textarea
              value={charge}
              onChange={(e) => setCharge(e.target.value)}
              placeholder="에너지를 채운 것들... (예: 외부 콘텐츠 작업, 산책)"
              className="bg-secondary/50 border-border text-sm resize-none h-16 rounded-xl focus:border-primary/50"
            />
          </div>
        </div>
        <Button
          onClick={handleSaveCheckin}
          disabled={saving || !energy}
          variant="outline"
          className="w-full h-9 rounded-xl text-sm border-primary/30 text-primary hover:bg-primary/10"
        >
          {saving ? "저장 중..." : "저장"}
        </Button>
      </section>

      {/* Writing Review 연결 카드 */}
      {checkinSaved && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2">
            <PenLine className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-primary">Writing Review 시작하기</p>
          </div>

          {/* AI 분석 결과 예시 */}
          {aiAnalysisForReview && (
            <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 p-3 space-y-1.5">
              <p className="text-xs text-teal-400 font-medium flex items-center gap-1">
                🧠 AI 분석 결과가 프리라이팅에 자동 삽입됩니다
              </p>
              <p className="text-xs text-white/70 leading-relaxed line-clamp-2">{aiAnalysisForReview.oneLine}</p>
            </div>
          )}

          {!aiAnalysisForReview && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              오늘의 에너지와 Drain/Charge 데이터를 기반으로 AI와 함께 하루를 리뷰해보세요.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => navigate(`/review?date=${selectedDate}`)}
              className="flex-1 h-9 rounded-xl text-sm bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            >
              <PenLine className="w-3.5 h-3.5" />
              {aiAnalysisForReview ? "AI 분석 포함하여 리뷰 시작" : "리뷰 시작"}
            </Button>
            <Button
              onClick={() => setCheckinSaved(false)}
              variant="ghost"
              className="h-9 px-3 rounded-xl text-xs text-muted-foreground"
            >
              닫기
            </Button>
          </div>
        </div>
      )}

      {/* Link to detail */}
      <div className="pb-2">
        <Link href={`/daily/${selectedDate}`}>
          <button className="w-full text-xs text-muted-foreground hover:text-primary transition-colors py-2">
            상세 보기 →
          </button>
        </Link>
      </div>
    </div>
  );
}
