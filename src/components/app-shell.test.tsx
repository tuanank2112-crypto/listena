import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  useSession: vi.fn(),
  usePathname: vi.fn().mockReturnValue("/learner/dashboard"),
  clearOwnerIntents: vi.fn(),
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

describe("AppShell sign-out and owner lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("handleAppSignOut clears owner intents and calls signOut with callbackUrl", async () => {
    await handleAppSignOut("user-alice-123");

    expect(mocks.clearOwnerIntents).toHaveBeenCalledWith("user-alice-123");
    expect(mocks.clearOwnerIntents).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("handleAppSignOut handles missing or undefined ownerId gracefully", async () => {
    await handleAppSignOut(undefined);

    expect(mocks.clearOwnerIntents).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("invokes clearOwnerIntents on the rendered sign-out button click", async () => {
    mocks.useSession.mockReturnValue({
      data: {
        user: { id: "user-bob-456", name: "Bob Learner", email: "bob@example.com", role: "LEARNER" },
      },
      status: "authenticated",
    });

    const element = AppShell({ children: "content" });

    interface TreeNode {
      type?: unknown;
      props?: {
        onClick?: () => Promise<void> | void;
        children?: unknown;
      };
    }

    // Find the sign-out button in the element tree
    function findSignOutButton(node: unknown): TreeNode | null {
      if (!node || typeof node !== "object") return null;
      const treeNode = node as TreeNode;
      if (treeNode.type === "button" && typeof treeNode.props?.onClick === "function") {
        return treeNode;
      }
      if (Array.isArray(treeNode.props?.children)) {
        for (const child of treeNode.props.children) {
          const found = findSignOutButton(child);
          if (found) return found;
        }
      } else if (treeNode.props?.children) {
        return findSignOutButton(treeNode.props.children);
      }
      return null;
    }

    const signOutBtn = findSignOutButton(element);
    expect(signOutBtn).not.toBeNull();
    expect(signOutBtn?.props?.onClick).toBeDefined();

    await signOutBtn?.props?.onClick?.();

    expect(mocks.clearOwnerIntents).toHaveBeenCalledWith("user-bob-456");
    expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
