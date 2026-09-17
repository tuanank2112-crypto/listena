import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  useSession: vi.fn(),
  usePathname: vi.fn().mockReturnValue("/learner/dashboard"),
  useRouter: vi.fn(),
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
  clearOwnerIntents: vi.fn(),
  calls: [] as string[],
}));

vi.mock("next-auth/react", () => ({
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useRef: (val: unknown) => ({ current: val }),
    useEffect: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
  useRouter: mocks.useRouter,
}));

vi.mock("@/lib/client-intent", () => ({
  clearOwnerIntents: mocks.clearOwnerIntents,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { AppShell, handleAppSignOut, syncOwnerIntentLifecycle } from "./app-shell";

const router = { replace: mocks.routerReplace, refresh: mocks.routerRefresh };

interface TreeNode {
  type?: unknown;
  props?: {
    onClick?: () => Promise<void> | void;
    children?: unknown;
    "data-testid"?: string;
  };
}

function findButtons(node: unknown, found: TreeNode[] = []): TreeNode[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const child of node) findButtons(child, found);
    return found;
  }
  const treeNode = node as TreeNode;
  if (treeNode.type === "button" && typeof treeNode.props?.onClick === "function") {
    found.push(treeNode);
  }
  if (treeNode.props?.children !== undefined) findButtons(treeNode.props.children, found);
  return found;
}

describe("AppShell sign-out and owner lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.clearOwnerIntents.mockImplementation(() => { mocks.calls.push("clearOwnerIntents"); });
    mocks.signOut.mockImplementation(async () => { mocks.calls.push("signOut"); });
    mocks.routerReplace.mockImplementation(() => { mocks.calls.push("replace"); });
    mocks.routerRefresh.mockImplementation(() => { mocks.calls.push("refresh"); });
    mocks.useRouter.mockReturnValue(router);
  });

  it("syncOwnerIntentLifecycle clears previous owner intents on switch", () => {
    syncOwnerIntentLifecycle("user-new-456", "user-old-123");
    expect(mocks.clearOwnerIntents).toHaveBeenCalledWith("user-old-123");
  });

  it("syncOwnerIntentLifecycle does nothing when owner has not changed", () => {
    syncOwnerIntentLifecycle("user-123", "user-123");
    expect(mocks.clearOwnerIntents).not.toHaveBeenCalled();
  });

  it("syncOwnerIntentLifecycle clears previous owner intents when session terminates to undefined", () => {
    syncOwnerIntentLifecycle(undefined, "user-old-123");
    expect(mocks.clearOwnerIntents).toHaveBeenCalledWith("user-old-123");
  });

  it("handleAppSignOut clears intents, signs out in place, then replaces to / and refreshes, in that order", async () => {
    await handleAppSignOut("user-alice-123", router);

    expect(mocks.clearOwnerIntents).toHaveBeenCalledWith("user-alice-123");
    expect(mocks.clearOwnerIntents).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.routerReplace).toHaveBeenCalledWith("/");
    expect(mocks.calls).toEqual(["clearOwnerIntents", "signOut", "replace", "refresh"]);
    // No callbackUrl: the redirect target is never taken from the request.
    expect(JSON.stringify(mocks.signOut.mock.calls)).not.toContain("callbackUrl");
  });

  it("handleAppSignOut handles missing or undefined ownerId gracefully", async () => {
    await handleAppSignOut(undefined, router);

    expect(mocks.clearOwnerIntents).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.calls).toEqual(["signOut", "replace", "refresh"]);
  });

  it("renders a sign-out control for desktop and for the mobile menu, both running the sequence", async () => {
    mocks.useSession.mockReturnValue({
      data: {
        user: { id: "user-bob-456", name: "Bob Learner", email: "bob@example.com", role: "LEARNER" },
      },
      status: "authenticated",
    });

    const buttons = findButtons(AppShell({ children: "content" }));
    const testIds = buttons.map((button) => button.props?.["data-testid"]);
    expect(testIds).toEqual(expect.arrayContaining(["sign-out-desktop", "sign-out-mobile"]));

    const mobile = buttons.find((button) => button.props?.["data-testid"] === "sign-out-mobile");
    await mobile?.props?.onClick?.();
    await vi.waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalled());

    expect(mocks.clearOwnerIntents).toHaveBeenCalledWith("user-bob-456");
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.routerReplace).toHaveBeenCalledWith("/");
  });

  it("keeps the mobile sign-out control for a teacher session", () => {
    mocks.useSession.mockReturnValue({
      data: {
        user: { id: "teacher-1", name: "Teacher", email: "t@example.com", role: "TEACHER" },
      },
      status: "authenticated",
    });

    const testIds = findButtons(AppShell({ children: "content" })).map((button) => button.props?.["data-testid"]);
    expect(testIds).toEqual(expect.arrayContaining(["sign-out-desktop", "sign-out-mobile"]));
  });
});
