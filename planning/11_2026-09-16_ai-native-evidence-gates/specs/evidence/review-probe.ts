/** Review probe: current SQL on an in-memory DB; no application/env DB access. */
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { GenerateLessonSchema, CreateLessonSchema } from '../../../../src/server/validation/schemas';
import { hashCanonicalPayload } from '../../../../src/lib/idempotency';

async function main() {
  const source = readFileSync('src/server/services/learning.ts', 'utf8');
  const review = source.slice(source.indexOf('export async function reviewFlashcard'));
  const sql = [...review.matchAll(/sql: `([\s\S]*?)`/g)].map(m => m[1]);
  if (!sql[0]?.includes('INSERT INTO "ReviewLog"') || !sql[1]?.includes('UPDATE "VocabularyMastery"')) throw new Error('Source changed; re-review extraction');
  const db = createClient({ url: 'file::memory:' });
  await db.executeMultiple(`
    CREATE TABLE ReviewLog(id TEXT PRIMARY KEY, flashcardId TEXT, userId TEXT, rating TEXT, responseTimeMs INTEGER, previousInterval REAL, nextInterval REAL, clientReviewId TEXT, requestHash TEXT, reviewedAt INTEGER, UNIQUE(userId,clientReviewId));
    CREATE TABLE VocabularyMastery(userId TEXT, vocabularyItemId TEXT, masteryScore REAL, lastReviewedAt INTEGER, nextReviewAt INTEGER, intervalDays REAL, easeFactor REAL, repetitionCount INTEGER, correctCount INTEGER, incorrectCount INTEGER, revision INTEGER, UNIQUE(userId,vocabularyItemId));
    INSERT INTO VocabularyMastery VALUES('u','v',0.7,1000,2000,1,2.5,1,1,0,1);
  `);
  const stale = await db.batch([
    { sql: sql[0], args: ['loser','card','u','GOOD',1000,1,6,'key','hash',1000] },
    { sql: sql[1], args: [0.7,1000,7000,6,2.5,2,1,0,'u','v',0] },
  ], 'write');
  const persisted = await db.execute('SELECT COUNT(*) AS logs FROM ReviewLog');
  const mastery = await db.execute('SELECT revision,nextReviewAt FROM VocabularyMastery');
  const aiBody = { topic: 'Travel', cefrLevel: 'A2', learningObjectives: ['Ask for directions'] };
  const manualBody = {
    courseId:'00000000-0000-4000-8000-000000000001', title:'Test', topic:'Travel', cefrLevel:'A2', learningObjectives:[], transcript:'Hello',
    segments:[{position:1,text:'Hello',difficulty:1}], vocabulary:[{lemma:'example',displayText:'example',meaningVi:'ví dụ',cefrLevel:'A2'}],
    exercises:[{type:'FULL_DICTATION',prompt:'Listen',correctAnswer:'Hello',position:1}],
  };
  const ai = GenerateLessonSchema.safeParse(aiBody);
  const manual = CreateLessonSchema.safeParse(manualBody);
  const attemptPayload = {lessonId:'l',exerciseId:'e',submittedAnswer:'hello',completionTimeMs:1000,replayCount:0,hintCount:0,playbackRate:1};
  const reviewPayload = {flashcardId:'c',rating:'GOOD',responseTimeMs:1000};
  console.log(JSON.stringify({
    schemaVersion:'review-probe-v1', commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    scope:'Exact current review SQL on minimal in-memory tables; actual Zod schemas and canonical hashes. Not full service/HTTP/hosted evidence.',
    staleReview:{rowsAffected:stale.map(r=>r.rowsAffected),persistedLogs:Number(persisted.rows[0].logs),revision:Number(mastery.rows[0].revision),nextReviewAt:Number(mastery.rows[0].nextReviewAt)},
    teacherUiPayload:{aiAccepted:ai.success,manualAccepted:manual.success,aiIssues:ai.success?[]:ai.error.issues.map(i=>i.path.join('.')),manualIssues:manual.success?[]:manual.error.issues.map(i=>i.path.join('.'))},
    retryHash:{attemptChangesWithElapsedTime:hashCanonicalPayload(attemptPayload)!==hashCanonicalPayload({...attemptPayload,completionTimeMs:2000}),reviewChangesWithElapsedTime:hashCanonicalPayload(reviewPayload)!==hashCanonicalPayload({...reviewPayload,responseTimeMs:2000})},
  },null,2));
  db.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
