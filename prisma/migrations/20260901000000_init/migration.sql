-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LEARNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LearnerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "estimatedCefrLevel" TEXT NOT NULL DEFAULT 'A2',
    "listeningMastery" REAL NOT NULL DEFAULT 0.5,
    "vocabularyMastery" REAL NOT NULL DEFAULT 0.5,
    "spellingMastery" REAL NOT NULL DEFAULT 0.5,
    "preferredAccent" TEXT DEFAULT 'us',
    "preferredTopics" TEXT NOT NULL DEFAULT '',
    "recommendedPlaybackRate" REAL NOT NULL DEFAULT 1.0,
    "totalStudyMinutes" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cefrLevel" TEXT NOT NULL DEFAULT 'A2',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "cefrLevel" TEXT NOT NULL DEFAULT 'A2',
    "learningObjectives" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL,
    "audioUrl" TEXT,
    "accent" TEXT NOT NULL DEFAULT 'us',
    "defaultPlaybackRate" REAL NOT NULL DEFAULT 1.0,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LessonSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "audioUrl" TEXT,
    "startTime" REAL,
    "endTime" REAL,
    "difficulty" REAL NOT NULL DEFAULT 1.0,
    CONSTRAINT "LessonSegment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lemma" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "ipa" TEXT,
    "meaningVi" TEXT NOT NULL,
    "meaningEn" TEXT,
    "partOfSpeech" TEXT,
    "cefrLevel" TEXT NOT NULL DEFAULT 'A2',
    "exampleSentence" TEXT,
    "audioUrl" TEXT
);

-- CreateTable
CREATE TABLE "LessonVocabulary" (
    "lessonId" TEXT NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "isTarget" BOOLEAN NOT NULL DEFAULT true,
    "importance" REAL NOT NULL DEFAULT 1.0,

    PRIMARY KEY ("lessonId", "vocabularyItemId"),
    CONSTRAINT "LessonVocabulary_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonVocabulary_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "segmentId" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "metadata" TEXT DEFAULT '{}',
    "difficulty" REAL NOT NULL DEFAULT 1.0,
    "position" INTEGER NOT NULL,
    CONSTRAINT "Exercise_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exercise_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "LessonSegment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "normalizedAnswer" TEXT,
    "score" REAL,
    "completionTimeMs" INTEGER,
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "hintCount" INTEGER NOT NULL DEFAULT 0,
    "playbackRate" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttemptError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "expectedText" TEXT NOT NULL,
    "actualText" TEXT,
    "position" INTEGER NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "aiExplanation" TEXT,
    "remediationType" TEXT,
    "metadata" TEXT DEFAULT '{}',
    CONSTRAINT "AttemptError_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyMastery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "masteryScore" REAL NOT NULL DEFAULT 0.0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "nextReviewAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" REAL NOT NULL DEFAULT 0.0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "repetitionCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VocabularyMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VocabularyMastery_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillMastery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "masteryScore" REAL NOT NULL DEFAULT 0.5,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vocabularyItemId" TEXT NOT NULL,
    "sourceAttemptId" TEXT,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "cardType" TEXT NOT NULL DEFAULT 'TEXT_MEANING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Flashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Flashcard_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Flashcard_sourceAttemptId_fkey" FOREIGN KEY ("sourceAttemptId") REFERENCES "Attempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flashcardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "responseTimeMs" INTEGER,
    "previousInterval" REAL NOT NULL DEFAULT 0.0,
    "nextInterval" REAL NOT NULL DEFAULT 0.0,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewLog_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "inputHash" TEXT,
    "validatedOutput" TEXT,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerProfile_userId_key" ON "LearnerProfile"("userId");

-- CreateIndex
CREATE INDEX "Lesson_courseId_idx" ON "Lesson"("courseId");

-- CreateIndex
CREATE INDEX "Lesson_status_idx" ON "Lesson"("status");

-- CreateIndex
CREATE INDEX "LessonSegment_lessonId_idx" ON "LessonSegment"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyItem_lemma_key" ON "VocabularyItem"("lemma");

-- CreateIndex
CREATE INDEX "Exercise_lessonId_idx" ON "Exercise"("lessonId");

-- CreateIndex
CREATE INDEX "Attempt_userId_lessonId_idx" ON "Attempt"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "Attempt_userId_createdAt_idx" ON "Attempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AttemptError_attemptId_idx" ON "AttemptError"("attemptId");

-- CreateIndex
CREATE INDEX "VocabularyMastery_userId_nextReviewAt_idx" ON "VocabularyMastery"("userId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyMastery_userId_vocabularyItemId_key" ON "VocabularyMastery"("userId", "vocabularyItemId");

-- CreateIndex
CREATE INDEX "SkillMastery_userId_skillKey_idx" ON "SkillMastery"("userId", "skillKey");

-- CreateIndex
CREATE UNIQUE INDEX "SkillMastery_userId_skillKey_key" ON "SkillMastery"("userId", "skillKey");

-- CreateIndex
CREATE INDEX "Flashcard_userId_active_idx" ON "Flashcard"("userId", "active");

-- CreateIndex
CREATE INDEX "Flashcard_userId_vocabularyItemId_idx" ON "Flashcard"("userId", "vocabularyItemId");

-- CreateIndex
CREATE INDEX "ReviewLog_flashcardId_idx" ON "ReviewLog"("flashcardId");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_reviewedAt_idx" ON "ReviewLog"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "Recommendation_userId_status_idx" ON "Recommendation"("userId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_userId_generatedAt_idx" ON "Recommendation"("userId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_userId_lessonId_key" ON "Recommendation"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AIInteraction_createdAt_idx" ON "AIInteraction"("createdAt");

-- CreateIndex
CREATE INDEX "AIInteraction_purpose_success_idx" ON "AIInteraction"("purpose", "success");

