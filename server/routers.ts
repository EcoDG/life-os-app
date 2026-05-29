import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  aggregateWeeklyData,
  createImprovementPoint,
  createWritingReview,
  createTodo,
  deleteTodo,
  deleteUserContext,
  ensureDefaultHabits,
  getDailyEntriesRange,
  getDailyEntry,
  getHabitLogsByDate,
  getHabitLogsRange,
  getHabitsByUserId,
  getImprovementPointsByUser,
  getLatestWeeklyReview,
  getPendingImprovementPoints,
  getTodosByDate,
  getUserContext,
  getWeeklyHabitSummary,
  getWeeklyReviewByWeek,
  getWeeklyReviewsByUser,
  getWritingReviewById,
  getWritingReviewsByUser,
  toggleCurrentExperiment,
  updateHabitName,
  updateImprovementPointNotes,
  updateImprovementPointStatus,
  updateTodoContent,
  updateTodoDone,
  updateWritingReview,
  upsertDailyEntry,
  upsertHabitLog,
  upsertUserContext,
  upsertWeeklyReview,
} from "./db";
import { encrypt, decrypt } from "./crypto";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import type { ConversationMessage } from "../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function energyToMode(energy: number): "stretch" | "normal" | "survival" {
  if (energy >= 4) return "stretch";
  if (energy === 3) return "normal";
  return "survival";
}

function energyToMaxTodos(energy: number): number {
  if (energy >= 4) return 3;
  if (energy === 3) return 2;
  return 1;
}

// PRD 부록 A: Writing Review 시스템 프롬프트
const WRITING_REVIEW_SYSTEM_PROMPT = `당신은 사용자의 개인 성찰 파트너입니다.
사용자가 프리라이팅을 공유하면, 관점 전환을 유도하는 질문을 통해
더 깊은 자기 이해와 구체적 개선 포인트를 도출하도록 돕습니다.

## 프로세스

### Step 1: 프리라이팅 수신
사용자의 자유 글을 받습니다. 판단하지 않고, 감정 라벨링이 잘 되어 있는지 확인합니다.

### Step 2: 관점 전환 질문 3개
아래 6가지 카테고리에서 매번 다른 조합으로 3개를 선택:
1. 시간 전환 — "6개월 후에 이 상황을 보면?"
2. 타인 시점 — "상대방의 입장에서는?"
3. 인지-감정 분리 — "에너지를 뺏은 건 일 자체인가, 감정인가?"
4. 목표 연결 — "이 경험이 장기 목표에 어떻게 연결되는가?"
5. 패턴 인식 — "이런 상황이 전에도 있었나?"
6. 자원 발견 — "이 상황에서 확인된 강점은?"

### Step 3: 대화 3-4 라운드 후 마무리

### Step 4: Review Summary 생성 (마무리 시)
JSON 형식으로 반환:
{
  "emotion_keywords": ["감정1", "감정2"],
  "insights": "핵심 깨달음 1-2문장",
  "improvement_points": ["구체적 개선 사항"],
  "tags": ["영역 태그"]
}

## 대화 스타일
- 따뜻하지만 날카로운 질문
- 위로보다 인사이트 우선
- 자기 비판 루프 → 사실과 감정 분리 유도
- 짧게 답함`;

// Writing Review: 프리라이팅으로 초기 질문 3개 생성
async function generateInitialQuestions(freewriting: string): Promise<string[]> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: WRITING_REVIEW_SYSTEM_PROMPT },
      {
        role: "user",
        content: `다음은 오늘의 프리라이팅입니다:\n\n${freewriting}\n\n위 내용을 바탕으로 관점 전환을 위한 질문 3개를 생성해주세요. 각 질문은 서로 다른 카테고리에서 선택하세요. 질문만 번호 없이 줄바꿈으로 구분하여 반환하세요.`,
      },
    ],
  });

  const content = (response as { choices: { message: { content: string } }[] }).choices?.[0]?.message?.content ?? "";
  const questions = content
    .split("\n")
    .map((q: string) => q.trim())
    .filter((q: string) => q.length > 5)
    .slice(0, 3);

  return questions.length >= 1 ? questions : ["이 상황에서 가장 에너지를 뺏은 것은 무엇인가요?", "6개월 후에 이 상황을 돌아보면 어떻게 보일까요?", "이 경험에서 확인된 나의 강점이 있다면 무엇인가요?"];
}

// Writing Review: 답변에 대한 후속 질문 또는 Summary 생성
async function generateFollowUpOrSummary(
  conversation: ConversationMessage[],
  roundCount: number
): Promise<{ followUp?: string; summary?: { emotionKeywords: string[]; insights: string; improvementPoints: string[]; tags: string[] } }> {
  const shouldFinish = roundCount >= 4;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: WRITING_REVIEW_SYSTEM_PROMPT },
    ...conversation.map((m) => ({
      role: (m.role === "ai" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    })),
  ];

  if (shouldFinish) {
    messages.push({
      role: "user",
      content:
        "지금까지의 대화를 바탕으로 Review Summary를 JSON 형식으로 생성해주세요. emotion_keywords, insights, improvement_points, tags 필드를 포함하세요. JSON만 반환하세요.",
    });

    const response = await invokeLLM({ messages });
    const content = (response as { choices: { message: { content: string } }[] }).choices?.[0]?.message?.content ?? "{}";

    try {
      // JSON 블록 추출
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
      return {
        summary: {
          emotionKeywords: parsed.emotion_keywords ?? [],
          insights: parsed.insights ?? "",
          improvementPoints: parsed.improvement_points ?? [],
          tags: parsed.tags ?? [],
        },
      };
    } catch {
      return {
        summary: {
          emotionKeywords: [],
          insights: content.slice(0, 200),
          improvementPoints: [],
          tags: [],
        },
      };
    }
  } else {
    messages.push({
      role: "user",
      content: "대화를 계속 이어가기 위한 후속 질문 1개만 짧게 해주세요.",
    });

    const response = await invokeLLM({ messages });
    const followUp = (response as { choices: { message: { content: string } }[] }).choices?.[0]?.message?.content ?? "";
    return { followUp: followUp.trim() };
  }
}

// Weekly Report: Claude AI 분석 생성
async function generateWeeklyAnalysis(data: {
  weekStart: string;
  weekEnd: string;
  energyAvg: number | null;
  energyLowDay: string | null;
  energyHighDay: string | null;
  habitSummary: { slot: string; name: string; done: number; total: number }[];
  drainKeywords: string[];
  chargeKeywords: string[];
  entries: { date: string; energy: number | null; drain: string | null; charge: string | null }[];
}): Promise<{
  analysis: string;
  nextWeekMode: "recovery" | "normal" | "stretch";
  suggestions: string[];
}> {
  const habitText = data.habitSummary
    .map((h) => `Slot ${h.slot} (${h.name}): ${h.done}/${h.total}일 완료`)
    .join(", ");

  const prompt = `다음은 ${data.weekStart} ~ ${data.weekEnd} 주간 데이터입니다:

에너지 평균: ${data.energyAvg?.toFixed(1) ?? "데이터 없음"}/5
에너지 최저일: ${data.energyLowDay ?? "없음"}
에너지 최고일: ${data.energyHighDay ?? "없음"}
습관 달성: ${habitText || "데이터 없음"}
Drain 키워드: ${data.drainKeywords.join(", ") || "없음"}
Charge 키워드: ${data.chargeKeywords.join(", ") || "없음"}

위 데이터를 바탕으로 다음을 JSON 형식으로 반환하세요:
{
  "analysis": "이번 주 에너지 패턴과 습관에 대한 핵심 인사이트 2-3문장",
  "next_week_mode": "recovery 또는 normal 또는 stretch (에너지 평균 기준: 3 이하→recovery, 3-4→normal, 4 이상→stretch)",
  "suggestions": ["다음 주를 위한 구체적 제안 2-3개"]
}
JSON만 반환하세요.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "당신은 에너지 기반 자기관리 코치입니다. 데이터를 분석하여 실용적인 인사이트를 제공합니다." },
      { role: "user", content: prompt },
    ],
  });

  const content = (response as { choices: { message: { content: string } }[] }).choices?.[0]?.message?.content ?? "{}";

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
    const modeRaw = (parsed.next_week_mode ?? "normal").toLowerCase();
    const nextWeekMode: "recovery" | "normal" | "stretch" =
      modeRaw === "recovery" || modeRaw === "stretch" ? modeRaw : "normal";
    return {
      analysis: parsed.analysis ?? content.slice(0, 300),
      nextWeekMode,
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    const avg = data.energyAvg ?? 3;
    return {
      analysis: content.slice(0, 300),
      nextWeekMode: avg <= 3 ? "recovery" : avg >= 4 ? "stretch" : "normal",
      suggestions: [],
    };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Health Analysis ────────────────────────────────────────────────────────
  health: router({
    analyzeScreenshot: protectedProcedure
      .input(
        z.object({
          sleepImageBase64: z.string().min(1), // base64 encoded image
          energyImageBase64: z.string().min(1), // base64 encoded image
          sleepImageMime: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
          energyImageMime: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
      )
      .mutation(async ({ input }) => {
        const systemPrompt = `당신은 수면 과학 전문가입니다. 삼성헬스 스크린샷을 분석하여 실제 컨디션을 평가합니다.

## 수면 단계 분석 기준
이미지에서 아래 수치를 추출하세요:
- 깊은 수면 % (정상: 10-20%)
- 각성 시간 % (정상: 0-9%)
- 렘 수면 % (정상: 20-30%)
- 얕은 수면 % (정상: 40-60%)

## 에너지 점수 이미지 분석 기준
이미지에서 아래 수치를 추출하세요:
- 수면 중 심박수 (정상: 50-70bpm)
- 수면 중 HRV (높을수록 회복 우수)
- 삼성헬스 에너지 점수 (참고만, 맹신 금지)

## 과학적 판단 로직
삼성헬스 점수는 총 수면 시간과 전날 활동량에 과가중치를 두어 착시를 유발합니다.
실제 컨디션은 아래 우선순위로 판단하세요:

1순위 - 깊은 수면 %:
- 15%+ → +2점
- 10-14% → +1점
- 7-9% → 0점
- 7% 미만 → -2점

2순위 - 각성 시간 %:
- 0-9% → +1점
- 10-14% → 0점
- 15%+ → -2점

3순위 - HRV:
- 60ms+ → +1점
- 40-59ms → 0점
- 40ms 미만 → -1점

4순위 - 렘 수면 %:
- 20%+ → +1점
- 15-19% → 0점
- 15% 미만 → -1점

기준점 5에서 합산하여 최종 Energy Score 1-5 도출. 최솟값 1, 최댓값 5로 클램핑.

## 출력 형식 (JSON만 반환, 다른 텍스트 없이)
{
  "energy_score": 2,
  "sleep_quality": "bad",
  "metrics": {
    "deep_sleep_pct": 7,
    "wake_pct": 17,
    "rem_pct": 15,
    "light_pct": 61,
    "heart_rate": 60,
    "hrv": 51,
    "samsung_score": 89
  },
  "key_issues": ["깊은 수면 심각 부족 (7%)", "수면 분절 과다 (17%)"],
  "one_line": "삼성헬스 89점이지만 실제 회복도는 낮음. 오늘은 Survival Mode.",
  "suggestion": "고강도 집중 업무 오후로 미루기. 오전은 가벼운 루틴으로."
}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `다음 두 장의 삼성헬스 스크린샷을 분석해 주세요. 날짜: ${input.date}\n첫 번째 이미지는 수면 단계 화면, 두 번째 이미지는 에너지 점수 화면입니다.`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.sleepImageMime};base64,${input.sleepImageBase64}`,
                    detail: "high",
                  },
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.energyImageMime};base64,${input.energyImageBase64}`,
                    detail: "high",
                  },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "samsung_health_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  energy_score: { type: "integer", description: "1-5 energy score" },
                  sleep_quality: { type: "string", description: "good, ok, or bad" },
                  metrics: {
                    type: "object",
                    properties: {
                      deep_sleep_pct: { type: "number" },
                      wake_pct: { type: "number" },
                      rem_pct: { type: "number" },
                      light_pct: { type: "number" },
                      heart_rate: { type: "number" },
                      hrv: { type: "number" },
                      samsung_score: { type: "number" },
                    },
                    required: ["deep_sleep_pct", "wake_pct", "rem_pct", "light_pct", "heart_rate", "hrv", "samsung_score"],
                    additionalProperties: false,
                  },
                  key_issues: { type: "array", items: { type: "string" } },
                  one_line: { type: "string" },
                  suggestion: { type: "string" },
                },
                required: ["energy_score", "sleep_quality", "metrics", "key_issues", "one_line", "suggestion"],
                additionalProperties: false,
              },
            },
          },
        });

        const raw = response.choices?.[0]?.message?.content;
        if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 응답이 비어있습니다" });

        let parsed: {
          energy_score: number;
          sleep_quality: string;
          metrics: {
            deep_sleep_pct: number;
            wake_pct: number;
            rem_pct: number;
            light_pct: number;
            heart_rate: number;
            hrv: number;
            samsung_score: number;
          };
          key_issues: string[];
          one_line: string;
          suggestion: string;
        };
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 응답 파싱 실패" });
        }

        // energy_score 클램핑 (1~5)
        parsed.energy_score = Math.max(1, Math.min(5, Math.round(parsed.energy_score)));

        return {
          energy_score: parsed.energy_score,
          sleep_quality: parsed.sleep_quality as "good" | "ok" | "bad",
          metrics: parsed.metrics,
          key_issues: parsed.key_issues,
          one_line: parsed.one_line,
          suggestion: parsed.suggestion,
          date: input.date,
        };
      }),
  }),

  // ─── Habits ────────────────────────────────────────────────────────────────
  habits: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureDefaultHabits(ctx.user.id);
      return getHabitsByUserId(ctx.user.id);
    }),

    updateName: protectedProcedure
      .input(z.object({ slot: z.enum(["A", "B", "C"]), name: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await updateHabitName(ctx.user.id, input.slot, input.name);
        return { success: true };
      }),
  }),

  // ─── Daily Entry ───────────────────────────────────────────────────────────
  daily: router({
    get: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        const entry = await getDailyEntry(ctx.user.id, input.date);
        const todosData = await getTodosByDate(ctx.user.id, input.date);
        const habitLogsData = await getHabitLogsByDate(ctx.user.id, input.date);
        const userHabits = await getHabitsByUserId(ctx.user.id);
        return { entry: entry ?? null, todos: todosData, habitLogs: habitLogsData, habits: userHabits };
      }),

    upsert: protectedProcedure
      .input(
        z.object({
          date: z.string(),
          energy: z.number().min(1).max(5).optional(),
          sleep: z.enum(["good", "ok", "bad"]).optional(),
          drain: z.string().optional(),
          charge: z.string().optional(),
          notes: z.string().optional(),
          energyGrade: z.string().optional(),
          sleepGrade: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const todoMode = input.energy ? energyToMode(input.energy) : undefined;
        const entry = await upsertDailyEntry({
          userId: ctx.user.id,
          date: input.date,
          energy: input.energy,
          sleep: input.sleep,
          todoMode,
          drain: input.drain,
          charge: input.charge,
          notes: input.notes,
          energyGrade: input.energyGrade,
          sleepGrade: input.sleepGrade,
        });
        return { entry, todoMode, maxTodos: input.energy ? energyToMaxTodos(input.energy) : 2 };
      }),

    range: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ ctx, input }) => {
        return getDailyEntriesRange(ctx.user.id, input.startDate, input.endDate);
      }),
  }),

  // ─── Todos ─────────────────────────────────────────────────────────────────
  todos: router({
    list: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        return getTodosByDate(ctx.user.id, input.date);
      }),

    create: protectedProcedure
      .input(z.object({ date: z.string(), content: z.string().min(1).max(200), sortOrder: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const entry = await getDailyEntry(ctx.user.id, input.date);
        const maxTodos = entry?.energy ? energyToMaxTodos(entry.energy) : 3;
        const existing = await getTodosByDate(ctx.user.id, input.date);
        if (existing.length >= maxTodos) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `오늘의 에너지 기준 최대 ${maxTodos}개까지만 추가할 수 있습니다.`,
          });
        }
        await createTodo({ userId: ctx.user.id, date: input.date, content: input.content, sortOrder: input.sortOrder ?? existing.length });
        return { success: true };
      }),

    toggleDone: protectedProcedure
      .input(z.object({ id: z.number(), done: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await updateTodoDone(input.id, ctx.user.id, input.done);
        return { success: true };
      }),

    updateContent: protectedProcedure
      .input(z.object({ id: z.number(), content: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await updateTodoContent(input.id, ctx.user.id, input.content);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteTodo(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Habit Logs ────────────────────────────────────────────────────────────
  habitLogs: router({
    listByDate: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        return getHabitLogsByDate(ctx.user.id, input.date);
      }),

    toggle: protectedProcedure
      .input(z.object({ habitId: z.number(), date: z.string(), done: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await upsertHabitLog(ctx.user.id, input.habitId, input.date, input.done);
        return { success: true };
      }),
  }),

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    energyTrend: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ ctx, input }) => {
        const entries = await getDailyEntriesRange(ctx.user.id, input.startDate, input.endDate);
        return entries.map((e) => ({ date: e.date, energy: e.energy, todoMode: e.todoMode }));
      }),

    habitHeatmap: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ ctx, input }) => {
        const logs = await getHabitLogsRange(ctx.user.id, input.startDate, input.endDate);
        const userHabits = await getHabitsByUserId(ctx.user.id);
        return { logs, habits: userHabits };
      }),

    weekSummary: protectedProcedure
      .input(z.object({ weekStart: z.string(), weekEnd: z.string() }))
      .query(async ({ ctx, input }) => {
        return getWeeklyHabitSummary(ctx.user.id, input.weekStart, input.weekEnd);
      }),

    // Phase 2 확장: 대시보드에 개선포인트 + 최근 주간 리뷰 추가
    overview: protectedProcedure.query(async ({ ctx }) => {
      const pendingImprovements = await getPendingImprovementPoints(ctx.user.id, 3);
      const latestWeeklyReview = await getLatestWeeklyReview(ctx.user.id);
      return { pendingImprovements, latestWeeklyReview };
    }),
  }),

  // ─── Phase 2: Writing Review ───────────────────────────────────────────────
  review: router({
    // 프리라이팅 제출 → 초기 질문 3개 생성 + 리뷰 레코드 생성
    start: protectedProcedure
      .input(z.object({ freewriting: z.string().min(10).max(5000), date: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const questions = await generateInitialQuestions(input.freewriting);

        // AI 질문을 conversation에 저장
        const conversation: ConversationMessage[] = [
          { role: "user", content: input.freewriting },
          { role: "ai", content: questions.join("\n\n") },
        ];

        const review = await createWritingReview({
          userId: ctx.user.id,
          date: input.date,
          freewriting: input.freewriting,
          conversation,
          status: "chatting",
        });

        return { reviewId: review.id, questions };
      }),

    // 사용자 답변 제출 → 후속 질문 or Summary 생성
    respond: protectedProcedure
      .input(z.object({ reviewId: z.number(), answer: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const review = await getWritingReviewById(input.reviewId, ctx.user.id);
        if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "리뷰를 찾을 수 없습니다." });
        if (review.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "이미 완료된 리뷰입니다." });

        const currentConversation = (review.conversation ?? []) as ConversationMessage[];
        const updatedConversation: ConversationMessage[] = [
          ...currentConversation,
          { role: "user", content: input.answer },
        ];

        // 사용자 답변 횟수 (AI 질문 제외)
        const userRounds = updatedConversation.filter((m) => m.role === "user").length - 1; // -1 for freewriting

        const result = await generateFollowUpOrSummary(updatedConversation, userRounds);

        if (result.summary) {
          // 리뷰 완료
          const finalConversation: ConversationMessage[] = [
            ...updatedConversation,
            { role: "ai", content: `리뷰가 완료되었습니다.\n\n**핵심 인사이트:** ${result.summary.insights}\n\n**감정 키워드:** ${result.summary.emotionKeywords.join(", ")}` },
          ];
          await updateWritingReview(input.reviewId, ctx.user.id, {
            conversation: finalConversation,
            emotionKeywords: result.summary.emotionKeywords,
            insights: result.summary.insights,
            improvementPoints: result.summary.improvementPoints,
            tags: result.summary.tags,
            status: "completed",
          });
          return { done: true, summary: result.summary, conversation: finalConversation };
        } else {
          // 후속 질문
          const followUpConversation: ConversationMessage[] = [
            ...updatedConversation,
            { role: "ai", content: result.followUp! },
          ];
          await updateWritingReview(input.reviewId, ctx.user.id, {
            conversation: followUpConversation,
          });
          return { done: false, followUp: result.followUp, conversation: followUpConversation };
        }
      }),

    // 완료된 리뷰에서 개선포인트 저장
    saveImprovements: protectedProcedure
      .input(z.object({ reviewId: z.number(), improvementPoints: z.array(z.string().min(1).max(500)) }))
      .mutation(async ({ ctx, input }) => {
        const review = await getWritingReviewById(input.reviewId, ctx.user.id);
        if (!review) throw new TRPCError({ code: "NOT_FOUND" });

        for (const content of input.improvementPoints) {
          await createImprovementPoint({
            userId: ctx.user.id,
            writingReviewId: input.reviewId,
            content,
            status: "pending",
          });
        }
        return { success: true, count: input.improvementPoints.length };
      }),

    // 리뷰 목록
    list: protectedProcedure.query(async ({ ctx }) => {
      return getWritingReviewsByUser(ctx.user.id);
    }),

    // 특정 리뷰 조회
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const review = await getWritingReviewById(input.id, ctx.user.id);
        if (!review) throw new TRPCError({ code: "NOT_FOUND" });
        return review;
      }),
  }),

  // ─── Phase 2: Improvement Points ──────────────────────────────────────────
  improvements: router({
    list: protectedProcedure
      .input(z.object({ status: z.enum(["pending", "experimenting", "completed", "dropped"]).optional() }))
      .query(async ({ ctx, input }) => {
        return getImprovementPointsByUser(ctx.user.id, input.status);
      }),

    create: protectedProcedure
      .input(z.object({ content: z.string().min(1).max(500), writingReviewId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const point = await createImprovementPoint({
          userId: ctx.user.id,
          writingReviewId: input.writingReviewId,
          content: input.content,
          status: "pending",
        });
        return point;
      }),

    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pending", "experimenting", "completed", "dropped"]) }))
      .mutation(async ({ ctx, input }) => {
        await updateImprovementPointStatus(input.id, ctx.user.id, input.status);
        return { success: true };
      }),

    updateNotes: protectedProcedure
      .input(z.object({ id: z.number(), notes: z.string().max(2000) }))
      .mutation(async ({ ctx, input }) => {
        await updateImprovementPointNotes(input.id, ctx.user.id, input.notes);
        return { success: true };
      }),

    toggleExperiment: protectedProcedure
      .input(z.object({ id: z.number(), isCurrentExperiment: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await toggleCurrentExperiment(input.id, ctx.user.id, input.isCurrentExperiment);
        return { success: true };
      }),
  }),

  // ─── Obsidian Export ────────────────────────────────────────────────────────
  export: router({
    // 단일 날짜 md 콘텐츠 반환
    daily: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        const entry = await getDailyEntry(ctx.user.id, input.date);
        const todosData = await getTodosByDate(ctx.user.id, input.date);
        const habitLogsData = await getHabitLogsByDate(ctx.user.id, input.date);
        const userHabits = await getHabitsByUserId(ctx.user.id);
        await ensureDefaultHabits(ctx.user.id);

        // habitId -> slot 맵 생성
        const habitMap = new Map<number, string>();
        for (const h of userHabits) habitMap.set(h.id, h.slot);

        // 이 날짜의 Writing Review 조회
        const reviews = await getWritingReviewsByUser(ctx.user.id);
        const writingReview = reviews.find((r) => r.date === input.date && r.status === "completed") ?? null;

        const content = buildObsidianMarkdown({
          date: input.date,
          entry: entry ?? null,
          todos: todosData,
          habits: userHabits,
          habitLogs: habitLogsData,
          habitMap,
          writingReview: writingReview
            ? {
                freewriting: writingReview.freewriting,
                emotionKeywords: writingReview.emotionKeywords as string[] | null,
                insights: writingReview.insights,
                improvementPoints: writingReview.improvementPoints as string[] | null,
                tags: writingReview.tags as string[] | null,
              }
            : null,
        });

        return { content, filename: `${input.date}.md` };
      }),

    // 날짜 범위 여러 md 콘텐츠 배열 반환
    range: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ ctx, input }) => {
        const entries = await getDailyEntriesRange(ctx.user.id, input.startDate, input.endDate);
        const userHabits = await getHabitsByUserId(ctx.user.id);
        await ensureDefaultHabits(ctx.user.id);
        const habitMap = new Map<number, string>();
        for (const h of userHabits) habitMap.set(h.id, h.slot);

        const reviews = await getWritingReviewsByUser(ctx.user.id);

        const files: Array<{ filename: string; content: string }> = [];
        for (const entry of entries) {
          const todosData = await getTodosByDate(ctx.user.id, entry.date);
          const habitLogsData = await getHabitLogsByDate(ctx.user.id, entry.date);
          const writingReview = reviews.find((r) => r.date === entry.date && r.status === "completed") ?? null;
          const content = buildObsidianMarkdown({
            date: entry.date,
            entry,
            todos: todosData,
            habits: userHabits,
            habitLogs: habitLogsData,
            habitMap,
            writingReview: writingReview
              ? {
                  freewriting: writingReview.freewriting,
                  emotionKeywords: writingReview.emotionKeywords as string[] | null,
                  insights: writingReview.insights,
                  improvementPoints: writingReview.improvementPoints as string[] | null,
                  tags: writingReview.tags as string[] | null,
                }
              : null,
          });
          files.push({ filename: `${entry.date}.md`, content });
        }
        return { files };
      }),
  }),

  // ─── Phase 2: Weekly Report ──────────────────────────────────────────────────────────
  weekly: router({
    // 주간 리포트 생성 (7일 데이터 집계 + AI 분석)
    generate: protectedProcedure
      .input(z.object({ weekStart: z.string(), weekEnd: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const data = await aggregateWeeklyData(ctx.user.id, input.weekStart, input.weekEnd);
        const aiResult = await generateWeeklyAnalysis({
          weekStart: input.weekStart,
          weekEnd: input.weekEnd,
          energyAvg: data.energyAvg,
          energyLowDay: data.energyLowDay,
          energyHighDay: data.energyHighDay,
          habitSummary: data.habitSummary,
          drainKeywords: data.drainKeywords,
          chargeKeywords: data.chargeKeywords,
          entries: data.entries.map((e) => ({ date: e.date, energy: e.energy ?? null, drain: e.drain ?? null, charge: e.charge ?? null })),
        });

        const report = await upsertWeeklyReview({
          userId: ctx.user.id,
          weekStart: input.weekStart,
          weekEnd: input.weekEnd,
          energyAvg: data.energyAvg != null ? data.energyAvg.toFixed(1) : null,
          energyLowDay: data.energyLowDay,
          energyHighDay: data.energyHighDay,
          habitSummary: data.habitSummary,
          drainKeywords: data.drainKeywords,
          chargeKeywords: data.chargeKeywords,
          aiAnalysis: aiResult.analysis,
          nextWeekMode: aiResult.nextWeekMode,
          suggestions: aiResult.suggestions,
        });

        return { ...report, energyGradeDist: data.energyGradeDist };
      }),

    // 특정 주 리포트 조회
    get: protectedProcedure
      .input(z.object({ weekStart: z.string() }))
      .query(async ({ ctx, input }) => {
        return getWeeklyReviewByWeek(ctx.user.id, input.weekStart) ?? null;
      }),

    // 전체 주간 리포트 목록
    list: protectedProcedure.query(async ({ ctx }) => {
      return getWeeklyReviewsByUser(ctx.user.id);
    }),

    // 메모 업데이트
    updateNotes: protectedProcedure
      .input(z.object({ weekStart: z.string(), notes: z.string().max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const review = await getWeeklyReviewByWeek(ctx.user.id, input.weekStart);
        if (!review) throw new TRPCError({ code: "NOT_FOUND" });
        const db = (await import("./db")).getDb();
        // Simple update via upsert
        await upsertWeeklyReview({ ...review, notes: input.notes });
        return { success: true };
      }),
  }),

  // ─── User Context (encrypted settings) ──────────────────────────────────────────────────────────
  userContext: router({
    // GitHub 설정 저장 (repoUrl + PAT 암호화)
    setGitHubConfig: protectedProcedure
      .input(
        z.object({
          repoUrl: z.string().url().max(500),
          pat: z.string().min(1).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const repoPayload = encrypt(input.repoUrl);
        const patPayload = encrypt(input.pat);
        await upsertUserContext(ctx.user.id, "github_repo_url", repoPayload);
        await upsertUserContext(ctx.user.id, "github_pat", patPayload);
        return { success: true };
      }),

    // GitHub 설정 조회 (PAT는 마스킹하여 반환)
    getGitHubConfig: protectedProcedure.query(async ({ ctx }) => {
      const repoPayload = await getUserContext(ctx.user.id, "github_repo_url");
      const patPayload = await getUserContext(ctx.user.id, "github_pat");
      if (!repoPayload || !patPayload) return { configured: false as const };
      const repoUrl = decrypt(repoPayload);
      const pat = decrypt(patPayload);
      // PAT 마스킹: 앞 4자리 + *** + 뒤 4자리
      const maskedPat = pat.length > 8
        ? `${pat.slice(0, 4)}${"•".repeat(Math.min(pat.length - 8, 20))}${pat.slice(-4)}`
        : "•".repeat(pat.length);
      return { configured: true as const, repoUrl, maskedPat };
    }),

    // GitHub 연동 해제
    disconnectGitHub: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteUserContext(ctx.user.id, "github_repo_url");
      await deleteUserContext(ctx.user.id, "github_pat");
      return { success: true };
    }),

    // GitHub 연결 테스트 (레포 접근 확인)
    testGitHubConnection: protectedProcedure.mutation(async ({ ctx }) => {
      const repoPayload = await getUserContext(ctx.user.id, "github_repo_url");
      const patPayload = await getUserContext(ctx.user.id, "github_pat");
      if (!repoPayload || !patPayload) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "GitHub 설정이 없습니다" });
      }
      const repoUrl = decrypt(repoPayload);
      const pat = decrypt(patPayload);
      // repoUrl 파싱: https://github.com/owner/repo
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "유효하지 않은 GitHub 레포 URL입니다" });
      const [, owner, repo] = match;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new TRPCError({
          code: res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
          message: (body.message as string) ?? `GitHub API 오류 (${res.status})`,
        });
      }
      const data = await res.json() as { full_name: string; private: boolean };
      return { success: true, fullName: data.full_name, isPrivate: data.private };
    }),
  }),

  // ─── GitHub Push (Obsidian Export 자동화) ─────────────────────────────────────────────────────────
  github: router({
    /**
     * Push one or more markdown files to GitHub repo under Daily/ folder.
     * Uses GitHub Contents API (PUT /repos/{owner}/{repo}/contents/{path}).
     * If a file already exists, fetches its SHA first and includes it in the request.
     */
    push: protectedProcedure
      .input(
        z.object({
          files: z.array(
            z.object({
              filename: z.string(),   // e.g. "2026-05-27.md"
              content: z.string(),    // markdown content
            })
          ).min(1).max(31),
          commitMessage: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 1. 설정 조회
        const repoPayload = await getUserContext(ctx.user.id, "github_repo_url");
        const patPayload = await getUserContext(ctx.user.id, "github_pat");
        if (!repoPayload || !patPayload) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "GitHub 설정이 없습니다. 설정 화면에서 GitHub을 연결해주세요." });
        }
        const repoUrl = decrypt(repoPayload);
        const pat = decrypt(patPayload);

        // 2. owner/repo 파싱
        const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);
        if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "유효하지 않은 GitHub 레포 URL" });
        const [, owner, repo] = match;

        const headers = {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        };

        const results: Array<{ filename: string; status: "created" | "updated" | "error"; error?: string }> = [];

        for (const file of input.files) {
          const filePath = `Daily/${file.filename}`;
          const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
          const contentBase64 = Buffer.from(file.content, "utf8").toString("base64");
          const message = input.commitMessage ?? `chore: update ${file.filename}`;

          try {
            // 기존 파일 SHA 조회 (PUT 시 필요)
            let sha: string | undefined;
            const getRes = await fetch(apiUrl, { headers });
            if (getRes.ok) {
              const existing = await getRes.json() as { sha: string };
              sha = existing.sha;
            }

            // PUT 요청
            const body: Record<string, unknown> = { message, content: contentBase64 };
            if (sha) body.sha = sha;

            const putRes = await fetch(apiUrl, {
              method: "PUT",
              headers,
              body: JSON.stringify(body),
            });

            if (!putRes.ok) {
              const errBody = await putRes.json().catch(() => ({})) as Record<string, unknown>;
              results.push({ filename: file.filename, status: "error", error: (errBody.message as string) ?? `HTTP ${putRes.status}` });
            } else {
              results.push({ filename: file.filename, status: sha ? "updated" : "created" });
            }
          } catch (err) {
            results.push({ filename: file.filename, status: "error", error: String(err) });
          }
        }

        const failed = results.filter((r) => r.status === "error");
        if (failed.length === input.files.length) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `모든 파일 푸시 실패: ${failed[0]?.error}` });
        }

        return { results, pushed: results.filter((r) => r.status !== "error").length, failed: failed.length };
      }),
  }),
});

// ─── Obsidian Export ──────────────────────────────────────────────────────────

function buildObsidianMarkdown(params: {
  date: string;
  entry: { energy?: number | null; sleep?: string | null; todoMode?: string | null; drain?: string | null; charge?: string | null; notes?: string | null } | null;
  todos: Array<{ content: string; done: boolean; sortOrder: number }>;
  habits: Array<{ slot: string; name: string }>;
  habitLogs: Array<{ habitId: number; done: boolean }>;
  habitMap: Map<number, string>; // habitId -> slot
  writingReview?: { freewriting?: string | null; emotionKeywords?: string[] | null; insights?: string | null; improvementPoints?: string[] | null; tags?: string[] | null } | null;
}): string {
  const { date, entry, todos, habits, habitLogs, habitMap, writingReview } = params;
  const d = new Date(date + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dayName = dayNames[d.getDay()];
  const energy = entry?.energy ?? 0;
  const sleep = entry?.sleep ?? "";
  const todoMode = entry?.todoMode ?? "normal";

  // Frontmatter
  const lines: string[] = [
    "---",
    `date: ${date}`,
    `day: ${dayName}`,
    `energy: ${energy}`,
    `sleep: ${sleep}`,
    `todo_mode: ${todoMode}`,
    `tags: [daily]`,
    "---",
    "",
    `# ${date} (${dayName}) — Energy ${energy}/5`,
    "",
    `> Mode: **${todoMode}** → 오늘 우선순위 **${todos.length}개**`,
    "",
    "---",
    "",
    "## 📋 Today's Focus",
  ];

  if (todos.length === 0) {
    lines.push("(기록 없음)");
  } else {
    const sorted = [...todos].sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.forEach((t, i) => {
      lines.push(`- [${t.done ? "x" : " "}] ${i + 1}. ${t.content}`);
    });
  }

  lines.push("", "---", "", "## ✅ Habits");

  for (const habit of habits) {
    const habitEntry = habits.find((h) => h.slot === habit.slot);
    let habitId: number | undefined;
    habitMap.forEach((slot, id) => { if (slot === habit.slot) habitId = id; });
    const log = habitId !== undefined ? habitLogs.find((l) => l.habitId === habitId) : undefined;
    const done = log?.done ?? false;
    lines.push(`- [${done ? "x" : " "}] **${habit.slot}**: ${habit.name}`);
  }

  lines.push("", "---", "", "## ⚡ Drain / Charge");
  lines.push(`- Drain: ${entry?.drain || "(없음)"}`);
  lines.push(`- Charge: ${entry?.charge || "(없음)"}`);

  if (writingReview) {
    lines.push("", "---", "", "## ✍️ Writing Review", "");
    // 프리라이팅 원문 (있을 때만)
    if (writingReview.freewriting) {
      lines.push("### 프리라이팅", "", writingReview.freewriting, "");
    }
    // Review Summary (AI 생성)
    lines.push(`### Review Summary — ${date}`, "");
    if (writingReview.emotionKeywords?.length) {
      lines.push(`**감정 키워드**: ${writingReview.emotionKeywords.join(", ")}`, "");
    }
    if (writingReview.insights) {
      lines.push(`**인사이트**: ${writingReview.insights}`, "");
    }
    if (writingReview.improvementPoints?.length) {
      lines.push("**개선 포인트**:");
      writingReview.improvementPoints.forEach((p) => lines.push(`- [ ] ${p}`));
      lines.push("");
    }
    if (writingReview.tags?.length) {
      lines.push(`**태그**: ${writingReview.tags.map((t) => `#${t}`).join(" ")}`);
    }
  }

  return lines.join("\n");
}

export { buildObsidianMarkdown };

export type AppRouter = typeof appRouter;
