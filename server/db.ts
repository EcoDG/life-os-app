import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  DailyEntry,
  Habit,
  HabitLog,
  InsertDailyEntry,
  InsertHabitLog,
  InsertTodo,
  InsertUser,
  Todo,
  dailyEntries,
  habitLogs,
  habits,
  todos,
  userContext,
  users,
} from "../drizzle/schema";
import type { EncryptedPayload } from "./crypto";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Habits ───────────────────────────────────────────────────────────────────

export async function getHabitsByUserId(userId: number): Promise<Habit[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(habits).where(eq(habits.userId, userId));
}

export async function updateHabitName(
  userId: number,
  slot: "A" | "B" | "C",
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.slot, slot)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(habits)
      .set({ name })
      .where(and(eq(habits.userId, userId), eq(habits.slot, slot)));
  } else {
    await db.insert(habits).values({ userId, slot, name, targetFrequency: 7 });
  }
}

export async function ensureDefaultHabits(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(habits).where(eq(habits.userId, userId));
  const slots: Array<"A" | "B" | "C"> = ["A", "B", "C"];
  const defaultNames: Record<string, string> = {
    A: "Slot A 습관",
    B: "Slot B 습관",
    C: "Slot C 습관",
  };
  for (const slot of slots) {
    if (!existing.find((h) => h.slot === slot)) {
      await db.insert(habits).values({ userId, slot, name: defaultNames[slot], targetFrequency: 7 });
    }
  }
}

// ─── Daily Entries ────────────────────────────────────────────────────────────

export async function getDailyEntry(
  userId: number,
  date: string
): Promise<DailyEntry | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(dailyEntries)
    .where(and(eq(dailyEntries.userId, userId), eq(dailyEntries.date, date)))
    .limit(1);
  return result[0];
}

export async function upsertDailyEntry(data: InsertDailyEntry): Promise<DailyEntry> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await getDailyEntry(data.userId as number, data.date as string);
  if (existing) {
    await db
      .update(dailyEntries)
      .set({
        energy: data.energy,
        sleep: data.sleep,
        todoMode: data.todoMode,
        drain: data.drain,
        charge: data.charge,
        notes: data.notes,
        energyGrade: data.energyGrade,
        sleepGrade: data.sleepGrade,
      })
      .where(eq(dailyEntries.id, existing.id));
    return { ...existing, ...data } as DailyEntry;
  } else {
    await db.insert(dailyEntries).values(data);
    const created = await getDailyEntry(data.userId as number, data.date as string);
    return created!;
  }
}

export async function getDailyEntriesRange(
  userId: number,
  startDate: string,
  endDate: string
): Promise<DailyEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(dailyEntries)
    .where(
      and(
        eq(dailyEntries.userId, userId),
        gte(dailyEntries.date, startDate),
        lte(dailyEntries.date, endDate)
      )
    );
}

// ─── Todos ────────────────────────────────────────────────────────────────────

export async function getTodosByDate(userId: number, date: string): Promise<Todo[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.date, date)));
}

export async function createTodo(data: InsertTodo): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(todos).values(data);
}

export async function updateTodoDone(todoId: number, userId: number, done: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(todos)
    .set({ done })
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
}

export async function deleteTodo(todoId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(todos).where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
}

export async function updateTodoContent(
  todoId: number,
  userId: number,
  content: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(todos)
    .set({ content })
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
}

// ─── Habit Logs ───────────────────────────────────────────────────────────────

export async function getHabitLogsByDate(userId: number, date: string): Promise<HabitLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(habitLogs)
    .where(and(eq(habitLogs.userId, userId), eq(habitLogs.date, date)));
}

export async function upsertHabitLog(
  userId: number,
  habitId: number,
  date: string,
  done: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(habitLogs)
    .where(
      and(eq(habitLogs.userId, userId), eq(habitLogs.habitId, habitId), eq(habitLogs.date, date))
    )
    .limit(1);

  if (existing.length > 0) {
    await db.update(habitLogs).set({ done }).where(eq(habitLogs.id, existing[0].id));
  } else {
    await db.insert(habitLogs).values({ userId, habitId, date, done });
  }
}

export async function getHabitLogsRange(
  userId: number,
  startDate: string,
  endDate: string
): Promise<HabitLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.userId, userId),
        gte(habitLogs.date, startDate),
        lte(habitLogs.date, endDate)
      )
    );
}

export async function getWeeklyHabitSummary(
  userId: number,
  weekStart: string,
  weekEnd: string
): Promise<{ habitId: number; slot: string; name: string; done: number; total: number }[]> {
  const db = await getDb();
  if (!db) return [];

  const userHabits = await getHabitsByUserId(userId);
  const logs = await getHabitLogsRange(userId, weekStart, weekEnd);

  return userHabits.map((habit) => {
    const habitDoneLogs = logs.filter((l) => l.habitId === habit.id && l.done);
    return {
      habitId: habit.id,
      slot: habit.slot,
      name: habit.name,
      done: habitDoneLogs.length,
      total: 7,
    };
  });
}

// ─── Phase 2: Writing Reviews ─────────────────────────────────────────────────

import {
  ConversationMessage,
  HabitSummaryData,
  ImprovementPoint,
  InsertImprovementPoint,
  InsertWeeklyReview,
  InsertWritingReview,
  WeeklyReview,
  WritingReview,
  improvementPoints,
  weeklyReviews,
  writingReviews,
} from "../drizzle/schema";

export async function createWritingReview(data: InsertWritingReview): Promise<WritingReview> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(writingReviews).values(data);
  const result = await db
    .select()
    .from(writingReviews)
    .where(and(eq(writingReviews.userId, data.userId as number), eq(writingReviews.date, data.date as string)))
    .orderBy(writingReviews.createdAt)
    .limit(1);
  return result[result.length - 1]!;
}

export async function getWritingReviewById(id: number, userId: number): Promise<WritingReview | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(writingReviews)
    .where(and(eq(writingReviews.id, id), eq(writingReviews.userId, userId)))
    .limit(1);
  return result[0];
}

export async function updateWritingReview(
  id: number,
  userId: number,
  data: Partial<{
    conversation: ConversationMessage[];
    emotionKeywords: string[];
    insights: string;
    improvementPoints: string[];
    tags: string[];
    status: "draft" | "chatting" | "completed";
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(writingReviews)
    .set(data)
    .where(and(eq(writingReviews.id, id), eq(writingReviews.userId, userId)));
}

export async function getWritingReviewsByUser(userId: number): Promise<WritingReview[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(writingReviews)
    .where(eq(writingReviews.userId, userId))
    .orderBy(writingReviews.createdAt);
}

// ─── Phase 2: Improvement Points ─────────────────────────────────────────────

export async function createImprovementPoint(data: InsertImprovementPoint): Promise<ImprovementPoint> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(improvementPoints).values(data);
  const result = await db
    .select()
    .from(improvementPoints)
    .where(eq(improvementPoints.userId, data.userId as number))
    .orderBy(improvementPoints.createdAt);
  return result[result.length - 1]!;
}

export async function getImprovementPointsByUser(
  userId: number,
  status?: "pending" | "experimenting" | "completed" | "dropped"
): Promise<ImprovementPoint[]> {
  const db = await getDb();
  if (!db) return [];
  if (status) {
    return db
      .select()
      .from(improvementPoints)
      .where(and(eq(improvementPoints.userId, userId), eq(improvementPoints.status, status)))
      .orderBy(improvementPoints.createdAt);
  }
  return db
    .select()
    .from(improvementPoints)
    .where(eq(improvementPoints.userId, userId))
    .orderBy(improvementPoints.createdAt);
}

export async function updateImprovementPointStatus(
  id: number,
  userId: number,
  status: "pending" | "experimenting" | "completed" | "dropped"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(improvementPoints)
    .set({ status })
    .where(and(eq(improvementPoints.id, id), eq(improvementPoints.userId, userId)));
}

export async function updateImprovementPointNotes(
  id: number,
  userId: number,
  experimentNotes: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(improvementPoints)
    .set({ experimentNotes })
    .where(and(eq(improvementPoints.id, id), eq(improvementPoints.userId, userId)));
}

export async function toggleCurrentExperiment(
  id: number,
  userId: number,
  isCurrentExperiment: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(improvementPoints)
    .set({ isCurrentExperiment })
    .where(and(eq(improvementPoints.id, id), eq(improvementPoints.userId, userId)));
}

export async function getPendingImprovementPoints(userId: number, limit = 3): Promise<ImprovementPoint[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(improvementPoints)
    .where(and(eq(improvementPoints.userId, userId), eq(improvementPoints.status, "pending")))
    .orderBy(improvementPoints.createdAt)
    .limit(limit);
}

// ─── Phase 2: Weekly Reviews ──────────────────────────────────────────────────

export async function upsertWeeklyReview(data: InsertWeeklyReview): Promise<WeeklyReview> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const existing = await db
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, data.userId as number), eq(weeklyReviews.weekStart, data.weekStart as string)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(weeklyReviews)
      .set({
        energyAvg: data.energyAvg,
        energyLowDay: data.energyLowDay,
        energyHighDay: data.energyHighDay,
        habitSummary: data.habitSummary,
        drainKeywords: data.drainKeywords,
        chargeKeywords: data.chargeKeywords,
        aiAnalysis: data.aiAnalysis,
        nextWeekMode: data.nextWeekMode,
        suggestions: data.suggestions,
        notes: data.notes,
      })
      .where(eq(weeklyReviews.id, existing[0].id));
    const updated = await db.select().from(weeklyReviews).where(eq(weeklyReviews.id, existing[0].id)).limit(1);
    return updated[0]!;
  } else {
    await db.insert(weeklyReviews).values(data);
    const created = await db
      .select()
      .from(weeklyReviews)
      .where(and(eq(weeklyReviews.userId, data.userId as number), eq(weeklyReviews.weekStart, data.weekStart as string)))
      .limit(1);
    return created[0]!;
  }
}

export async function getWeeklyReviewByWeek(userId: number, weekStart: string): Promise<WeeklyReview | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, userId), eq(weeklyReviews.weekStart, weekStart)))
    .limit(1);
  return result[0];
}

export async function getWeeklyReviewsByUser(userId: number): Promise<WeeklyReview[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, userId))
    .orderBy(weeklyReviews.weekStart);
}

export async function getLatestWeeklyReview(userId: number): Promise<WeeklyReview | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, userId))
    .orderBy(weeklyReviews.weekStart)
    .limit(1);
  // Return last item (most recent)
  return result[result.length - 1];
}

// ─── Weekly Data Aggregation (for AI analysis) ────────────────────────────────

export async function aggregateWeeklyData(
  userId: number,
  weekStart: string,
  weekEnd: string
): Promise<{
  entries: DailyEntry[];
  habitSummary: HabitSummaryData[];
  drainKeywords: string[];
  chargeKeywords: string[];
  energyAvg: number | null;
  energyLowDay: string | null;
  energyHighDay: string | null;
  energyGradeDist: { grade: string; count: number; energy: number }[];
}> {
  const entries = await getDailyEntriesRange(userId, weekStart, weekEnd);
  const habitSummaryRaw = await getWeeklyHabitSummary(userId, weekStart, weekEnd);

  const habitSummary: HabitSummaryData[] = habitSummaryRaw.map((h) => ({
    slot: h.slot,
    name: h.name,
    done: h.done,
    total: h.total,
  }));

  // Collect drain/charge keywords
  const drainRaw: string[] = [];
  const chargeRaw: string[] = [];
  for (const e of entries) {
    if (e.drain) drainRaw.push(...e.drain.split(/[,，、\s]+/).filter(Boolean));
    if (e.charge) chargeRaw.push(...e.charge.split(/[,，、\s]+/).filter(Boolean));
  }

  // Frequency count
  const countKeywords = (arr: string[]): string[] => {
    const freq: Record<string, number> = {};
    for (const k of arr) {
      const key = k.trim().toLowerCase();
      if (key) freq[key] = (freq[key] ?? 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k);
  };

  const energyEntries = entries.filter((e) => e.energy != null);
  const energyAvg =
    energyEntries.length > 0
      ? energyEntries.reduce((s, e) => s + (e.energy ?? 0), 0) / energyEntries.length
      : null;

  let energyLowDay: string | null = null;
  let energyHighDay: string | null = null;
  if (energyEntries.length > 0) {
    const sorted = [...energyEntries].sort((a, b) => (a.energy ?? 0) - (b.energy ?? 0));
    energyLowDay = sorted[0]?.date ?? null;
    energyHighDay = sorted[sorted.length - 1]?.date ?? null;
  }

  // 에너지 등급 분포 집계 (삼성헬스 4단계 매핑)
  const gradeOrder = ["매우 좋음", "좋음", "보통", "관심 필요"];
  const gradeEnergyMap: Record<string, number> = {
    "매우 좋음": 5,
    "좋음": 4,
    "보통": 3,
    "관심 필요": 2,
  };
  const energyGradeCount: Record<string, number> = {
    "매우 좋음": 0,
    "좋음": 0,
    "보통": 0,
    "관심 필요": 0,
  };
  for (const e of energyEntries) {
    const en = e.energy ?? 0;
    if (en >= 5) energyGradeCount["매우 좋음"]++;
    else if (en === 4) energyGradeCount["좋음"]++;
    else if (en === 3) energyGradeCount["보통"]++;
    else energyGradeCount["관심 필요"]++;
  }
  const energyGradeDist = gradeOrder.map((grade) => ({
    grade,
    count: energyGradeCount[grade] ?? 0,
    energy: gradeEnergyMap[grade] ?? 0,
  }));

  return {
    entries,
    habitSummary,
    drainKeywords: countKeywords(drainRaw),
    chargeKeywords: countKeywords(chargeRaw),
    energyAvg,
    energyLowDay,
    energyHighDay,
    energyGradeDist,
  };
}

// ─── User Context (encrypted key-value store) ─────────────────────────────────

/**
 * Upsert an encrypted key-value pair for a user.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE to handle the (userId, key) unique constraint.
 */
export async function upsertUserContext(
  userId: number,
  key: string,
  payload: EncryptedPayload
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(userContext)
    .values({
      userId,
      key,
      encryptedValue: payload.encryptedValue,
      iv: payload.iv,
      authTag: payload.authTag,
    })
    .onDuplicateKeyUpdate({
      set: {
        encryptedValue: payload.encryptedValue,
        iv: payload.iv,
        authTag: payload.authTag,
      },
    });
}

/**
 * Retrieve an encrypted payload for a given (userId, key).
 * Returns null when no row exists.
 */
export async function getUserContext(
  userId: number,
  key: string
): Promise<EncryptedPayload | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(userContext)
    .where(and(eq(userContext.userId, userId), eq(userContext.key, key)))
    .limit(1);

  if (!rows.length) return null;
  const row = rows[0]!;
  return {
    encryptedValue: row.encryptedValue,
    iv: row.iv,
    authTag: row.authTag,
  };
}

/**
 * Delete a user context entry (e.g. when user disconnects GitHub).
 */
export async function deleteUserContext(userId: number, key: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(userContext)
    .where(and(eq(userContext.userId, userId), eq(userContext.key, key)));
}
