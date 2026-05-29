/**
 * DB Export Script
 * 모든 테이블 데이터를 CSV로 export
 * Usage: node scripts/export-db.mjs
 */
import { createConnection } from "mysql2/promise";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// DATABASE_URL 파싱
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
if (!match) {
  console.error("DATABASE_URL 형식을 파싱할 수 없습니다:", dbUrl.substring(0, 40));
  process.exit(1);
}

const [, user, password, host, port, database] = match;

console.log(`Connecting to ${host}:${port}/${database}...`);

const conn = await createConnection({
  host,
  port: parseInt(port),
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
});

// 테이블 목록 조회
const [tables] = await conn.execute("SHOW TABLES");
const tableNames = tables.map((row) => Object.values(row)[0]);
console.log(`Found tables: ${tableNames.join(", ")}`);

const backupDir = join(projectRoot, "db-backup");
mkdirSync(backupDir, { recursive: true });

const exportSummary = [];

for (const table of tableNames) {
  if (table === "__drizzle_migrations") {
    console.log(`  Skipping ${table} (internal)`);
    continue;
  }

  try {
    const [rows] = await conn.execute(`SELECT * FROM \`${table}\``);

    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows (empty)`);
      // 헤더만 있는 파일 유지
      exportSummary.push({ table, rows: 0 });
      continue;
    }

    // CSV 생성
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(",")];

    for (const row of rows) {
      const values = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        // 쉼표, 따옴표, 줄바꿈이 있으면 따옴표로 감싸기
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(values.join(","));
    }

    const csvContent = csvLines.join("\n") + "\n";
    const filename = join(backupDir, `${table}.csv`);
    writeFileSync(filename, csvContent, "utf8");

    console.log(`  ✓ ${table}: ${rows.length} rows exported`);
    exportSummary.push({ table, rows: rows.length });
  } catch (err) {
    console.error(`  ✗ ${table}: Error - ${err.message}`);
    exportSummary.push({ table, rows: -1, error: err.message });
  }
}

// README 업데이트
const now = new Date().toISOString().split("T")[0];
const readmeContent = `# DB Backup

Export date: ${now} (UTC)

## Tables

| Table | Rows | Description |
|-------|------|-------------|
${exportSummary
  .map(({ table, rows, error }) => {
    const desc = {
      users: "사용자 계정 (Manus OAuth)",
      daily_entries: "일일 체크인 데이터 (에너지, 수면, energyGrade, sleepGrade)",
      todos: "일일 마이크로 Todo",
      habits: "습관 슬롯 (A/B/C) 정의",
      habit_logs: "습관 일일 체크 로그",
      weekly_reviews: "주간 리뷰 데이터",
      writing_reviews: "Writing Review (프리라이팅 + AI 대화)",
      improvement_points: "개선 포인트 추적",
      user_context: "사용자 컨텍스트 (GitHub 설정 등)",
    }[table] || "";
    if (error) return `| \`${table}\` | Error | ${error} |`;
    return `| \`${table}\` | ${rows} | ${desc} |`;
  })
  .join("\n")}

## 스키마 복원 방법

새 데이터베이스에 스키마를 적용하려면:

\`\`\`bash
# 1. .env에 DATABASE_URL 설정 후
pnpm drizzle-kit push
\`\`\`

## 데이터 복원 방법

CSV 파일을 MySQL에 임포트하려면:

\`\`\`sql
LOAD DATA INFILE '/path/to/table_name.csv'
INTO TABLE table_name
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\\n'
IGNORE 1 ROWS;
\`\`\`

## 주의사항

- 개인 데이터가 포함되어 있습니다. 공개 레포지토리에 실제 데이터를 커밋할 경우 개인정보 보호에 유의하세요.
- 이 백업은 Manus 플랫폼 DB에서 직접 export한 데이터입니다.
`;

writeFileSync(join(backupDir, "README.md"), readmeContent, "utf8");

await conn.end();
console.log(`\nExport complete! ${exportSummary.length} tables processed.`);
console.log(`Files saved to: ${backupDir}`);
