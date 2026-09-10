import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createUser: vi.fn(),
  createProfile: vi.fn(),
  createSkill: vi.fn(),
  hash: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, create: mocks.createUser },
    learnerProfile: { create: mocks.createProfile },
    skillMastery: { create: mocks.createSkill },
  },
}));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/logger", () => ({ default: { info: mocks.info, error: mocks.error } }));

import { POST } from "./route";

describe("POST /api/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("bcrypt-hash");
    mocks.createUser.mockResolvedValue({
      id: "learner-1",
      name: "Lan",
      email: "lan@example.com",
      role: "LEARNER",
    });
    mocks.createProfile.mockResolvedValue({});
    mocks.createSkill.mockResolvedValue({});
  });

  it("ignores a privilege-escalation role in a public registration payload", async () => {
    const response = await POST(new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Lan",
        email: "lan@example.com",
        password: "safe-pass",
        role: "TEACHER",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: "LEARNER" }),
    }));
    expect(mocks.createSkill).toHaveBeenCalledTimes(6);
  });
});
