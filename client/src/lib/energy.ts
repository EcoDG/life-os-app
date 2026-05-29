export type EnergyMode = "stretch" | "normal" | "survival";

export function energyToMode(energy: number): EnergyMode {
  if (energy >= 4) return "stretch";
  if (energy === 3) return "normal";
  return "survival";
}

export function energyToMaxTodos(energy: number): number {
  if (energy >= 4) return 3;
  if (energy === 3) return 2;
  return 1;
}

export const modeConfig: Record<
  EnergyMode,
  { label: string; description: string; color: string; bgColor: string; borderColor: string }
> = {
  stretch: {
    label: "stretch",
    description: "최대 3개 목표 · 고에너지 모드",
    color: "text-[oklch(0.65_0.18_145)]",
    bgColor: "bg-[oklch(0.65_0.18_145)]/15",
    borderColor: "border-[oklch(0.65_0.18_145)]/30",
  },
  normal: {
    label: "normal",
    description: "최대 2개 목표 · 일반 모드",
    color: "text-[oklch(0.72_0.15_195)]",
    bgColor: "bg-[oklch(0.72_0.15_195)]/15",
    borderColor: "border-[oklch(0.72_0.15_195)]/30",
  },
  survival: {
    label: "survival",
    description: "최대 1개 목표 · 회복 모드",
    color: "text-[oklch(0.72_0.19_50)]",
    bgColor: "bg-[oklch(0.72_0.19_50)]/15",
    borderColor: "border-[oklch(0.72_0.19_50)]/30",
  },
};

export const energyColors: Record<number, string> = {
  1: "oklch(0.62 0.22 25)",
  2: "oklch(0.72 0.19 50)",
  3: "oklch(0.82 0.17 90)",
  4: "oklch(0.75 0.17 145)",
  5: "oklch(0.65 0.18 145)",
};

export const energyEmojis: Record<number, string> = {
  1: "🔴",
  2: "🟠",
  3: "🟡",
  4: "🟢",
  5: "💚",
};

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

export function getWeekRange(date: Date): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: formatDate(monday),
    end: formatDate(sunday),
  };
}

export function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

export const DAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"];
