import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Loader2,
  PenLine,
  Plus,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";

type ReviewStatus = "idle" | "chatting" | "completed";

type ConversationMessage = { role: "user" | "ai"; content: string };

interface ReviewSummary {
  emotionKeywords: string[];
  insights: string;
  improvementPoints: string[];
  tags: string[];
}

// ─── 채팅 메시지 컴포넌트 ─────────────────────────────────────────────────────

function ChatMessage({ msg }: { msg: ConversationMessage }) {
  const isAI = msg.role === "ai";
  return (
    <div className={`flex gap-3 ${isAI ? "flex-row" : "flex-row-reverse"}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isAI ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent"
        }`}
      >
        {isAI ? <Bot size={16} /> : <User size={16} />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isAI
            ? "bg-card border border-border/50 text-foreground rounded-tl-sm"
            : "bg-primary/15 text-foreground rounded-tr-sm"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ─── 리뷰 히스토리 아이템 ─────────────────────────────────────────────────────

function ReviewHistoryItem({
  review,
  onClick,
}: {
  review: {
    id: number;
    date: string;
    status: string;
    emotionKeywords: string[] | null;
    insights: string | null;
  };
  onClick: () => void;
}) {
  const statusLabel: Record<string, { label: string; color: string }> = {
    draft: { label: "초안", color: "bg-muted text-muted-foreground" },
    chatting: { label: "진행 중", color: "bg-yellow-500/20 text-yellow-400" },
    completed: { label: "완료", color: "bg-primary/20 text-primary" },
  };
  const s = statusLabel[review.status] ?? statusLabel.draft;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">
          {format(new Date(review.date), "M월 d일 (EEE)", { locale: ko })}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
      </div>
      {review.insights && (
        <p className="text-sm text-foreground line-clamp-2">{review.insights}</p>
      )}
      {review.emotionKeywords && review.emotionKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {review.emotionKeywords.slice(0, 3).map((k) => (
            <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {k}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function WritingReview() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const searchStr = useSearch();

  // URL 쿼리 파라미터에서 날짜 추출 (?date=YYYY-MM-DD)
  const queryDate = new URLSearchParams(searchStr).get("date");
  const today = format(new Date(), "yyyy-MM-dd");
  const targetDate = queryDate ?? today;

  // 현재 뷰: list | new | detail
  const [view, setView] = useState<"list" | "new" | "detail">(queryDate ? "new" : "list");
  const [activeReviewId, setActiveReviewId] = useState<number | null>(null);

  // 새 리뷰 상태
  const [freewriting, setFreewriting] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("idle");
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [selectedImprovements, setSelectedImprovements] = useState<string[]>([]);
  const [savedReviewId, setSavedReviewId] = useState<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // AI 분석 결과 (sessionStorage에서 읽기)
  const [aiAnalysis, setAiAnalysis] = useState<{
    oneLine: string;
    suggestion: string;
    energyScore: number;
  } | null>(null);
  const [aiInserted, setAiInserted] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(`ai-analysis-${targetDate}`);
    if (stored) {
      try {
        setAiAnalysis(JSON.parse(stored));
      } catch {
        // 파싱 실패 시 무시
      }
    }
  }, [targetDate]);

  // 날짜 파라미터로 진입 시 당일 데이터 자동 로드
  const { data: dailyData } = trpc.daily.get.useQuery(
    { date: targetDate },
    { enabled: !!queryDate && isAuthenticated }
  );

  useEffect(() => {
    if (!queryDate || !dailyData) return;
    if (freewriting) return; // 이미 입력된 경우 덮어쓰지 않음
    const entry = dailyData.entry;
    if (!entry) return;
    const parts: string[] = [];
    if (entry.energy) {
      const modeLabel = entry.energy >= 4 ? "stretch" : entry.energy === 3 ? "normal" : "survival";
      parts.push(`오늘 에너지: ${entry.energy}/5 (${modeLabel} 모드)`);
    }
    if (entry.sleep) parts.push(`수면 품질: ${entry.sleep}`);
    if (entry.drain) parts.push(`Drain: ${entry.drain}`);
    if (entry.charge) parts.push(`Charge: ${entry.charge}`);
    if (parts.length > 0) {
      setFreewriting(parts.join("\n") + "\n\n");
    }
  }, [queryDate, dailyData]);

  // 리뷰 목록
  const { data: reviews, refetch: refetchReviews } = trpc.review.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 특정 리뷰 조회
  const { data: detailReview } = trpc.review.get.useQuery(
    { id: activeReviewId! },
    { enabled: !!activeReviewId }
  );

  // Mutations
  const startMutation = trpc.review.start.useMutation();
  const respondMutation = trpc.review.respond.useMutation();
  const saveImprovementsMutation = trpc.review.saveImprovements.useMutation();

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

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
        <PenLine size={48} className="text-primary" />
        <p className="text-muted-foreground text-center">로그인이 필요합니다</p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>로그인</Button>
      </div>
    );
  }

  // ─── 프리라이팅 제출 ────────────────────────────────────────────────────────

  const handleStartReview = async () => {
    if (freewriting.trim().length < 10) {
      toast.error("최소 10자 이상 작성해주세요.");
      return;
    }
    try {
      const result = await startMutation.mutateAsync({ freewriting: freewriting.trim(), date: targetDate });
      setSavedReviewId(result.reviewId);
      const aiMessage: ConversationMessage = {
        role: "ai",
        content: result.questions.join("\n\n"),
      };
      setConversation([{ role: "user", content: freewriting }, aiMessage]);
      setReviewStatus("chatting");
    } catch (e) {
      toast.error("AI 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  // ─── 답변 제출 ──────────────────────────────────────────────────────────────

  const handleRespond = async () => {
    if (!currentAnswer.trim() || !savedReviewId) return;
    const answer = currentAnswer.trim();
    setCurrentAnswer("");

    // 낙관적 업데이트
    setConversation((prev) => [...prev, { role: "user", content: answer }]);

    try {
      const result = await respondMutation.mutateAsync({ reviewId: savedReviewId, answer });
      setConversation(result.conversation as ConversationMessage[]);

      if (result.done && result.summary) {
        setSummary(result.summary as ReviewSummary);
        setSelectedImprovements(result.summary.improvementPoints ?? []);
        setReviewStatus("completed");
        refetchReviews();
      }
    } catch (e) {
      toast.error("응답 처리에 실패했습니다.");
      setConversation((prev) => prev.slice(0, -1));
    }
  };

  // ─── 개선포인트 저장 ────────────────────────────────────────────────────────

  const handleSaveImprovements = async () => {
    if (!savedReviewId || selectedImprovements.length === 0) return;
    try {
      await saveImprovementsMutation.mutateAsync({
        reviewId: savedReviewId,
        improvementPoints: selectedImprovements,
      });
      toast.success(`${selectedImprovements.length}개의 개선 포인트가 저장되었습니다.`);
      setView("list");
      refetchReviews();
      // 상태 초기화
      setFreewriting("");
      setConversation([]);
      setSummary(null);
      setSelectedImprovements([]);
      setSavedReviewId(null);
      setReviewStatus("idle");
    } catch (e) {
      toast.error("저장에 실패했습니다.");
    }
  };

  // ─── 새 리뷰 시작 ──────────────────────────────────────────────────────────

  const handleNewReview = () => {
    setFreewriting("");
    setConversation([]);
    setSummary(null);
    setSelectedImprovements([]);
    setSavedReviewId(null);
    setReviewStatus("idle");
    setView("new");
  };

  // ─── 뷰: 목록 ──────────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-md mx-auto px-4 pt-6">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <PenLine size={20} className="text-primary" />
                Writing Review
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">프리라이팅 + AI 성찰 파트너</p>
            </div>
            <Button size="sm" onClick={handleNewReview} className="gap-1">
              <Plus size={14} />새 리뷰
            </Button>
          </div>

          {/* 리뷰 목록 */}
          {!reviews || reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <PenLine size={28} className="text-primary" />
              </div>
              <div className="text-center">
                <p className="text-foreground font-medium">아직 작성한 리뷰가 없습니다</p>
                <p className="text-sm text-muted-foreground mt-1">
                  오늘의 생각을 자유롭게 써보세요
                </p>
              </div>
              <Button onClick={handleNewReview} className="gap-2">
                <PenLine size={16} />첫 번째 리뷰 시작하기
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {[...reviews].reverse().map((r) => (
                <ReviewHistoryItem
                  key={r.id}
                  review={{
                    id: r.id,
                    date: r.date,
                    status: r.status,
                    emotionKeywords: r.emotionKeywords as string[] | null,
                    insights: r.insights,
                  }}
                  onClick={() => {
                    setActiveReviewId(r.id);
                    setView("detail");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── 뷰: 상세 (기존 리뷰 조회) ────────────────────────────────────────────

  if (view === "detail" && detailReview) {
    const conv = (detailReview.conversation ?? []) as ConversationMessage[];
    const keywords = (detailReview.emotionKeywords ?? []) as string[];
    const improvements = (detailReview.improvementPoints ?? []) as string[];
    const tags = (detailReview.tags ?? []) as string[];

    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-md mx-auto px-4 pt-6">
          <button
            onClick={() => { setView("list"); setActiveReviewId(null); }}
            className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            목록으로
          </button>

          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground">
              {format(new Date(detailReview.date), "M월 d일 (EEE)", { locale: ko })}
            </h2>
            <Badge variant={detailReview.status === "completed" ? "default" : "secondary"}>
              {detailReview.status === "completed" ? "완료" : detailReview.status === "chatting" ? "진행 중" : "초안"}
            </Badge>
          </div>

          {/* 프리라이팅 */}
          <Card className="mb-4 bg-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">프리라이팅</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {detailReview.freewriting}
              </p>
            </CardContent>
          </Card>

          {/* 대화 */}
          {conv.length > 1 && (
            <div className="space-y-3 mb-4">
              {conv.slice(1).map((m, i) => (
                <ChatMessage key={i} msg={m} />
              ))}
            </div>
          )}

          {/* Summary */}
          {detailReview.status === "completed" && (
            <Card className="bg-gradient-to-br from-primary/10 to-accent/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" />
                  Review Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {keywords.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">감정 키워드</p>
                    <div className="flex flex-wrap gap-1">
                      {keywords.map((k) => (
                        <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
                {detailReview.insights && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">핵심 인사이트</p>
                    <p className="text-sm text-foreground">{detailReview.insights}</p>
                  </div>
                )}
                {improvements.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">개선 포인트</p>
                    <ul className="space-y-1">
                      {improvements.map((p, i) => (
                        <li key={i} className="text-sm text-foreground flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ─── 뷰: 새 리뷰 작성 ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* 헤더 */}
        <button
          onClick={() => setView("list")}
          className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          목록으로
        </button>

        <h2 className="text-lg font-bold text-foreground mb-1">새 Writing Review</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {format(new Date(), "M월 d일 (EEE)", { locale: ko })} · 자유롭게 오늬의 생각을 써보세요
        </p>

        {/* AI 분석 결과 배너 */}
        {aiAnalysis && reviewStatus === "idle" && (
          <div className="mb-4 rounded-xl border border-teal-500/30 bg-teal-500/8 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🧠</span>
                <p className="text-xs font-semibold text-teal-400">AI 컨디션 분석 결과</p>
              </div>
              {aiInserted && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} />삽입됨
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div className="rounded-lg bg-white/5 p-2.5">
                <p className="text-xs text-white/50 mb-0.5">한 줄 요약</p>
                <p className="text-sm text-white/80 leading-relaxed">{aiAnalysis.oneLine}</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2.5">
                <p className="text-xs text-amber-400/70 mb-0.5">오늘의 제안</p>
                <p className="text-sm text-amber-200/80 leading-relaxed">{aiAnalysis.suggestion}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={aiInserted}
              onClick={() => {
                const insertText = [
                  `[AI 컨디션 분석] Energy ${aiAnalysis.energyScore}/5`,
                  `한 줄 요약: ${aiAnalysis.oneLine}`,
                  `오늘의 제안: ${aiAnalysis.suggestion}`,
                  "",
                ].join("\n");
                setFreewriting((prev) =>
                  prev ? insertText + prev : insertText
                );
                setAiInserted(true);
                toast.success("AI 분석 결과가 프리라이팅에 삽입되었습니다");
              }}
              className="w-full py-2 rounded-lg text-xs font-medium transition-all
                disabled:opacity-50 disabled:cursor-default
                bg-teal-600/80 hover:bg-teal-500/80 text-white
                disabled:bg-emerald-600/30 disabled:text-emerald-400"
            >
              {aiInserted ? "✓ 프리라이팅에 삽입됨" : "↓ 프리라이팅 초안에 삽입"}
            </button>
          </div>
        )}

        {/* Step 1: 프리라이팅 */}
        {reviewStatus === "idle" && (
          <div className="space-y-4">
            <div className="relative">
              <Textarea
                value={freewriting}
                onChange={(e) => setFreewriting(e.target.value)}
                placeholder="오늘 어떤 일이 있었나요? 감정, 상황, 생각을 자유롭게 써보세요.&#10;&#10;예: 팀장이 또 보고서 수정을 요청했다. 세 번째다. 에너지가 확 빠졌는데..."
                className="min-h-[200px] bg-card border-border/50 text-foreground placeholder:text-muted-foreground/50 resize-none text-sm leading-relaxed"
              />
              <span className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                {freewriting.length}/5000
              </span>
            </div>
            <Button
              onClick={handleStartReview}
              disabled={freewriting.trim().length < 10 || startMutation.isPending}
              className="w-full gap-2"
            >
              {startMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  AI가 분석 중...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  AI에게 보내기
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 2: AI Q&A 채팅 */}
        {reviewStatus === "chatting" && (
          <div className="space-y-4">
            {/* 채팅 영역 */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {conversation.map((msg, i) => (
                <ChatMessage key={i} msg={msg} />
              ))}
              {respondMutation.isPending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot size={16} className="text-primary" />
                  </div>
                  <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3">
                    <Loader2 size={14} className="animate-spin text-primary" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <Separator className="bg-border/30" />

            {/* 답변 입력 */}
            <div className="flex gap-2">
              <Textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="답변을 입력하세요..."
                className="min-h-[80px] bg-card border-border/50 text-foreground placeholder:text-muted-foreground/50 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRespond();
                }}
              />
              <Button
                onClick={handleRespond}
                disabled={!currentAnswer.trim() || respondMutation.isPending}
                size="icon"
                className="self-end h-10 w-10 shrink-0"
              >
                <Send size={16} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">Ctrl+Enter로 전송</p>
          </div>
        )}

        {/* Step 3: Review Summary + 개선포인트 선택 */}
        {reviewStatus === "completed" && summary && (
          <div className="space-y-4">
            {/* 최종 대화 */}
            <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1">
              {conversation.map((msg, i) => (
                <ChatMessage key={i} msg={msg} />
              ))}
            </div>

            <Separator className="bg-border/30" />

            {/* Summary 카드 */}
            <Card className="bg-gradient-to-br from-primary/10 to-accent/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles size={14} className="text-primary" />
                  Review Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.emotionKeywords.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">감정 키워드</p>
                    <div className="flex flex-wrap gap-1">
                      {summary.emotionKeywords.map((k) => (
                        <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
                {summary.insights && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">핵심 인사이트</p>
                    <p className="text-sm text-foreground">{summary.insights}</p>
                  </div>
                )}
                {summary.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {summary.tags.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 개선포인트 선택 */}
            {summary.improvementPoints.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-primary" />
                  개선 포인트 저장 선택
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  실행할 개선 포인트를 선택하세요
                </p>
                <div className="space-y-2">
                  {summary.improvementPoints.map((point, i) => {
                    const selected = selectedImprovements.includes(point);
                    return (
                      <button
                        key={i}
                        onClick={() =>
                          setSelectedImprovements((prev) =>
                            selected ? prev.filter((p) => p !== point) : [...prev, point]
                          )
                        }
                        className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                          selected
                            ? "bg-primary/15 border-primary/40 text-foreground"
                            : "bg-card border-border/50 text-muted-foreground hover:border-primary/20"
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${
                              selected ? "bg-primary border-primary" : "border-border"
                            }`}
                          >
                            {selected && <span className="w-2 h-2 rounded-full bg-background" />}
                          </span>
                          {point}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              onClick={handleSaveImprovements}
              disabled={saveImprovementsMutation.isPending}
              className="w-full gap-2"
            >
              {saveImprovementsMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {selectedImprovements.length > 0
                ? `${selectedImprovements.length}개 개선 포인트 저장`
                : "저장 (개선 포인트 없이)"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
