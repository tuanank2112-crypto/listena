import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.reviewLog.deleteMany();
  await prisma.flashcard.deleteMany();
  await prisma.attemptError.deleteMany();
  await prisma.attempt.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.aIInteraction.deleteMany();
  await prisma.lessonVocabulary.deleteMany();
  await prisma.exercise.deleteMany();
  await prisma.lessonSegment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.vocabularyMastery.deleteMany();
  await prisma.skillMastery.deleteMany();
  await prisma.learnerProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.vocabularyItem.deleteMany();

  // ── Users ──────────────────────────────────────────

  const learnerPassword = await hash("demo1234", 12);
  const teacherPassword = await hash("demo1234", 12);

  const learner = await prisma.user.create({
    data: {
      name: "Nguyễn Văn A",
      email: "learner@example.com",
      password: learnerPassword,
      role: "LEARNER",
    },
  });

  const teacher = await prisma.user.create({
    data: {
      name: "Cô Minh Anh",
      email: "teacher@example.com",
      password: teacherPassword,
      role: "TEACHER",
    },
  });

  console.log("✅ Demo users created");

  // ── Learner Profile ────────────────────────────────

  await prisma.learnerProfile.create({
    data: {
      userId: learner.id,
      estimatedCefrLevel: "A2",
      listeningMastery: 0.45,
      vocabularyMastery: 0.5,
      spellingMastery: 0.4,
      preferredAccent: "us",
      preferredTopics: "travel, food, family",
      recommendedPlaybackRate: 1.0,
      totalStudyMinutes: 45,
      currentStreak: 3,
      lastActivityAt: new Date(),
    },
  });

  // Initialize skill masteries
  const skills = ["listening", "vocabulary", "spelling", "function_words", "segmentation", "final_sounds"];
  for (const skill of skills) {
    await prisma.skillMastery.create({
      data: {
        userId: learner.id,
        skillKey: skill,
        masteryScore: 0.5,
        evidenceCount: 0,
      },
    });
  }

  // ── Course ─────────────────────────────────────────

  const course = await prisma.course.create({
    data: {
      title: "English 1 - Listening and Vocabulary",
      description: "Khóa học luyện nghe và từ vựng tiếng Anh trình độ A2",
      cefrLevel: "A2",
      status: "PUBLISHED",
      createdById: teacher.id,
    },
  });

  console.log("✅ Course created");

  // ── Vocabulary Items ───────────────────────────────

  const vocabItems = await Promise.all([
    prisma.vocabularyItem.create({
      data: {
        lemma: "getaway",
        displayText: "getaway",
        ipa: "/ˈɡet.ə.weɪ/",
        meaningVi: "kỳ nghỉ ngắn",
        meaningEn: "a short vacation",
        partOfSpeech: "noun",
        cefrLevel: "A2",
        exampleSentence: "We planned a family getaway to Da Nang.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "family",
        displayText: "family",
        ipa: "/ˈfæm.əl.i/",
        meaningVi: "gia đình",
        meaningEn: "a group of related people",
        partOfSpeech: "noun",
        cefrLevel: "A1",
        exampleSentence: "My family went to the beach.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "beach",
        displayText: "beach",
        ipa: "/biːtʃ/",
        meaningVi: "bãi biển",
        meaningEn: "a shore of a body of water",
        partOfSpeech: "noun",
        cefrLevel: "A1",
        exampleSentence: "We spent the whole day at the beach.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "beautiful",
        displayText: "beautiful",
        ipa: "/ˈbjuː.tɪ.fəl/",
        meaningVi: "đẹp, xinh đẹp",
        meaningEn: "very attractive",
        partOfSpeech: "adjective",
        cefrLevel: "A2",
        exampleSentence: "The weather was beautiful.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "swam",
        displayText: "swam",
        ipa: "/swæm/",
        meaningVi: "đã bơi (quá khứ của swim)",
        meaningEn: "past tense of swim",
        partOfSpeech: "verb",
        cefrLevel: "A2",
        exampleSentence: "We swam in the sea.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "sandcastle",
        displayText: "sandcastle",
        ipa: "/ˈsænd.kæs.əl/",
        meaningVi: "lâu đài cát",
        meaningEn: "a model of a castle built in sand",
        partOfSpeech: "noun",
        cefrLevel: "A2",
        exampleSentence: "The children built sandcastles.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "shell",
        displayText: "shell",
        ipa: "/ʃel/",
        meaningVi: "vỏ sò, vỏ ốc",
        meaningEn: "a hard outer covering of a sea creature",
        partOfSpeech: "noun",
        cefrLevel: "A2",
        exampleSentence: "She found some beautiful shells.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "restaurant",
        displayText: "restaurant",
        ipa: "/ˈres.tər.ɒnt/",
        meaningVi: "nhà hàng",
        meaningEn: "a place where meals are served",
        partOfSpeech: "noun",
        cefrLevel: "A1",
        exampleSentence: "We had lunch at a small restaurant.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "check-in",
        displayText: "check in",
        ipa: "/tʃek ɪn/",
        meaningVi: "làm thủ tục nhận phòng",
        meaningEn: "to register at a hotel",
        partOfSpeech: "verb",
        cefrLevel: "A2",
        exampleSentence: "We checked in at the hotel.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "order",
        displayText: "order",
        ipa: "/ˈɔːr.dər/",
        meaningVi: "gọi món, đặt hàng",
        meaningEn: "to request food or drink",
        partOfSpeech: "verb",
        cefrLevel: "A2",
        exampleSentence: "I would like to order the grilled fish.",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "menu",
        displayText: "menu",
        ipa: "/ˈmen.juː/",
        meaningVi: "thực đơn",
        meaningEn: "a list of food and drinks",
        partOfSpeech: "noun",
        cefrLevel: "A1",
        exampleSentence: "Can I see the menu please?",
      },
    }),
    prisma.vocabularyItem.create({
      data: {
        lemma: "delicious",
        displayText: "delicious",
        ipa: "/dɪˈlɪʃ.əs/",
        meaningVi: "ngon",
        meaningEn: "very tasty",
        partOfSpeech: "adjective",
        cefrLevel: "A2",
        exampleSentence: "The food was delicious.",
      },
    }),
  ]);

  console.log("✅ Vocabulary items created");

  // ── Lesson 1: Da Nang Family Getaway ──────────────

  const lesson1 = await prisma.lesson.create({
    data: {
      courseId: course.id,
      title: "Da Nang Family Getaway",
      topic: "family, travel, beach",
      cefrLevel: "A2",
      learningObjectives: "Luyện nghe từ vựng về chủ đề gia đình và du lịch; Nhận biết thì quá khứ đơn trong câu kể; Luyện chép chính tả câu ngắn",
      transcript:
        "Last weekend, my family went on a getaway to Da Nang. The weather was beautiful and sunny. We swam in the sea and built sandcastles on the beach. My little sister found some colorful shells. We had lunch at a small restaurant near the beach. The food was delicious. Everyone was very happy.",
      audioUrl: null,
      accent: "us",
      defaultPlaybackRate: 1.0,
      estimatedMinutes: 10,
      status: "PUBLISHED",
      createdById: teacher.id,
    },
  });

  // Segments
  const s1 = await prisma.lessonSegment.create({
    data: {
      lessonId: lesson1.id,
      position: 1,
      text: "Last weekend, my family went on a getaway to Da Nang.",
      difficulty: 1.0,
    },
  });
  const s2 = await prisma.lessonSegment.create({
    data: {
      lessonId: lesson1.id,
      position: 2,
      text: "The weather was beautiful and sunny.",
      difficulty: 1.0,
    },
  });
  const s3 = await prisma.lessonSegment.create({
    data: {
      lessonId: lesson1.id,
      position: 3,
      text: "We swam in the sea and built sandcastles on the beach.",
      difficulty: 1.2,
    },
  });
  const s4 = await prisma.lessonSegment.create({
    data: {
      lessonId: lesson1.id,
      position: 4,
      text: "My little sister found some colorful shells.",
      difficulty: 1.0,
    },
  });
  const s5 = await prisma.lessonSegment.create({
    data: {
      lessonId: lesson1.id,
      position: 5,
      text: "We had lunch at a small restaurant near the beach.",
      difficulty: 1.1,
    },
  });
  const s6 = await prisma.lessonSegment.create({
    data: {
      lessonId: lesson1.id,
      position: 6,
      text: "The food was delicious. Everyone was very happy.",
      difficulty: 0.8,
    },
  });

  // Exercises
  await prisma.exercise.create({
    data: {
      lessonId: lesson1.id,
      segmentId: null,
      type: "GIST",
      prompt: "Where did the family go last weekend?",
      correctAnswer: "They went to Da Nang.",
      difficulty: 1.0,
      position: 1,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson1.id,
      segmentId: s2.id,
      type: "PARTIAL_DICTATION",
      prompt: 'The weather was ______ and sunny.',
      correctAnswer: "beautiful",
      difficulty: 1.0,
      position: 2,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson1.id,
      segmentId: s3.id,
      type: "FULL_DICTATION",
      prompt: "Chép lại chính xác câu bạn nghe được.",
      correctAnswer: "We swam in the sea and built sandcastles on the beach.",
      difficulty: 1.2,
      position: 3,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson1.id,
      segmentId: s4.id,
      type: "PARTIAL_DICTATION",
      prompt: "My little sister found some ______ shells.",
      correctAnswer: "colorful",
      difficulty: 1.0,
      position: 4,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson1.id,
      segmentId: s5.id,
      type: "FULL_DICTATION",
      prompt: "Chép lại chính xác câu bạn nghe được.",
      correctAnswer: "We had lunch at a small restaurant near the beach.",
      difficulty: 1.1,
      position: 5,
    },
  });

  // Lesson vocabulary
  for (const vi of vocabItems.slice(0, 8)) {
    await prisma.lessonVocabulary.create({
      data: {
        lessonId: lesson1.id,
        vocabularyItemId: vi.id,
        isTarget: true,
        importance: 1.0,
      },
    });
  }

  // ── Lesson 2: Checking in at a Hotel ───────────────

  const lesson2 = await prisma.lesson.create({
    data: {
      courseId: course.id,
      title: "Checking in at a Hotel",
      topic: "hotel, travel, accommodation",
      cefrLevel: "A2",
      learningObjectives: "Luyện nghe từ vựng khách sạn; Nhận biết câu hỏi và câu trả lời trong tình huống nhận phòng",
      transcript:
        "Good evening. Welcome to the Sunrise Hotel. I have a reservation for two nights. Can I see your passport, please? Here you are. Your room is on the third floor, room 305. The breakfast is served from 7 to 10 in the morning. Thank you. Enjoy your stay.",
      audioUrl: null,
      accent: "us",
      defaultPlaybackRate: 1.0,
      estimatedMinutes: 8,
      status: "PUBLISHED",
      createdById: teacher.id,
    },
  });

  const segs2 = [
    { pos: 1, text: "Good evening. Welcome to the Sunrise Hotel.", diff: 0.8 },
    { pos: 2, text: "I have a reservation for two nights.", diff: 1.0 },
    { pos: 3, text: "Can I see your passport, please?", diff: 1.0 },
    { pos: 4, text: "Your room is on the third floor, room 305.", diff: 1.1 },
    { pos: 5, text: "The breakfast is served from 7 to 10 in the morning.", diff: 1.2 },
    { pos: 6, text: "Enjoy your stay.", diff: 0.7 },
  ];

  for (const seg of segs2) {
    await prisma.lessonSegment.create({
      data: {
        lessonId: lesson2.id,
        position: seg.pos,
        text: seg.text,
        difficulty: seg.diff,
      },
    });
  }

  await prisma.exercise.create({
    data: {
      lessonId: lesson2.id,
      type: "GIST",
      prompt: "What is the name of the hotel?",
      correctAnswer: "Sunrise Hotel",
      difficulty: 0.8,
      position: 1,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson2.id,
      type: "PARTIAL_DICTATION",
      prompt: "I have a ______ for two nights.",
      correctAnswer: "reservation",
      difficulty: 1.0,
      position: 2,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson2.id,
      type: "FULL_DICTATION",
      prompt: "Chép lại câu: Can I see your passport, please?",
      correctAnswer: "Can I see your passport, please?",
      difficulty: 1.0,
      position: 3,
    },
  });

  // ── Lesson 3: Ordering Food at a Restaurant ────────

  const lesson3 = await prisma.lesson.create({
    data: {
      courseId: course.id,
      title: "Ordering Food at a Restaurant",
      topic: "food, restaurant, ordering",
      cefrLevel: "A2",
      learningObjectives: "Luyện nghe từ vựng nhà hàng; Nhận biết câu gọi món",
      transcript:
        "Welcome to Bella Italia. Here is the menu. What would you like to order? I would like the grilled fish with vegetables. Would you like anything to drink? Yes, a glass of orange juice please. And for dessert? Some tiramisu, please. Good choices. Your food will be ready soon.",
      audioUrl: null,
      accent: "us",
      defaultPlaybackRate: 1.0,
      estimatedMinutes: 8,
      status: "PUBLISHED",
      createdById: teacher.id,
    },
  });

  const segs3 = [
    { pos: 1, text: "Welcome to Bella Italia. Here is the menu.", diff: 0.8 },
    { pos: 2, text: "What would you like to order?", diff: 0.9 },
    { pos: 3, text: "I would like the grilled fish with vegetables.", diff: 1.1 },
    { pos: 4, text: "Would you like anything to drink?", diff: 1.0 },
    { pos: 5, text: "A glass of orange juice please.", diff: 1.0 },
    { pos: 6, text: "Your food will be ready soon.", diff: 0.8 },
  ];

  for (const seg of segs3) {
    await prisma.lessonSegment.create({
      data: {
        lessonId: lesson3.id,
        position: seg.pos,
        text: seg.text,
        difficulty: seg.diff,
      },
    });
  }

  await prisma.exercise.create({
    data: {
      lessonId: lesson3.id,
      type: "GIST",
      prompt: "What is the name of the restaurant?",
      correctAnswer: "Bella Italia",
      difficulty: 0.8,
      position: 1,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson3.id,
      type: "PARTIAL_DICTATION",
      prompt: "I would like the ______ fish with vegetables.",
      correctAnswer: "grilled",
      difficulty: 1.0,
      position: 2,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson3.id,
      type: "FULL_DICTATION",
      prompt: "Chép lại câu: What would you like to order?",
      correctAnswer: "What would you like to order?",
      difficulty: 0.9,
      position: 3,
    },
  });
  await prisma.exercise.create({
    data: {
      lessonId: lesson3.id,
      type: "VOCABULARY",
      prompt: "Từ 'menu' có nghĩa là gì?",
      correctAnswer: "thực đơn",
      difficulty: 1.0,
      position: 4,
    },
  });

  // Link vocabulary to lessons 2 & 3
  for (const vi of [vocabItems[8], vocabItems[1], vocabItems[7]]) {
    await prisma.lessonVocabulary.create({
      data: { lessonId: lesson2.id, vocabularyItemId: vi.id, isTarget: true, importance: 1.0 },
    });
  }
  for (const vi of [vocabItems[9], vocabItems[10], vocabItems[11], vocabItems[7]]) {
    await prisma.lessonVocabulary.create({
      data: { lessonId: lesson3.id, vocabularyItemId: vi.id, isTarget: true, importance: 1.0 },
    });
  }

  console.log("✅ 3 lessons created with segments, exercises, and vocabulary");

  // ── Recommendations ────────────────────────────────

  await prisma.recommendation.create({
    data: {
      userId: learner.id,
      lessonId: lesson2.id,
      reason: "Bài này giúp bạn luyện từ vựng về khách sạn và du lịch.",
      score: 0.85,
      status: "PENDING",
    },
  });

  console.log("✅ Recommendations created");
  console.log("");
  console.log("🎉 Seed completed successfully!");
  console.log("📧 learner@example.com / demo1234");
  console.log("📧 teacher@example.com / demo1234");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
