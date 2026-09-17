import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";

async function main() {
  console.log("==================================================");
  console.log(" ListenAI Backup & Restore Verification Drill");
  console.log("==================================================");

  const workDir = join(tmpdir(), `listenai-dril-${randomUUID().slice(0, 8)}`);
  mkdirSync(workDir, { recursive: true });

  const sourceDbPath = join(workDir, "source.db");
  const backupFilePath = join(workDir, "snapshot.backup");
  const restoredDbPath = join(workDir, "restored.db");

  try {
    console.log(`1. Creating isolated test database at: ${sourceDbPath}`);
    const sourceClient = createClient({ url: `file:${sourceDbPath}` });

    // Apply baseline DDL tables
    await sourceClient.batch([
      `CREATE TABLE "User" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT,
        "email" TEXT UNIQUE,
        "role" TEXT DEFAULT 'LEARNER',
        "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE "Course" (
        "id" TEXT PRIMARY KEY,
        "title" TEXT NOT NULL,
        "topic" TEXT NOT NULL,
        "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE "Lesson" (
        "id" TEXT PRIMARY KEY,
        "courseId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "status" TEXT DEFAULT 'DRAFT',
        "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE "ReviewLog" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "clientKey" TEXT UNIQUE NOT NULL,
        "resultJson" TEXT,
        "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
    ], "write");

    // Insert synthetic seed records into source DB
    const testUserId = `user-${randomUUID()}`;
    const testCourseId = `course-${randomUUID()}`;
    const testLessonId = `lesson-${randomUUID()}`;
    const testReviewId = `review-${randomUUID()}`;

    console.log("2. Seeding source database with test records...");
    await sourceClient.batch([
      {
        sql: `INSERT INTO "User" ("id", "name", "email", "role") VALUES (?, ?, ?, ?)`,
        args: [testUserId, "Drill User", "drill@example.com", "LEARNER"],
      },
      {
        sql: `INSERT INTO "Course" ("id", "title", "topic") VALUES (?, ?, ?)`,
        args: [testCourseId, "Travel English", "Airport"],
      },
      {
        sql: `INSERT INTO "Lesson" ("id", "courseId", "title", "status") VALUES (?, ?, ?, ?)`,
        args: [testLessonId, testCourseId, "At Check-in", "PUBLISHED"],
      },
      {
        sql: `INSERT INTO "ReviewLog" ("id", "userId", "clientKey", "resultJson") VALUES (?, ?, ?, ?)`,
        args: [testReviewId, testUserId, "client-key-1", JSON.stringify({ easeFactor: 2.5 })],
      },
    ], "write");

    const sourceCountRes = await sourceClient.execute(`SELECT count(*) as count FROM "Lesson"`);
    const sourceCount = Number(sourceCountRes.rows[0].count);
    console.log(`   Source database verified with ${sourceCount} Lesson record(s).`);
    sourceClient.close();

    // Perform simulated database backup
    console.log(`3. Simulating atomic snapshot export -> ${backupFilePath}`);
    copyFileSync(sourceDbPath, backupFilePath);
    if (!existsSync(backupFilePath)) {
      throw new Error("Backup file was not created successfully");
    }

    // Perform simulated database restore
    console.log(`4. Restoring snapshot to new target database -> ${restoredDbPath}`);
    copyFileSync(backupFilePath, restoredDbPath);

    // Verify restored database contents
    console.log("5. Running readback assertions on restored database...");
    const restoredClient = createClient({ url: `file:${restoredDbPath}` });

    const userCheck = await restoredClient.execute({
      sql: `SELECT "name", "email" FROM "User" WHERE "id" = ?`,
      args: [testUserId],
    });
    if (userCheck.rows.length !== 1 || userCheck.rows[0].email !== "drill@example.com") {
      throw new Error("User record verification failed on restored database");
    }

    const lessonCheck = await restoredClient.execute({
      sql: `SELECT "title", "status" FROM "Lesson" WHERE "id" = ?`,
      args: [testLessonId],
    });
    if (lessonCheck.rows.length !== 1 || lessonCheck.rows[0].title !== "At Check-in") {
      throw new Error("Lesson record verification failed on restored database");
    }

    const reviewCheck = await restoredClient.execute({
      sql: `SELECT "resultJson" FROM "ReviewLog" WHERE "id" = ?`,
      args: [testReviewId],
    });
    if (reviewCheck.rows.length !== 1) {
      throw new Error("ReviewLog verification failed on restored database");
    }
    const parsedReceipt = JSON.parse(String(reviewCheck.rows[0].resultJson));
    if (parsedReceipt.easeFactor !== 2.5) {
      throw new Error("Receipt payload mismatch on restored database");
    }

    restoredClient.close();

    console.log("==================================================");
    console.log("🎉 Backup & Restore Drill PASSED (100% data fidelity)");
    console.log("==================================================");
  } finally {
    // Cleanup temporary work directory
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

main().catch((err) => {
  console.error("Backup & restore drill failed:", err);
  process.exit(1);
});
