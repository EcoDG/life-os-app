import { describe, expect, it } from "vitest";
import { buildObsidianMarkdown } from "./routers";

// ─── buildObsidianMarkdown 단위 테스트 ─────────────────────────────────────────

describe("buildObsidianMarkdown", () => {
  const baseParams = {
    date: "2026-05-26",
    entry: {
      energy: 4,
      sleep: "good",
      todoMode: "stretch",
      drain: "반복 수정",
      charge: "산책",
      notes: null,
    },
    todos: [
      { content: "PRD 작성", done: true, sortOrder: 1 },
      { content: "코드 리뷰", done: false, sortOrder: 2 },
    ],
    habits: [
      { slot: "A", name: "아침 루틴" },
      { slot: "B", name: "독서 30분" },
      { slot: "C", name: "운동" },
    ],
    habitLogs: [
      { habitId: 1, done: true },
      { habitId: 2, done: false },
      { habitId: 3, done: true },
    ],
    habitMap: new Map<number, string>([[1, "A"], [2, "B"], [3, "C"]]),
  };

  it("YAML frontmatter가 올바르게 생성된다", () => {
    const md = buildObsidianMarkdown(baseParams);
    expect(md).toContain("---");
    expect(md).toContain("date: 2026-05-26");
    expect(md).toContain("energy: 4");
    expect(md).toContain("sleep: good");
    expect(md).toContain("todo_mode: stretch");
    expect(md).toContain("tags: [daily]");
  });

  it("헤더에 날짜와 에너지 점수가 포함된다", () => {
    const md = buildObsidianMarkdown(baseParams);
    expect(md).toContain("# 2026-05-26");
    expect(md).toContain("Energy 4/5");
  });

  it("Today's Focus 섹션에 todo 항목이 포함된다", () => {
    const md = buildObsidianMarkdown(baseParams);
    expect(md).toContain("## 📋 Today's Focus");
    expect(md).toContain("[x] 1. PRD 작성");
    expect(md).toContain("[ ] 2. 코드 리뷰");
  });

  it("Habits 섹션에 완료 여부가 반영된다", () => {
    const md = buildObsidianMarkdown(baseParams);
    expect(md).toContain("## ✅ Habits");
    expect(md).toContain("[x] **A**: 아침 루틴");
    expect(md).toContain("[ ] **B**: 독서 30분");
    expect(md).toContain("[x] **C**: 운동");
  });

  it("Drain / Charge 섹션이 포함된다", () => {
    const md = buildObsidianMarkdown(baseParams);
    expect(md).toContain("## ⚡ Drain / Charge");
    expect(md).toContain("Drain: 반복 수정");
    expect(md).toContain("Charge: 산책");
  });

  it("Writing Review가 있으면 해당 섹션이 포함된다", () => {
    const md = buildObsidianMarkdown({
      ...baseParams,
      writingReview: {
        emotionKeywords: ["불안", "성취감"],
        insights: "작은 성공이 에너지를 만든다",
        improvementPoints: ["아침 루틴 고정하기"],
        tags: ["에너지관리", "루틴"],
      },
    });
    expect(md).toContain("## ✍️ Writing Review");
    expect(md).toContain("불안, 성취감");
    expect(md).toContain("작은 성공이 에너지를 만든다");
    expect(md).toContain("- [ ] 아침 루틴 고정하기");
    expect(md).toContain("#에너지관리");
    // freewriting 없으면 프리라이팅 섹션 없음
    expect(md).not.toContain("### 프리라이팅");
  });

  it("Writing Review에 freewriting이 있으면 프리라이팅 섹션이 포함된다", () => {
    const md = buildObsidianMarkdown({
      ...baseParams,
      writingReview: {
        freewriting: "오늘 하루가 너무 힘들었다. 회의가 많았고 집중이 안 됐다.",
        emotionKeywords: ["피로", "분산"],
        insights: "집중 시간 블록이 필요하다",
        improvementPoints: ["포모도로 기법 실험"],
        tags: ["집중력"],
      },
    });
    expect(md).toContain("## ✍️ Writing Review");
    expect(md).toContain("### 프리라이팅");
    expect(md).toContain("오늘 하루가 너무 힘들었다");
    expect(md).toContain("### Review Summary");
    expect(md).toContain("피로, 분산");
    // 프리라이팅 섹션이 Review Summary 앞에 위치해야 함
    const freewIdx = md.indexOf("### 프리라이팅");
    const summaryIdx = md.indexOf("### Review Summary");
    expect(freewIdx).toBeLessThan(summaryIdx);
  });

  it("Writing Review에 freewriting이 null이면 프리라이팅 섹션이 생략된다", () => {
    const md = buildObsidianMarkdown({
      ...baseParams,
      writingReview: {
        freewriting: null,
        emotionKeywords: ["평온"],
        insights: "오늘은 좋은 하루였다",
        improvementPoints: [],
        tags: [],
      },
    });
    expect(md).toContain("## ✍️ Writing Review");
    expect(md).not.toContain("### 프리라이팅");
    expect(md).toContain("### Review Summary");
  });

  it("Writing Review가 없으면 해당 섹션이 없다", () => {
    const md = buildObsidianMarkdown(baseParams);
    expect(md).not.toContain("## ✍️ Writing Review");
  });

  it("entry가 null이어도 오류 없이 생성된다", () => {
    const md = buildObsidianMarkdown({
      ...baseParams,
      entry: null,
    });
    expect(md).toContain("date: 2026-05-26");
    expect(md).toContain("energy: 0");
    expect(md).toContain("Drain: (없음)");
    expect(md).toContain("Charge: (없음)");
  });

  it("todo가 없으면 '기록 없음'이 표시된다", () => {
    const md = buildObsidianMarkdown({ ...baseParams, todos: [] });
    expect(md).toContain("(기록 없음)");
  });

  it("todo는 sortOrder 순서로 정렬된다", () => {
    const md = buildObsidianMarkdown({
      ...baseParams,
      todos: [
        { content: "나중 작업", done: false, sortOrder: 3 },
        { content: "첫 번째 작업", done: false, sortOrder: 1 },
        { content: "두 번째 작업", done: false, sortOrder: 2 },
      ],
    });
    const firstIdx = md.indexOf("첫 번째 작업");
    const secondIdx = md.indexOf("두 번째 작업");
    const thirdIdx = md.indexOf("나중 작업");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("요일 레이블이 올바르게 포함된다 (2026-05-26은 화요일)", () => {
    const md = buildObsidianMarkdown(baseParams);
    expect(md).toContain("(화)");
  });
});
