# DB Backup

Export date: 2026-05-28 (UTC)

## Tables

| Table | Rows | Description |
|-------|------|-------------|
| `daily_entries` | 4 | 일일 체크인 데이터 (에너지, 수면, energyGrade, sleepGrade) |
| `habit_logs` | 3 | 습관 일일 체크 로그 |
| `habits` | 3 | 습관 슬롯 (A/B/C) 정의 |
| `improvement_points` | 45 | 개선 포인트 추적 |
| `todos` | 8 | 일일 마이크로 Todo |
| `user_context` | 2 | 사용자 컨텍스트 (GitHub 설정 등) |
| `users` | 1 | 사용자 계정 (Manus OAuth) |
| `weekly_reviews` | 0 | 주간 리뷰 데이터 |
| `writing_reviews` | 2 | Writing Review (프리라이팅 + AI 대화) |

## 스키마 복원 방법

새 데이터베이스에 스키마를 적용하려면:

```bash
# 1. .env에 DATABASE_URL 설정 후
pnpm drizzle-kit push
```

## 데이터 복원 방법

CSV 파일을 MySQL에 임포트하려면:

```sql
LOAD DATA INFILE '/path/to/table_name.csv'
INTO TABLE table_name
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;
```

## 주의사항

- 개인 데이터가 포함되어 있습니다. 공개 레포지토리에 실제 데이터를 커밋할 경우 개인정보 보호에 유의하세요.
- 이 백업은 Manus 플랫폼 DB에서 직접 export한 데이터입니다.
