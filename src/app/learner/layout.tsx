import { auth } from "@/server/auth/config";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export default async function LearnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "LEARNER" && session.user.role !== "ADMIN") {
    redirect("/teacher");
  }

  return <AppShell>{children}</AppShell>;
}
