import { trpc } from "@/lib/trpc";
import {
  DAY_LABELS_KO,
  energyEmojis,
  energyToMaxTodos,
  energyToMode,
  modeConfig,
} from "@/lib/energy";
import {
  EnergyGradeSelector,
  SleepGradeSelector,
  energyToGrade,
  sleepToGrade,
  type SamsungGrade,
} from "@/components/SamsungGradeSelector";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Zap,
  Moon,
  ListChecks,
  Flame,
  Download,
  FileText,
  PenLine,
  Github,
} from "lucide-react";


import { useLocation } from "wouter";

interface Props {
  date: string;
}

function getDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const dayLabel = DAY_LABELS_KO[d.getDay()];
  return `${dateStr.replace(/-/g, ".")} (${dayLabel})`;
}

export default function DailyDetail({ date }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.daily.get.useQuery({ date });

  const [energy, setEnergy] = useState<number | null>(null);
  const [sleep, setSleep] = useState<"good" | "ok" | "bad" | null>(null);
  const [energyGrade, setEnergyGrade] = useState<SamsungGrade | null>(null);
  const [sleepGrade, setSleepGrade] = useState<SamsungGrade | null>(null);
  const [drain, setDrain] = useState("");
  const [charge, setCharge] = useState("");
  const [newTodo, setNewTodo] = useState("");
  const [saving, setSaving] = useState(false);

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
    }
  }, [data?.entry]);

  const upsertDaily = trpc.daily.upsert.useMutation({
    onSuccess: () => utils.daily.get.invalidate({ date }),
  });

  const createTodo = trpc.todos.create.useMutation({
    onSuccess: () => utils.daily.get.invalidate({ date }),
    onError: (e) => toast.error(e.message),
  });

  const toggleTodo = trpc.todos.toggleDone.useMutation({
    onMutate: async ({ id, done }) => {
      const prev = utils.daily.get.getData({ date });
      utils.daily.get.setData({ date }, (old) => {
        if (!old) return old;
        return { ...old, todos: old.todos.map((t) => (t.id === id ? { ...t, done } : t)) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.daily.get.setData({ date }, ctx.prev);
    },
  });

  const deleteTodo = trpc.todos.delete.useMutation({
    onSuccess: () => utils.daily.get.invalidate({ date }),
  });

  const toggleHabit = trpc.habitLogs.toggle.useMutation({
    onMutate: async ({ habitId, done }) => {
      const prev = utils.daily.get.getData({ date });
      utils.daily.get.setData({ date }, (old) => {
        if (!old) return old;
        const exists = old.habitLogs.find((l) => l.habitId === habitId);
        return {
          ...old,
          habitLogs: exists
            ? old.habitLogs.map((l) => (l.habitId === habitId ? { ...l, done } : l))
            : [...old.habitLogs, { id: -1, userId: 0, habitId, date, done, createdAt: new Date(), updatedAt: new Date() }],
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.daily.get.setData({ date }, ctx.prev);
    },
  });

  const handleSave = async () => {
    if (!energy) { toast.error("에너지 점수를 선택해주세요"); return; }
    setSaving(true);
    try {
      await upsertDaily.mutateAsync({ date, energy, sleep: sleep ?? undefined, drain: drain || undefined, charge: charge || undefined, energyGrade: energyGrade ?? undefined, sleepGrade: sleepGrade ?? undefined });
      toast.success("저장 완료!");
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    await createTodo.mutateAsync({ date, content: newTodo.trim() });
    setNewTodo("");
  };

  if (isLoading) {
    return (
      <div className="container py-4 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const todos = data?.todos ?? [];
  const habitLogs = data?.habitLogs ?? [];
  const habits = data?.habits ?? [];
  const maxTodos = energy ? energyToMaxTodos(energy) : 3;
  const mode = energy ? energyToMode(energy) : null;
  const modeInfo = mode ? modeConfig[mode] : null;

  const getHabitDone = (habitId: number) =>
    habitLogs.find((l) => l.habitId === habitId)?.done ?? false;

  return (
    <div className="container py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/daily")}
          className="p-2 rounded-xl hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-base font-semibold text-foreground">{getDateLabel(date)}</h1>
        {data?.entry && (
          <Badge variant="outline" className="ml-auto text-xs border-primary/30 text-primary">
            기록 있음
          </Badge>
        )}
      </div>

      {/* Energy */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Energy</h2>
        </div>
        <EnergyGradeSelector
          value={energyGrade}
          onChange={(grade, mapped) => { setEnergyGrade(grade); setEnergy(mapped); }}
        />
        {energyGrade && energy && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {energyGrade} → <strong>Energy {energy}</strong>
            </span>
            {modeInfo && (
              <Badge
                variant="outline"
                className={cn("text-xs font-mono border", modeInfo.color, modeInfo.bgColor, modeInfo.borderColor)}
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

      {/* Sleep */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Sleep</h2>
        </div>
        <SleepGradeSelector
          value={sleepGrade}
          onChange={(grade, mapped) => { setSleepGrade(grade); setSleep(mapped); }}
        />
        {sleepGrade && sleep && (
          <p className="text-xs text-muted-foreground">
            {sleepGrade} → <strong>{sleep}</strong>
          </p>
        )}
      </section>

      {/* Todos */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Today's Focus</h2>
          </div>
          <span className="text-xs text-muted-foreground">{todos.length}/{maxTodos}</span>
        </div>
        <div className="space-y-2">
          {todos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">목표가 없습니다</p>
          )}
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-2 p-2 rounded-xl bg-secondary/30 group">
              <button onClick={() => toggleTodo.mutate({ id: todo.id, done: !todo.done })} className="shrink-0">
                {todo.done ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
              </button>
              <span className={cn("flex-1 text-sm", todo.done ? "line-through text-muted-foreground" : "text-foreground")}>
                {todo.content}
              </span>
              <button onClick={() => deleteTodo.mutate({ id: todo.id })} className="opacity-0 group-hover:opacity-100 p-1">
                <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
        {todos.length < maxTodos && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
              placeholder="목표 추가..."
              className="flex-1 h-9 px-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={handleAddTodo}
              disabled={!newTodo.trim()}
              className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center disabled:opacity-40"
            >
              <Plus className="w-4 h-4 text-primary" />
            </button>
          </div>
        )}
      </section>

      {/* Habit Check */}
      {habits.length > 0 && (
        <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">습관 체크</h2>
          </div>
          <div className="space-y-2">
            {habits.map((habit) => {
              const done = getHabitDone(habit.id);
              return (
                <button
                  key={habit.id}
                  onClick={() => toggleHabit.mutate({ habitId: habit.id, date, done: !done })}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                    done ? "border-primary/40 bg-primary/10" : "border-border bg-secondary/30"
                  )}
                >
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border", done ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border text-muted-foreground")}>
                    {habit.slot}
                  </div>
                  <span className={cn("flex-1 text-sm text-left font-medium", done ? "text-primary" : "text-foreground")}>
                    {habit.name}
                  </span>
                  {done ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Drain / Charge */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-[oklch(0.68_0.18_25)]" />
          <h2 className="text-sm font-semibold">Drain / Charge</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[oklch(0.72_0.19_50)] mb-1.5 block">🔻 Drain</label>
            <Textarea value={drain} onChange={(e) => setDrain(e.target.value)} placeholder="에너지를 뺏은 것들..." className="bg-secondary/50 border-border text-sm resize-none h-16 rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-medium text-[oklch(0.72_0.15_195)] mb-1.5 block">🔺 Charge</label>
            <Textarea value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="에너지를 채운 것들..." className="bg-secondary/50 border-border text-sm resize-none h-16 rounded-xl" />
          </div>
        </div>
      </section>

      <Button
        onClick={handleSave}
        disabled={saving || !energy}
        className="w-full h-11 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        {saving ? "저장 중..." : "저장"}
      </Button>

      {/* Obsidian Export + Writing Review 연결 */}
      <ObsidianExportSection date={date} />
    </div>
  );
}

function ObsidianExportSection({ date }: { date: string }) {
  const [, navigate] = useLocation();
  const [exporting, setExporting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const utils = trpc.useUtils();

  // GitHub 연동 여부 확인
  const { data: githubConfig } = trpc.userContext.getGitHubConfig.useQuery();
  const pushMutation = trpc.github.push.useMutation();

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await utils.client.export.daily.query({ date });
      const blob = new Blob([result.content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${result.filename} 다운로드 완료`);
    } catch {
      toast.error("내보내기에 실패했습니다");
    } finally {
      setExporting(false);
    }
  };

  const handlePushToGitHub = async () => {
    setPushing(true);
    try {
      const result = await utils.client.export.daily.query({ date });
      const res = await pushMutation.mutateAsync({
        files: [{ filename: result.filename, content: result.content }],
        commitMessage: `chore: update daily note ${date}`,
      });
      if (res.failed > 0) {
        toast.error(`푸시 실패: ${res.results.find((r) => r.status === "error")?.error}`);
      } else {
        const action = res.results[0]?.status === "created" ? "생성" : "업데이트";
        toast.success(`GitHub Daily/${result.filename} ${action} 완료`);
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

  const handleStartReview = () => {
    navigate(`/review?date=${date}`);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          onClick={handleExport}
          disabled={exporting}
          variant="outline"
          className="flex-1 h-10 rounded-xl text-sm border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 gap-2"
        >
          <Download className="w-4 h-4" />
          {exporting ? "내보내는 중..." : ".md 다운로드"}
        </Button>
        {githubConfig?.configured ? (
          <Button
            onClick={handlePushToGitHub}
            disabled={pushing}
            variant="outline"
            className="flex-1 h-10 rounded-xl text-sm border-[oklch(0.72_0.15_195)]/30 text-[oklch(0.72_0.15_195)] hover:bg-[oklch(0.72_0.15_195)]/10 gap-2"
          >
            <Github className="w-4 h-4" />
            {pushing ? "푸시 중..." : "GitHub 푸시"}
          </Button>
        ) : (
          <Button
            onClick={() => navigate("/settings")}
            variant="outline"
            className="flex-1 h-10 rounded-xl text-sm border-border/40 text-muted-foreground/60 hover:text-muted-foreground hover:border-border gap-2"
          >
            <Github className="w-4 h-4" />
            GitHub 연결
          </Button>
        )}
      </div>
      <Button
        onClick={handleStartReview}
        variant="outline"
        className="w-full h-10 rounded-xl text-sm border-primary/30 text-primary hover:bg-primary/10 gap-2"
      >
        <PenLine className="w-4 h-4" />
        Writing Review 시작
      </Button>
    </div>
  );
}
