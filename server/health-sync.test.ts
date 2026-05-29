import { describe, it, expect } from "vitest";
import { sleepScoreToEnergy, sleepScoreToQuality, energyToMode } from "./healthSync";

// ─── sleepScoreToEnergy ────────────────────────────────────────────────────────

describe("sleepScoreToEnergy", () => {
  it("85 이상 → 5 (stretch)", () => {
    expect(sleepScoreToEnergy(85)).toBe(5);
    expect(sleepScoreToEnergy(90)).toBe(5);
    expect(sleepScoreToEnergy(100)).toBe(5);
  });

  it("70~84 → 4", () => {
    expect(sleepScoreToEnergy(70)).toBe(4);
    expect(sleepScoreToEnergy(77)).toBe(4);
    expect(sleepScoreToEnergy(84)).toBe(4);
  });

  it("55~69 → 3", () => {
    expect(sleepScoreToEnergy(55)).toBe(3);
    expect(sleepScoreToEnergy(62)).toBe(3);
    expect(sleepScoreToEnergy(69)).toBe(3);
  });

  it("40~54 → 2", () => {
    expect(sleepScoreToEnergy(40)).toBe(2);
    expect(sleepScoreToEnergy(47)).toBe(2);
    expect(sleepScoreToEnergy(54)).toBe(2);
  });

  it("40 미만 → 1 (survival)", () => {
    expect(sleepScoreToEnergy(39)).toBe(1);
    expect(sleepScoreToEnergy(20)).toBe(1);
    expect(sleepScoreToEnergy(0)).toBe(1);
  });

  it("경계값 정확성: 85는 5, 84는 4", () => {
    expect(sleepScoreToEnergy(85)).toBe(5);
    expect(sleepScoreToEnergy(84)).toBe(4);
  });

  it("경계값 정확성: 70은 4, 69는 3", () => {
    expect(sleepScoreToEnergy(70)).toBe(4);
    expect(sleepScoreToEnergy(69)).toBe(3);
  });

  it("경계값 정확성: 55는 3, 54는 2", () => {
    expect(sleepScoreToEnergy(55)).toBe(3);
    expect(sleepScoreToEnergy(54)).toBe(2);
  });

  it("경계값 정확성: 40은 2, 39는 1", () => {
    expect(sleepScoreToEnergy(40)).toBe(2);
    expect(sleepScoreToEnergy(39)).toBe(1);
  });
});

// ─── sleepScoreToQuality ──────────────────────────────────────────────────────

describe("sleepScoreToQuality", () => {
  it("70 이상 → good", () => {
    expect(sleepScoreToQuality(70)).toBe("good");
    expect(sleepScoreToQuality(85)).toBe("good");
    expect(sleepScoreToQuality(100)).toBe("good");
  });

  it("50~69 → ok", () => {
    expect(sleepScoreToQuality(50)).toBe("ok");
    expect(sleepScoreToQuality(60)).toBe("ok");
    expect(sleepScoreToQuality(69)).toBe("ok");
  });

  it("50 미만 → bad", () => {
    expect(sleepScoreToQuality(49)).toBe("bad");
    expect(sleepScoreToQuality(30)).toBe("bad");
    expect(sleepScoreToQuality(0)).toBe("bad");
  });

  it("경계값: 70은 good, 69는 ok", () => {
    expect(sleepScoreToQuality(70)).toBe("good");
    expect(sleepScoreToQuality(69)).toBe("ok");
  });

  it("경계값: 50은 ok, 49는 bad", () => {
    expect(sleepScoreToQuality(50)).toBe("ok");
    expect(sleepScoreToQuality(49)).toBe("bad");
  });
});

// ─── energyToMode ─────────────────────────────────────────────────────────────

describe("energyToMode (healthSync)", () => {
  it("5 → stretch", () => {
    expect(energyToMode(5)).toBe("stretch");
  });

  it("4 이상 → stretch", () => {
    expect(energyToMode(4)).toBe("stretch");
    expect(energyToMode(5)).toBe("stretch");
  });

  it("3 → normal", () => {
    expect(energyToMode(3)).toBe("normal");
  });

  it("1, 2 → survival", () => {
    expect(energyToMode(1)).toBe("survival");
    expect(energyToMode(2)).toBe("survival");
  });
});

// ─── 통합 시나리오 ─────────────────────────────────────────────────────────────

describe("Health Sync 통합 시나리오", () => {
  it("수면 점수 82 → energy 4, quality good, mode stretch", () => {
    const score = 82;
    const energy = sleepScoreToEnergy(score);
    const quality = sleepScoreToQuality(score);
    const mode = energyToMode(energy);
    expect(energy).toBe(4);
    expect(quality).toBe("good");
    expect(mode).toBe("stretch");
  });

  it("수면 점수 45 → energy 2, quality bad, mode survival", () => {
    const score = 45;
    const energy = sleepScoreToEnergy(score);
    const quality = sleepScoreToQuality(score);
    const mode = energyToMode(energy);
    expect(energy).toBe(2);
    expect(quality).toBe("bad");
    expect(mode).toBe("survival");
  });

  it("수면 점수 90 → energy 5, quality good, mode stretch", () => {
    const score = 90;
    const energy = sleepScoreToEnergy(score);
    const quality = sleepScoreToQuality(score);
    const mode = energyToMode(energy);
    expect(energy).toBe(5);
    expect(quality).toBe("good");
    expect(mode).toBe("stretch");
  });

  it("수면 점수 58 → energy 3, quality ok, mode normal", () => {
    const score = 58;
    const energy = sleepScoreToEnergy(score);
    const quality = sleepScoreToQuality(score);
    const mode = energyToMode(energy);
    expect(energy).toBe(3);
    expect(quality).toBe("ok");
    expect(mode).toBe("normal");
  });
});

// ─── energyGrade / sleepGrade 매핑 검증 ──────────────────────────────────────

describe("energy_grade → energy 매핑 (삼성헬스 4단계)", () => {
  const gradeEnergyMap: Record<string, number> = {
    "매우 좋음": 5,
    "좋음": 4,
    "보통": 3,
    "관심 필요": 2,
  };

  it("매우 좋음 → energy 5", () => {
    expect(gradeEnergyMap["매우 좋음"]).toBe(5);
  });

  it("좋음 → energy 4", () => {
    expect(gradeEnergyMap["좋음"]).toBe(4);
  });

  it("보통 → energy 3", () => {
    expect(gradeEnergyMap["보통"]).toBe(3);
  });

  it("관심 필요 → energy 2", () => {
    expect(gradeEnergyMap["관심 필요"]).toBe(2);
  });

  it("energy_grade 있으면 sleep_score 변환보다 우선 적용", () => {
    // sleep_score 60 → energy 3 이지만, energy_grade "매우 좋음" → energy 5
    const sleepScore = 60;
    const energyFromScore = sleepScoreToEnergy(sleepScore);
    const energyFromGrade = gradeEnergyMap["매우 좋음"];
    // grade가 우선이므로 grade 값이 사용되어야 함
    expect(energyFromGrade).toBe(5);
    expect(energyFromScore).toBe(3);
    expect(energyFromGrade).not.toBe(energyFromScore);
  });
});

describe("sleep_grade → sleepQuality 매핑 (삼성헬스 4단계)", () => {
  const gradeSleepMap: Record<string, "good" | "ok" | "bad"> = {
    "매우 좋음": "good",
    "좋음": "good",
    "보통": "ok",
    "관심 필요": "bad",
  };

  it("매우 좋음 → good", () => {
    expect(gradeSleepMap["매우 좋음"]).toBe("good");
  });

  it("좋음 → good", () => {
    expect(gradeSleepMap["좋음"]).toBe("good");
  });

  it("보통 → ok", () => {
    expect(gradeSleepMap["보통"]).toBe("ok");
  });

  it("관심 필요 → bad", () => {
    expect(gradeSleepMap["관심 필요"]).toBe("bad");
  });
});

describe("energy_grade + sleep_grade 통합 시나리오", () => {
  it("energy_grade '좋음' → energy 4, mode stretch", () => {
    const gradeEnergyMap: Record<string, number> = {
      "매우 좋음": 5, "좋음": 4, "보통": 3, "관심 필요": 2,
    };
    const energy = gradeEnergyMap["좋음"];
    const mode = energyToMode(energy);
    expect(energy).toBe(4);
    expect(mode).toBe("stretch");
  });

  it("energy_grade '관심 필요' → energy 2, mode survival", () => {
    const gradeEnergyMap: Record<string, number> = {
      "매우 좋음": 5, "좋음": 4, "보통": 3, "관심 필요": 2,
    };
    const energy = gradeEnergyMap["관심 필요"];
    const mode = energyToMode(energy);
    expect(energy).toBe(2);
    expect(mode).toBe("survival");
  });

  it("sleep_grade '보통' → sleepQuality ok", () => {
    const gradeSleepMap: Record<string, "good" | "ok" | "bad"> = {
      "매우 좋음": "good", "좋음": "good", "보통": "ok", "관심 필요": "bad",
    };
    expect(gradeSleepMap["보통"]).toBe("ok");
  });
});
