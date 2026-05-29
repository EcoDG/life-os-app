/**
 * POST /api/health/sync
 *
 * 웨어러블 기기(Garmin, Apple Watch, Oura 등)에서 건강 데이터를 수신하여
 * 해당 날짜의 daily_entry에 저장하고, sleep_score 기반으로 에너지와 수면 품질을 자동 계산합니다.
 *
 * 인증: 기존 세션 쿠키(JWT) 방식 동일 사용
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { dailyEntries } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

// ─── 요청 바디 스키마 ─────────────────────────────────────────────────────────

const SAMSUNG_GRADES = ["매우 좋음", "좋음", "보통", "관심 필요"] as const;
export type SamsungGradeValue = typeof SAMSUNG_GRADES[number];

const HealthSyncBodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD format"),
  sleep_duration: z.number().int().min(0).max(1440).optional(), // 분 단위 (0~24h)
  sleep_score: z.number().int().min(0).max(100).optional(),
  hrv: z.number().int().min(0).max(300).optional(),
  resting_heart_rate: z.number().int().min(20).max(250).optional(),
  // 삼성헬스 등급 직접 전달 (숫자 변환 없이 정확한 등급 사용)
  energy_grade: z.enum(["매우 좋음", "좋음", "보통", "관심 필요"]).optional(),
  sleep_grade: z.enum(["매우 좋음", "좋음", "보통", "관심 필요"]).optional(),
});

export type HealthSyncBody = z.infer<typeof HealthSyncBodySchema>;

// ─── 계산 로직 ────────────────────────────────────────────────────────────────

/**
 * sleep_score(0~100) → energy(1~5)
 * 85이상→5, 70-84→4, 55-69→3, 40-54→2, 40미만→1
 */
export function sleepScoreToEnergy(score: number): number {
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 55) return 3;
  if (score >= 40) return 2;
  return 1;
}

/**
 * sleep_score(0~100) → sleepQuality("good" | "ok" | "bad")
 * 70이상→good, 50-69→ok, 50미만→bad
 */
export function sleepScoreToQuality(score: number): "good" | "ok" | "bad" {
  if (score >= 70) return "good";
  if (score >= 50) return "ok";
  return "bad";
}

/**
 * energy(1~5) → todoMode("stretch" | "normal" | "survival")
 * 4이상→stretch, 3→normal, 1-2→survival
 * (클라이언트 lib/energy.ts의 energyToMode와 동일한 로직)
 */
export function energyToMode(energy: number): "stretch" | "normal" | "survival" {
  if (energy >= 4) return "stretch";
  if (energy === 3) return "normal";
  return "survival";
}

// ─── Express 라우터 등록 ──────────────────────────────────────────────────────

export function registerHealthSyncRoute(app: Express): void {
  app.post("/api/health/sync", async (req: Request, res: Response) => {
    // 1. 인증
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized", message: "Valid session cookie required" });
      return;
    }

    // 2. 요청 바디 검증
    const parseResult = HealthSyncBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "Bad Request",
        message: "Invalid request body",
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const body = parseResult.data;

    // 3. sleep_score 기반 자동 계산
    let autoEnergy: number | undefined;
    let autoSleepQuality: "good" | "ok" | "bad" | undefined;
    let autoMode: "stretch" | "normal" | "survival" | undefined;

    // energy_grade 직접 전달 시 우선 사용 (sleep_score 변환보다 정확)
    if (body.energy_grade !== undefined) {
      const gradeEnergyMap: Record<SamsungGradeValue, number> = {
        "매우 좋음": 5,
        "좋음": 4,
        "보통": 3,
        "관심 필요": 2,
      };
      autoEnergy = gradeEnergyMap[body.energy_grade];
      autoMode = energyToMode(autoEnergy);
    } else if (body.sleep_score !== undefined) {
      autoEnergy = sleepScoreToEnergy(body.sleep_score);
      autoMode = energyToMode(autoEnergy);
    }

    // sleep_grade 직접 전달 시 우선 사용
    if (body.sleep_grade !== undefined) {
      const gradeSleepMap: Record<SamsungGradeValue, "good" | "ok" | "bad"> = {
        "매우 좋음": "good",
        "좋음": "good",
        "보통": "ok",
        "관심 필요": "bad",
      };
      autoSleepQuality = gradeSleepMap[body.sleep_grade];
    } else if (body.sleep_score !== undefined) {
      autoSleepQuality = sleepScoreToQuality(body.sleep_score);
    }

    // 4. DB upsert
    try {
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Service Unavailable", message: "Database not available" });
        return;
      }

      // 기존 daily_entry 조회
      const existing = await db
        .select()
        .from(dailyEntries)
        .where(and(eq(dailyEntries.userId, user.id), eq(dailyEntries.date, body.date)))
        .limit(1);

      const now = new Date();

      if (existing.length > 0) {
        // 기존 레코드 업데이트: 건강 데이터 + 자동 계산값 (기존 수동 입력값 덮어쓰기)
        await db
          .update(dailyEntries)
          .set({
            ...(body.sleep_duration !== undefined && { sleepDuration: body.sleep_duration }),
            ...(body.sleep_score !== undefined && { sleepScore: body.sleep_score }),
            ...(body.hrv !== undefined && { hrv: body.hrv }),
            ...(body.resting_heart_rate !== undefined && { restingHeartRate: body.resting_heart_rate }),
            ...(autoEnergy !== undefined && { energy: autoEnergy }),
            ...(autoSleepQuality !== undefined && { sleep: autoSleepQuality }),
            ...(autoMode !== undefined && { todoMode: autoMode }),
            ...(body.energy_grade !== undefined && { energyGrade: body.energy_grade }),
            ...(body.sleep_grade !== undefined && { sleepGrade: body.sleep_grade }),
            healthSyncedAt: now,
            updatedAt: now,
          })
          .where(and(eq(dailyEntries.userId, user.id), eq(dailyEntries.date, body.date)));
      } else {
        // 신규 레코드 생성
        await db.insert(dailyEntries).values({
          userId: user.id,
          date: body.date,
          ...(body.sleep_duration !== undefined && { sleepDuration: body.sleep_duration }),
          ...(body.sleep_score !== undefined && { sleepScore: body.sleep_score }),
          ...(body.hrv !== undefined && { hrv: body.hrv }),
          ...(body.resting_heart_rate !== undefined && { restingHeartRate: body.resting_heart_rate }),
          ...(autoEnergy !== undefined && { energy: autoEnergy }),
          ...(autoSleepQuality !== undefined && { sleep: autoSleepQuality }),
          ...(autoMode !== undefined && { todoMode: autoMode }),
          ...(body.energy_grade !== undefined && { energyGrade: body.energy_grade }),
          ...(body.sleep_grade !== undefined && { sleepGrade: body.sleep_grade }),
          healthSyncedAt: now,
        });
      }

      // 5. 응답
      res.status(200).json({
        success: true,
        date: body.date,
        synced: {
          sleep_duration: body.sleep_duration ?? null,
          sleep_score: body.sleep_score ?? null,
          hrv: body.hrv ?? null,
          resting_heart_rate: body.resting_heart_rate ?? null,
          energy_grade: body.energy_grade ?? null,
          sleep_grade: body.sleep_grade ?? null,
        },
        calculated: {
          energy: autoEnergy ?? null,
          sleep_quality: autoSleepQuality ?? null,
          todo_mode: autoMode ?? null,
        },
      });
    } catch (error) {
      console.error("[HealthSync] DB error:", error);
      res.status(500).json({ error: "Internal Server Error", message: "Failed to save health data" });
    }
  });
}
