import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Loader2,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ImprovementStatus = "pending" | "experimenting" | "completed" | "dropped";

const STATUS_CONFIG: Record<
  ImprovementStatus,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  pending: {
    label: "미실행",
    icon: <Target size={12} />,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
  },
  experimenting: {
    label: "실행 중",
    icon: <FlaskConical size={12} />,
    color: "text-yellow-400",
    bg: "bg-yellow-500/15",
  },
  completed: {
    label: "완료",
    icon: <CheckCircle2 size={12} />,
    color: "text-primary",
    bg: "bg-primary/15",
  },
  dropped: {
    label: "중단",
    icon: <XCircle size={12} />,
    color: "text-muted-foreground/60",
    bg: "bg-muted/30",
  },
};

const STATUS_ORDER: ImprovementStatus[] = ["pending", "experimenting", "completed", "dropped"];

type ImprovementPoint = {
  id: number;
  content: string;
  status: ImprovementStatus;
  experimentNotes: string | null;
  isCurrentExperiment: boolean;
  writingReviewId: number | null;
  createdAt: Date;
};

// ─── 개선포인트 카드 ──────────────────────────────────────────────────────────

function ImprovementCard({
  point,
  onStatusChange,
  onNotesUpdate,
  onToggleExperiment,
}: {
  point: ImprovementPoint;
  onStatusChange: (id: number, status: ImprovementStatus) => void;
  onNotesUpdate: (id: number, notes: string) => void;
  onToggleExperiment: (id: number, val: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(point.experimentNotes ?? "");
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const cfg = STATUS_CONFIG[point.status];

  const handleSaveNotes = () => {
    onNotesUpdate(point.id, notesValue);
    setEditingNotes(false);
  };

  const nextStatuses = STATUS_ORDER.filter((s) => s !== point.status);

  return (
    <Card
      className={`border transition-all ${
        point.isCurrentExperiment ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card"
      } ${point.status === "dropped" ? "opacity-60" : ""}`}
    >
      <CardContent className="p-4">
        {/* 헤더 */}
        <div className="flex items-start gap-3">
          {/* 현재 실험 토글 */}
          <button
            onClick={() => onToggleExperiment(point.id, !point.isCurrentExperiment)}
            className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
              point.isCurrentExperiment
                ? "bg-primary border-primary"
                : "border-border hover:border-primary/50"
            }`}
            title="이번 주 실험 표시"
          >
            {point.isCurrentExperiment && <span className="w-2 h-2 rounded-full bg-background" />}
          </button>

          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium leading-relaxed ${
                point.status === "dropped" ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {point.content}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {/* 상태 배지 */}
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} hover:opacity-80 transition-opacity`}
              >
                {cfg.icon}
                {cfg.label}
                <ChevronDown size={10} />
              </button>

              {point.isCurrentExperiment && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                  이번 주 실험
                </span>
              )}

              <span className="text-xs text-muted-foreground ml-auto">
                {format(new Date(point.createdAt), "M/d", { locale: ko })}
              </span>
            </div>

            {/* 상태 변경 메뉴 */}
            {showStatusMenu && (
              <div className="mt-2 flex flex-wrap gap-1">
                {nextStatuses.map((s) => {
                  const c = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        onStatusChange(point.id, s);
                        setShowStatusMenu(false);
                      }}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${c.bg} ${c.color} hover:opacity-80 transition-opacity border border-border/30`}
                    >
                      {c.icon}
                      {c.label}로 변경
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 펼치기 */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* 펼쳐진 내용: 실험 노트 */}
        {expanded && (
          <div className="mt-3 pl-8">
            <p className="text-xs text-muted-foreground mb-2">실험 노트</p>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="실험 결과, 관찰, 메모..."
                  className="min-h-[80px] text-sm bg-background border-border/50 resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNotes} className="text-xs h-7">
                    저장
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditingNotes(false); setNotesValue(point.experimentNotes ?? ""); }}
                    className="text-xs h-7"
                  >
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className="w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {point.experimentNotes || (
                  <span className="italic text-muted-foreground/60">노트 추가...</span>
                )}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function Improvements() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<ImprovementStatus | "all">("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContent, setNewContent] = useState("");

  const utils = trpc.useUtils();

  const { data: allPoints, isLoading } = trpc.improvements.list.useQuery(
    { status: activeTab === "all" ? undefined : activeTab },
    { enabled: isAuthenticated }
  );

  const createMutation = trpc.improvements.create.useMutation({
    onSuccess: () => {
      utils.improvements.list.invalidate();
      setShowAddDialog(false);
      setNewContent("");
      toast.success("개선 포인트가 추가되었습니다.");
    },
  });

  const updateStatusMutation = trpc.improvements.updateStatus.useMutation({
    onSuccess: () => utils.improvements.list.invalidate(),
  });

  const updateNotesMutation = trpc.improvements.updateNotes.useMutation({
    onSuccess: () => utils.improvements.list.invalidate(),
  });

  const toggleExperimentMutation = trpc.improvements.toggleExperiment.useMutation({
    onSuccess: () => utils.improvements.list.invalidate(),
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

  const tabs: { key: ImprovementStatus | "all"; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "pending", label: "미실행" },
    { key: "experimenting", label: "실행 중" },
    { key: "completed", label: "완료" },
    { key: "dropped", label: "중단" },
  ];

  // 통계
  const stats = {
    total: allPoints?.length ?? 0,
    experimenting: allPoints?.filter((p) => p.status === "experimenting").length ?? 0,
    completed: allPoints?.filter((p) => p.status === "completed").length ?? 0,
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp size={20} className="text-primary" />
              개선 포인트
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">실행 가능한 변화를 추적합니다</p>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1">
            <Plus size={14} />
            추가
          </Button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-card border border-border/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">전체</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-yellow-400">{stats.experimenting}</p>
            <p className="text-xs text-muted-foreground">실행 중</p>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">완료</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full transition-all ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 목록 */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-primary" size={24} />
          </div>
        ) : !allPoints || allPoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Target size={28} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-medium">
                {activeTab === "all" ? "아직 개선 포인트가 없습니다" : `${tabs.find((t) => t.key === activeTab)?.label} 항목이 없습니다`}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Writing Review를 완료하면 자동으로 추가됩니다
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowAddDialog(true)} className="gap-2">
              <Plus size={14} />
              직접 추가하기
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {allPoints.map((point) => (
              <ImprovementCard
                key={point.id}
                point={point as ImprovementPoint}
                onStatusChange={(id, status) =>
                  updateStatusMutation.mutate({ id, status })
                }
                onNotesUpdate={(id, notes) =>
                  updateNotesMutation.mutate({ id, notes })
                }
                onToggleExperiment={(id, val) =>
                  toggleExperimentMutation.mutate({ id, isCurrentExperiment: val })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* 직접 추가 다이얼로그 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-card border-border max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="text-foreground">개선 포인트 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="구체적이고 실행 가능한 개선 사항을 입력하세요.&#10;예: 보고서 제출 전 1-page 요약 먼저 공유하기"
              className="min-h-[100px] bg-background border-border/50 text-foreground resize-none text-sm"
            />
            <Button
              onClick={() => createMutation.mutate({ content: newContent.trim() })}
              disabled={newContent.trim().length < 5 || createMutation.isPending}
              className="w-full gap-2"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              추가
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
