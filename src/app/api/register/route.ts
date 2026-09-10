import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { RegisterSchema } from "@/server/validation/schemas";
import logger from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, role } = parsed.data;

    // Check existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email đã được sử dụng" },
        { status: 409 }
      );
    }

    // Create user
    const hashedPassword = await hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    // Create learner profile + skill masteries only for LEARNER role
    if (role === "LEARNER") {
      await prisma.learnerProfile.create({
        data: {
          userId: user.id,
          estimatedCefrLevel: "A2",
          listeningMastery: 0.5,
          vocabularyMastery: 0.5,
          spellingMastery: 0.5,
          lastActivityAt: new Date(),
        },
      });

      // Initialize skill masteries
      const skills = ["listening", "vocabulary", "spelling", "function_words", "segmentation", "final_sounds"];
      for (const skill of skills) {
        await prisma.skillMastery.create({
          data: {
            userId: user.id,
            skillKey: skill,
            masteryScore: 0.5,
            evidenceCount: 0,
          },
        });
      }
    }

    logger.info({ userId: user.id, role }, "User registered");

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Registration failed");
    return NextResponse.json(
      { error: "Đăng ký thất bại. Vui lòng thử lại sau." },
      { status: 500 }
    );
  }
}
