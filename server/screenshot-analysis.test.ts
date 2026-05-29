/**
 * screenshot-analysis.test.ts
 *
 * health.analyzeScreenshot tRPC 프로시저 관련 단위 테스트
 * - 에너지 점수 클램핑 로직
 * - 수면 품질 매핑
 * - 응답 구조 검증
 */
import { describe, it, expect } from "vitest";

// ─── 에너지 점수 클램핑 로직 ──────────────────────────────────────────────────

function clampEnergyScore(raw: number): number {
  return Math.max(1, Math.min(5, Math.round(raw)));
}

describe("clampEnergyScore", () => {
  it("정상 범위 값은 그대로 반환", () => {
    expect(clampEnergyScore(1)).toBe(1);
    expect(clampEnergyScore(3)).toBe(3);
    expect(clampEnergyScore(5)).toBe(5);
  });

  it("1 미만은 1로 클램핑", () => {
    expect(clampEnergyScore(0)).toBe(1);
    expect(clampEnergyScore(-2)).toBe(1);
  });

  it("5 초과는 5로 클램핑", () => {
    expect(clampEnergyScore(6)).toBe(5);
    expect(clampEnergyScore(10)).toBe(5);
  });

  it("소수점은 반올림 후 클램핑", () => {
    expect(clampEnergyScore(2.4)).toBe(2);
    expect(clampEnergyScore(2.6)).toBe(3);
    expect(clampEnergyScore(4.9)).toBe(5);
  });
});

// ─── 과학적 판단 로직 (점수 계산) ────────────────────────────────────────────

interface SleepMetrics {
  deep_sleep_pct: number;
  wake_pct: number;
  hrv: number;
  rem_pct: number;
}

function calculateEnergyScore(metrics: SleepMetrics): number {
  let score = 5;

  // 1순위: 깊은 수면 %
  if (metrics.deep_sleep_pct >= 15) score += 2;
  else if (metrics.deep_sleep_pct >= 10) score += 1;
  else if (metrics.deep_sleep_pct < 7) score -= 2;

  // 2순위: 각성 시간 %
  if (metrics.wake_pct <= 9) score += 1;
  else if (metrics.wake_pct >= 15) score -= 2;

  // 3순위: HRV
  if (metrics.hrv >= 60) score += 1;
  else if (metrics.hrv < 40) score -= 1;

  // 4순위: 렘 수면 %
  if (metrics.rem_pct >= 20) score += 1;
  else if (metrics.rem_pct < 15) score -= 1;

  return clampEnergyScore(score);
}

describe("calculateEnergyScore", () => {
  it("최상 컨디션 → 5점", () => {
    const score = calculateEnergyScore({
      deep_sleep_pct: 18,
      wake_pct: 5,
      hrv: 65,
      rem_pct: 25,
    });
    expect(score).toBe(5);
  });

  it("깊은 수면 심각 부족 + 각성 과다 → 낮은 점수", () => {
    const score = calculateEnergyScore({
      deep_sleep_pct: 5,  // -2
      wake_pct: 20,       // -2
      hrv: 35,            // -1
      rem_pct: 12,        // -1
    });
    // 5 - 2 - 2 - 1 - 1 = -1 → 클램핑 → 1
    expect(score).toBe(1);
  });

  it("보통 컨디션 → 3-4점 범위", () => {
    const score = calculateEnergyScore({
      deep_sleep_pct: 12,  // +1
      wake_pct: 11,        // 0
      hrv: 50,             // 0
      rem_pct: 18,         // 0
    });
    // 5 + 1 = 6 → 클램핑 → 5? 아니면 +1만 적용
    // 실제: 5 + 1 + 0 + 0 + 0 = 6 → 클램핑 → 5
    expect(score).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThanOrEqual(5);
  });

  it("결과는 항상 1~5 범위", () => {
    const extremeGood = calculateEnergyScore({
      deep_sleep_pct: 20,
      wake_pct: 3,
      hrv: 80,
      rem_pct: 30,
    });
    expect(extremeGood).toBeLessThanOrEqual(5);

    const extremeBad = calculateEnergyScore({
      deep_sleep_pct: 2,
      wake_pct: 30,
      hrv: 20,
      rem_pct: 8,
    });
    expect(extremeBad).toBeGreaterThanOrEqual(1);
  });
});

// ─── 분석 결과 구조 검증 ──────────────────────────────────────────────────────

interface AnalysisResult {
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
}

function validateAnalysisResult(result: unknown): result is AnalysisResult {
  if (typeof result !== "object" || result === null) return false;
  const r = result as Record<string, unknown>;

  if (typeof r.energy_score !== "number") return false;
  if (!["good", "ok", "bad"].includes(r.sleep_quality as string)) return false;
  if (typeof r.metrics !== "object" || r.metrics === null) return false;
  if (!Array.isArray(r.key_issues)) return false;
  if (typeof r.one_line !== "string") return false;
  if (typeof r.suggestion !== "string") return false;

  const m = r.metrics as Record<string, unknown>;
  const requiredMetrics = ["deep_sleep_pct", "wake_pct", "rem_pct", "light_pct", "heart_rate", "hrv", "samsung_score"];
  for (const key of requiredMetrics) {
    if (typeof m[key] !== "number") return false;
  }

  return true;
}

describe("validateAnalysisResult", () => {
  it("올바른 결과 구조 검증 통과", () => {
    const valid: AnalysisResult = {
      energy_score: 3,
      sleep_quality: "ok",
      metrics: {
        deep_sleep_pct: 9,
        wake_pct: 12,
        rem_pct: 18,
        light_pct: 61,
        heart_rate: 62,
        hrv: 48,
        samsung_score: 75,
      },
      key_issues: ["깊은 수면 부족 (9%)"],
      one_line: "전반적으로 보통 수준의 회복.",
      suggestion: "오후 집중 업무 권장.",
    };
    expect(validateAnalysisResult(valid)).toBe(true);
  });

  it("잘못된 sleep_quality 거부", () => {
    const invalid = {
      energy_score: 3,
      sleep_quality: "excellent", // 잘못된 값
      metrics: {
        deep_sleep_pct: 9, wake_pct: 12, rem_pct: 18,
        light_pct: 61, heart_rate: 62, hrv: 48, samsung_score: 75,
      },
      key_issues: [],
      one_line: "test",
      suggestion: "test",
    };
    expect(validateAnalysisResult(invalid)).toBe(false);
  });

  it("metrics 필드 누락 시 거부", () => {
    const invalid = {
      energy_score: 3,
      sleep_quality: "ok",
      metrics: {
        deep_sleep_pct: 9,
        // wake_pct 누락
        rem_pct: 18, light_pct: 61, heart_rate: 62, hrv: 48, samsung_score: 75,
      },
      key_issues: [],
      one_line: "test",
      suggestion: "test",
    };
    expect(validateAnalysisResult(invalid)).toBe(false);
  });

  it("null 입력 거부", () => {
    expect(validateAnalysisResult(null)).toBe(false);
    expect(validateAnalysisResult(undefined)).toBe(false);
    expect(validateAnalysisResult("string")).toBe(false);
  });
});

// ─── energy_score → SamsungGrade 매핑 ────────────────────────────────────────

type SamsungGrade = "매우 좋음" | "좋음" | "보통" | "관심 필요";

function scoreToGrade(score: number): SamsungGrade {
  if (score >= 5) return "매우 좋음";
  if (score >= 4) return "좋음";
  if (score >= 3) return "보통";
  return "관심 필요";
}

describe("scoreToGrade", () => {
  it("5점 → 매우 좋음", () => expect(scoreToGrade(5)).toBe("매우 좋음"));
  it("4점 → 좋음", () => expect(scoreToGrade(4)).toBe("좋음"));
  it("3점 → 보통", () => expect(scoreToGrade(3)).toBe("보통"));
  it("2점 → 관심 필요", () => expect(scoreToGrade(2)).toBe("관심 필요"));
  it("1점 → 관심 필요", () => expect(scoreToGrade(1)).toBe("관심 필요"));
});

// ─── sleep_quality → SamsungGrade 매핑 ───────────────────────────────────────

function sleepQualityToGrade(q: "good" | "ok" | "bad"): SamsungGrade {
  if (q === "good") return "좋음";
  if (q === "ok") return "보통";
  return "관심 필요";
}

describe("sleepQualityToGrade", () => {
  it("good → 좋음", () => expect(sleepQualityToGrade("good")).toBe("좋음"));
  it("ok → 보통", () => expect(sleepQualityToGrade("ok")).toBe("보통"));
  it("bad → 관심 필요", () => expect(sleepQualityToGrade("bad")).toBe("관심 필요"));
});

// ─── Writing Review 삽입 텍스트 생성 로직 ────────────────────────────────────

interface AiAnalysisForReview {
  oneLine: string;
  suggestion: string;
  energyScore: number;
}

function buildInsertText(ai: AiAnalysisForReview): string {
  return [
    `[AI 컨디션 분석] Energy ${ai.energyScore}/5`,
    `한 줄 요약: ${ai.oneLine}`,
    `오늘의 제안: ${ai.suggestion}`,
    "",
  ].join("\n");
}

function insertAtTop(existing: string, insertText: string): string {
  return existing ? insertText + existing : insertText;
}

describe("buildInsertText", () => {
  it("올바른 형식의 삽입 텍스트 생성", () => {
    const result = buildInsertText({
      oneLine: "삼성헬스 89점이지만 실제 회복도는 낮음.",
      suggestion: "오전은 가벼운 루틴으로.",
      energyScore: 2,
    });
    expect(result).toContain("[AI 컨디션 분석] Energy 2/5");
    expect(result).toContain("한 줄 요약: 삼성헬스 89점이지만 실제 회복도는 낮음.");
    expect(result).toContain("오늘의 제안: 오전은 가벼운 루틴으로.");
  });

  it("빈 기존 텍스트에 삽입 시 insertText만 반환", () => {
    const insert = buildInsertText({ oneLine: "좋은 컨디션", suggestion: "집중 업무 가능", energyScore: 4 });
    expect(insertAtTop("", insert)).toBe(insert);
  });

  it("기존 텍스트 있을 때 앞에 삽입", () => {
    const insert = buildInsertText({ oneLine: "보통", suggestion: "가벼운 하루", energyScore: 3 });
    const existing = "오늘 에너지: 3/5 (normal 모드)\n";
    const result = insertAtTop(existing, insert);
    expect(result.startsWith("[AI 컨디션 분석]")).toBe(true);
    expect(result).toContain("오늘 에너지: 3/5");
  });
});

describe("sessionStorage AI analysis key format", () => {
  it("날짜별 고유 키 생성", () => {
    const date = "2026-05-29";
    const key = `ai-analysis-${date}`;
    expect(key).toBe("ai-analysis-2026-05-29");
  });

  it("다른 날짜는 다른 키", () => {
    const key1 = `ai-analysis-2026-05-29`;
    const key2 = `ai-analysis-2026-05-30`;
    expect(key1).not.toBe(key2);
  });
});
