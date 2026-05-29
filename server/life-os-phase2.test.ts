import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock Context ─────────────────────────────────────────────────────────────

function createMockContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── Writing Review Router Tests ──────────────────────────────────────────────

describe("review router", () => {
  it("review.list returns array for authenticated user", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.review.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("review.get throws NOT_FOUND for non-existent review", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.review.get({ id: 999999 })).rejects.toThrow();
  });
});

// ─── Improvements Router Tests ────────────────────────────────────────────────

describe("improvements router", () => {
  it("improvements.list returns array", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.improvements.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("improvements.list filters by status", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const pending = await caller.improvements.list({ status: "pending" });
    const experimenting = await caller.improvements.list({ status: "experimenting" });
    expect(Array.isArray(pending)).toBe(true);
    expect(Array.isArray(experimenting)).toBe(true);
  });

  it("improvements.create and list includes new item", async () => {
    // 실제 DB 유저 ID 1을 사용 (FK 제약 존재)
    const ctx = createMockContext(1);
    const caller = appRouter.createCaller(ctx);

    // create 후 반환된 ID로 직접 조회 (기존 데이터 상태에 없이 독립적)
    const created = await caller.improvements.create({ content: "테스트 개선 포인트 Phase2" });
    const list = await caller.improvements.list({});
    const found = list.find((p) => p.id === created.id);
    expect(found).toBeDefined();
    expect(found?.status).toBe("pending");
  });

  it("improvements.updateStatus changes status", async () => {
    const ctx = createMockContext(1);
    const caller = appRouter.createCaller(ctx);

    const created = await caller.improvements.create({ content: "상태 변경 테스트" });
    await caller.improvements.updateStatus({ id: created.id, status: "experimenting" });

    const list = await caller.improvements.list({ status: "experimenting" });
    const found = list.find((p) => p.id === created.id);
    expect(found?.status).toBe("experimenting");
  });

  it("improvements.updateNotes saves notes", async () => {
    const ctx = createMockContext(1);
    const caller = appRouter.createCaller(ctx);

    const created = await caller.improvements.create({ content: "노트 테스트" });
    await caller.improvements.updateNotes({ id: created.id, notes: "실험 결과 메모" });

    const list = await caller.improvements.list({});
    const found = list.find((p) => p.id === created.id);
    expect(found?.experimentNotes).toBe("실험 결과 메모");
  });

  it("improvements.toggleExperiment sets isCurrentExperiment", async () => {
    const ctx = createMockContext(1);
    const caller = appRouter.createCaller(ctx);

    const created = await caller.improvements.create({ content: "실험 토글 테스트" });
    await caller.improvements.toggleExperiment({ id: created.id, isCurrentExperiment: true });

    const list = await caller.improvements.list({});
    const found = list.find((p) => p.id === created.id);
    expect(found?.isCurrentExperiment).toBe(true);
  });
});

// ─── Weekly Report Router Tests ───────────────────────────────────────────────

describe("weekly router", () => {
  it("weekly.list returns array", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.weekly.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("weekly.get returns null or undefined for non-existent week", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.weekly.get({ weekStart: "2000-01-01" });
    expect(result == null).toBe(true); // null 또는 undefined 모두 허용
  });
});

// ─── Dashboard Overview Tests ─────────────────────────────────────────────────

describe("dashboard.overview", () => {
  it("returns pendingImprovements and latestWeeklyReview", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.overview();
    expect(result).toHaveProperty("pendingImprovements");
    expect(result).toHaveProperty("latestWeeklyReview");
    expect(Array.isArray(result.pendingImprovements)).toBe(true);
  });
});

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns user when authenticated", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.id).toBe(1);
  });
});
