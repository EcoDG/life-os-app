import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Auth Context Helper ───────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];

  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

// ─── Energy Mode Logic ─────────────────────────────────────────────────────────

describe("Energy Mode Logic", () => {
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

  it("에너지 5 → stretch 모드, 최대 3개 todo", () => {
    expect(energyToMode(5)).toBe("stretch");
    expect(energyToMaxTodos(5)).toBe(3);
  });

  it("에너지 4 → stretch 모드, 최대 3개 todo", () => {
    expect(energyToMode(4)).toBe("stretch");
    expect(energyToMaxTodos(4)).toBe(3);
  });

  it("에너지 3 → normal 모드, 최대 2개 todo", () => {
    expect(energyToMode(3)).toBe("normal");
    expect(energyToMaxTodos(3)).toBe(2);
  });

  it("에너지 2 → survival 모드, 최대 1개 todo", () => {
    expect(energyToMode(2)).toBe("survival");
    expect(energyToMaxTodos(2)).toBe(1);
  });

  it("에너지 1 → survival 모드, 최대 1개 todo", () => {
    expect(energyToMode(1)).toBe("survival");
    expect(energyToMaxTodos(1)).toBe(1);
  });
});

// ─── Auth Logout ───────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("세션 쿠키를 삭제하고 success를 반환한다", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

// ─── Auth Me ──────────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("인증된 사용자 정보를 반환한다", async () => {
    const { ctx } = createAuthContext(42);
    const caller = appRouter.createCaller(ctx);

    const user = await caller.auth.me();

    expect(user).not.toBeNull();
    expect(user?.id).toBe(42);
    expect(user?.email).toBe("test42@example.com");
  });

  it("미인증 상태에서는 null을 반환한다", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});

// ─── Habit Slot Validation ─────────────────────────────────────────────────────

describe("habits.updateName", () => {
  it("유효하지 않은 슬롯은 zod 에러를 발생시킨다", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.habits.updateName({ slot: "D" as "A", name: "테스트" })
    ).rejects.toThrow();
  });

  it("빈 이름은 zod 에러를 발생시킨다", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.habits.updateName({ slot: "A", name: "" })
    ).rejects.toThrow();
  });
});

// ─── Daily Entry Validation ────────────────────────────────────────────────────

describe("daily.upsert validation", () => {
  it("에너지 범위 초과는 zod 에러를 발생시킨다", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.daily.upsert({ date: "2026-05-20", energy: 6 })
    ).rejects.toThrow();
  });

  it("에너지 0은 zod 에러를 발생시킨다", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.daily.upsert({ date: "2026-05-20", energy: 0 })
    ).rejects.toThrow();
  });

  it("유효하지 않은 sleep 값은 zod 에러를 발생시킨다", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.daily.upsert({ date: "2026-05-20", sleep: "excellent" as "good" })
    ).rejects.toThrow();
  });
});
