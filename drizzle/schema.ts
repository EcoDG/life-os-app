import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 사용자별 습관 설정 (Slot A / B / C)
export const habits = mysqlTable("habits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slot: mysqlEnum("slot", ["A", "B", "C"]).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  targetFrequency: int("targetFrequency").default(7).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Habit = typeof habits.$inferSelect;
export type InsertHabit = typeof habits.$inferInsert;

// 일일 기록 (에너지, 수면, 모드, drain/charge)
export const dailyEntries = mysqlTable("daily_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD string
  energy: int("energy"),
  sleep: mysqlEnum("sleep", ["good", "ok", "bad"]),
  todoMode: mysqlEnum("todoMode", ["stretch", "normal", "survival"]),
  drain: text("drain"),
  charge: text("charge"),
  notes: text("notes"),
  // Health Sync: 웨어러블 데이터 (POST /api/health/sync)
  sleepDuration: int("sleepDuration"),        // 분 단위 (예: 420 = 7시간)
  sleepScore: int("sleepScore"),              // 0~100
  hrv: int("hrv"),                           // ms
  restingHeartRate: int("restingHeartRate"),  // bpm
  healthSyncedAt: timestamp("healthSyncedAt"), // 마지막 sync 시각
  // 삼성헬스 4단계 등급 (에너지: E5/E4/E3/E2, 수면: S4/S3/S2/S1)
  energyGrade: varchar("energyGrade", { length: 20 }),  // e.g. "E5", "E4", "E3", "E2"
  sleepGrade: varchar("sleepGrade", { length: 20 }),    // e.g. "S4", "S3", "S2", "S1"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DailyEntry = typeof dailyEntries.$inferSelect;
export type InsertDailyEntry = typeof dailyEntries.$inferInsert;

// 일일 할 일 (micro-todo)
export const todos = mysqlTable("todos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyEntryId: int("dailyEntryId").references(() => dailyEntries.id, {
    onDelete: "cascade",
  }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD string
  content: varchar("content", { length: 200 }).notNull(),
  done: boolean("done").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type InsertTodo = typeof todos.$inferInsert;

// 습관 로그 (날짜별 완료 여부)
export const habitLogs = mysqlTable("habit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  habitId: int("habitId")
    .notNull()
    .references(() => habits.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD string
  done: boolean("done").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HabitLog = typeof habitLogs.$inferSelect;
export type InsertHabitLog = typeof habitLogs.$inferInsert;

// ─── Phase 2: AI Integration ──────────────────────────────────────────────────

// 글쓰기 리뷰 (프리라이팅 + AI Q&A + Summary)
export type ConversationMessage = { role: "user" | "ai"; content: string };

export const writingReviews = mysqlTable("writing_reviews", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  freewriting: text("freewriting"),
  // [{role: "user"|"ai", content: "..."}]
  conversation: json("conversation").$type<ConversationMessage[]>().default([]),
  emotionKeywords: json("emotionKeywords").$type<string[]>().default([]),
  insights: text("insights"),
  improvementPoints: json("improvementPoints").$type<string[]>().default([]),
  tags: json("tags").$type<string[]>().default([]),
  // 리뷰 진행 상태: draft(프리라이팅 작성), chatting(Q&A 중), completed(완료)
  status: mysqlEnum("status", ["draft", "chatting", "completed"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WritingReview = typeof writingReviews.$inferSelect;
export type InsertWritingReview = typeof writingReviews.$inferInsert;

// 개선 포인트 (리뷰에서 추출된 실행 가능한 개선 사항)
export const improvementPoints = mysqlTable("improvement_points", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  writingReviewId: int("writingReviewId").references(() => writingReviews.id, {
    onDelete: "set null",
  }),
  content: varchar("content", { length: 500 }).notNull(),
  status: mysqlEnum("status", ["pending", "experimenting", "completed", "dropped"])
    .default("pending")
    .notNull(),
  experimentNotes: text("experimentNotes"),
  // 이번 주 실험 태그 (weekly review에서 선택)
  isCurrentExperiment: boolean("isCurrentExperiment").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImprovementPoint = typeof improvementPoints.$inferSelect;
export type InsertImprovementPoint = typeof improvementPoints.$inferInsert;

// 주간 리뷰 (AI 자동 분석 리포트)
export type HabitSummaryData = { slot: string; name: string; done: number; total: number };

export const weeklyReviews = mysqlTable("weekly_reviews", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekStart: varchar("weekStart", { length: 10 }).notNull(), // YYYY-MM-DD (Monday)
  weekEnd: varchar("weekEnd", { length: 10 }).notNull(),     // YYYY-MM-DD (Sunday)
  energyAvg: varchar("energyAvg", { length: 4 }),            // "3.5"
  energyLowDay: varchar("energyLowDay", { length: 10 }),
  energyHighDay: varchar("energyHighDay", { length: 10 }),
  habitSummary: json("habitSummary").$type<HabitSummaryData[]>().default([]),
  drainKeywords: json("drainKeywords").$type<string[]>().default([]),
  chargeKeywords: json("chargeKeywords").$type<string[]>().default([]),
  aiAnalysis: text("aiAnalysis"),
  nextWeekMode: mysqlEnum("nextWeekMode", ["recovery", "normal", "stretch"]),
  suggestions: json("suggestions").$type<string[]>().default([]),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type InsertWeeklyReview = typeof weeklyReviews.$inferInsert;

// ─── Phase 3: User Context (encrypted key-value store) ──────────────────────────────

// 암호화된 사용자별 키-밸류 저장소 (GitHub PAT 등 민감 정보)
export const userContext = mysqlTable("user_context", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // 설정 키 (e.g. "github_repo_url", "github_pat")
  key: varchar("key", { length: 100 }).notNull(),
  // AES-256-GCM 암호화된 값 (base64)
  encryptedValue: text("encryptedValue").notNull(),
  // GCM nonce (base64, 12 bytes)
  iv: varchar("iv", { length: 32 }).notNull(),
  // GCM auth tag (base64, 16 bytes)
  authTag: varchar("authTag", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserContext = typeof userContext.$inferSelect;
export type InsertUserContext = typeof userContext.$inferInsert;
