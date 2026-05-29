import { cn } from "@/lib/utils";

export type SamsungGrade = "매우 좋음" | "좋음" | "보통" | "관심 필요";

export const SAMSUNG_GRADES: SamsungGrade[] = ["매우 좋음", "좋음", "보통", "관심 필요"];

export const GRADE_ENERGY_MAP: Record<SamsungGrade, number> = {
  "매우 좋음": 5,
  "좋음": 4,
  "보통": 3,
  "관심 필요": 2,
};

export const GRADE_SLEEP_MAP: Record<SamsungGrade, "good" | "ok" | "bad"> = {
  "매우 좋음": "good",
  "좋음": "good",
  "보통": "ok",
  "관심 필요": "bad",
};

const GRADE_ENERGY_RANGES: Record<SamsungGrade, string> = {
  "매우 좋음": "85-100",
  "좋음": "75-84",
  "보통": "60-74",
  "관심 필요": "0-59",
};

const GRADE_COLORS: Record<SamsungGrade, string> = {
  "매우 좋음": "oklch(0.65 0.18 145)",
  "좋음": "oklch(0.75 0.17 145)",
  "보통": "oklch(0.82 0.17 90)",
  "관심 필요": "oklch(0.72 0.19 50)",
};

const SLEEP_COLORS: Record<"good" | "ok" | "bad", string> = {
  good: "oklch(0.72 0.15 195)",
  ok: "oklch(0.82 0.17 90)",
  bad: "oklch(0.72 0.19 50)",
};

interface EnergyGradeSelectorProps {
  value: SamsungGrade | null;
  onChange: (grade: SamsungGrade, energy: number) => void;
}

/** 에너지 등급 선택기 — 삼성헬스 4단계 + 점수 범위 + Life OS 수치 표시 */
export function EnergyGradeSelector({ value, onChange }: EnergyGradeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SAMSUNG_GRADES.map((grade) => {
        const mapped = GRADE_ENERGY_MAP[grade];
        const isSelected = value === grade;
        const color = GRADE_COLORS[grade];
        return (
          <button
            key={grade}
            type="button"
            onClick={() => onChange(grade, mapped)}
            style={
              isSelected
                ? {
                    borderColor: color,
                    backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`,
                  }
                : {}
            }
            className={cn(
              "h-16 rounded-xl text-sm font-medium transition-all duration-200 border flex flex-col items-center justify-center gap-0.5 px-2",
              isSelected
                ? "scale-[1.02] shadow-md"
                : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50 hover:bg-secondary"
            )}
          >
            <span className={cn("font-semibold text-sm", isSelected ? "text-foreground" : "")}>
              {grade}
            </span>
            <span className="text-[10px] opacity-50">({GRADE_ENERGY_RANGES[grade]})</span>
            <span
              className="text-[11px] font-mono font-bold"
              style={{ color: isSelected ? color : undefined, opacity: isSelected ? 1 : 0.5 }}
            >
              → E{mapped}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface SleepGradeSelectorProps {
  value: SamsungGrade | null;
  onChange: (grade: SamsungGrade, sleep: "good" | "ok" | "bad") => void;
}

/** 수면 등급 선택기 — 삼성헬스 4단계 + Life OS sleep 값 표시 */
export function SleepGradeSelector({ value, onChange }: SleepGradeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SAMSUNG_GRADES.map((grade) => {
        const mapped = GRADE_SLEEP_MAP[grade];
        const isSelected = value === grade;
        const color = SLEEP_COLORS[mapped];
        return (
          <button
            key={grade}
            type="button"
            onClick={() => onChange(grade, mapped)}
            style={
              isSelected
                ? {
                    borderColor: color,
                    backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`,
                  }
                : {}
            }
            className={cn(
              "h-14 rounded-xl text-sm font-medium transition-all duration-200 border flex flex-col items-center justify-center gap-0.5 px-2",
              isSelected
                ? "scale-[1.02] shadow-md"
                : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50 hover:bg-secondary"
            )}
          >
            <span className={cn("font-semibold text-sm", isSelected ? "text-foreground" : "")}>
              {grade}
            </span>
            <span
              className="text-[11px] font-mono font-bold"
              style={{ color: isSelected ? color : undefined, opacity: isSelected ? 1 : 0.5 }}
            >
              {mapped}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** energy 숫자 → 가장 가까운 SamsungGrade 역매핑 */
export function energyToGrade(energy: number): SamsungGrade {
  if (energy >= 5) return "매우 좋음";
  if (energy === 4) return "좋음";
  if (energy === 3) return "보통";
  return "관심 필요";
}

/** sleep 문자열 → SamsungGrade 역매핑 (기본값: 좋음) */
export function sleepToGrade(sleep: "good" | "ok" | "bad"): SamsungGrade {
  if (sleep === "good") return "좋음";
  if (sleep === "ok") return "보통";
  return "관심 필요";
}
