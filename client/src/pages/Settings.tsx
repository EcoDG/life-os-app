import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useState } from "react";
import {
  User, Settings2, LogOut, CheckCircle2, Edit3, Github, Download,
  ExternalLink, BookOpen, Eye, EyeOff, Wifi, WifiOff, Trash2, ShieldCheck,
} from "lucide-react";

export default function Settings() {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const { data: habits, isLoading } = trpc.habits.list.useQuery();

  // ─── Habit editing state ───────────────────────────────────────────────────
  const [editingSlot, setEditingSlot] = useState<"A" | "B" | "C" | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const updateHabit = trpc.habits.updateName.useMutation({
    onSuccess: () => {
      utils.habits.list.invalidate();
      toast.success("습관 이름이 업데이트되었습니다");
      setEditingSlot(null);
    },
    onError: () => toast.error("저장에 실패했습니다"),
  });

  const handleEdit = (slot: "A" | "B" | "C", currentName: string) => {
    setEditingSlot(slot);
    setEditName(currentName);
  };

  const handleSaveHabit = async () => {
    if (!editingSlot || !editName.trim()) return;
    setSaving(true);
    try {
      await updateHabit.mutateAsync({ slot: editingSlot, name: editName.trim() });
    } finally {
      setSaving(false);
    }
  };

  const slotColors: Record<string, string> = {
    A: "text-[oklch(0.72_0.15_195)] bg-[oklch(0.72_0.15_195)]/15 border-[oklch(0.72_0.15_195)]/30",
    B: "text-[oklch(0.65_0.18_145)] bg-[oklch(0.65_0.18_145)]/15 border-[oklch(0.65_0.18_145)]/30",
    C: "text-[oklch(0.68_0.18_25)] bg-[oklch(0.68_0.18_25)]/15 border-[oklch(0.68_0.18_25)]/30",
  };

  return (
    <div className="container py-4 space-y-4">
      {/* Profile */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">프로필</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user?.name ?? "사용자"}</p>
            <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={logout}
          className="w-full h-9 rounded-xl text-sm border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
        >
          <LogOut className="w-4 h-4 mr-2" />
          로그아웃
        </Button>
      </section>

      {/* Habit Settings */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">습관 설정</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Slot A / B / C 습관의 이름을 설정합니다. 목표 빈도는 주 7일입니다.
        </p>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {(["A", "B", "C"] as const).map((slot) => {
              const habit = habits?.find((h) => h.slot === slot);
              const isEditing = editingSlot === slot;

              return (
                <div key={slot} className="p-3 rounded-xl border border-border bg-secondary/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border", slotColors[slot])}>
                        {slot}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">Slot {slot}</span>
                    </div>
                    {!isEditing && (
                      <button onClick={() => handleEdit(slot, habit?.name ?? "")} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveHabit()}
                        autoFocus
                        maxLength={100}
                        className="flex-1 h-9 px-3 rounded-xl bg-background border border-primary/50 text-sm text-foreground focus:outline-none"
                      />
                      <button
                        onClick={handleSaveHabit}
                        disabled={saving || !editName.trim()}
                        className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center disabled:opacity-40 hover:bg-primary/30 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      </button>
                      <button
                        onClick={() => setEditingSlot(null)}
                        className="w-9 h-9 rounded-xl bg-secondary border border-border flex items-center justify-center hover:bg-secondary/80 transition-colors text-xs text-muted-foreground"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-foreground pl-9">
                      {habit?.name ?? <span className="text-muted-foreground italic">이름 미설정</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* GitHub 연동 (DB 기반 암호화 저장) */}
      <GitHubSection />

      {/* Obsidian Export 가이드 */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Obsidian Export</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Daily 상세 화면 또는 대시보드에서 .md / .zip 파일을 다운로드하거나 GitHub에 직접 푸시할 수 있습니다.
        </p>
        <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">파일 형식 예시</p>
          <div className="font-mono text-[11px] text-muted-foreground space-y-0.5">
            <div className="text-primary">---</div>
            <div>date: 2026-05-27</div>
            <div>energy: 4</div>
            <div>sleep: good</div>
            <div>todo_mode: stretch</div>
            <div>tags: [daily]</div>
            <div className="text-primary">---</div>
            <div className="text-foreground font-medium mt-1"># 2026-05-27 (화) — Energy 4/5</div>
            <div className="text-muted-foreground">## 📋 Today's Focus</div>
            <div className="text-muted-foreground">## ✅ Habits</div>
            <div className="text-muted-foreground">## ⚡ Drain / Charge</div>
            <div className="text-muted-foreground">## ✍️ Writing Review (있는 경우)</div>
          </div>
        </div>
      </section>

      {/* App Info */}
      <section className="bg-card rounded-2xl border border-border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">앱 정보</h2>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">버전</span>
            <span className="text-foreground">Phase 2 + GitHub Auto-Push</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">모드</span>
            <span className="text-foreground">다크 모드 기본</span>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── GitHub Section (DB-backed, encrypted) ────────────────────────────────────

function GitHubSection() {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.userContext.getGitHubConfig.useQuery();

  const [repoUrl, setRepoUrl] = useState("");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");

  const setConfig = trpc.userContext.setGitHubConfig.useMutation({
    onSuccess: () => {
      utils.userContext.getGitHubConfig.invalidate();
      toast.success("GitHub 설정이 저장되었습니다 (암호화)");
      setMode("view");
      setPat("");
    },
    onError: (e) => toast.error(e.message),
  });

  const disconnect = trpc.userContext.disconnectGitHub.useMutation({
    onSuccess: () => {
      utils.userContext.getGitHubConfig.invalidate();
      toast.success("GitHub 연동이 해제되었습니다");
      setMode("edit");
    },
    onError: (e) => toast.error(e.message),
  });

  const testConnection = trpc.userContext.testGitHubConnection.useMutation({
    onSuccess: (data) => {
      toast.success(`연결 성공: ${data.fullName} (${data.isPrivate ? "private" : "public"})`);
    },
    onError: (e) => toast.error(`연결 실패: ${e.message}`),
  });

  const handleSave = () => {
    if (!repoUrl.trim() || !pat.trim()) {
      toast.error("레포 URL과 Personal Access Token을 모두 입력해주세요");
      return;
    }
    setConfig.mutate({ repoUrl: repoUrl.trim(), pat: pat.trim() });
  };

  const handleStartEdit = () => {
    if (config?.configured) {
      setRepoUrl(config.repoUrl);
    }
    setPat("");
    setMode("edit");
  };

  const isConfigured = config?.configured === true;

  return (
    <section className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Github className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">GitHub 연동</h2>
        {isConfigured && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <ShieldCheck className="w-3 h-3" />
            AES-256 암호화 저장
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : isConfigured && mode === "view" ? (
        /* ── 연결됨 상태 ── */
        <div className="space-y-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">연결됨</span>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">레포지토리</p>
              <a
                href={config.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
              >
                {config.repoUrl}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Personal Access Token</p>
              <p className="text-xs font-mono text-foreground">{config.maskedPat}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => testConnection.mutate()}
              disabled={testConnection.isPending}
              className="flex-1 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Wifi className="w-3.5 h-3.5" />
              {testConnection.isPending ? "테스트 중..." : "연결 테스트"}
            </button>
            <button
              onClick={handleStartEdit}
              className="flex-1 h-9 rounded-xl bg-secondary/50 border border-border text-muted-foreground text-xs font-medium hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              수정
            </button>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* ── 입력 폼 ── */
        <div className="space-y-3">
          {isConfigured && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <p className="text-xs text-yellow-400">기존 설정을 덮어씁니다. PAT를 다시 입력해주세요.</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">레포지토리 URL</label>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/obsidian-vault"
              className="w-full h-9 px-3 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Personal Access Token
              <span className="ml-1 text-[10px] text-muted-foreground/60">(repo 권한 필요)</span>
            </label>
            <div className="relative">
              <input
                type={showPat ? "text" : "password"}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full h-9 px-3 pr-9 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPat((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPat ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=Life+OS"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              GitHub에서 PAT 발급하기 (repo 권한)
            </a>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={setConfig.isPending || !repoUrl.trim() || !pat.trim()}
              className="flex-1 h-10 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              {setConfig.isPending ? "저장 중..." : "암호화하여 저장"}
            </button>
            {isConfigured && (
              <button
                onClick={() => setMode("view")}
                className="h-10 px-4 rounded-xl bg-secondary/50 border border-border text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                취소
              </button>
            )}
          </div>

          {/* 보안 안내 */}
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 space-y-1">
            <p className="text-[11px] font-medium text-primary flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              보안 저장 방식
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              PAT는 AES-256-GCM으로 암호화되어 서버 DB에 저장됩니다. 평문은 서버 메모리에만 일시적으로 존재하며, 클라이언트로 전송되지 않습니다.
            </p>
          </div>
        </div>
      )}

      {/* Obsidian Git 팁 */}
      {!isConfigured && mode !== "edit" && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-1.5">
          <p className="text-xs font-medium text-primary flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            Obsidian Git 플러그인으로 자동화
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            GitHub 연동 후 대시보드 Export 카드에서 "GitHub에 푸시" 버튼으로 Daily/ 폴더에 직접 커밋할 수 있습니다.
          </p>
          <a
            href="https://github.com/denolehov/obsidian-git"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Obsidian Git 플러그인 바로가기
          </a>
        </div>
      )}
    </section>
  );
}
