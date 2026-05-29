# Life OS — Phase 1 Core TODO

## DB & Backend
- [x] DB 스키마 설계: habits, daily_entries, todos, habit_logs 테이블
- [x] Drizzle 마이그레이션 생성 및 적용
- [x] DB 헬퍼 함수 구현 (server/db.ts)
- [x] tRPC 라우터 구현: habits CRUD
- [x] tRPC 라우터 구현: daily_entries CRUD (에너지, 수면, 모드, drain/charge)
- [x] tRPC 라우터 구현: todos CRUD (에너지 연동 개수 제한)
- [x] tRPC 라우터 구현: habit_logs CRUD
- [x] tRPC 라우터 구현: 대시보드 집계 (에너지 트렌드, 습관 히트맵)

## 글로벌 UI
- [x] 다크 모드 기본 테마 설정 (Teal/Cyan Primary, Coral Accent, Dark Gray BG)
- [x] DashboardLayout 기반 모바일 우선 네비게이션 구성
- [x] 하단 탭 네비게이션 (대시보드 / Check-in / 설정)

## 인증
- [x] 로그인 화면 (Manus OAuth)
- [x] 인증 상태에 따른 라우트 보호

## Daily Check-in 화면 (S3)
- [x] 에너지 점수 1~5 입력 UI (탭 버튼)
- [x] 수면 품질 선택 (good / ok / bad)
- [x] 에너지 기반 모드 자동 표시 (stretch / normal / survival)
- [x] 에너지 연동 micro-todo 입력 (5점→3개, 3점→2개, 1~2점→1개)
- [x] 저녁 습관 체크 (Slot A / Slot B / Slot C 완료 여부)
- [x] Drain / Charge 키워드 입력
- [x] 저장 기능 (당일 기록 upsert)

## 대시보드 화면 (S2)
- [x] 에너지 트렌드 차트 (최근 4주, 일별 라인 그래프, recharts)
- [x] 습관 히트맵 (GitHub 잔디 스타일, 최근 12주)
- [x] 이번 주 습관 달성 요약 카드 (Slot A/B/C X/7일 형식)
- [x] 오늘 Check-in 상태 표시 (완료/미완료)

## Daily 상세 화면 (S4)
- [x] 특정 날짜 기록 조회 (/daily/:date)
- [x] 기록 수정 기능

## 설정 화면 (S9)
- [x] 습관 이름/슬롯 설정 (Slot A / B / C 이름 변경)
- [x] 프로필 정보 표시 (이름, 이메일)

## 테스트
- [x] tRPC 라우터 vitest 테스트 작성
- [x] 체크포인트 저장

## Phase 2 — AI Integration

### DB & Backend
- [x] DB 스키마 확장: writing_reviews 테이블 (freewriting, conversation JSONB, emotion_keywords, insights, tags)
- [x] DB 스키마 확장: improvement_points 테이블 (content, status: pending/experimenting/completed/dropped, experiment_notes)
- [x] DB 스키마 확장: weekly_reviews 테이블 (energy_avg, habit_summary JSONB, drain/charge keywords, ai_analysis, next_week_mode)
- [x] Drizzle 마이그레이션 생성 및 적용
- [x] AI 연동 (서버사이드 전용, invokeLLM 사용 - Forge API)
- [x] Writing Review tRPC 라우터: start (프리라이팅 → 질문 3개 생성)
- [x] Writing Review tRPC 라우터: respond (답변 → 후속 질문 or Summary 생성)
- [x] Writing Review tRPC 라우터: saveImprovements (개선포인트 저장)
- [x] Writing Review tRPC 라우터: list/get
- [x] Improvement Points tRPC 라우터: list/create/updateStatus/updateNotes/toggleExperiment
- [x] Weekly Report tRPC 라우터: generate (7일 집계 + AI 분석)
- [x] Weekly Report tRPC 라우터: get/list
- [x] Dashboard overview 라우터 (개선포인트 + 최근 주간리뷰)

### Writing Review 화면 (/review)
- [x] 프리라이팅 입력 영역 (자유 텍스트)
- [x] AI에게 보내기 버튼 → 관점 전환 질문 3개 수신
- [x] 채팅 형태 Q&A (3-4 라운드)
- [x] Review Summary 표시 (감정키워드, 인사이트, 개선포인트, 태그)
- [x] 저장 기능 (리뷰 + 개선포인트 자동 생성)
- [x] 리뷰 히스토리 목록

### 개선 포인트 화면 (/improvements)
- [x] 탭 필터: 전체 / 미실행 / 실행중 / 완료
- [x] 개선 포인트 카드 (내용, 상태 배지, 출처 리뷰 날짜)
- [x] 상태 변경 (pending → experimenting → completed/dropped)
- [x] 실험 노트 입력/수정

### Weekly Report 화면 (/weekly)
- [x] 주간 리포트 생성 버튼 (7일 데이터 집계 + AI 분석)
- [x] 에너지 평균/최저일/최고일 표시
- [x] 습관 달성 요약 (Slot A/B/C X/7일)
- [x] Drain/Charge 키워드 빈도 표시
- [x] AI 분석 텍스트 표시
- [x] 다음 주 모드 제안 (recovery/normal/stretch)
- [x] 이번 주 실험할 개선 포인트 선택 UI
- [x] 주간 리포트 히스토리

### 대시보드 확장
- [x] 미실행/실행중 개선 포인트 상위 3개 카드 추가
- [x] 주간 리뷰 요약 카드 추가 (최근 주간 리뷰 있을 때)
- [x] 하단 탭 네비게이션에 리뷰/주간 탭 추가

### 테스트
- [x] Writing Review 라우터 vitest 테스트 (26개 전체 통과)
- [x] Improvement Points 라우터 vitest 테스트
- [x] Weekly Report 라우터 vitest 테스트
- [x] 체크포인트 저장

## Phase 2 추가 기능

### GitHub 레포 연동
- [x] 설정 화면에 GitHub 연동 섹션 추가 (레포 URL 입력 + 연결 안내)
- [x] GitHub Export 안내 UI (현재는 수동 복사 안내, 향후 API 연동 확장 가능)

### Obsidian Export
- [x] tRPC export 라우터: 날짜 범위 기반 md 파일 내용 생성 (Markdownformat.md 스펙)
- [x] Daily 상세 화면에 Export 버튼 추가 (단일 날짜 .md 다운로드)
- [x] 대시보드에 날짜 범위 Export 버튼 추가 (여러 날짜 .zip 다운로드)
- [x] Writing Review 데이터 있을 경우 md에 자동 포함

### Daily Check-in → Writing Review 연결
- [x] 체크인 완료 화면에 "오늘의 Writing Review 시작" 버튼 추가
- [x] Writing Review 시작 시 당일 에너지/drain/charge 데이터 프리라이팅 초안 자동 채우기
- [x] Writing Review 페이지에서 날짜 파라미터로 진입 시 해당 날짜 데이터 자동 로드

## GitHub 연동 DB 저장 + Obsidian 자동 푸시

### DB & Backend
- [x] user_context 테이블 추가 (userId, key, encryptedValue, iv, tag)
- [x] AES-256-GCM 암호화/복호화 서버 유틸 구현 (server/crypto.ts)
- [x] user_context tRPC 라우터: GitHub 설정 저장(setGitHubConfig) / 조회(getGitHubConfig)
- [x] export.pushToGitHub 라우터: 날짜 범위 md 생성 → GitHub Contents API로 Daily/ 폴더에 커밋·푸시
- [x] GitHub API: 파일 존재 시 SHA 조회 후 업데이트, 없으면 신규 생성

### 설정 화면
- [x] localStorage GitHub 설정 제거
- [x] DB 기반 GitHub 레포 URL + PAT 저장 UI (PAT는 마스킹 표시)
- [x] 연결 테스트 버튼 (GitHub API 레포 접근 확인)

### Export UI
- [x] 대시보드 Export 카드에 "GitHub에 푸시" 버튼 추가
- [x] Daily 상세 화면 Export 버튼에 "GitHub에 푸시" 옵션 추가
- [x] GitHub 설정 미완료 시 설정 화면으로 안내

### 테스트
- [x] user_context 암호화 저장/복호화 vitest 테스트
- [x] pushToGitHub 라우터 단위 테스트
- [x] 체크포인트 저장

## Health Sync API

- [x] daily_entries 테이블에 건강 데이터 컨럼 추가 (sleepDuration, sleepScore, hrv, restingHeartRate)
- [x] DB 마이그레이션 적용
- [x] POST /api/health/sync 엔드포인트 구현 (JWT 세션 쿠키 인증)
- [x] sleep_score → energy 자동 계산 로직 (85이상→5, 70-84→4, 55-69→3, 40-54→2, 40미만→1)
- [x] sleep_score → sleepQuality 자동 매핑 (70이상→good, 50-69→ok, 50미만→bad)
- [x] 해당 날짜 daily_entry upsert (healthData 저장 + energy/sleepQuality 자동 설정)
- [x] tRPC daily.getEntry에 healthData 필드 포함하여 반환
- [x] Daily Check-in 화면: healthData 있으면 에너지·수면 값 pre-fill (배너로 출처 표시)
- [x] 수동 입력 시 pre-fill 값 덮어쓰기 가능
- [x] Health Sync API vitest 테스트 작성
- [x] 체크포인트 저장

## 컴포넌트 분리 + Health Sync 확장 + Weekly Report 차트

- [x] SamsungGradeSelector 공유 컴포넌트 생성 (client/src/components/SamsungGradeSelector.tsx)
- [x] DailyCheckin에서 SamsungGradeSelector 사용으로 교체
- [x] DailyDetail에서 SamsungGradeSelector 사용으로 교체
- [x] Health Sync API body에 energy_grade / sleep_grade 필드 추가 (선택적)
- [x] energy_grade/sleep_grade 있으면 직접 사용, 없으면 sleep_score 변환 fallback
- [x] daily_entries에 energyGrade / sleepGrade 컨럼 추가 및 마이그레이션
- [x] DailyCheckin pre-fill 시 grade 필드도 복원
- [x] Weekly Report 서버 라우터에 에너지 등급 분포 집계 추가
- [x] Weekly Report 화면에 등급 분포 가로 막대 차트 추가 (recharts)
- [x] 테스트 업데이트 및 체크포인트 저장

## 삼성헬스 스크린샷 AI 분석 기능

- [x] 서버: analyzeScreenshot tRPC 프로시저 추가 (Claude Vision API 호출)
- [x] 서버: 시스템 프롬프트 + JSON 응답 파싱 로직 구현
- [x] 프론트엔드: SamsungHealthAnalyzer 컴포넌트 생성 (이미지 업로드 2개 + 분석 결과 카드)
- [x] 프론트엔드: DailyCheckin에 "삼성헬스 분석" 버튼 및 컴포넌트 통합
- [x] 프론트엔드: 분석 결과로 Energy Score 자동 입력 (수정 가능)
- [x] 프론트엔드: 삼성헬스 원본 점수 vs AI 판단 점수 나란히 표시
- [x] 테스트: analyzeScreenshot 프로시저 단위 테스트

## Writing Review AI 분석 자동 연결

- [x] DailyCheckin: AI 분석 결과(one_line, suggestion)를 sessionStorage에 임시 저장
- [x] DailyCheckin: Writing Review 진입 버튼에 AI 분석 결과 전달 (query param 또는 state)
- [x] WritingReview: AI 분석 배너 표시 (one_line + suggestion)
- [x] WritingReview: "프리라이팅에 삽입" 버튼으로 초안에 자동 추가
- [x] 테스트 및 체크포인트
