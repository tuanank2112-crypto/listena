import { randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Minimum wall-clock time for the public account-action routes (password
 * reset, verification resend, register). Every response is held until this
 * floor has passed, so the round trip carries no information about whether
 * the submitted email belongs to an account. Keep in step with 01-CONTRACTS.
 */
export const MIN_OPAQUE_RESPONSE_MS = 600;

/**
 * A fixed bcrypt cost-12 digest of an unrelated constant. Comparing against
 * it costs the same CPU as a real password check, so a request for an
 * unknown email performs the same work as one for a known account.
 */
const TIMING_EQUALIZER_HASH = "$2a$12$kuC59ZOJUvu1x3oXjRHEIeWgez/dY40Ab4GwCWWMQVieG1W7BvPf.";

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until at least `MIN_OPAQUE_RESPONSE_MS` have elapsed since
 * `startedAt` (a `performance.now()` reading taken on handler entry).
 */
export async function padOpaqueResponse(startedAt: number, minimumMs = MIN_OPAQUE_RESPONSE_MS) {
  const elapsed = performance.now() - startedAt;
  await sleep(Math.max(0, minimumMs - elapsed));
}

/** Burns the CPU cost of one bcrypt verification without touching any account. */
export async function equalizePasswordWork() {
  await compare("listenai-timing-equalizer-input", TIMING_EQUALIZER_HASH);
}

/**
 * One indexed read on `AccountActionToken` that can never match a row, so the
 * "no such account" branch of a deferred callback performs database work
 * comparable to issuing a token. Together with `equalizePasswordWork` this
 * keeps both branches at about the same cost even on a runtime that awaited
 * `after()` before flushing (the synchronous local libSQL driver did).
 */
export async function equalizeTokenWork() {
  await prisma.accountActionToken.findFirst({
    where: { tokenHash: randomBytes(32).toString("hex") },
    select: { id: true },
  });
}
