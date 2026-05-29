import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  const statements = [
    `CREATE TABLE IF NOT EXISTS writing_reviews (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      date varchar(10) NOT NULL,
      freewriting text,
      conversation json,
      emotionKeywords json,
      insights text,
      improvementPoints json,
      tags json,
      status enum('draft','chatting','completed') NOT NULL DEFAULT 'draft',
      createdAt timestamp NOT NULL DEFAULT (now()),
      updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )`,
    `CREATE TABLE IF NOT EXISTS improvement_points (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      writingReviewId int,
      content varchar(500) NOT NULL,
      status enum('pending','experimenting','completed','dropped') NOT NULL DEFAULT 'pending',
      experimentNotes text,
      isCurrentExperiment boolean NOT NULL DEFAULT false,
      createdAt timestamp NOT NULL DEFAULT (now()),
      updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )`,
    `CREATE TABLE IF NOT EXISTS weekly_reviews (
      id int AUTO_INCREMENT NOT NULL,
      userId int NOT NULL,
      weekStart varchar(10) NOT NULL,
      weekEnd varchar(10) NOT NULL,
      energyAvg varchar(4),
      energyLowDay varchar(10),
      energyHighDay varchar(10),
      habitSummary json,
      drainKeywords json,
      chargeKeywords json,
      aiAnalysis text,
      nextWeekMode enum('recovery','normal','stretch'),
      suggestions json,
      notes text,
      createdAt timestamp NOT NULL DEFAULT (now()),
      updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )`,
    `ALTER TABLE writing_reviews ADD CONSTRAINT writing_reviews_userId_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE improvement_points ADD CONSTRAINT improvement_points_userId_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE improvement_points ADD CONSTRAINT improvement_points_reviewId_fk FOREIGN KEY (writingReviewId) REFERENCES writing_reviews(id) ON DELETE SET NULL`,
    `ALTER TABLE weekly_reviews ADD CONSTRAINT weekly_reviews_userId_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE`,
  ];

  for (const sql of statements) {
    try {
      await conn.execute(sql);
      const tableName = sql.match(/TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i)?.[1] ?? sql.slice(0, 40);
      console.log(`✓ ${tableName}`);
    } catch (e) {
      const msg = e.message ?? String(e);
      if (
        msg.includes("already exists") ||
        msg.includes("Duplicate key name") ||
        msg.includes("already exists")
      ) {
        console.log(`⏭  SKIP (already exists): ${msg.slice(0, 80)}`);
      } else {
        console.error(`✗ ERROR: ${msg}`);
      }
    }
  }

  await conn.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
